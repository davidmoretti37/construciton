/**
 * PEV telemetry — structured log + optional Supabase persistence.
 *
 * Emits one JSON record per PEV invocation so we can answer:
 *   - How often is the classifier picking each class?
 *   - How long do plans take? (p50, p95)
 *   - What % of complex requests succeed vs ask vs fall back?
 *   - Where in the pipeline do failures concentrate?
 *
 * Persistence is opt-in via PEV_TELEMETRY_TABLE env (default: just log).
 * When set, writes a row per turn to that table (Supabase).
 *
 * The record shape is stable; downstream dashboards can rely on it.
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../../utils/logger');
const { recordUsage } = require('../aiBudget');

// Defaults to 'pev_turns' (the table created by 20260501_pev_telemetry.sql).
// Set PEV_TELEMETRY_TABLE='' to disable persistence (always-on logs continue).
const TELEMETRY_TABLE = process.env.PEV_TELEMETRY_TABLE !== undefined
  ? (process.env.PEV_TELEMETRY_TABLE || null)
  : 'pev_turns';

let supabase = null;
function getSupabase() {
  if (supabase) return supabase;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return supabase;
}

/**
 * Build a flat record from the runPev result.
 *
 * Privacy: we DO NOT log the user's message content or step args/results.
 * We log shape (classification, step count, tools used, timings) so we can
 * analyze behavior without storing user data.
 *
 * @param {Object} input
 *   userId      — string
 *   pevResult   — return value of runPev()
 *   sessionId   — optional chat session id (for joining across turns)
 */
function buildRecord({ userId, pevResult, sessionId = null }) {
  if (!pevResult) return null;
  const stages = pevResult.trace?.stages || [];

  const findStage = (name) => stages.find((s) => s.stage === name);
  const cls = findStage('classify');
  const planStage = findStage('plan');
  const verifyStages = stages.filter((s) => s.stage === 'verify');
  const executeStages = stages.filter((s) => s.stage === 'execute');
  const respondStage = findStage('respond');

  // Tool names used (just names, no args)
  const toolsUsed = (pevResult.stepResults || []).map((s) => s.tool);

  return {
    user_id: userId,
    session_id: sessionId,
    handoff: pevResult.handoff, // 'foreman' | 'ask' | 'response'
    classification: cls?.classification || null,
    classification_confidence: cls?.confidence || null,
    classification_fallback: cls?.fallback || false,
    classify_ms: cls?.latencyMs || null,
    plan_ok: planStage?.ok ?? null,
    plan_ms: planStage?.latencyMs || null,
    step_count: pevResult.plan?.steps?.length || 0,
    execute_loops: executeStages.length,
    execute_ok: executeStages[executeStages.length - 1]?.ok ?? null,
    reached_steps: executeStages[executeStages.length - 1]?.reachedSteps ?? 0,
    verify_loops: verifyStages.length,
    verify_satisfied: verifyStages[verifyStages.length - 1]?.satisfied ?? null,
    verify_short_circuit: verifyStages[verifyStages.length - 1]?.shortCircuit || false,
    respond_ms: respondStage?.latencyMs || null,
    respond_fallback: respondStage?.fallback || false,
    total_ms: pevResult.totalMs || null,
    tools_used: toolsUsed,
    created_at: new Date().toISOString(),
  };
}

/**
 * Record one PEV turn. Always logs structured JSON; optionally writes to
 * Supabase if PEV_TELEMETRY_TABLE is configured. Never throws — telemetry
 * failures must not affect the user's response.
 */
// Rough token estimates per PEV stage. Real values vary ±50% but these
// give the budget tracker a useful approximation so a runaway PEV pipeline
// can't silently bypass the monthly cap. The aiBudget existing flow records
// REAL tokens for the Foreman path; PEV's per-stage usage isn't easily
// extracted (each stage parses its OpenRouter response separately) so we
// estimate from stage outcomes.
const STAGE_TOKEN_ESTIMATES = {
  classify:   { input: 400,  output: 60,   model: 'claude-haiku-4.5' },
  plan_haiku: { input: 2500, output: 500,  model: 'claude-haiku-4.5' },
  plan_sonnet:{ input: 2500, output: 500,  model: 'claude-sonnet-4.6' },
  verify:    { input: 800,  output: 100,  model: 'claude-haiku-4.5' },
  respond:    { input: 700,  output: 250,  model: 'claude-haiku-4.5' },
  argRepair:  { input: 600,  output: 200,  model: 'claude-haiku-4.5' },
};

async function recordPevUsage(input) {
  try {
    if (!input?.userId || !input?.pevResult) return;
    const stages = input.pevResult.trace?.stages || [];
    if (stages.length === 0) return;

    // Aggregate estimated tokens per model
    const totals = {}; // model -> { input, output }
    function add(stageKey) {
      const e = STAGE_TOKEN_ESTIMATES[stageKey];
      if (!e) return;
      totals[e.model] = totals[e.model] || { input: 0, output: 0 };
      totals[e.model].input += e.input;
      totals[e.model].output += e.output;
    }

    for (const s of stages) {
      if (s.stage === 'classify' && !s.fallback) add('classify');
      if (s.stage === 'plan' && s.ok) {
        // Default plan is Haiku; if PEV escalated, a Sonnet call also happened
        add('plan_haiku');
        if (input.pevResult.plan?.escalated) add('plan_sonnet');
      }
      if (s.stage === 'verify' && !s.shortCircuit && !s.fallback) add('verify');
      if (s.stage === 'respond' && !s.fallback) add('respond');
    }

    for (const [model, tokens] of Object.entries(totals)) {
      recordUsage(input.userId, model, tokens.input, tokens.output).catch(() => {});
    }
  } catch (e) {
    logger.debug(`[PEV.telemetry] usage recording failed: ${e.message}`);
  }
}

async function recordPevTurn(input) {
  try {
    const rec = buildRecord(input);
    if (!rec) return;

    // Always emit structured log — searchable in Railway / log aggregator
    logger.info(`[PEV.telemetry] ${JSON.stringify({
      handoff: rec.handoff,
      classification: rec.classification,
      step_count: rec.step_count,
      execute_ok: rec.execute_ok,
      verify_satisfied: rec.verify_satisfied,
      total_ms: rec.total_ms,
      tools_used: rec.tools_used,
    })}`);

    // Cost tracking: record estimated PEV tokens against the user's monthly
    // aiBudget so the existing kill switch (HTTP 402 at /api/chat/agent if
    // over cap) actually applies to PEV-driven turns.
    recordPevUsage(input).catch(() => {});

    // Optional persistence
    if (TELEMETRY_TABLE) {
      const sb = getSupabase();
      if (!sb) return;
      const { error } = await sb.from(TELEMETRY_TABLE).insert(rec);
      if (error) logger.debug(`[PEV.telemetry] insert failed: ${error.message}`);
    }
  } catch (e) {
    // Telemetry must never break the request flow
    logger.debug(`[PEV.telemetry] threw: ${e.message}`);
  }
}

module.exports = { recordPevTurn, buildRecord };
