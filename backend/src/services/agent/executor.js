/**
 * Stage 2 — Executor (wave-parallel)
 *
 * Walks a Planner-produced plan, resolves {{placeholders}} against prior
 * step results, calls executeTool() for each, and stops cleanly on any
 * unrecoverable error.
 *
 * Scheduling: steps are grouped into TOPOLOGICAL WAVES from depends_on.
 * Steps in the same wave have no dependency on each other, so they run
 * IN PARALLEL via Promise.all. Steps in later waves wait for earlier
 * waves to complete. This cuts latency on broad-search plans
 * ("find John's project AND find Smith's project AND find overdue
 * invoices") from sum-of-step-times to max-of-wave-time per wave.
 *
 * Per-step semantics (unchanged from sequential version):
 * - Errors classified: transient (1 retry), bad_args (try repair), soft
 *   (halt unless optional), not_found (halt), fatal (halt)
 * - preToolCheck callback for approval gate
 * - repairArgs callback for LLM-assisted bad_args repair
 * - optional steps continue past failures
 * - emit() streams step-level events
 *
 * Result ordering: stepResults preserves plan order regardless of wave
 * concurrency, so the Verifier and Responder see deterministic output.
 */

const logger = require('../../utils/logger');

const MAX_STEPS = parseInt(process.env.PEV_MAX_STEPS, 10) || 12;
const PER_STEP_TIMEOUT_MS = parseInt(process.env.PEV_STEP_TIMEOUT_MS, 10) || 30_000;
const PARALLEL_ENABLED = process.env.PEV_PARALLEL !== '0'; // default on, kill switch via PEV_PARALLEL=0

/**
 * Run a plan.
 *
 * @param {Object} args
 *   plan          — { goal, steps, ... } from the Planner
 *   executeTool   — async (name, args, userId) => result
 *   userId        — string
 *   emit          — optional (event) => void for streaming
 *   preToolCheck  — optional async ({tool, args}) => {verdict, ...}
 *   repairArgs    — optional async ({tool, args, error}) => {repaired, args?}
 * @returns {Promise<{
 *   ok: boolean,
 *   stepResults: Array<{id, tool, args, result?, error?, ms, skipped?, repaired?}>,
 *   reachedSteps: number,
 *   stoppedReason?: string,
 *   pendingApproval?: object,
 * }>}
 */
async function execute({ plan, executeTool, userId, emit = () => {}, preToolCheck = null, repairArgs = null }) {
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

  const results = new Map();        // step id -> tool result (live during execution)
  const stepResultsByIndex = [];     // sparse, indexed by plan step position
  // We track results by index so plan-order is preserved even when waves
  // execute concurrently. After all waves finish, we flatten into stepResults.

  emit({ type: 'plan_start', goal: plan.goal, stepCount: plan.steps.length });

  // ─────────── Build waves from depends_on ───────────
  const waves = PARALLEL_ENABLED ? computeWaves(plan.steps) : plan.steps.map((s) => [s]);

  // Quick sanity: cycle detection
  const totalScheduled = waves.reduce((n, w) => n + w.length, 0);
  if (totalScheduled !== plan.steps.length) {
    return {
      ok: false,
      stepResults: [],
      reachedSteps: 0,
      stoppedReason: 'plan has a dependency cycle',
    };
  }

  let reachedSteps = 0;

  for (let waveIdx = 0; waveIdx < waves.length; waveIdx++) {
    const wave = waves[waveIdx];

    // Run all steps in this wave concurrently. Each runOneStep call is
    // self-contained: it resolves its own placeholders, runs preToolCheck,
    // calls the tool, applies retry/repair, returns a structured outcome.
    const ctx = { executeTool, userId, emit, preToolCheck, repairArgs, results, plan };
    const outcomes = await Promise.all(
      wave.map((step) => runOneStep(step, plan.steps.indexOf(step), ctx))
    );

    // Process outcomes IN PLAN ORDER (not wave order) so the first
    // halt-condition we surface matches the user's mental model of the plan.
    const orderedOutcomes = outcomes.slice().sort((a, b) => a.stepIndex - b.stepIndex);

    for (const outcome of orderedOutcomes) {
      stepResultsByIndex[outcome.stepIndex] = outcome.stepResult;

      if (outcome.kind === 'success') {
        results.set(outcome.stepResult.id, outcome.stepResult.result);
        reachedSteps++;
      } else if (outcome.kind === 'optional_failed') {
        // Optional step failed but plan continues. Set null so depends_on
        // placeholders resolve to null gracefully.
        results.set(outcome.stepResult.id, null);
        reachedSteps++;
      } else if (outcome.kind === 'pending_approval') {
        const flat = compactStepResults(stepResultsByIndex);
        return {
          ok: false,
          stepResults: flat,
          reachedSteps,
          stoppedReason: outcome.stoppedReason,
          pendingApproval: outcome.pendingApproval,
        };
      } else if (outcome.kind === 'halt') {
        const flat = compactStepResults(stepResultsByIndex);
        return {
          ok: false,
          stepResults: flat,
          reachedSteps,
          stoppedReason: outcome.stoppedReason,
        };
      }
    }
  }

  emit({ type: 'plan_complete', steps: plan.steps.length });
  return {
    ok: true,
    stepResults: compactStepResults(stepResultsByIndex),
    reachedSteps,
  };
}

// ─────────────────────────────────────────────────────────────────
// Per-step execution (extracted so it can run in parallel via Promise.all)
// Returns { kind, stepIndex, stepResult, stoppedReason?, pendingApproval? }
// kind: 'success' | 'optional_failed' | 'halt' | 'pending_approval'
// ─────────────────────────────────────────────────────────────────
async function runOneStep(step, stepIndex, ctx) {
  const { executeTool, userId, emit, preToolCheck, repairArgs, results, plan } = ctx;
  const t0 = Date.now();

  // 1. Resolve placeholders
  let resolvedArgs;
  try {
    resolvedArgs = resolvePlaceholders(step.args, results);
  } catch (e) {
    const err = `placeholder resolution failed for step ${step.id}: ${e.message}`;
    emit({ type: 'step_error', stepId: step.id, error: err });
    return {
      kind: 'halt',
      stepIndex,
      stepResult: { id: step.id, tool: step.tool, args: step.args, error: { message: err, class: 'fatal' }, ms: Date.now() - t0 },
      stoppedReason: err,
    };
  }

  emit({ type: 'step_start', stepId: step.id, stepIndex: stepIndex + 1, tool: step.tool, why: step.why });

  // 2. Pre-tool approval check
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
          kind: 'pending_approval',
          stepIndex,
          stepResult: { id: step.id, tool: step.tool, args: resolvedArgs, ms: Date.now() - t0 },
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
      // Fail-closed: gate error halts the plan
      return {
        kind: 'halt',
        stepIndex,
        stepResult: { id: step.id, tool: step.tool, args: resolvedArgs, error: { message: e.message, class: 'fatal' }, ms: Date.now() - t0 },
        stoppedReason: `approval check failed for step ${step.id}: ${e.message}`,
      };
    }
  }

  // 3. Call the tool with transient retry
  let result;
  let lastErr = null;
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

  // 4. Handle thrown errors (with arg-repair attempt for bad_args)
  if (lastErr) {
    const cls = classifyError(lastErr);

    if (cls === 'bad_args' && repairArgs && lastErr.message) {
      const repairStart = Date.now();
      emit({ type: 'step_repair_start', stepId: step.id, error: lastErr.message });
      try {
        const repair = await repairArgs({ tool: step.tool, args: resolvedArgs, error: lastErr.message });
        if (repair?.repaired && repair.args) {
          emit({ type: 'step_repair_done', stepId: step.id, ms: Date.now() - repairStart });
          try {
            const retried = await Promise.race([
              executeTool(step.tool, repair.args, userId),
              new Promise((_, rej) => setTimeout(() => rej(new Error('step timeout after repair')), PER_STEP_TIMEOUT_MS)),
            ]);
            if (retried && typeof retried === 'object' && retried.error) {
              lastErr = new Error(retried.error);
            } else {
              const ms = Date.now() - t0;
              emit({ type: 'step_done', stepId: step.id, tool: step.tool, ms, summary: summarizeResult(retried), repaired: true });
              return {
                kind: 'success',
                stepIndex,
                stepResult: { id: step.id, tool: step.tool, args: repair.args, result: retried, ms, repaired: true },
              };
            }
          } catch (retryErr) {
            lastErr = retryErr;
          }
        } else {
          emit({ type: 'step_repair_skipped', stepId: step.id, reason: repair?.reason || 'not repairable' });
        }
      } catch (e) {
        logger.debug(`[executor] repair stage threw: ${e.message}`);
      }
    }

    const ms = Date.now() - t0;
    const errClass = classifyError(lastErr);
    emit({ type: 'step_error', stepId: step.id, error: lastErr.message, errorClass: errClass, ms, optional: step.optional === true });

    const sr = {
      id: step.id, tool: step.tool, args: resolvedArgs,
      error: { message: lastErr.message, class: errClass },
      ms, skipped: step.optional === true,
    };
    if (step.optional === true) return { kind: 'optional_failed', stepIndex, stepResult: sr };
    return {
      kind: 'halt',
      stepIndex,
      stepResult: sr,
      stoppedReason: `step ${step.id} (${step.tool}) failed: ${lastErr.message}`,
    };
  }

  // 5. Soft errors (tool returned {error: ...} instead of throwing)
  if (result && typeof result === 'object' && result.error) {
    const ms = Date.now() - t0;
    emit({
      type: 'step_error',
      stepId: step.id,
      error: result.error,
      errorClass: 'soft',
      suggestions: result.suggestions || null,
      ms,
      optional: step.optional === true,
    });
    const sr = {
      id: step.id, tool: step.tool, args: resolvedArgs,
      result, // include raw so verifier can see suggestions
      error: { message: result.error, class: 'soft' },
      ms, skipped: step.optional === true,
    };
    if (step.optional === true) return { kind: 'optional_failed', stepIndex, stepResult: sr };
    return {
      kind: 'halt',
      stepIndex,
      stepResult: sr,
      stoppedReason: `step ${step.id} (${step.tool}) returned error: ${result.error}`,
    };
  }

  // 6. Success
  const ms = Date.now() - t0;
  emit({ type: 'step_done', stepId: step.id, tool: step.tool, ms, summary: summarizeResult(result) });
  return {
    kind: 'success',
    stepIndex,
    stepResult: { id: step.id, tool: step.tool, args: resolvedArgs, result, ms },
  };
}

// ─────────────────────────────────────────────────────────────────
// Wave computation — group steps into topological levels.
// Steps with all dependencies satisfied by earlier waves go in the
// next wave. Detects cycles by tracking unscheduled steps.
// ─────────────────────────────────────────────────────────────────
function computeWaves(steps) {
  const waves = [];
  const scheduled = new Set();
  let remaining = steps.slice();

  while (remaining.length > 0) {
    const wave = remaining.filter((s) => (s.depends_on || []).every((d) => scheduled.has(d)));
    if (wave.length === 0) {
      // Cycle or dependency on missing step — bail out, caller detects it
      // by noticing totalScheduled !== plan.steps.length
      break;
    }
    waves.push(wave);
    for (const s of wave) scheduled.add(s.id);
    remaining = remaining.filter((s) => !wave.includes(s));
  }
  return waves;
}

// Sparse stepResults (indexed by plan position) → dense array
function compactStepResults(byIndex) {
  return byIndex.filter((x) => x !== undefined);
}

// ─────────────────────────────────────────────────────────────────
// Placeholder resolution (unchanged)
// ─────────────────────────────────────────────────────────────────

const PLACEHOLDER_RE = /^\{\{\s*(.+?)\s*\}\}$/;
const HAS_PLACEHOLDER_RE = /\{\{\s*(.+?)\s*\}\}/g;

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
  HAS_PLACEHOLDER_RE.lastIndex = 0;
  return str.replace(HAS_PLACEHOLDER_RE, (_, path) => {
    const v = resolvePath(path, results);
    return v == null ? '' : String(v);
  });
}

function resolvePath(path, results) {
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
// Error classification + result summarization (unchanged)
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

function summarizeResult(r) {
  if (r == null) return null;
  if (typeof r !== 'object') return String(r).slice(0, 120);
  if (Array.isArray(r)) return `array(${r.length})`;
  if (typeof r.count === 'number') return `count=${r.count}`;
  if (Array.isArray(r.results)) return `results(${r.results.length})`;
  if (typeof r.id === 'string') return `id=${r.id.slice(0, 8)}…`;
  if (typeof r.success === 'boolean') return r.success ? 'success' : 'fail';
  return Object.keys(r).slice(0, 5).join(', ');
}

module.exports = {
  execute,
  // Exposed for tests
  resolvePlaceholders,
  classifyError,
  summarizeResult,
  computeWaves,
};
