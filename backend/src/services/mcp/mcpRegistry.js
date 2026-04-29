/**
 * P12 — MCP integration registry.
 *
 * Catalog of every integration Sylk supports. Each entry has metadata
 * the UI uses to render the "Connect a Tool" screen + plumbing the
 * mcpClient uses to load the right adapter.
 *
 * Adding a new integration:
 *   1. Append an entry below
 *   2. Implement the adapter in `adapters/<type>.js` exporting:
 *        getTools()  → array of OpenAI-format tool definitions
 *        callTool(toolName, args, credential)  → tool result
 *      (Or, for OAuth-required integrations:)
 *        oauthAuthorizeUrl(state, redirectUri)
 *        oauthExchangeCode(code, redirectUri) → { accessToken, refreshToken, expiresAt, scopes }
 *        oauthRefresh(refreshToken) → { accessToken, expiresAt }
 *   3. Add the OAuth client_id / client_secret env vars
 *   4. Add the redirect URI to the provider's developer console
 *
 * Each integration is identified by `type` (e.g. 'gmail', 'qbo', 'echo').
 * The `category` field aligns with the tool registry's category enum
 * (P1) so MCP tools surface in their natural domain.
 */

const ECHO = {
  type: 'echo',
  name: 'Echo (test)',
  description: 'Test integration that exposes a single tool which echoes back its input. Used during development to verify the MCP framework end-to-end without needing real OAuth.',
  icon: 'flash-outline',          // Ionicon
  category: 'mcp_echo',
  oauth: false,                    // doesn't need credentials
  enabled: process.env.MCP_ECHO_ENABLED !== 'false', // default on; flip off in prod
  scopes: [],
};

// Active OAuth integrations.
const GOOGLE_CALENDAR = {
  type: 'google_calendar',
  name: 'Google Calendar',
  description: 'Read your calendar so Foreman can answer "what\'s on my schedule?" and "when am I free?".',
  icon: 'calendar-outline',
  category: 'mcp_google_calendar',
  oauth: true,
  // Live when both env vars are set; otherwise hidden from the available list.
  enabled: !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET),
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
};

// Future entries — placeholders, not active until their adapters ship.
// Keeping them here documents the roadmap and lets the registry render
// "Coming soon" tiles in the UI.
const PLANNED = {
  gmail: {
    type: 'gmail',
    name: 'Gmail',
    description: 'Read client email threads — Foreman remembers what was said, drafts responses, surfaces context from past conversations.',
    icon: 'mail-outline',
    category: 'mcp_gmail',
    oauth: true,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'],
    coming_soon: true,
  },
  stripe: {
    type: 'stripe',
    name: 'Stripe',
    description: 'Pull live payment data — Foreman tracks charges, subscriptions, and disputes alongside your project P&L.',
    icon: 'card-outline',
    category: 'mcp_stripe',
    oauth: true,
    scopes: ['read_only'],
    coming_soon: true,
  },
  qbo: {
    type: 'qbo',
    name: 'QuickBooks Online',
    description: 'Sync your books — Foreman cross-references QB invoices, vendors, and expense categorization.',
    icon: 'briefcase-outline',
    category: 'mcp_qbo',
    oauth: true,
    scopes: ['com.intuit.quickbooks.accounting'],
    coming_soon: true,
  },
  monday: {
    type: 'monday',
    name: 'Monday.com',
    description: 'Read project boards — Foreman keeps Sylk and Monday in sync.',
    icon: 'grid-outline',
    category: 'mcp_monday',
    oauth: true,
    scopes: ['boards:read', 'me:read'],
    coming_soon: true,
  },
};

const REGISTRY = {
  echo: ECHO,
  google_calendar: GOOGLE_CALENDAR,
  ...PLANNED,
};

/** All entries the UI should display. */
function listAll() {
  return Object.values(REGISTRY);
}

/** Only entries that are actually wired up + enabled (have an adapter). */
function listAvailable() {
  return Object.values(REGISTRY).filter(r => r.enabled && !r.coming_soon);
}

function get(type) {
  return REGISTRY[type] || null;
}

module.exports = { REGISTRY, listAll, listAvailable, get };
