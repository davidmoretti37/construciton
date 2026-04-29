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

// Icon spec contract:
//   icon: 'name'                                    → Ionicon (legacy / fallback)
//   icon: { lib: 'fa5-brand', name, color? }        → FontAwesome5 brand glyph
//   icon: { lib: 'fa5', name, color? }              → FontAwesome5 solid glyph
//   icon: { lib: 'ionicon', name, color? }          → Ionicon (explicit)
// Frontend IntegrationsScreen renders all of these.
const ECHO = {
  type: 'echo',
  name: 'Echo (test)',
  description: 'Test integration that exposes a single tool which echoes back its input. Used during development to verify the MCP framework end-to-end without needing real OAuth.',
  icon: { lib: 'ionicon', name: 'flash-outline' },
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
  icon: { lib: 'fa5-brand', name: 'google', color: '#4285F4' },
  category: 'mcp_google_calendar',
  oauth: true,
  // Live when both env vars are set; otherwise hidden from the available list.
  enabled: !!(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET),
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
};

// Active OAuth integration: QuickBooks Online — comprehensive read surface
// (customers, vendors, items, invoices, bills, P&L, AR aging, projects,
// classes, accounts). Live whenever the env vars are set; flips to "Coming
// soon" automatically when they're missing.
const QBO = {
  type: 'qbo',
  name: 'QuickBooks Online',
  description: 'Import your customers, subcontractors, service catalog, invoices, and full P&L history. The fastest way to onboard an existing contractor.',
  icon: { lib: 'fa5', name: 'book', color: '#2CA01C' }, // QBO green
  category: 'mcp_qbo',
  oauth: true,
  enabled: !!(process.env.QBO_OAUTH_CLIENT_ID && process.env.QBO_OAUTH_CLIENT_SECRET),
  scopes: ['com.intuit.quickbooks.accounting'],
};

// Active OAuth integration: Monday.com — board + item reads.
const MONDAY = {
  type: 'monday',
  name: 'Monday.com',
  description: 'Import projects from your Monday boards — pick a board, map columns to project fields, done.',
  icon: { lib: 'fa5', name: 'th-large', color: '#FF3D57' }, // Monday red
  category: 'mcp_monday',
  oauth: true,
  enabled: !!(process.env.MONDAY_OAUTH_CLIENT_ID && process.env.MONDAY_OAUTH_CLIENT_SECRET),
  scopes: ['boards:read', 'me:read', 'users:read'],
};

// Future entries — placeholders, not active until their adapters ship.
// Keeping them here documents the roadmap and lets the registry render
// "Coming soon" tiles in the UI.
const PLANNED = {
  gmail: {
    type: 'gmail',
    name: 'Gmail',
    description: 'Read client email threads — Foreman remembers what was said, drafts responses, surfaces context from past conversations.',
    icon: { lib: 'fa5-brand', name: 'google', color: '#EA4335' },
    category: 'mcp_gmail',
    oauth: true,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'],
    coming_soon: true,
  },
  stripe: {
    type: 'stripe',
    name: 'Stripe',
    description: 'Pull live payment data — Foreman tracks charges, subscriptions, and disputes alongside your project P&L.',
    icon: { lib: 'fa5-brand', name: 'stripe-s', color: '#635BFF' },
    category: 'mcp_stripe',
    oauth: true,
    scopes: ['read_only'],
    coming_soon: true,
  },
  buildertrend: {
    type: 'buildertrend',
    name: 'Buildertrend',
    description: 'Import projects, customers, change orders from your Buildertrend account. Coming soon.',
    icon: { lib: 'fa5', name: 'hammer', color: '#FF6F00' },
    category: 'mcp_buildertrend',
    oauth: true,
    scopes: [],
    coming_soon: true,
  },
  jobber: {
    type: 'jobber',
    name: 'Jobber',
    description: 'Import clients, properties, jobs, and invoices from Jobber. Coming soon.',
    icon: { lib: 'fa5', name: 'wrench', color: '#179AE3' },
    category: 'mcp_jobber',
    oauth: true,
    scopes: [],
    coming_soon: true,
  },
};

const REGISTRY = {
  echo: ECHO,
  google_calendar: GOOGLE_CALENDAR,
  qbo: QBO,
  monday: MONDAY,
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
