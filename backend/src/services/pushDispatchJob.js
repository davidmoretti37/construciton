/**
 * Push Dispatch Job
 *
 * Polls the notifications table for entries that haven't been pushed yet
 * and dispatches them to the user's device via Expo push (existing
 * pushNotificationService.sendPushToUser). Sets pushed_at on success so
 * each notification fires exactly once.
 *
 * Why polling instead of triggers: notifications get inserted from many
 * places (Postgres functions, server routes, agent tools). A single
 * polling job is simpler than wiring pg_net out of every Postgres path
 * or instrumenting every Node call site.
 *
 * Categorization: notification.type maps to one of the per-category
 * push toggles in notification_preferences. We respect that toggle plus
 * the master `push_enabled`. Quiet hours are respected — pushes that
 * would land during quiet hours are deferred (pushed_at stays NULL,
 * picked up on next tick after quiet hours end).
 *
 * Idempotent: pushed_at = NOW() under WHERE pushed_at IS NULL ensures
 * concurrent ticks (e.g. server restart overlap) don't double-push.
 */

const { createClient } = require('@supabase/supabase-js');
const { sendPushToUser } = require('./pushNotificationService');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Default 60s. Set lower for dev, higher for very chatty installs.
const TICK_MS = parseInt(process.env.PUSH_DISPATCH_INTERVAL_MS, 10) || 60_000;
// Don't push notifications older than this — avoids back-pushing on cold
// start after a long outage. 1 hour is a reasonable "current" window.
const FRESHNESS_WINDOW_MS = 60 * 60 * 1000;
// Per-tick row limit — keeps a single tick bounded.
const BATCH_SIZE = 100;

// notification.type → notification_preferences column for the per-category
// push toggle. Missing types fall through to the master push_enabled gate.
const TYPE_TO_PREF_COLUMN = {
  appointment_reminder: 'push_appointment_reminders',
  daily_report_submitted: 'push_daily_reports',
  project_warning: 'push_project_warnings',
  financial_update: 'push_financial_updates',
  worker_update: 'push_worker_updates',
  bank_reconciliation: 'push_bank_reconciliation',

  // Billing/CO/draw/invoice events ride the financial toggle
  draw_ready: 'push_financial_updates',
  draw_stale: 'push_financial_updates',
  invoice_overdue: 'push_financial_updates',
  invoice_paid: 'push_financial_updates',
  invoice_partial_payment: 'push_financial_updates',
  payments_active: 'push_financial_updates',
  co_response_received: 'push_financial_updates',
  co_pending_response: 'push_financial_updates',
  // Subcontractor events also financial-ish (compliance + payments)
  sub_doc_uploaded: 'push_financial_updates',
  sub_doc_expiring: 'push_financial_updates',
  sub_doc_expired: 'push_financial_updates',
  sub_doc_requested: 'push_financial_updates',
  sub_bid_invitation: 'push_financial_updates',
  sub_bid_submitted: 'push_financial_updates',
  sub_bid_accepted: 'push_financial_updates',
  sub_bid_declined: 'push_financial_updates',
  sub_contract_sent: 'push_financial_updates',
  sub_contract_signed: 'push_financial_updates',
  sub_invoice_sent: 'push_financial_updates',
  sub_payment_received: 'push_financial_updates',
  sub_engagement_status_changed: 'push_financial_updates',
  sub_upgrade_invite: 'push_financial_updates',
  sub_task_assigned: 'push_worker_updates',
  project_doc_added: 'push_project_warnings',
  task_update: 'push_worker_updates',
  // System notifications are always-on (subject to master push_enabled)
  system: null,
};

function isInQuietHours(prefs, now = new Date()) {
  if (!prefs?.quiet_hours_enabled) return false;
  const start = prefs.quiet_hours_start; // 'HH:MM:SS'
  const end = prefs.quiet_hours_end;
  if (!start || !end) return false;
  const hhmm = now.toTimeString().slice(0, 8); // 'HH:MM:SS' in server tz
  // Quiet hours are stored in user-local time; ideally we'd convert using
  // profile.timezone. For now we compare in server tz which matches the
  // existing notification_preferences semantics elsewhere.
  if (start < end) {
    return hhmm >= start && hhmm < end;
  }
  // Wraps midnight (e.g. 22:00 → 07:00)
  return hhmm >= start || hhmm < end;
}

function shouldPush(notification, prefs) {
  if (!prefs) return true; // No prefs row → defaults to on
  if (prefs.push_enabled === false) return false;
  const col = TYPE_TO_PREF_COLUMN[notification.type];
  if (col && prefs[col] === false) return false;
  if (isInQuietHours(prefs)) return false;
  return true;
}

async function loadPrefsForUsers(userIds) {
  if (userIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .in('user_id', userIds);
  if (error) {
    logger.warn('[pushDispatch] prefs load failed:', error.message);
    return new Map();
  }
  return new Map((data || []).map((p) => [p.user_id, p]));
}

async function runPushDispatchTick() {
  try {
    const sinceIso = new Date(Date.now() - FRESHNESS_WINDOW_MS).toISOString();
    const { data: rows, error } = await supabase
      .from('notifications')
      .select('id, user_id, title, body, type, action_type, action_data, project_id')
      .is('pushed_at', null)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      logger.warn('[pushDispatch] fetch failed:', error.message);
      return 0;
    }
    if (!rows || rows.length === 0) return 0;

    const uniqUsers = [...new Set(rows.map((r) => r.user_id))];
    const prefsByUser = await loadPrefsForUsers(uniqUsers);

    let pushed = 0;
    let skipped = 0;
    let deferred = 0;

    for (const n of rows) {
      const prefs = prefsByUser.get(n.user_id);
      if (!shouldPush(n, prefs)) {
        // Deferred (quiet hours) → don't mark pushed_at, will retry next tick.
        // Skipped (opted-out) → mark pushed_at so we stop retrying forever.
        if (prefs && isInQuietHours(prefs)) {
          deferred++;
          continue;
        }
        await supabase
          .from('notifications')
          .update({ pushed_at: new Date().toISOString() })
          .eq('id', n.id)
          .is('pushed_at', null);
        skipped++;
        continue;
      }

      // Claim the row first (idempotent under concurrent ticks)
      const { error: claimErr, data: claimed } = await supabase
        .from('notifications')
        .update({ pushed_at: new Date().toISOString() })
        .eq('id', n.id)
        .is('pushed_at', null)
        .select('id')
        .maybeSingle();
      if (claimErr || !claimed) continue; // Another worker claimed it, or update failed

      try {
        await sendPushToUser(n.user_id, {
          title: n.title || 'Update',
          body: n.body || '',
          data: {
            notification_id: n.id,
            type: n.type,
            action_type: n.action_type,
            action_data: n.action_data,
            project_id: n.project_id,
          },
        });
        pushed++;
      } catch (e) {
        // sendPushToUser already logs; we still keep pushed_at set so we
        // don't retry forever. Real delivery failures (expired tokens) are
        // handled inside that service via DeviceNotRegistered → is_active=false.
        logger.warn(`[pushDispatch] send failed for notif ${n.id}: ${e.message}`);
      }
    }

    if (pushed + skipped + deferred > 0) {
      logger.info(`[pushDispatch] tick: pushed=${pushed} skipped=${skipped} deferred=${deferred}`);
    }
    return pushed;
  } catch (e) {
    logger.error('[pushDispatch] tick threw:', e.message);
    return 0;
  }
}

function startPushDispatchJob() {
  if (process.env.DISABLE_PUSH_DISPATCH === '1') {
    logger.info('[pushDispatch] Disabled by env');
    return null;
  }
  // Slight startup delay so the rest of the server boots first
  setTimeout(() => { runPushDispatchTick().catch(() => {}); }, 15 * 1000);
  return setInterval(() => {
    runPushDispatchTick().catch(() => {});
  }, TICK_MS);
}

module.exports = { runPushDispatchTick, startPushDispatchJob };
