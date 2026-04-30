/**
 * Tool category taxonomy + intent → category mapping.
 *
 * This is the foundation for hierarchical tool routing. Today the agent
 * picks tools via flat keyword matching against `TOOL_GROUPS` in
 * `toolRouter.js` — that scales poorly past ~100 tools. The category
 * model here gives us:
 *
 *   - one category per tool (its primary domain)
 *   - tags for cross-cutting concerns (destructive, financial-report, etc)
 *   - a stable name space external MCP servers can register under
 *     (e.g. `mcp_quickbooks`, `mcp_notion`) without touching core code
 *
 * Phase 1 introduces this module but does NOT change routing behavior.
 * The registry uses category metadata for `getToolsByCategory(...)`
 * lookups (used by the new approval-gate framework) while leaving
 * `TOOL_GROUPS` as the source of routing truth. A later phase can
 * replace TOOL_GROUPS with pure-category routing once the metadata is
 * validated against real traffic.
 */

/** Canonical category enum. Adding a category is non-breaking. */
const CATEGORIES = Object.freeze({
  PROJECTS: 'projects',
  ESTIMATES: 'estimates',
  INVOICES: 'invoices',
  DRAWS: 'draws',
  EXPENSES: 'expenses',
  TRANSACTIONS: 'transactions',
  FINANCIAL_REPORTS: 'financial_reports',
  BANK: 'bank',
  WORKERS: 'workers',
  SCHEDULING: 'scheduling',
  SERVICE_PLANS: 'service_plans',
  DOCUMENTS: 'documents',
  REPORTS: 'reports',
  SMS: 'sms',
  SETTINGS: 'settings',
  SEARCH: 'search',
  BRIEFING: 'briefing',
  MEMORY: 'memory',
  SUBS: 'subs',
  IMPORTS: 'imports',
  CHANGE_ORDERS: 'change_orders',
  // Reserved for future MCP-namespaced categories.
  // External MCP servers should register tools under categories of the
  // form `mcp_<provider>` (e.g. `mcp_quickbooks`).
});

const VALID_CATEGORIES = new Set(Object.values(CATEGORIES));

function isValidCategory(c) {
  if (typeof c !== 'string') return false;
  if (VALID_CATEGORIES.has(c)) return true;
  // Allow any `mcp_<provider>` shape so MCP servers can register without
  // a code change here.
  return /^mcp_[a-z][a-z0-9_]+$/.test(c);
}

/** Risk levels used by the approval gate. */
const RISK_LEVELS = Object.freeze({
  /** Pure read tool — no side effects. */
  READ: 'read',
  /** Reversible write (create/update/etc). No approval gate. */
  WRITE_SAFE: 'write_safe',
  /** Irreversible write inside our system (delete/void). Hard confirm. */
  WRITE_DESTRUCTIVE: 'write_destructive',
  /** Outbound to a third-party system (SMS, email, payment). Hard confirm. */
  EXTERNAL_WRITE: 'external_write',
});

const VALID_RISK_LEVELS = new Set(Object.values(RISK_LEVELS));

/** Model tier hints. Planner can override. */
const MODEL_TIERS = Object.freeze({
  HAIKU: 'haiku',
  SONNET: 'sonnet',
  ANY: 'any',
});

const VALID_MODEL_TIERS = new Set(Object.values(MODEL_TIERS));

module.exports = {
  CATEGORIES,
  RISK_LEVELS,
  MODEL_TIERS,
  isValidCategory,
  VALID_CATEGORIES,
  VALID_RISK_LEVELS,
  VALID_MODEL_TIERS,
};
