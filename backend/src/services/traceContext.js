/**
 * Trace context — Phase 6.
 *
 * Two ids tag every event the agent emits during a turn:
 *
 *   - trace_id: stable for the lifetime of one HTTP request /
 *               SSE stream. Same as the agent_jobs.id when present.
 *   - turn_id:  stable for the lifetime of one user-message round trip.
 *               When the agent replans, a new turn_id is minted but
 *               the trace_id stays the same.
 *
 * Why both:
 *   - trace_id lets us replay a whole conversation exchange (e.g. for
 *     debugging "what did the agent do for this user request?").
 *   - turn_id lets us reason about a single planner→tools→reply cycle
 *     even when the agent self-corrects mid-stream.
 *
 * The ids are short (8 hex chars) on purpose — they're for log
 * correlation, not for security. Don't reuse them for anything that
 * needs uniqueness across processes.
 *
 * Backwards-compatible: SSE events that didn't carry trace info still
 * work; old clients ignore unknown fields.
 */

const { randomUUID } = require('crypto');

/** 8-char hex tag — short, log-friendly, not for security. */
function shortId() {
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

/** Mint a fresh trace context — call once per request. */
function newTraceContext({ jobId } = {}) {
  return {
    trace_id: jobId ? jobId.replace(/-/g, '').slice(0, 8) : shortId(),
    turn_id: shortId(),
    started_at: Date.now(),
  };
}

/** Mint a new turn within an existing trace (replan / retry). */
function nextTurn(ctx) {
  return { ...ctx, turn_id: shortId(), started_at: Date.now() };
}

/**
 * Decorate an outgoing SSE event with trace metadata. Idempotent — if
 * the event already has a trace_id we leave it.
 */
function tagEvent(event, ctx) {
  if (!event || !ctx) return event;
  if (event.trace_id) return event;
  return { ...event, trace_id: ctx.trace_id, turn_id: ctx.turn_id };
}

module.exports = { newTraceContext, nextTurn, tagEvent, shortId };
