-- =====================================================
-- notifications.pushed_at — push-dispatch idempotency marker
-- =====================================================
-- The notifications table is the single source of truth for everything
-- the user should see (in-app + push). Until now, only Stripe and Twilio
-- code paths called pushNotificationService directly; everything else
-- (morning brief, draw ready, invoice paid, CO approved, sub doc events,
-- bank reconciliation, etc.) wrote to this table but never reached the
-- phone.
--
-- A backend polling dispatcher (services/pushDispatchJob.js) now scans
-- WHERE pushed_at IS NULL AND created_at > NOW() - 1 hour, dispatches
-- via the existing pushNotificationService, and marks pushed_at = NOW().
-- The 1-hour window prevents back-pushing old rows on a cold start.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.notifications.pushed_at IS
  'When push notification was dispatched to user device(s). NULL = not yet pushed (or push opted-out via notification_preferences). Set by pushDispatchJob.';

-- Partial index makes the dispatcher poll cheap even with millions of rows.
CREATE INDEX IF NOT EXISTS idx_notifications_pending_push
  ON public.notifications (created_at)
  WHERE pushed_at IS NULL;
