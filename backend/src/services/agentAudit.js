/**
 * Agent Turn Audit — durable per-turn record.
 *
 * Writes one row to agent_turn_audit for every agent turn. Captures
 * user message, tool calls + results, final response, claims extracted
 * from the response, the verifier's consistency verdict, and any
 * intervention applied. Plus a row to capability_gaps when the
 * verifier detected the user asked for something we have no tool for.
 *
 * Fire-and-forget — never blocks the user-facing response.
 */

const logger = require('../utils/logger');
const { createClient } = require('@supabase/supabase-js');

let _client = null;
function getClient() {
  if (_client !== null) return _client;
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      _client = false;
      logger.warn('[agentAudit] SUPABASE_URL/SERVICE_ROLE_KEY missing — audit disabled');
      return null;
    }
    _client = createClient(url, key, { auth: { persistSession: false } });
    return _client;
  } catch (e) {
    _client = false;
    logger.warn('[agentAudit] supabase client init failed:', e.message);
    return null;
  }
}

function summarizeToolCalls(toolCalls) {
  return (toolCalls || []).map((tc) => {
    const result = tc.result;
    const isString = typeof result === 'string';
    const errored = !isString && !!result?.error;
    const blocked = !isString && !!result?.blocked;
    return {
      name: tc.name || tc.tool || tc.function?.name || 'unknown',
      args_keys: tc.args && typeof tc.args === 'object' ? Object.keys(tc.args).slice(0, 20) : [],
      success: !errored && !blocked,
      errored,
      blocked,
      error_message: errored ? String(result.error).slice(0, 500) : null,
      duration_ms: tc.duration_ms || null,
    };
  });
}

/**
 * Record one agent turn. All fields optional; missing ones default to safe values.
 * Returns void; failures are logged but never thrown.
 */
async function writeTurn({
  jobId,
  userId,
  sessionId,
  userMessage,
  toolCalls,
  finalResponse,
  verifyResult,
  intervention,
  model,
  totalDurationMs,
}) {
  const client = getClient();
  if (!client || !userId) return;

  try {
    const summarized = summarizeToolCalls(toolCalls);

    const row = {
      job_id: jobId || null,
      user_id: userId,
      session_id: sessionId || null,
      user_message: userMessage ? String(userMessage).slice(0, 4000) : null,
      tool_calls: summarized,
      tool_calls_count: summarized.length,
      successful_tool_calls_count: summarized.filter((t) => t.success).length,
      failed_tool_calls_count: summarized.filter((t) => t.errored).length,
      blocked_tool_calls_count: summarized.filter((t) => t.blocked).length,
      final_response: finalResponse ? String(finalResponse).slice(0, 8000) : null,
      claims_extracted: verifyResult?.claims || [],
      consistency_check: {
        passed: verifyResult?.passed ?? true,
        mismatches: verifyResult?.mismatches || [],
      },
      capability_gap: verifyResult?.capabilityGap || { detected: false, inferred_capability: null },
      intervention: intervention || { occurred: false, type: null },
      model: model || null,
      total_duration_ms: totalDurationMs || null,
    };

    const { data: inserted, error } = await client
      .from('agent_turn_audit')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      logger.warn('[agentAudit] insert failed:', error.message);
      return;
    }

    if (row.capability_gap?.detected) {
      try {
        await client.from('capability_gaps').insert({
          user_id: userId,
          session_id: sessionId || null,
          user_message: row.user_message,
          inferred_capability: row.capability_gap.inferred_capability,
          turn_audit_id: inserted?.id || null,
        });
      } catch (e) {
        logger.warn('[agentAudit] capability_gaps insert failed:', e.message);
      }
    }
  } catch (e) {
    logger.warn('[agentAudit] write failed:', e.message);
  }
}

module.exports = { writeTurn };
