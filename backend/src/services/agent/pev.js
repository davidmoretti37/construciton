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
// Detects "dry run", "test mode", "preview only" — message intent that
// asks for the plan without execution. We strip the marker before
// classifying / planning so the rest of the pipeline doesn't get confused.
const DRY_RUN_RE = /^\s*(?:dry[\s-]?run|test[\s-]?mode|preview\s+only|just\s+show\s+me\s+(?:the\s+)?plan)[:\s,.-]*/i;

// Tools that are read-only — failures on these are usually environmental
// (DB hiccup, transient connection) and the simple Foreman flow can often
// recover. If PEV halts on the FIRST step and that step is a read tool,
// fall back instead of asking the user something they can't answer.
const READONLY_TOOLS = new Set([
  'search_projects', 'get_project_details', 'get_project_summary',
  'search_estimates', 'get_estimate_details',
  'search_invoices', 'get_invoice_details',
  'search_workers', 'get_workers', 'get_worker_details',
  'list_change_orders', 'get_change_order',
  'list_subs', 'get_sub', 'get_sub_compliance',
  'list_engagements', 'get_engagement',
  'global_search', 'query_event_history',
  'get_transactions', 'get_financial_overview',
  'get_daily_briefing',
]);

const GENERIC_ERROR_PATTERNS = [
  /something went wrong/i,
  /that action isn'?t available/i,
  /unknown error/i,
];

function shouldFallbackToForeman(executeResult, plan) {
  // Only fall back if execution halted on the FIRST step
  if (!executeResult || executeResult.reachedSteps !== 0) return false;
  if (!Array.isArray(executeResult.stepResults) || executeResult.stepResults.length !== 1) return false;
  const sr = executeResult.stepResults[0];
  if (!sr?.error) return false;
  // Only fall back for read-only tools (writes need approval, fall-through is risky)
  if (!READONLY_TOOLS.has(sr.tool)) return false;
  // Only fall back on generic errors — specific errors (not_found, ambiguous)
  // give the user good info via the Responder
  const msg = String(sr.error.message || '').toLowerCase();
  if (!GENERIC_ERROR_PATTERNS.some((re) => re.test(msg))) return false;
  return true;
}

function detectDryRun(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return { dryRun: false, cleaned: userMessage };
  const m = userMessage.match(DRY_RUN_RE);
  if (m) {
    return { dryRun: true, cleaned: userMessage.slice(m[0].length).trim() };
  }
  return { dryRun: false, cleaned: userMessage };
}

async function runPev(input) {
  const {
    tools,
    userId,
    executeTool,
    businessContext = '',
    memorySnapshot = '',
    hints = {},
    conversationHistory = [],
    emit = () => {},
  } = input;
  // Dry-run mode: if message starts with "dry run:", "test mode:", etc.,
  // we plan + verify the plan but DON'T execute. User sees what would
  // happen without consequences. Useful for big invoices, COs, anything
  // with side effects. Strip the marker so classification works on the
  // remaining intent.
  const { dryRun, cleaned: userMessage } = detectDryRun(input.userMessage);

  const trace = { stages: [] };
  const t0 = Date.now();

  // ─────────── Stage 0: Classify ───────────
  emit({ type: 'pev_classify_start' });
  // Pass conversation history into hints so the classifier can disambiguate
  // continuations ("just delete them") from fragments. Without this,
  // follow-up turns get misrouted to 'clarification' even though the prior
  // agent message gives full context.
  const classifyHints = { ...hints, conversationHistory };
  const cls = await classify(userMessage, classifyHints);
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
  // If the user's message is a short continuation ("just delete them",
  // "yeah do it"), bake in the prior agent question + the original user
  // request so the planner has the full intent. Otherwise the planner
  // sees a fragment and has to ask.
  const enrichedUserMessage = enrichWithContext(userMessage, conversationHistory);
  const planResult = await makePlan({
    userMessage: enrichedUserMessage,
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
    const rawQ = planResult.plan.needs_user_input?.question
      || 'I need a bit more info to act on that.';
    // Humanize the planner's question through the Responder. Most of the
    // time the planner's question is fine, but Responder enforces tone
    // (no apologies, one-question-only, concrete options).
    const responder = await respond({
      userMessage,
      outcome: 'ask',
      plan: planResult.plan,
      stepResults: [],
      gap: rawQ,
    });
    trace.stages.push({ stage: 'respond', latencyMs: responder.latencyMs, fallback: responder.fallback, outcome: 'ask' });
    return {
      handoff: 'ask',
      question: responder.text,
      options: planResult.plan.needs_user_input?.options || [],
      plan: planResult.plan,
      response: { text: responder.text, visualElements: [] },
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

  // ─────────── Dry-run mode: stop after planning, return the plan ───────────
  if (dryRun) {
    emit({ type: 'pev_dry_run', stepCount: planResult.plan.steps.length });
    return {
      handoff: 'response',
      dryRun: true,
      plan: planResult.plan,
      stepResults: [],
      response: {
        text: formatDryRunSummary(planResult.plan),
        visualElements: [],
        fallback: false,
      },
      trace,
      totalMs: Date.now() - t0,
    };
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
      // Humanize the approval prompt through the Responder so we never
      // surface raw "action_summary" text directly.
      const responder = await respond({
        userMessage,
        outcome: 'approval',
        plan: attemptedPlan,
        stepResults: lastExec.stepResults,
        pendingApproval: lastExec.pendingApproval,
      });
      trace.stages.push({ stage: 'respond', latencyMs: responder.latencyMs, fallback: responder.fallback, outcome: 'approval' });
      return {
        handoff: 'approval',
        pendingApproval: lastExec.pendingApproval,
        plan: attemptedPlan,
        stepResults: lastExec.stepResults,
        response: { text: responder.text, visualElements: [] },
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

    // Not satisfied AND execution failed. Two paths from here:
    //   a) FALL BACK to Foreman if the failure is the FIRST step and it's
    //      a read-only tool with a generic error. The simple Foreman flow
    //      has the full system prompt and tool surface and might handle
    //      the request without halting. This is the escape hatch for the
    //      "agent got stupid" UX failure — when PEV is stuck, the user
    //      gets the working agent back instead of a humanized "I dunno".
    //   b) Otherwise, surface to user via Responder (humanized). For
    //      mid-plan failures, multi-step plans, write tools, etc.
    if (!lastExec.ok) {
      if (shouldFallbackToForeman(lastExec, attemptedPlan)) {
        emit({ type: 'pev_fallback_foreman', reason: 'read-tool failure on first step' });
        return {
          handoff: 'foreman',
          reason: 'pev stuck on first read step — letting Foreman handle it',
          plan: attemptedPlan,
          stepResults: lastExec.stepResults,
          trace,
          totalMs: Date.now() - t0,
        };
      }

      const responder = await respond({
        userMessage,
        outcome: 'ask',
        plan: attemptedPlan,
        stepResults: lastExec.stepResults,
        gap: lastVerifier.gap || lastExec.stoppedReason,
        suggestion: lastVerifier.suggestion,
      });
      trace.stages.push({ stage: 'respond', latencyMs: responder.latencyMs, fallback: responder.fallback, outcome: 'ask' });
      return {
        handoff: 'ask',
        question: responder.text, // human-readable, never technical
        plan: attemptedPlan,
        stepResults: lastExec.stepResults,
        verifier: lastVerifier,
        response: { text: responder.text, visualElements: [] },
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
    outcome: 'success',
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

/**
 * If the current user message is a short continuation (under 80 chars) and
 * the recent conversation has a longer user request, prepend the prior
 * intent so the planner sees the full picture. Without this, "just delete
 * them" gets planned in isolation and misses what to delete.
 *
 * Heuristic: short message + history with a longer user message in the
 * last 4 turns + agent's last turn was a question → enrich.
 */
function enrichWithContext(userMessage, conversationHistory) {
  if (!userMessage || userMessage.length > 80) return userMessage;
  if (!Array.isArray(conversationHistory) || conversationHistory.length === 0) return userMessage;

  // Find the last substantive user request (>40 chars) in recent history,
  // and the last agent message
  let priorRequest = null;
  let priorAgentMsg = null;
  for (let i = conversationHistory.length - 1; i >= Math.max(0, conversationHistory.length - 6); i--) {
    const turn = conversationHistory[i];
    if (!turn || typeof turn !== 'object') continue;
    let text = '';
    if (typeof turn.content === 'string') text = turn.content;
    else if (Array.isArray(turn.content)) {
      const t = turn.content.find((b) => b.type === 'text');
      if (t) text = t.text || '';
    }
    if (!text) continue;
    if (turn.role === 'user' && !priorRequest && text.length > 40 && text !== userMessage) {
      priorRequest = text;
    }
    if (turn.role === 'assistant' && !priorAgentMsg) {
      priorAgentMsg = text;
    }
    if (priorRequest && priorAgentMsg) break;
  }

  if (!priorRequest) return userMessage;

  return [
    `[Continuation of prior request]`,
    `Original: ${priorRequest.slice(0, 500)}`,
    priorAgentMsg ? `Agent asked: ${priorAgentMsg.slice(0, 300)}` : null,
    `User now says: ${userMessage}`,
  ].filter(Boolean).join('\n');
}

/**
 * Human-readable dry-run plan summary. Lists each step + why so the user
 * can review consequences before they happen.
 */
function formatDryRunSummary(plan) {
  if (!plan || !Array.isArray(plan.steps)) return 'Dry run: no plan generated.';
  const lines = [`Here's what I would do (dry run — nothing executed):`, ''];
  lines.push(`Goal: ${plan.goal}`);
  lines.push('');
  for (let i = 0; i < plan.steps.length; i++) {
    const s = plan.steps[i];
    const optional = s.optional ? ' [optional]' : '';
    lines.push(`${i + 1}. ${s.tool}${optional}`);
    if (s.why) lines.push(`   ${s.why}`);
  }
  lines.push('');
  lines.push(`Send the same message without "dry run" to execute.`);
  return lines.join('\n');
}

module.exports = { runPev, PEV_ENABLED, detectDryRun };
