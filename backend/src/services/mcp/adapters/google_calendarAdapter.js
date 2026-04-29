/**
 * P12b — Google Calendar adapter (read-only).
 *
 * Tools exposed:
 *   google_calendar__list_events     — upcoming events in a window
 *   google_calendar__search_events   — text search across the user's calendar
 *
 * OAuth: standard Google OAuth 2.0 authorization code flow with refresh
 * tokens. Scope = calendar.readonly (matches mcpRegistry).
 *
 * Required env vars:
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 *
 * Redirect URI is constructed by routes/integrations.js:
 *   {BACKEND_URL}/api/integrations/google_calendar/callback
 * — register that exact URL in the Google Cloud Console for the OAuth client.
 */

const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://www.googleapis.com/calendar/v3';

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'google_calendar__list_events',
      description: 'List upcoming events on the user\'s primary Google Calendar. Use when the user asks "what\'s on my schedule", "am I free tomorrow", "what meetings do I have this week", etc.',
      parameters: {
        type: 'object',
        properties: {
          time_min: {
            type: 'string',
            description: 'ISO-8601 lower bound (inclusive). Defaults to now if omitted.',
          },
          time_max: {
            type: 'string',
            description: 'ISO-8601 upper bound (exclusive). Defaults to 7 days from now if omitted.',
          },
          max_results: {
            type: 'integer',
            description: 'Maximum events to return. Default 20, max 50.',
          },
        },
      },
    },
    metadata: {
      category: 'mcp_google_calendar',
      risk_level: 'read',
      requires_approval: false,
      model_tier_required: 'any',
      tags: ['mcp', 'calendar', 'google'],
    },
  },
  {
    type: 'function',
    function: {
      name: 'google_calendar__search_events',
      description: 'Free-text search the user\'s primary Google Calendar. Use when the user asks "when is my meeting with Sarah", "what time is the Davis walkthrough", etc.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Free-text search query.' },
          max_results: { type: 'integer', description: 'Maximum events to return. Default 10, max 50.' },
        },
        required: ['query'],
      },
    },
    metadata: {
      category: 'mcp_google_calendar',
      risk_level: 'read',
      requires_approval: false,
      model_tier_required: 'any',
      tags: ['mcp', 'calendar', 'google'],
    },
  },
];

function getTools() { return TOOLS; }

function clientCreds() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('Google OAuth not configured (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET missing)');
  }
  return { id, secret };
}

async function oauthAuthorizeUrl(state, redirectUri) {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',         // request a refresh token
    prompt: 'consent',              // force refresh-token issuance even on re-connect
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function oauthExchangeCode(code, redirectUri, _callbackParams = {}) {
  const { id, secret } = clientCreds();
  const body = new URLSearchParams({
    code,
    client_id: id,
    client_secret: secret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token exchange failed (${resp.status}): ${text}`);
  }
  const json = await resp.json();
  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000).toISOString()
    : null;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || null,
    expiresAt,
    scopes: (json.scope || SCOPES.join(' ')).split(/\s+/).filter(Boolean),
    metadata: { token_type: json.token_type || 'Bearer' },
  };
}

async function oauthRefresh(refreshToken) {
  const { id, secret } = clientCreds();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: id,
    client_secret: secret,
    grant_type: 'refresh_token',
  });
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token refresh failed (${resp.status}): ${text}`);
  }
  const json = await resp.json();
  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000).toISOString()
    : null;
  return {
    accessToken: json.access_token,
    // Google rotates refresh tokens only on revoke / re-grant; reuse old one when not returned
    refreshToken: json.refresh_token || null,
    expiresAt,
  };
}

async function callTool(toolName, args, credential) {
  if (!credential || !credential.accessToken) {
    return { error: 'Not connected to Google Calendar.' };
  }

  if (toolName === 'google_calendar__list_events') {
    return await listEvents(args || {}, credential);
  }
  if (toolName === 'google_calendar__search_events') {
    return await searchEvents(args || {}, credential);
  }
  return { error: `Unknown tool: ${toolName}` };
}

async function listEvents(args, credential) {
  const timeMin = args.time_min || new Date().toISOString();
  const timeMax = args.time_max || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const maxResults = clamp(args.max_results, 1, 50, 20);
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(maxResults),
  });
  return await fetchEventsList(`${API_BASE}/calendars/primary/events?${params}`, credential);
}

async function searchEvents(args, credential) {
  if (!args.query || typeof args.query !== 'string') {
    return { error: 'query is required' };
  }
  const maxResults = clamp(args.max_results, 1, 50, 10);
  const params = new URLSearchParams({
    q: args.query,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(maxResults),
    timeMin: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return await fetchEventsList(`${API_BASE}/calendars/primary/events?${params}`, credential);
}

async function fetchEventsList(url, credential) {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${credential.accessToken}` },
  });
  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 401) return { error: 'Google Calendar session expired. Please reconnect.' };
    return { error: `Google Calendar API error (${resp.status}): ${text.slice(0, 200)}` };
  }
  const json = await resp.json();
  const events = (json.items || []).map(normalizeEvent);
  return {
    events,
    count: events.length,
    next_page_token: json.nextPageToken || null,
  };
}

function normalizeEvent(e) {
  return {
    id: e.id,
    summary: e.summary || '(no title)',
    description: e.description || null,
    location: e.location || null,
    start: e.start?.dateTime || e.start?.date || null,
    end: e.end?.dateTime || e.end?.date || null,
    all_day: !!e.start?.date && !e.start?.dateTime,
    organizer: e.organizer?.email || null,
    attendees: (e.attendees || []).map(a => a.email).filter(Boolean),
    html_link: e.htmlLink || null,
    status: e.status || null,
  };
}

function clamp(n, min, max, def) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

module.exports = {
  type: 'google_calendar',
  oauth: true,
  getTools,
  callTool,
  oauthAuthorizeUrl,
  oauthExchangeCode,
  oauthRefresh,
};
