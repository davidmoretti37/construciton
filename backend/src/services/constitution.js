/**
 * Constitution — Phase 6 safety layer.
 *
 * Hard rules the agent MUST NOT violate, expressed as code rather than
 * prompt instructions. The system prompt already says "don't do X" but
 * an LLM can be coaxed past prompt rules. The constitution runs AFTER
 * the LLM has produced a response and BEFORE we ship it to the user.
 *
 * Three categories of rule today:
 *   1. structural    — message has the right shape (plan emitted when
 *                      the planner ran, etc.)
 *   2. content       — the response text doesn't claim a thing it
 *                      can't actually do (e.g. "I sent the SMS" when
 *                      SMS is product-disabled)
 *   3. policy        — high-level behavior (don't reveal internal tool
 *                      names; don't claim deletion happened without
 *                      the destructive guard saying so)
 *
 * Rules return either { ok: true } or { ok: false, severity, fix? }.
 * Severity:
 *   - 'warn'   — log, ship the response anyway
 *   - 'block'  — replace the response with a fix message
 *
 * Cost: each rule is a synchronous regex/string check. ~10µs per turn.
 * Free safety net.
 */

const logger = require('../utils/logger');

/**
 * Rule: agent never claims to have sent an SMS when SMS is product-disabled.
 * Catches LLM hallucinations like "I just texted Carolyn."
 */
function ruleNoFakeSmsSend(ctx) {
  // Skip if SMS is enabled (the registry would have the SMS tools)
  const registry = require('./tools/registry');
  if (registry.getMetadata('send_sms')) return { ok: true };

  // Catch any indicative claim that an SMS was sent. We're permissive
  // on purpose — the cost of a false positive (replacing the response
  // with a clarifier) is low; the cost of a false negative (the user
  // believes a text went out when it didn't) is high.
  const text = ctx.responseText || '';
  const claimsSent = /\b(?:just\s+)?(?:texted|sms[-\s]?ed)\s+\w/i.test(text)
    || /\bsent\s+(?:a|an|the)?\s*(?:sms|text|text\s+message)\s+to\s+\w/i.test(text);
  if (!claimsSent) return { ok: true };
  return {
    ok: false,
    severity: 'block',
    rule: 'no_fake_sms_send',
    reason: 'Response claims an SMS was sent but SMS is disabled in this build.',
    fix: 'I can\'t actually send SMS in this build — that feature is currently off. Want me to draft an email or share the document via the existing share flow instead?',
  };
}

/**
 * Rule: agent never claims a destructive action completed if no
 * matching tool call was actually made AND not blocked by the gate.
 * Catches "Done — deleted the project" when nothing happened.
 */
function ruleNoFakeDestructiveCompletion(ctx) {
  const text = (ctx.responseText || '').toLowerCase();
  const claimsDeleted = /\b(deleted|removed|voided|cancelled|canceled)\s+(the|that|your|it)\b/i.test(ctx.responseText || '');
  if (!claimsDeleted) return { ok: true };
  // Check if a destructive tool actually ran successfully this turn
  const destructiveCalls = (ctx.executedToolCalls || []).filter(tc => {
    const name = tc.tool || tc.name || tc.function?.name;
    return /^(delete_|void_|cancel_)/i.test(name || '') && !tc.blocked;
  });
  if (destructiveCalls.length > 0) return { ok: true };
  return {
    ok: false,
    severity: 'warn',
    rule: 'no_fake_destructive_completion',
    reason: 'Response claims a destructive action completed, but no matching tool call ran this turn.',
  };
}

/**
 * Rule: agent never reveals internal tool names in its response. The
 * system prompt already says this; the constitution catches drift.
 */
function ruleNoToolNameLeak(ctx) {
  const text = ctx.responseText || '';
  // Heuristic: tool names are snake_case verbs like "search_projects",
  // "delete_expense", "get_ar_aging". A bare snake_case word in the
  // response is a strong signal.
  const matches = text.match(/\b(search_|get_|update_|delete_|create_|void_|assign_|unassign_|share_|record_|setup_|clock_|complete_|generate_|convert_|dispatch_|memory|read_sms_|send_sms|list_unread_)[a-z_]{3,}/g);
  if (!matches?.length) return { ok: true };
  // Filter false positives — lowercase product feature names like
  // "service_plan" are fine in user-facing copy. Tool names tend to
  // start with a verb.
  const verbStarters = ['search_', 'get_', 'update_', 'delete_', 'create_', 'void_', 'assign_', 'unassign_', 'share_', 'record_', 'setup_', 'clock_', 'complete_', 'generate_', 'convert_', 'dispatch_'];
  const real = matches.filter(m => verbStarters.some(v => m.startsWith(v)));
  if (real.length === 0) return { ok: true };
  return {
    ok: false,
    severity: 'warn',
    rule: 'no_tool_name_leak',
    reason: `Response includes internal tool name(s): ${real.join(', ')}.`,
  };
}

const RULES = [
  ruleNoFakeSmsSend,
  ruleNoFakeDestructiveCompletion,
  ruleNoToolNameLeak,
];

/**
 * Run every rule against the agent's outgoing response. Returns:
 *   { ok: true }            — clean, ship as-is
 *   { ok: false, results }  — at least one rule fired; if any have
 *                              severity='block', the caller should
 *                              substitute the fix text.
 */
function evaluate(ctx) {
  const violations = [];
  for (const rule of RULES) {
    try {
      const r = rule(ctx);
      if (!r.ok) violations.push(r);
    } catch (e) {
      logger.warn(`[constitution] rule threw: ${e.message}`);
    }
  }
  if (violations.length === 0) return { ok: true, results: [] };
  const blocked = violations.find(v => v.severity === 'block');
  return { ok: false, results: violations, blocked };
}

module.exports = { evaluate, RULES };
