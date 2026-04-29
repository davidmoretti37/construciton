// Single chokepoint for writing to domain_events. Every business-meaningful
// thing that happens in Sylk goes through here — project creation, expense
// recording, worker assignment, phase progress, voice transcript receipt,
// agent tool invocation, anything.
//
// Why a single chokepoint: discipline. If individual handlers had to
// remember to log their own events, half would forget, and the world
// model becomes useless. Wrapping the agent's tool dispatcher with this
// emitter means every action is logged whether the handler author
// remembered or not.
//
// Performance: emit is fire-and-forget. The chat path never waits on the
// event log write. If the write fails it logs a warning and the user
// experience is unaffected.

const { adminSupabase } = require('./userSupabaseClient');
const { embedText } = require('./memory/memoryService');
const logger = require('../utils/logger');

// ============================================================
// Canonical event types
// ============================================================
// Pattern: '<entity>.<verb>' — past tense, dotted. event_category groups
// related events. Adding a new event type? Add it here, NEVER inline as
// a string literal at the call site, so we keep the canonical taxonomy.
const EVENT_TYPES = {
  // Projects
  PROJECT_CREATED: { type: 'project.created', category: 'project' },
  PROJECT_UPDATED: { type: 'project.updated', category: 'project' },
  PROJECT_DELETED: { type: 'project.deleted', category: 'project' },
  PROJECT_STATUS_CHANGED: { type: 'project.status_changed', category: 'project' },
  PHASE_CREATED: { type: 'phase.created', category: 'project' },
  PHASE_PROGRESS_UPDATED: { type: 'phase.progress_updated', category: 'project' },
  PHASE_BUDGET_UPDATED: { type: 'phase.budget_updated', category: 'project' },

  // Financial
  EXPENSE_RECORDED: { type: 'expense.recorded', category: 'financial' },
  EXPENSE_UPDATED: { type: 'expense.updated', category: 'financial' },
  EXPENSE_DELETED: { type: 'expense.deleted', category: 'financial' },
  INCOME_RECORDED: { type: 'income.recorded', category: 'financial' },
  ESTIMATE_CREATED: { type: 'estimate.created', category: 'financial' },
  ESTIMATE_UPDATED: { type: 'estimate.updated', category: 'financial' },
  ESTIMATE_ACCEPTED: { type: 'estimate.accepted', category: 'financial' },
  INVOICE_CREATED: { type: 'invoice.created', category: 'financial' },
  INVOICE_UPDATED: { type: 'invoice.updated', category: 'financial' },
  INVOICE_VOIDED: { type: 'invoice.voided', category: 'financial' },
  INVOICE_PAID: { type: 'invoice.paid', category: 'financial' },
  PAYMENT_RECEIVED: { type: 'payment.received', category: 'financial' },
  CHANGE_ORDER_DRAFTED: { type: 'change_order.drafted', category: 'financial' },
  CHANGE_ORDER_SENT: { type: 'change_order.sent', category: 'financial' },
  CHANGE_ORDER_VIEWED: { type: 'change_order.viewed', category: 'financial' },
  CHANGE_ORDER_APPROVED: { type: 'change_order.approved', category: 'financial' },
  CHANGE_ORDER_REJECTED: { type: 'change_order.rejected', category: 'financial' },
  CHANGE_ORDER_VOIDED: { type: 'change_order.voided', category: 'financial' },

  // Crew
  WORKER_ASSIGNED: { type: 'worker.assigned', category: 'crew' },
  WORKER_UNASSIGNED: { type: 'worker.unassigned', category: 'crew' },
  SUPERVISOR_ASSIGNED: { type: 'supervisor.assigned', category: 'crew' },
  SUPERVISOR_UNASSIGNED: { type: 'supervisor.unassigned', category: 'crew' },
  WORKER_CLOCKED_IN: { type: 'worker.clocked_in', category: 'crew' },
  WORKER_CLOCKED_OUT: { type: 'worker.clocked_out', category: 'crew' },
  TIME_ENTRY_RECORDED: { type: 'time_entry.recorded', category: 'crew' },

  // Scheduling
  SCHEDULE_CREATED: { type: 'schedule.created', category: 'scheduling' },
  SCHEDULE_UPDATED: { type: 'schedule.updated', category: 'scheduling' },
  TASK_COMPLETED: { type: 'task.completed', category: 'scheduling' },

  // Service plans
  SERVICE_PLAN_CREATED: { type: 'service_plan.created', category: 'service_plan' },
  SERVICE_PLAN_UPDATED: { type: 'service_plan.updated', category: 'service_plan' },
  SERVICE_VISIT_CREATED: { type: 'service_visit.created', category: 'service_plan' },
  SERVICE_VISIT_COMPLETED: { type: 'service_visit.completed', category: 'service_plan' },
  SERVICE_LOCATION_ADDED: { type: 'service_location.added', category: 'service_plan' },

  // Reports & docs
  DAILY_REPORT_CREATED: { type: 'daily_report.created', category: 'documentation' },
  DOCUMENT_UPLOADED: { type: 'document.uploaded', category: 'documentation' },
  DOCUMENT_DELETED: { type: 'document.deleted', category: 'documentation' },
  PHOTO_CAPTURED: { type: 'photo.captured', category: 'documentation' },

  // Communication
  MESSAGE_SENT: { type: 'message.sent', category: 'communication' },
  CLIENT_NOTIFIED: { type: 'client.notified', category: 'communication' },
  VOICE_TRANSCRIPT_RECEIVED: { type: 'voice.transcript_received', category: 'communication' },

  // Agent
  AGENT_TOOL_INVOKED: { type: 'agent.tool_invoked', category: 'agent' },
  AGENT_PLAN_GENERATED: { type: 'agent.plan_generated', category: 'agent' },
  AGENT_PLAN_DIVERGED: { type: 'agent.plan_diverged', category: 'agent' },
  AGENT_REPLAN_TRIGGERED: { type: 'agent.replan_triggered', category: 'agent' },
  AGENT_DESTRUCTIVE_BLOCKED: { type: 'agent.destructive_blocked', category: 'agent' },
  USER_FEEDBACK_RECORDED: { type: 'user.feedback_recorded', category: 'agent' },
};

// ============================================================
// Sensitive-field scrub
// ============================================================
// Never persist secrets into the event log. Strip a known set of keys
// from any payload object before it lands in the row.
const SENSITIVE_KEYS = new Set([
  'password', 'token', 'secret', 'api_key', 'access_token', 'refresh_token',
  'authorization', 'auth', 'cookie', 'ssn', 'tax_id', 'card_number',
  'cvv', 'pin', 'private_key', 'jwt', 'bearer',
]);

function scrubSensitive(obj, depth = 0) {
  if (depth > 6 || obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(item => scrubSensitive(item, depth + 1));
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(k.toLowerCase())) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = scrubSensitive(v, depth + 1);
    }
  }
  return out;
}

// ============================================================
// Public emit
// ============================================================
/**
 * Append one event to domain_events. Fire-and-forget.
 *
 * @param {object} args
 * @param {string} args.ownerId          — multi-tenant owner. REQUIRED.
 * @param {object} args.eventType        — one of EVENT_TYPES.* (object with type+category)
 * @param {string} [args.actorId]        — auth user who triggered the action
 * @param {string} [args.actorType]      — 'owner' | 'supervisor' | 'worker' | 'agent' | 'system' | 'client' | 'external'
 * @param {string} [args.entityType]
 * @param {string} [args.entityId]
 * @param {object} [args.payload]
 * @param {object} [args.beforeState]
 * @param {object} [args.afterState]
 * @param {string} [args.reason]         — free-text WHY
 * @param {string} [args.source]         — 'chat'|'manual'|'agent_tool'|'webhook'|'cron'|'system'|'migration'|'automation'
 * @param {string} [args.summary]        — one-line human-readable description (will be embedded)
 * @param {object} [args.agentDecision]  — what the agent decided + why
 * @param {string} [args.userFeedback]   — 'approved'|'edited'|'rejected'|'ignored'|'undone'
 * @param {object} [args.rawInput]       — original transcript / photo URL / webhook payload
 * @param {string} [args.sessionId]
 * @param {string} [args.messageId]
 * @param {string} [args.parentEventId]
 * @param {Date}   [args.occurredAt]     — defaults to now
 * @returns {Promise<{id: string}|null>}
 */
async function emitDomainEvent(args) {
  if (!args || !args.ownerId || !args.eventType?.type) {
    logger.warn('[domain_event] skipped — missing required fields:', { ownerId: !!args?.ownerId, eventType: args?.eventType?.type });
    return null;
  }

  const row = {
    owner_id: args.ownerId,
    actor_id: args.actorId || null,
    actor_type: args.actorType || (args.actorId ? 'owner' : 'system'),
    event_type: args.eventType.type,
    event_category: args.eventType.category || null,
    entity_type: args.entityType || null,
    entity_id: args.entityId || null,
    payload: scrubSensitive(args.payload || {}),
    before_state: args.beforeState ? scrubSensitive(args.beforeState) : null,
    after_state: args.afterState ? scrubSensitive(args.afterState) : null,
    reason: args.reason || null,
    source: args.source || 'system',
    summary: args.summary || null,
    agent_decision: args.agentDecision ? scrubSensitive(args.agentDecision) : null,
    user_feedback: args.userFeedback || null,
    raw_input: args.rawInput ? scrubSensitive(args.rawInput) : null,
    occurred_at: args.occurredAt ? new Date(args.occurredAt).toISOString() : new Date().toISOString(),
    session_id: args.sessionId || null,
    message_id: args.messageId || null,
    parent_event_id: args.parentEventId || null,
  };

  // Embed the summary inline so semantic search works from row 1. If the
  // embed fails (no API key, network error) we still write the row —
  // we can re-embed in a backfill later.
  if (row.summary && row.summary.length > 4) {
    try {
      const v = await embedText(row.summary);
      if (Array.isArray(v) && v.length === 1536) {
        row.embedding = v;
        row.embedding_model = 'openai/text-embedding-3-small';
      }
    } catch (e) {
      logger.debug('[domain_event] embed skipped:', e.message);
    }
  }

  try {
    const { data, error } = await adminSupabase
      .from('domain_events')
      .insert(row)
      .select('id')
      .single();
    if (error) {
      logger.warn('[domain_event] insert failed:', error.message);
      return null;
    }
    return { id: data.id };
  } catch (e) {
    logger.warn('[domain_event] uncaught:', e.message);
    return null;
  }
}

// ============================================================
// Convenience: fire-and-forget that returns immediately
// ============================================================
function emit(args) {
  emitDomainEvent(args).catch(() => {});
}

module.exports = { emitDomainEvent, emit, EVENT_TYPES };
