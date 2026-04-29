/**
 * Step tracker — Phase 2 of Foreman 2.0.
 *
 * For complex plans, the planner emits a 1-5 step list (`plan.steps`).
 * This module tracks the lifecycle of each step inside the agent loop:
 *
 *     pending → in_progress → completed
 *                          → failed
 *
 * Tracking is heuristic, driven by which tool names get called each
 * round. It complements (does not replace) the planner verifier:
 *
 *  - Verifier compares ACTUAL EXECUTION vs PLAN at the end of the turn.
 *  - StepTracker streams progress DURING the turn so the UI can render
 *    "step 2/5: Email the welcome packet" while the work is happening.
 *
 * SSE events emitted (writer is the agentService createJobWriter):
 *
 *   { type: 'step_started',   step_id, action }
 *   { type: 'step_completed', step_id }
 *   { type: 'step_failed',    step_id, reason }
 *
 * Frontend rendering of these is deferred to Phase 3; backend emits
 * them now so the wire format is stable.
 *
 * Design notes:
 *  - We do NOT mutate the plan. The tracker keeps its own state copy.
 *  - We do NOT block the agent loop on step ordering. depends_on is
 *    informational; the LLM has the full step list in its context and
 *    is expected to follow order. If it doesn't, the verifier catches it.
 *  - We DO attribute the first matching tool call to a single step so
 *    the same tool firing doesn't advance two steps simultaneously.
 */

/**
 * Build a step tracker for a single agent turn.
 * @param {Array<{id:number, action:string, tools_likely?:string[], depends_on?:number[]}>} steps
 * @param {Object} writer - agentService writer with .emit({ type, ... })
 * @returns {Object} tracker with onToolRound + markFailed + summary + getActiveStepId
 */
function createStepTracker(steps, writer) {
  if (!Array.isArray(steps) || steps.length === 0) return null;

  const state = steps.map(s => ({
    id: s.id,
    action: s.action,
    tools_likely: Array.isArray(s.tools_likely) ? s.tools_likely.slice() : [],
    depends_on: Array.isArray(s.depends_on) ? s.depends_on.slice() : [],
    status: 'pending',
    matched_tools: new Set(),
  }));

  function emit(event) {
    try { writer?.emit?.(event); } catch (_) { /* writer may be null in tests */ }
  }

  function isCompleted(step) {
    return step.status === 'completed' || step.status === 'failed';
  }

  function dependenciesSatisfied(step) {
    if (!step.depends_on?.length) return true;
    return step.depends_on.every(prereqId => {
      const prereq = state.find(s => s.id === prereqId);
      return prereq?.status === 'completed';
    });
  }

  /**
   * Advance the step state given the tool calls that just ran.
   * @param {Array<{name?:string, function?:{name?:string}}>} toolCalls
   */
  function onToolRound(toolCalls) {
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return;
    const calledNames = toolCalls
      .map(c => c?.name || c?.function?.name)
      .filter(Boolean);
    if (calledNames.length === 0) return;

    // First pass: claim called tools for the earliest matching unfinished
    // step. Each tool name is attributed to one step max so progress
    // reads cleanly even if two steps share a tool.
    const claimed = new Set();
    for (const step of state) {
      if (isCompleted(step)) continue;
      if (!dependenciesSatisfied(step)) continue;

      for (const name of calledNames) {
        if (claimed.has(name)) continue;
        if (step.tools_likely.length === 0 || step.tools_likely.includes(name)) {
          step.matched_tools.add(name);
          claimed.add(name);
          if (step.status === 'pending') {
            step.status = 'in_progress';
            emit({ type: 'step_started', step_id: step.id, action: step.action });
          }
        }
      }
    }

    // Second pass: mark steps completed when all expected tools have run.
    for (const step of state) {
      if (isCompleted(step)) continue;
      if (step.status !== 'in_progress') continue;

      const targets = step.tools_likely;
      const allRan = targets.length > 0 && targets.every(t => step.matched_tools.has(t));

      // If the planner gave no tools_likely but a tool got attributed to
      // this step, treat the first match as completion. Heuristic, but
      // better than leaving such steps stuck in_progress forever.
      const noTargetsButProgress = targets.length === 0 && step.matched_tools.size > 0;

      if (allRan || noTargetsButProgress) {
        step.status = 'completed';
        emit({ type: 'step_completed', step_id: step.id });
      }
    }
  }

  /**
   * Mark a step failed. Overrides 'completed' too — a tool can run AND
   * return an error, in which case the round-tracker may have already
   * marked the step completed. The corrective step_failed event is what
   * the verifier + frontend need to see.
   */
  function markFailed(stepId, reason = '') {
    const step = state.find(s => s.id === stepId);
    if (!step) return;
    if (step.status === 'failed') return; // already terminal
    step.status = 'failed';
    emit({ type: 'step_failed', step_id: stepId, reason: String(reason).slice(0, 240) });
  }

  /** First non-completed step's id, or null. */
  function getActiveStepId() {
    const active = state.find(s => s.status === 'in_progress');
    if (active) return active.id;
    const next = state.find(s => s.status === 'pending' && dependenciesSatisfied(s));
    return next ? next.id : null;
  }

  /** Snapshot for telemetry / verifier / report. */
  function summary() {
    return state.map(s => ({
      id: s.id,
      action: s.action,
      status: s.status,
      tools_seen: Array.from(s.matched_tools),
    }));
  }

  return { onToolRound, markFailed, summary, getActiveStepId };
}

module.exports = { createStepTracker };
