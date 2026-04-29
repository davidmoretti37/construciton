/**
 * P12 — MCP client.
 *
 * Sits between the agent loop and per-user MCP integrations. Three
 * jobs:
 *
 *   1. `getToolsForUser(userId)` — returns the array of tool
 *      definitions the agent should add to its tool list this turn,
 *      based on which integrations the user has connected.
 *
 *   2. `callTool(userId, toolName, args)` — routes a tool invocation
 *      to the correct adapter, fetches the user's credential, runs
 *      the call, returns the result. Token refresh is automatic on
 *      401-style errors.
 *
 *   3. `registerHandlers(userId)` — registers per-user runtime
 *      handlers in the central tools/registry so the agent's
 *      `executeTool` dispatch path finds them. Called once per
 *      request near the top of the loop.
 *
 * Adapter pattern: each integration lives in `adapters/<type>.js` and
 * exports the same shape. The client knows nothing integration-
 * specific — it just routes.
 *
 * Failure modes (all soft-fall):
 *   - Adapter not found        → tool not registered, agent never sees it
 *   - Credential missing       → tool returns `{ error: 'not connected' }`
 *   - Provider 401             → triggers refresh; retries once; otherwise marks expired
 *   - Provider 5xx / timeout   → returns `{ error: '...' }`; agent handles gracefully
 *
 * Adding a new adapter: drop a file in `adapters/`, export `{ type,
 * getTools, callTool, ... }`, add the entry to `mcpRegistry.js`. No
 * changes to this file.
 */

const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');
const { REGISTRY, listAvailable } = require('./mcpRegistry');
const credentialStore = require('./credentialStore');
const toolRegistry = require('../tools/registry');

// In-memory adapter cache. Adapters are stateless modules so it's
// safe to require() once and reuse.
const _adapters = {};

function loadAdapter(type) {
  if (_adapters[type]) return _adapters[type];
  const file = path.join(__dirname, 'adapters', `${type}Adapter.js`);
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    const adapter = require(file);
    _adapters[type] = adapter;
    return adapter;
  } catch (e) {
    logger.warn(`[mcpClient] failed to load adapter ${type}: ${e.message}`);
    return null;
  }
}

/** Eagerly preload every available adapter at boot for faster first calls. */
function preloadAdapters() {
  for (const entry of listAvailable()) {
    loadAdapter(entry.type);
  }
}

/**
 * Returns the OpenAI-format tool definitions the agent should add to
 * `toolsWithMemory` for this user — based on their currently-connected
 * integrations.
 *
 * The tool's `name` is the namespaced version (e.g. `echo__say`) so
 * collisions with built-in tool names are impossible.
 */
async function getToolsForUser(userId) {
  if (!userId) return [];
  const connected = (await credentialStore.listForUser(userId))
    .filter(c => c.status === 'connected');
  if (!connected.length) return [];

  const tools = [];
  for (const conn of connected) {
    const entry = REGISTRY[conn.integration_type];
    if (!entry || !entry.enabled) continue;
    const adapter = loadAdapter(conn.integration_type);
    if (!adapter) continue;
    try {
      const adapterTools = adapter.getTools();
      tools.push(...adapterTools);
    } catch (e) {
      logger.warn(`[mcpClient] adapter ${conn.integration_type} getTools failed: ${e.message}`);
    }
  }
  return tools;
}

/**
 * Register runtime handlers in the central tools/registry for every
 * tool this user has access to. The agent's `executeTool` dispatch
 * path finds them via `registry.getRuntimeHandler(name)`.
 *
 * Idempotent — re-registering the same name updates the closure but
 * doesn't duplicate. We re-register every turn so per-user routing
 * stays correct (different users may have different integrations).
 */
async function registerHandlers(userId) {
  if (!userId) return;
  const connected = (await credentialStore.listForUser(userId))
    .filter(c => c.status === 'connected');
  for (const conn of connected) {
    const entry = REGISTRY[conn.integration_type];
    if (!entry || !entry.enabled) continue;
    const adapter = loadAdapter(conn.integration_type);
    if (!adapter) continue;
    const tools = adapter.getTools();
    for (const t of tools) {
      const name = t.function?.name;
      if (!name) continue;
      // Register metadata so the approval gate sees the right
      // risk_level. Idempotent — safe to call every turn.
      try {
        toolRegistry.register({
          name,
          definition: t,
          handler: async (uId, args) => callTool(uId, name, args),
          metadata: t.metadata || {
            category: entry.category,
            risk_level: 'read',
            requires_approval: false,
            model_tier_required: 'any',
            tags: ['mcp'],
          },
        });
      } catch (e) {
        logger.warn(`[mcpClient] register ${name} failed: ${e.message}`);
      }
    }
  }
}

/**
 * Execute one tool. Looks up the integration type from the tool name's
 * prefix (e.g. `echo__say` → type=`echo`), fetches the user's credential,
 * calls the adapter. Returns the adapter's result OR a structured error
 * object the agent loop can render.
 */
async function callTool(userId, toolName, args) {
  if (!toolName || !toolName.includes('__')) {
    return { error: `Invalid MCP tool name: ${toolName}` };
  }
  const type = toolName.split('__')[0];
  const entry = REGISTRY[type];
  if (!entry) return { error: `Unknown MCP integration: ${type}` };
  const adapter = loadAdapter(type);
  if (!adapter) return { error: `Adapter not loaded: ${type}` };

  // Echo (and any future no-auth adapter) doesn't need a credential.
  let credential = null;
  if (entry.oauth) {
    credential = await credentialStore.getCredential(userId, type);
    if (!credential) {
      return { error: `Not connected to ${entry.name}. Connect it in Settings first.` };
    }
    // Refresh on expiry — let the adapter decide whether to bother
    // (some providers don't expire tokens; others rotate every hour).
    if (credential.expiresAt && new Date(credential.expiresAt) < new Date(Date.now() + 60_000)) {
      if (typeof adapter.oauthRefresh === 'function' && credential.refreshToken) {
        try {
          const refreshed = await adapter.oauthRefresh(credential.refreshToken);
          await credentialStore.saveCredential({
            userId,
            integrationType: type,
            accessToken: refreshed.accessToken,
            refreshToken: refreshed.refreshToken || credential.refreshToken,
            expiresAt: refreshed.expiresAt,
            scopes: credential.scopes,
            metadata: credential.metadata,
          });
          credential.accessToken = refreshed.accessToken;
        } catch (e) {
          await credentialStore.markStatus(userId, type, 'expired', `refresh failed: ${e.message}`);
          return { error: `${entry.name} session expired. Please reconnect in Settings.` };
        }
      }
    }
  }

  try {
    const result = await adapter.callTool(toolName, args || {}, credential);
    // Touch last_synced so the UI shows freshness.
    if (entry.oauth) {
      credentialStore.touchSync(userId, type).catch(() => {});
    }
    return result;
  } catch (e) {
    logger.warn(`[mcpClient] callTool ${toolName} failed: ${e.message}`);
    return { error: `Integration call failed: ${e.message}` };
  }
}

module.exports = {
  getToolsForUser,
  registerHandlers,
  callTool,
  preloadAdapters,
  // Exposed for tests / admin tooling
  loadAdapter,
};
