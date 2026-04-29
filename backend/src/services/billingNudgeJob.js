// Billing nudge job — fires daily and asks Postgres to emit stale-action
// notifications for draws sitting ready, invoices past due, and COs with
// no client response. The actual logic is server-side in the
// emit_stale_billing_notifications() Postgres function (idempotent per day),
// so this file is just the trigger.

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Run once per 24h. Set to a small interval for dev/testing.
const NUDGE_INTERVAL_MS = parseInt(process.env.BILLING_NUDGE_INTERVAL_MS, 10)
  || (24 * 60 * 60 * 1000); // default daily

/**
 * Single tick — calls the SQL function. Idempotent: only inserts notifications
 * that haven't been emitted today for the same (user, type, entity_id).
 */
async function runBillingNudgeTick() {
  try {
    const { data, error } = await supabase.rpc('emit_stale_billing_notifications');
    if (error) {
      logger.warn('[billingNudge] RPC failed:', error.message);
      return null;
    }
    const emitted = Array.isArray(data) ? (data[0]?.emitted ?? 0) : (data?.emitted ?? 0);
    if (emitted > 0) {
      logger.info(`[billingNudge] Emitted ${emitted} stale billing notification(s)`);
    }
    return emitted;
  } catch (e) {
    logger.warn('[billingNudge] Tick threw:', e.message);
    return null;
  }
}

/**
 * Wire into the server lifecycle: run once at boot (catches anything stale
 * between deploys) and then every NUDGE_INTERVAL_MS.
 */
function startBillingNudgeJob() {
  if (process.env.DISABLE_BILLING_NUDGE === '1') {
    logger.info('[billingNudge] Disabled by env');
    return null;
  }
  // Initial run — small delay so the server finishes booting first
  setTimeout(() => { runBillingNudgeTick().catch(() => {}); }, 30 * 1000);
  // Recurring tick
  return setInterval(() => {
    runBillingNudgeTick().catch(() => {});
  }, NUDGE_INTERVAL_MS);
}

module.exports = { runBillingNudgeTick, startBillingNudgeJob };
