/**
 * Plan-Execute-Verify orchestrator.
 *
 * Composes classifier + planner + executor + verifier into a single
 * entry point: runPev(). agentService.js calls this when the classifier
 * flags a message as 'complex'; otherwise it stays on the existing
 * Foreman flow (single-loop tool calling).
 *
 *   classify(message)
 *     │
 *     ├─ simple/briefing → return { handoff: 'foreman' }
 *     ├─ clarification   → return { handoff: 'ask', question: '...' }
 *     └─ complex →
 *          plan() → if needs_user_input or low confidence:
 *                       return { handoff: 'ask', question: ... }
 *                   else:
 *                       execute() → loop:
 *                         verify() → satisfied? done : try again
 *                                    (capped at MAX_VERIFY_LOOPS)
 *                       on stuck: return { handoff: 'foreman' }
 *
 * Default: ON. Set PEV_ENABLED=0 to disable (kill switch — falls through
 * to the existing Foreman flow with zero behavioral change).
 *
 * Returns one of:
 *   { handoff: 'foreman', reason }                — fall through to current flow
 *   { handoff: 'ask', question, options? }        — frontend renders a question
 *   { handoff: 'response', plan, stepResults, verifier, response? }
 *                                                 — agent has solved it
 */

const logger = require('../../utils/logger');
const { classify } = require('./classifier');
const { plan: makePlan, planVerdict } = require('./planner');
const { execute } = require('./executor');
const { verify, MAX_VERIFY_LOOPS } = require('./verifier');
const { respond } = require('./responder');
const approvalGate = require('../approvalGate');
const { evaluatePlan } = require('../constitution');
const { repair: repairArgs, isWorthRepairing } = require('./argRepair');

// Default ON. Set PEV_ENABLED=0 to disable (kill switch).
const PEV_ENABLED = process.env.PEV_ENABLED !== '0';

/**
 * Run the PEV pipeline on a user message.
 *
 * @param {Object} input
 *   userMessage     — string
 *   tools           — filtered tool defs (from toolRouter)
 *   userId          — string
 *   executeTool     — async (name, args, userId) => result
 *   businessContext — optional string
 *   memorySnapshot  — optional string
 *   hints           — optional state hints (active preview, etc.)
 *   emit            — optional event emitter for streaming
 * @returns {Promise<Object>}
 */
async function runPev(input) {
  const {
    userMessage,
    tools,
    userId,
    executeTool,
    businessContext = '',
    memorySnapshot = '',
    hints = {},
    emit = () => {},
  } = input;

  const trace = { stages: [] };
  const t0 = Date.now();

  // ─────────── Stage 0: Classify ───────────
  emit({ type: 'pev_classify_start' });
  const cls = await classify(userMessage, hints);
  trace.stages.push({ stage: 'classify', ...cls });
  emit({ type: 'pev_classify_done', classification: cls.classification, confidence: cls.confidence });

  if (cls.classification === 'simple' || cls.classification === 'briefing') {
    return { handoff: 'foreman', reason: cls.classification, trace, totalMs: Date.now() - t0 };
  }
  if (cls.classification === 'clarification') {
    return {
      handoff: 'ask',
      question: 'Could you say a bit more about what you want to do?',
      trace,
      totalMs: Date.now() - t0,
    };
  }
  // complex → plan

  // ─────────── Stage 1: Plan ───────────
  emit({ type: 'pev_plan_start' });
  const planResult = await makePlan({
    userMessage,
    tools,
    businessContext,
    memorySnapshot,
  });
  trace.stages.push({ stage: 'plan', ok: planResult.ok, latencyMs: planResult.latencyMs });

  if (!planResult.ok) {
    emit({ type: 'pev_plan_failed', reason: planResult.error });
    return { handoff: 'foreman', reason: `plan failed: ${planResult.error}`, trace, totalMs: Date.now() - t0 };
  }

  const verdict = planVerdict(planResult.plan);
  emit({ type: 'pev_plan_done', verdict, stepCount: planResult.plan.steps.length });

  if (verdict === 'ask') {
    const q = planResult.plan.needs_user_input?.question
      || 'I need a bit more info to act on that.';
    return {
      handoff: 'ask',
      question: q,
      options: planResult.plan.needs_user_input?.options || [],
      plan: planResult.plan,
      trace,
      totalMs: Date.now() - t0,
    };
  }
  if (verdict === 'fallback') {
    return { handoff: 'foreman', reason: 'plan unactionable', trace, totalMs: Date.now() - t0 };
  }

  // Constitutional check on the plan. Hard rules that prose can't
  // reliably enforce — e.g., "never decompose a change order into
  // create_project_phase + record_expense" (the bug class that motivated
  // the PEV rebuild). If a rule blocks, we re-plan ONCE with the rule's
  // reason injected as feedback; if it still violates, hand off to the
  // user with the reason.
  const constCheck = evaluatePlan({ plan: planResult.plan, userMessage });
  trace.stages.push({ stage: 'constitution', ok: !constCheck.blocked });
  if (constCheck.blocked) {
    emit({ type: 'pev_constitution_blocked', rule: constCheck.blocked.rule, reason: constCheck.blocked.reason });
    // One repair attempt: feed the rule's reason back to the planner as
    // explicit guidance and re-plan. If the second plan still violates,
    // surface to the user.
    const repaired = await makePlan({
      userMessage: `${userMessage}\n\n[Plan rejected: ${constCheck.blocked.reason}\n${constCheck.blocked.fix || ''}]`,
      tools,
      businessContext,
      memorySnapshot,
    });
    if (repaired.ok && planVerdict(repaired.plan) === 'execute') {
      const repairedCheck = evaluatePlan({ plan: repaired.plan, userMessage });
      if (!repairedCheck.blocked) {
        emit({ type: 'pev_constitution_repaired', rule: constCheck.blocked.rule });
        planResult.plan = repaired.plan; // proceed with the repaired plan
      } else {
        return {
          handoff: 'ask',
          question: `I tried to plan that but ran into a structural rule: ${constCheck.blocked.reason}`,
          plan: repaired.plan,
          trace,
          totalMs: Date.now() - t0,
        };
      }
    } else {
      return {
        handoff: 'ask',
        question: `I'm not able to do that the way the request describes. ${constCheck.blocked.reason}`,
        trace,
        totalMs: Date.now() - t0,
      };
    }
  }

  // ─────────── Stages 2 + 3: Execute + Verify (with bounded retry loop) ───────────
  let attemptedPlan = planResult.plan;
  let lastExec = null;
  let lastVerifier = null;
  let loops = 0;

  while (loops <= MAX_VERIFY_LOOPS) {
    loops++;

    emit({ type: 'pev_execute_start', loop: loops });
    lastExec = await execute({
      plan: attemptedPlan,
      executeTool,
      userId,
      emit,
      preToolCheck: async ({ tool, args }) => approvalGate.check({ toolName: tool, toolArgs: args, messages: [] }),
      // LLM-assisted argument repair: when a tool returns bad_args, run a
      // small Haiku call to fix the args and retry once. Pre-filtered to
      // bad_args-shaped errors only so we don't burn LLM calls on
      // not-found / auth / ambiguous failures that arg massaging can't fix.
      repairArgs: async ({ tool, args, error }) => {
        if (!isWorthRepairing(error)) return { repaired: false, reason: 'not arg-repairable' };
        const toolDef = (tools || []).find((t) => (t.function || t).name === tool);
        const schema = toolDef?.function?.parameters || toolDef?.parameters;
        return repairArgs({ tool, args, error, schema });
      },
    });
    trace.stages.push({ stage: 'execute', loop: loops, ok: lastExec.ok, reachedSteps: lastExec.reachedSteps, pendingApproval: !!lastExec.pendingApproval });
    emit({ type: 'pev_execute_done', ok: lastExec.ok });

    // Approval gate fired — halt and ask the user to confirm before any
    // destructive/external write tool runs. Surface as a special handoff
    // so the orchestrator's caller can emit a pending_approval SSE event
    // matching the existing approval flow's wire format.
    if (lastExec.pendingApproval) {
      return {
        handoff: 'approval',
        pendingApproval: lastExec.pendingApproval,
        plan: attemptedPlan,
        stepResults: lastExec.stepResults,
        trace,
        totalMs: Date.now() - t0,
      };
    }

    emit({ type: 'pev_verify_start' });
    lastVerifier = await verify({
      userMessage,
      plan: attemptedPlan,
      executeResult: lastExec,
      memorySnapshot, // memory-aware verification: flag plans that violate stored business rules
    });
    trace.stages.push({
      stage: 'verify',
      loop: loops,
      satisfied: lastVerifier.satisfied,
      shortCircuit: !!lastVerifier.shortCircuit,
      latencyMs: lastVerifier.latencyMs,
    });
    emit({
      type: 'pev_verify_done',
      satisfied: lastVerifier.satisfied,
      gap: lastVerifier.gap,
    });

    if (lastVerifier.satisfied) break;

    // Not satisfied: if execution actually failed, surface to user (don't
    // just spin in re-verify loops — the gap is real and needs human input)
    if (!lastExec.ok) {
      return {
        handoff: 'ask',
        question: lastVerifier.gap || lastExec.stoppedReason || 'I hit an issue running that.',
        suggestion: lastVerifier.suggestion || null,
        plan: attemptedPlan,
        stepResults: lastExec.stepResults,
        verifier: lastVerifier,
        trace,
        totalMs: Date.now() - t0,
      };
    }

    if (loops > MAX_VERIFY_LOOPS) break;

    // Plan re-extension: if execution succeeded but verifier flagged a
    // gap, ask the planner to extend the plan with the missing step(s).
    // We give it the original message + verifier's gap as additional
    // signal. If re-planning fails, hand off.
    emit({ type: 'pev_replan_start', gap: lastVerifier.gap });
    const replanned = await makePlan({
      userMessage: `${userMessage}\n\n[Verifier flagged: ${lastVerifier.gap}. ${lastVerifier.suggestion || ''}]`,
      tools,
      businessContext,
      memorySnapshot,
    });
    if (!replanned.ok || planVerdict(replanned.plan) !== 'execute') {
      emit({ type: 'pev_replan_failed' });
      break;
    }
    attemptedPlan = replanned.plan;
  }

  // ─────────── Stage 4: Respond ───────────
  // Compose the user-facing reply directly from plan + step results.
  // Replaces the previous "inject synthetic msg into messages and let
  // Foreman re-compose" path which round-tripped through a second LLM.
  emit({ type: 'pev_respond_start' });
  const responder = await respond({
    userMessage,
    plan: attemptedPlan,
    stepResults: lastExec?.stepResults || [],
  });
  trace.stages.push({ stage: 'respond', latencyMs: responder.latencyMs, fallback: responder.fallback });
  emit({ type: 'pev_respond_done', textLength: (responder.text || '').length });

  return {
    handoff: 'response',
    plan: attemptedPlan,
    stepResults: lastExec?.stepResults || [],
    verifier: lastVerifier,
    response: {
      text: responder.text,
      visualElements: responder.visualElements || [],
      fallback: responder.fallback,
    },
    trace,
    totalMs: Date.now() - t0,
  };
}

module.exports = { runPev, PEV_ENABLED };
