/**
 * Stage 2 — Executor
 *
 * Walks a Planner-produced plan step by step, resolves {{placeholders}}
 * against prior step results, calls executeTool() for each, and stops
 * cleanly on any unrecoverable error.
 *
 * Design choices:
 * - Step order is plan-order. Plans are already topologically valid
 *   (validatePlan() in planner.js enforces depends_on points to earlier
 *   ids), so we don't re-sort.
 * - Placeholder syntax: '{{s1.field}}' / '{{s1.results[0].id}}'. Only
 *   string values in args are scanned; nested objects/arrays recurse.
 * - Errors classified into:
 *     transient  — network / 5xx / timeout — 1 retry with same args
 *     bad_args   — tool says "missing X" / "invalid Y" — surface to user
 *     not_found  — tool says nothing matched — surface to user
 *     fatal      — anything else — surface to user
 * - On any non-transient error, the Executor halts and returns a
 *   structured outcome so the orchestrator can ask the user instead of
 *   silently failing.
 * - emit() callback lets the orchestrator stream step-level events to
 *   the chat client (so the user sees "Step 1: searching projects... ✓").
 */

const logger = require('../../utils/logger');

const MAX_STEPS = parseInt(process.env.PEV_MAX_STEPS, 10) || 12;
const PER_STEP_TIMEOUT_MS = parseInt(process.env.PEV_STEP_TIMEOUT_MS, 10) || 30_000;

/**
 * Run a plan.
 *
 * @param {Object} args
 *   plan          — { goal, steps, ... } from the Planner
 *   executeTool   — async (name, args, userId) => result
 *   userId        — string
 *   emit          — optional callback (event) => void for streaming
 *   preToolCheck  — optional async ({tool, args}) => {verdict, reason, action_summary, ...}
 *                   When verdict='BLOCK', the executor halts WITHOUT calling
 *                   the tool and returns pendingApproval so the orchestrator
 *                   can surface an inline confirm card to the user. Used to
 *                   route writes through approvalGate (destructive writes,
 *                   external writes like email/QBO mirror).
 * @returns {Promise<{
 *   ok: boolean,
 *   stepResults: Array<{id, tool, args, result?, error?, ms}>,
 *   reachedSteps: number,
 *   stoppedReason?: string,
 *   pendingApproval?: { stepId, tool, args, gateResult },
 * }>}
 */
async function execute({ plan, executeTool, userId, emit = () => {}, preToolCheck = null }) {
  if (!plan || !Array.isArray(plan.steps)) {
    return { ok: false, stepResults: [], reachedSteps: 0, stoppedReason: 'no plan' };
  }
  if (plan.steps.length > MAX_STEPS) {
    return {
      ok: false,
      stepResults: [],
      reachedSteps: 0,
      stoppedReason: `plan has ${plan.steps.length} steps (max ${MAX_STEPS})`,
    };
  }

  const results = new Map(); // step id -> tool result
  const stepResults = [];

  emit({ type: 'plan_start', goal: plan.goal, stepCount: plan.steps.length });

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const t0 = Date.now();

    // Resolve placeholders against prior step results
    let resolvedArgs;
    try {
      resolvedArgs = resolvePlaceholders(step.args, results);
    } catch (e) {
      const err = `placeholder resolution failed for step ${step.id}: ${e.message}`;
      stepResults.push({ id: step.id, tool: step.tool, args: step.args, error: err, ms: Date.now() - t0 });
      emit({ type: 'step_error', stepId: step.id, error: err });
      return { ok: false, stepResults, reachedSteps: i, stoppedReason: err };
    }

    emit({
      type: 'step_start',
      stepId: step.id,
      stepIndex: i + 1,
      tool: step.tool,
      why: step.why,
    });

    // Pre-tool approval check (writes / external sends). Halts the plan
    // and surfaces a pending_approval card to the user before the tool
    // ever runs. Resumption happens in the next user turn (when they
    // tap Approve, the message becomes "yes confirm" and PEV re-plans).
    if (preToolCheck) {
      try {
        const check = await preToolCheck({ tool: step.tool, args: resolvedArgs });
        if (check?.verdict === 'BLOCK') {
          emit({
            type: 'pev_pending_approval',
            stepId: step.id,
            tool: step.tool,
            args: resolvedArgs,
            risk_level: check.risk_level,
            action_summary: check.action_summary,
            reason: check.reason,
          });
          return {
            ok: false,
            stepResults,
            reachedSteps: i,
            stoppedReason: `step ${step.id} (${step.tool}) requires user confirmation`,
            pendingApproval: {
              stepId: step.id,
              tool: step.tool,
              args: resolvedArgs,
              risk_level: check.risk_level,
              action_summary: check.action_summary,
              reason: check.reason,
              next_step: check.next_step,
            },
          };
        }
      } catch (e) {
        // Fail-closed: if the gate itself errors, halt rather than ship a
        // potentially-destructive call. Surface the gate failure to the user.
        return {
          ok: false,
          stepResults,
          reachedSteps: i,
          stoppedReason: `approval check failed for step ${step.id}: ${e.message}`,
        };
      }
    }

    let result;
    let lastErr = null;

    // 1 retry on transient errors
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        result = await Promise.race([
          executeTool(step.tool, resolvedArgs, userId),
          new Promise((_, rej) => setTimeout(
            () => rej(Object.assign(new Error('step timeout'), { transient: true })),
            PER_STEP_TIMEOUT_MS,
          )),
        ]);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        const cls = classifyError(e);
        if (cls !== 'transient' || attempt === 2) break;
        emit({ type: 'step_retry', stepId: step.id, reason: 'transient' });
      }
    }

    const ms = Date.now() - t0;

    if (lastErr) {
      const cls = classifyError(lastErr);
      stepResults.push({
        id: step.id,
        tool: step.tool,
        args: resolvedArgs,
        error: { message: lastErr.message, class: cls },
        ms,
      });
      emit({ type: 'step_error', stepId: step.id, error: lastErr.message, errorClass: cls, ms });
      return {
        ok: false,
        stepResults,
        reachedSteps: i,
        stoppedReason: `step ${step.id} (${step.tool}) failed: ${lastErr.message}`,
      };
    }

    // Tool handlers conventionally return { error: '...' } for soft failures
    // (e.g. "no project matches that name") instead of throwing. Treat those
    // the same as exceptions — halt and let the orchestrator decide whether
    // to ask the user.
    if (result && typeof result === 'object' && result.error) {
      stepResults.push({
        id: step.id,
        tool: step.tool,
        args: resolvedArgs,
        result, // include the raw result so the orchestrator/verifier can see suggestions
        error: { message: result.error, class: 'soft' },
        ms,
      });
      emit({
        type: 'step_error',
        stepId: step.id,
        error: result.error,
        errorClass: 'soft',
        suggestions: result.suggestions || null,
        ms,
      });
      return {
        ok: false,
        stepResults,
        reachedSteps: i,
        stoppedReason: `step ${step.id} (${step.tool}) returned error: ${result.error}`,
      };
    }

    results.set(step.id, result);
    stepResults.push({ id: step.id, tool: step.tool, args: resolvedArgs, result, ms });
    emit({
      type: 'step_done',
      stepId: step.id,
      tool: step.tool,
      ms,
      // Don't ship the full result over SSE — could be big. Just a summary.
      summary: summarizeResult(result),
    });
  }

  emit({ type: 'plan_complete', steps: plan.steps.length });
  return { ok: true, stepResults, reachedSteps: plan.steps.length };
}

// ─────────────────────────────────────────────────────────────────
// Placeholder resolution
// ─────────────────────────────────────────────────────────────────

const PLACEHOLDER_RE = /^\{\{\s*(.+?)\s*\}\}$/;
const HAS_PLACEHOLDER_RE = /\{\{\s*(.+?)\s*\}\}/g;

/**
 * Walk an args object, replacing {{stepId.path}} strings with values
 * from prior step results.
 *
 * Two replacement modes:
 *   - The whole string is a single placeholder ("{{s1.results[0].id}}")
 *     → replace with the actual value (preserves type — UUID stays string,
 *     number stays number)
 *   - The string contains placeholders mixed with text ("CO for {{s1.name}}")
 *     → replace each with String(value) and concatenate
 *
 * Throws if a referenced step id is missing or a path doesn't resolve.
 */
function resolvePlaceholders(value, results) {
  if (value == null) return value;
  if (typeof value === 'string') return resolveString(value, results);
  if (Array.isArray(value)) return value.map((v) => resolvePlaceholders(v, results));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = resolvePlaceholders(v, results);
    }
    return out;
  }
  return value;
}

function resolveString(str, results) {
  const whole = str.match(PLACEHOLDER_RE);
  if (whole) {
    return resolvePath(whole[1], results);
  }
  if (!HAS_PLACEHOLDER_RE.test(str)) return str;
  // Reset regex stateful flag
  HAS_PLACEHOLDER_RE.lastIndex = 0;
  return str.replace(HAS_PLACEHOLDER_RE, (_, path) => {
    const v = resolvePath(path, results);
    return v == null ? '' : String(v);
  });
}

function resolvePath(path, results) {
  // Path: 'sN.field.field2[index].field3'
  const parts = path.split(/\.|(?=\[)/).filter(Boolean);
  const stepId = parts.shift();
  if (!results.has(stepId)) {
    throw new Error(`placeholder references missing step '${stepId}'`);
  }
  let cur = results.get(stepId);
  for (const part of parts) {
    if (cur == null) throw new Error(`placeholder path '${path}' hits null at '${part}'`);
    if (part.startsWith('[') && part.endsWith(']')) {
      const idx = parseInt(part.slice(1, -1), 10);
      cur = cur[idx];
    } else {
      cur = cur[part];
    }
  }
  return cur;
}

// ─────────────────────────────────────────────────────────────────
// Error classification + result summarization
// ─────────────────────────────────────────────────────────────────

function classifyError(err) {
  if (err && err.transient === true) return 'transient';
  const msg = String(err?.message || err || '').toLowerCase();
  if (msg.includes('timeout') || msg.includes('econnreset') || msg.includes('etimedout')) {
    return 'transient';
  }
  if (msg.includes('5') && /5\d\d/.test(msg)) return 'transient';
  if (msg.includes('not found') || msg.includes('no match')) return 'not_found';
  if (msg.includes('required') || msg.includes('invalid') || msg.includes('missing')) {
    return 'bad_args';
  }
  return 'fatal';
}

/**
 * Summarize a tool result for streaming events so we don't ship huge
 * payloads. The full result is still kept in stepResults for the
 * verifier and the final response.
 */
function summarizeResult(r) {
  if (r == null) return null;
  if (typeof r !== 'object') return String(r).slice(0, 120);
  // Pull a count if it's a list-shaped result
  if (Array.isArray(r)) return `array(${r.length})`;
  if (typeof r.count === 'number') return `count=${r.count}`;
  if (Array.isArray(r.results)) return `results(${r.results.length})`;
  if (typeof r.id === 'string') return `id=${r.id.slice(0, 8)}…`;
  if (typeof r.success === 'boolean') return r.success ? 'success' : 'fail';
  // Fall back to the first 5 keys
  return Object.keys(r).slice(0, 5).join(', ');
}

module.exports = {
  execute,
  // Exposed for unit tests
  resolvePlaceholders,
  classifyError,
  summarizeResult,
};
