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
