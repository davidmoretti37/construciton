/**
 * Monday.com adapter — board / item read surface.
 *
 * Monday is highly schema-flexible: every board has its own column layout,
 * so this adapter exposes the *raw* board structure and lets the agent
 * (or a downstream import handler) decide which columns map to our
 * project fields. No assumptions about column names.
 *
 * Tools exposed (namespace `monday__`):
 *
 *   monday__list_workspaces            — top-level workspaces
 *   monday__list_boards                — all boards visible to the user
 *   monday__get_board                  — one board with its column schema
 *   monday__list_items                 — items (rows) on a board with all column values
 *   monday__get_item                   — one item with all column values
 *   monday__list_users                 — team members (used for worker matching)
 *   monday__get_me                     — current user (verify connection)
 *
 * OAuth: Monday's authorization-code flow.
 *   AUTH:    https://auth.monday.com/oauth2/authorize
 *   TOKEN:   https://auth.monday.com/oauth2/token
 *   API:     https://api.monday.com/v2  (GraphQL POST)
 *
 * Required env vars:
 *   MONDAY_OAUTH_CLIENT_ID
 *   MONDAY_OAUTH_CLIENT_SECRET
 */

const SCOPES = ['boards:read', 'me:read', 'users:read'];

const AUTH_ENDPOINT = 'https://auth.monday.com/oauth2/authorize';
const TOKEN_ENDPOINT = 'https://auth.monday.com/oauth2/token';
const API_ENDPOINT = 'https://api.monday.com/v2';

function clientCreds() {
  const id = process.env.MONDAY_OAUTH_CLIENT_ID;
  const secret = process.env.MONDAY_OAUTH_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('Monday OAuth not configured (MONDAY_OAUTH_CLIENT_ID / MONDAY_OAUTH_CLIENT_SECRET missing)');
  }
  return { id, secret };
}

// ─────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────

const READ_META = {
  category: 'mcp_monday',
  risk_level: 'read',
  requires_approval: false,
  model_tier_required: 'any',
  tags: ['mcp', 'monday', 'project-management'],
};

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'monday__get_me',
      description: 'Return the connected Monday account (current user name + email). Use to verify the connection works.',
      parameters: { type: 'object', properties: {} },
    },
    metadata: READ_META,
  },
  {
    type: 'function',
    function: {
      name: 'monday__list_workspaces',
      description: 'List Monday workspaces visible to the user. Useful for routing imports to the right workspace.',
      parameters: { type: 'object', properties: {} },
    },
    metadata: READ_META,
  },
  {
    type: 'function',
    function: {
      name: 'monday__list_boards',
      description: 'List all Monday boards visible to the user (id, name, item count, workspace, kind). Use first when the user wants to import — they pick which board represents their projects.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max boards to return. Default 50, max 200.' },
          workspace_ids: { type: 'array', items: { type: 'string' }, description: 'Optional workspace filter.' },
        },
      },
    },
    metadata: READ_META,
  },
  {
    type: 'function',
    function: {
      name: 'monday__get_board',
      description: 'Fetch one board with its full column schema (column titles + types + ids). Use after the user picks a board so the agent can map columns to our project fields (Name, Client, Budget, Address, etc.).',
      parameters: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'Monday board ID.' },
        },
        required: ['board_id'],
      },
    },
    metadata: READ_META,
  },
  {
    type: 'function',
    function: {
      name: 'monday__list_items',
      description: 'Fetch the items (rows) on a board, with all their column values. Returns an array — each item has id, name, group, and a column_values map (column_id → value text + raw json). Used to import projects from a board.',
      parameters: {
        type: 'object',
        properties: {
          board_id: { type: 'string', description: 'Monday board ID.' },
          limit: { type: 'integer', description: 'Max items to return. Default 100, max 500.' },
          cursor: { type: 'string', description: 'Pagination cursor from a previous call.' },
        },
        required: ['board_id'],
      },
    },
    metadata: READ_META,
  },
  {
    type: 'function',
    function: {
      name: 'monday__get_item',
      description: 'Fetch one item with all column values. Useful for drilling into a single item the agent has ambiguity about.',
      parameters: {
        type: 'object',
        properties: {
          item_id: { type: 'string', description: 'Monday item ID.' },
        },
        required: ['item_id'],
      },
    },
    metadata: READ_META,
  },
  {
    type: 'function',
    function: {
      name: 'monday__list_users',
      description: 'List Monday team members. Useful for matching Monday "Person" column values to our workers during project import.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max users. Default 100.' },
        },
      },
    },
    metadata: READ_META,
  },
];

function getTools() {
  return TOOLS;
}

// ─────────────────────────────────────────────────────────────────
// OAuth
// ─────────────────────────────────────────────────────────────────

async function oauthAuthorizeUrl(state, redirectUri) {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function oauthExchangeCode(code, redirectUri, _callbackParams = {}) {
  const { id, secret } = clientCreds();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri,
  });
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Monday token exchange failed (${resp.status}): ${text}`);
  }
  const json = await resp.json();
  // Monday access tokens are long-lived and don't return a refresh token
  // for the standard OAuth flow. expires_in may be present (annual-ish);
  // when not, we treat it as non-expiring and rely on a 401 to force reconnect.
  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000).toISOString()
    : null;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || null,
    expiresAt,
    scopes: SCOPES,
    metadata: {
      token_type: json.token_type || 'Bearer',
      account_id: json.account_id || null,
    },
  };
}

async function oauthRefresh(refreshToken) {
  // Monday rarely issues refresh tokens; provided here in case future
  // token rotation lands. Falls back to re-OAuth flow (mcpClient flips
  // status to 'expired' which triggers the reconnect prompt).
  if (!refreshToken) {
    throw new Error('Monday refresh not supported without refresh_token. User must reconnect.');
  }
  const { id, secret } = clientCreds();
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: id,
    client_secret: secret,
  });
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Monday token refresh failed (${resp.status}): ${text}`);
  }
  const json = await resp.json();
  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000).toISOString()
    : null;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || null,
    expiresAt,
  };
}

// ─────────────────────────────────────────────────────────────────
// Tool dispatcher
// ─────────────────────────────────────────────────────────────────

async function callTool(toolName, args, credential) {
  if (!credential || !credential.accessToken) {
    return { error: 'Not connected to Monday.' };
  }
  args = args || {};

  switch (toolName) {
    case 'monday__get_me':         return getMe(credential);
    case 'monday__list_workspaces':return listWorkspaces(credential);
    case 'monday__list_boards':    return listBoards(args, credential);
    case 'monday__get_board':      return getBoard(args, credential);
    case 'monday__list_items':     return listItems(args, credential);
    case 'monday__get_item':       return getItem(args, credential);
    case 'monday__list_users':     return listUsers(args, credential);
    default:
      return { error: `Unknown Monday tool: ${toolName}` };
  }
}

// ─────────────────────────────────────────────────────────────────
// GraphQL helper
// ─────────────────────────────────────────────────────────────────

async function gql(credential, query, variables = {}) {
  const resp = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: credential.accessToken,    // Monday: just the raw token, no "Bearer "
      'Content-Type': 'application/json',
      'API-Version': '2024-04',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 401) {
      const err = new Error('Monday 401 — token expired or revoked');
      err.status = 401;
      throw err;
    }
    throw new Error(`Monday GraphQL HTTP ${resp.status}: ${text.slice(0, 300)}`);
  }
  const json = await resp.json();
  if (json.errors && json.errors.length > 0) {
    throw new Error(`Monday GraphQL error: ${json.errors[0].message}`);
  }
  return json.data;
}

// ─────────────────────────────────────────────────────────────────
// Tool implementations
// ─────────────────────────────────────────────────────────────────

async function getMe(credential) {
  const data = await gql(credential, `query { me { id name email account { id name } } }`);
  return { user: data.me };
}

async function listWorkspaces(credential) {
  const data = await gql(credential, `query { workspaces(limit: 100) { id name kind state } }`);
  return { workspaces: data.workspaces || [] };
}

async function listBoards(args, credential) {
  const limit = clamp(args.limit, 1, 200, 50);
  const workspaceIds = Array.isArray(args.workspace_ids) ? args.workspace_ids : null;
  const wsArg = workspaceIds ? `, workspace_ids: [${workspaceIds.map((id) => `"${id}"`).join(',')}]` : '';
  const data = await gql(credential, `
    query {
      boards(limit: ${limit}${wsArg}) {
        id name description state board_kind items_count
        workspace { id name }
        owner { id name }
      }
    }
  `);
  return { boards: data.boards || [], count: (data.boards || []).length };
}

async function getBoard(args, credential) {
  if (!args.board_id) return { error: 'board_id is required' };
  const data = await gql(credential, `
    query {
      boards(ids: [${args.board_id}]) {
        id name description state items_count
        workspace { id name }
        groups { id title color }
        columns { id title type description settings_str }
      }
    }
  `);
  const board = (data.boards || [])[0];
  if (!board) return { error: 'Board not found' };
  return { board };
}

async function listItems(args, credential) {
  if (!args.board_id) return { error: 'board_id is required' };
  const limit = clamp(args.limit, 1, 500, 100);
  const cursorArg = args.cursor ? `, cursor: "${args.cursor}"` : '';
  const data = await gql(credential, `
    query {
      boards(ids: [${args.board_id}]) {
        items_page(limit: ${limit}${cursorArg}) {
          cursor
          items {
            id name state
            group { id title }
            updated_at created_at
            column_values {
              id type text value
              column { id title type }
            }
            creator { id name }
          }
        }
      }
    }
  `);
  const page = data.boards?.[0]?.items_page;
  if (!page) return { items: [], next_cursor: null };
  return {
    board_id: args.board_id,
    items: (page.items || []).map(normalizeItem),
    next_cursor: page.cursor || null,
  };
}

async function getItem(args, credential) {
  if (!args.item_id) return { error: 'item_id is required' };
  const data = await gql(credential, `
    query {
      items(ids: [${args.item_id}]) {
        id name state
        group { id title }
        board { id name }
        updated_at created_at
        column_values {
          id type text value
          column { id title type }
        }
        creator { id name }
      }
    }
  `);
  const item = (data.items || [])[0];
  if (!item) return { error: 'Item not found' };
  return { item: normalizeItem(item) };
}

async function listUsers(args, credential) {
  const limit = clamp(args.limit, 1, 1000, 100);
  const data = await gql(credential, `
    query {
      users(limit: ${limit}) {
        id name email title phone enabled is_admin
      }
    }
  `);
  return { users: data.users || [] };
}

function normalizeItem(item) {
  // Flatten column_values into a column_id → { title, type, text, value } map
  // for easier consumption. Keep the original array too in case a caller
  // wants the raw shape.
  const cvMap = {};
  const cvByTitle = {};
  for (const cv of item.column_values || []) {
    const entry = {
      title: cv.column?.title || cv.id,
      type: cv.type || cv.column?.type,
      text: cv.text,
      value: cv.value, // raw JSON-ish string
    };
    cvMap[cv.id] = entry;
    if (cv.column?.title) cvByTitle[cv.column.title] = entry;
  }
  return {
    id: item.id,
    name: item.name,
    state: item.state,
    group: item.group?.title || null,
    board_id: item.board?.id || null,
    board_name: item.board?.name || null,
    created_at: item.created_at,
    updated_at: item.updated_at,
    creator: item.creator?.name || null,
    columns: cvMap,            // by column id
    columns_by_title: cvByTitle, // by human title (more agent-friendly)
  };
}

function clamp(n, min, max, def) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

module.exports = {
  type: 'monday',
  oauth: true,
  getTools,
  callTool,
  oauthAuthorizeUrl,
  oauthExchangeCode,
  oauthRefresh,
};
