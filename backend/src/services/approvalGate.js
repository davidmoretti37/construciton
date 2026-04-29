/**
 * Approval gate — generalized safety layer for tool calls.
 *
 * Replaces the hardcoded `destructiveGuard.DESTRUCTIVE_TOOLS` set with
 * a metadata-driven decision. Every tool's risk_level + requires_approval
 * (in `tools/registry.js`) determines whether the gate intervenes.
 *
 * Verdicts:
 *   - PROCEED                — call executes normally
 *   - BLOCK                  — call replaced with a "blocked" tool result
 *                              instructing the agent to ask the user;
 *                              SSE emits `pending_approval` event so the
 *                              UI can render an inline confirm card
 *
 * Branches by risk_level:
 *   - read / write_safe      → PROCEED
 *   - write_destructive      → existing destructiveGuard verifier (Haiku)
 *   - external_write         → block on first call, ask user explicitly,
 *                              proceed once user confirms in next turn
 *
 * The result object is the same shape the agent loop has always handled,
 * so existing call sites can be migrated one at a time.
 */

const logger = require('../utils/logger');
const registry = require('./tools/registry');
const { RISK_LEVELS } = require('./tools/categories');
const { verifyDestructive } = require('./destructiveGuard');

// ─────────────────────────────────────────────────────────────────
// Helpers — derive a one-line action summary the user sees
// ─────────────────────────────────────────────────────────────────

function shortenArg(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 57) + '…' : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 80 ? s.slice(0, 77) + '…' : s;
  } catch { return String(v); }
}

function describeArgs(args) {
  if (!args || typeof args !== 'object') return '';
  const parts = [];
  for (const [k, v] of Object.entries(args)) {
    parts.push(`${k}=${shortenArg(v)}`);
  }
  return parts.join(', ');
}

/**
 * Build the human-readable "what's about to happen" line for the UI card.
 * Heuristics by tool name keep it 1-line and recognisable.
 */
function describeAction(toolName, args = {}) {
  const a = args;
  switch (toolName) {
    case 'delete_project': return `Delete project ${a.project_id || a.name || ''}`.trim();
    case 'delete_expense': return `Delete expense ${a.transaction_id || a.expense_id || ''}`.trim();
    case 'void_invoice': return `Void invoice ${a.invoice_id || a.invoice_number || ''}`.trim();
    case 'delete_service_plan': return `Delete service plan ${a.service_plan_id || a.name || ''}`.trim();
    case 'delete_project_document': return `Delete document${a.document_id ? ` ${a.document_id}` : ''}`;
    case 'cancel_signature_request': return `Cancel signature request${a.signature_request_id ? ` ${a.signature_request_id}` : ''}`;
    case 'send_sms':
      return `Send SMS to ${a.customer_id ? `customer ${a.customer_id}` : a.to_number || 'recipient'}: "${shortenArg(a.body || '')}"`;
    case 'share_document':
      return `Share ${a.document_type || 'document'} with ${a.client_name || a.recipient || 'client'} via ${a.method || 'email'}`;
    case 'request_signature':
      return `Send ${a.document_type || 'document'} for e-signature to ${a.signer_email || a.recipient || 'signer'}`;
    default: {
      const args_str = describeArgs(args);
      return `${toolName}${args_str ? ' (' + args_str + ')' : ''}`;
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Sub-checks per risk_level
// ─────────────────────────────────────────────────────────────────

/**
 * write_destructive: reuse the existing destructiveGuard verifier so
 * Phase 1 introduces no behavior change for the 5 tools it gated before.
 */
async function checkDestructive(toolName, args, messages) {
  const result = await verifyDestructive(toolName, args, messages);
  if (result.verdict === 'PROCEED') {
    return { verdict: 'PROCEED', reason: '' };
  }
  return {
    verdict: 'BLOCK',
    reason: result.reason,
    risk_level: RISK_LEVELS.WRITE_DESTRUCTIVE,
    action_summary: describeAction(toolName, args),
    next_step: 'Describe to the user EXACTLY what would be deleted (the specific name, amount, date, etc.) and ask "Are you sure? This cannot be undone." Wait for their explicit yes/confirm before retrying this tool.',
  };
}

/**
 * external_write: block on first call regardless of conversation —
 * outbound to a third party (SMS, email, e-sign) is irreversible the
 * moment the API accepts it. Same Haiku verifier rubric as destructive
 * because the user-confirmation logic is identical: did the user
 * explicitly OK *this exact send* in the last turn?
 */
async function checkExternalWrite(toolName, args, messages) {
  const result = await verifyDestructive(toolName, args, messages);
  if (result.verdict === 'PROCEED') {
    return { verdict: 'PROCEED', reason: '' };
  }
  return {
    verdict: 'BLOCK',
    reason: result.reason,
    risk_level: RISK_LEVELS.EXTERNAL_WRITE,
    action_summary: describeAction(toolName, args),
    next_step: 'Describe the EXACT message and recipient to the user, then ask "Send this now?" Wait for explicit yes/confirm before retrying.',
  };
}

// ─────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────

/**
 * @param {Object} args
 * @param {string} args.toolName
 * @param {Object} args.toolArgs
 * @param {Array}  args.messages — conversation up to but not including this tool call
 * @returns {Promise<{verdict: 'PROCEED'|'BLOCK', reason?: string, risk_level?: string, action_summary?: string, next_step?: string}>}
 */
async function check({ toolName, toolArgs, messages }) {
  const meta = registry.getMetadata(toolName);
  // Unknown tool: be conservative — block. The agent loop already has
  // its own "unknown tool" handler so this rarely fires.
  if (!meta) {
    logger.warn(`[approvalGate] no metadata for tool "${toolName}", blocking`);
    return {
      verdict: 'BLOCK',
      reason: 'Unknown tool — registry has no metadata',
      action_summary: describeAction(toolName, toolArgs),
      next_step: 'This tool is not registered. Tell the user which capability they were trying to use and suggest an alternative.',
    };
  }

  // Read or write_safe: nothing to gate.
  if (meta.risk_level === RISK_LEVELS.READ || meta.risk_level === RISK_LEVELS.WRITE_SAFE) {
    return { verdict: 'PROCEED', reason: '' };
  }

  // Tools that didn't opt in to approval still bypass even if the
  // risk_level is destructive/external. (Defensive — should never happen
  // because we pair WRITE_DESTRUCTIVE/EXTERNAL_WRITE with requires_approval=true
  // in the registry, but keeping this check makes the policy explicit.)
  if (!meta.requires_approval) {
    return { verdict: 'PROCEED', reason: '' };
  }

  if (meta.risk_level === RISK_LEVELS.WRITE_DESTRUCTIVE) {
    return checkDestructive(toolName, toolArgs, messages || []);
  }
  if (meta.risk_level === RISK_LEVELS.EXTERNAL_WRITE) {
    return checkExternalWrite(toolName, toolArgs, messages || []);
  }
  // Unknown risk_level — fail closed.
  logger.warn(`[approvalGate] unhandled risk_level "${meta.risk_level}" for "${toolName}", blocking`);
  return {
    verdict: 'BLOCK',
    reason: `Unhandled risk level: ${meta.risk_level}`,
    action_summary: describeAction(toolName, toolArgs),
    next_step: 'Tell the user there\'s a configuration issue with this tool.',
  };
}

/**
 * Build the synthetic tool result the agent loop substitutes when a
 * call is blocked. Mirrors the old destructiveGuard.blockedToolResult
 * shape so existing prompt logic still works.
 */
function blockedToolResult(toolName, gateResult) {
  return {
    blocked: true,
    error: gateResult.risk_level === RISK_LEVELS.EXTERNAL_WRITE
      ? 'Outbound action blocked — explicit confirmation required before sending.'
      : 'Destructive action blocked — explicit confirmation required.',
    tool: toolName,
    verifier_reason: gateResult.reason,
    risk_level: gateResult.risk_level,
    action_summary: gateResult.action_summary,
    next_step: gateResult.next_step,
  };
}

/**
 * Convenience: build the SSE event payload the frontend renders as the
 * inline confirm card. `jobId` is added by the caller.
 */
function pendingApprovalEvent(toolName, args, gateResult) {
  return {
    type: 'pending_approval',
    tool: toolName,
    args,
    action_summary: gateResult.action_summary,
    risk_level: gateResult.risk_level,
    reason: gateResult.reason,
  };
}

module.exports = {
  check,
  blockedToolResult,
  pendingApprovalEvent,
  describeAction,
};
