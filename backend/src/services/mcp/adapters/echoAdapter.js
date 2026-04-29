/**
 * P12 — Echo adapter.
 *
 * Test integration that exposes one tool (`echo__say`) which mirrors
 * back its input. Used to verify the MCP framework's plumbing — tool
 * registration, per-user dispatch, approval gates, trace IDs — without
 * requiring real OAuth, real third-party APIs, or compliance review.
 *
 * Real adapters (Gmail, QBO, etc.) will follow this same shape:
 *   getTools()                       → tool definitions
 *   callTool(toolName, args, cred)   → result for one call
 *   metadata fields for the registry
 */

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'echo__say',
      description: 'Test echo tool. Returns the `message` argument back unchanged. Used for verifying the MCP integration framework is wired correctly. Do not use this for real user requests — it does nothing useful.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Text to echo back.' },
        },
        required: ['message'],
      },
    },
    // The MCP client uses this metadata when registering the tool into
    // the central tools/registry so the approval gate + reasoning trail
    // know how to treat it. Echo is a safe read-equivalent — no
    // external side-effects.
    metadata: {
      category: 'mcp_echo',
      risk_level: 'read',
      requires_approval: false,
      model_tier_required: 'any',
      tags: ['mcp', 'system', 'test'],
    },
  },
];

function getTools() {
  return TOOLS;
}

async function callTool(toolName, args /*, credential — unused for echo */) {
  if (toolName !== 'echo__say') {
    return { error: `Unknown echo tool: ${toolName}` };
  }
  const message = typeof args?.message === 'string' ? args.message : '';
  return {
    echoed: message,
    received_at: new Date().toISOString(),
    note: 'This is the echo MCP adapter — used to verify the framework is wired correctly.',
  };
}

module.exports = {
  type: 'echo',
  oauth: false,
  getTools,
  callTool,
};
