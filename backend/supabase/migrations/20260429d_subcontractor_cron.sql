-- =====================================================================
-- Subcontractor Module — pg_cron expiry sweep
-- =====================================================================
-- Daily 06:00 UTC: walk active compliance_documents and flip status to
-- 'expired' for any whose expires_at has passed. The /api/internal/compliance/run-alerts
-- endpoint (to be wired with `net.http_post` once API base URL + INTERNAL_CRON_KEY
-- are confirmed) handles email/push notifications separately.
--
-- Idempotent.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule any prior version of this job to make this idempotent
DO $$
BEGIN
  PERFORM cron.unschedule('compliance-expiry-sweep')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'compliance-expiry-sweep');
EXCEPTION WHEN undefined_table THEN
  -- pg_cron not yet active
  NULL;
END $$;

SELECT cron.schedule(
  'compliance-expiry-sweep',
  '0 6 * * *',
  $$
    UPDATE public.compliance_documents
    SET status = 'expired'
    WHERE status = 'active' AND expires_at < CURRENT_DATE;
  $$
);
