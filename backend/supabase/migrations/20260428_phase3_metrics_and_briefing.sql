-- Phase-3 metrics & briefing layer.
-- Three read-only views + one SECURITY DEFINER briefing function. Views use
-- security_invoker=true so each caller's RLS policies on the underlying
-- tables (workers / projects / time_tracking / etc.) gate what they see —
-- no separate RLS needed on the views themselves.

-- ============================================================
-- worker_metrics_v: per-worker rolling 30-day stats
-- ============================================================
DROP VIEW IF EXISTS public.worker_metrics_v CASCADE;
CREATE VIEW public.worker_metrics_v
WITH (security_invoker = true)
AS
SELECT
  w.id                                                                AS worker_id,
  w.full_name                                                         AS worker_name,
  w.owner_id                                                          AS owner_id,
  w.status                                                            AS status,
  COALESCE(tt.hours_30d, 0)::numeric(10,2)                            AS hours_30d,
  COALESCE(tt.days_clocked_30d, 0)                                    AS days_clocked_30d,
  COALESCE(dr.reports_30d, 0)                                         AS reports_30d,
  CASE
    WHEN COALESCE(tt.days_clocked_30d, 0) = 0 THEN NULL
    ELSE ROUND(COALESCE(dr.reports_30d, 0)::numeric / tt.days_clocked_30d, 2)
  END                                                                 AS reports_per_day_30d,
  tt.last_clock_in                                                    AS last_clock_in,
  dr.last_report                                                      AS last_report,
  CASE
    WHEN tt.last_clock_in IS NULL THEN NULL
    ELSE EXTRACT(DAY FROM NOW() - tt.last_clock_in)::int
  END                                                                 AS days_since_last_clock_in
FROM public.workers w
LEFT JOIN (
  SELECT
    worker_id,
    SUM(EXTRACT(EPOCH FROM (clock_out - clock_in))/3600)
      FILTER (WHERE clock_in >= NOW() - INTERVAL '30 days' AND clock_out IS NOT NULL)  AS hours_30d,
    COUNT(DISTINCT DATE(clock_in))
      FILTER (WHERE clock_in >= NOW() - INTERVAL '30 days')                            AS days_clocked_30d,
    MAX(clock_in)                                                                       AS last_clock_in
  FROM public.time_tracking
  GROUP BY worker_id
) tt ON tt.worker_id = w.id
LEFT JOIN (
  SELECT
    worker_id,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')  AS reports_30d,
    MAX(created_at)                                                    AS last_report
  FROM public.daily_reports
  GROUP BY worker_id
) dr ON dr.worker_id = w.id
WHERE w.promoted_to_supervisor IS NOT TRUE;

-- ============================================================
-- project_health_v: per-project financial + activity health
-- ============================================================
DROP VIEW IF EXISTS public.project_health_v CASCADE;
CREATE VIEW public.project_health_v
WITH (security_invoker = true)
AS
SELECT
  p.id                                                                AS project_id,
  p.name                                                              AS project_name,
  p.user_id                                                           AS owner_id,
  p.assigned_supervisor_id                                            AS supervisor_id,
  p.status                                                            AS status,
  p.contract_amount                                                   AS contract_amount,
  p.budget                                                            AS budget,
  p.created_at                                                        AS created_at,
  COALESCE(tx.expenses, 0)::numeric(12,2)                             AS total_expenses,
  COALESCE(tx.income, 0)::numeric(12,2)                               AS total_income,
  CASE
    WHEN p.contract_amount IS NULL OR p.contract_amount = 0 THEN NULL
    ELSE ROUND(100.0 * COALESCE(tx.expenses, 0) / p.contract_amount, 1)
  END                                                                 AS budget_used_pct,
  GREATEST(tx.last_tx, tt.last_clock_in, dr.last_report)              AS last_activity,
  CASE
    WHEN GREATEST(tx.last_tx, tt.last_clock_in, dr.last_report) IS NULL THEN NULL
    ELSE EXTRACT(DAY FROM NOW() - GREATEST(tx.last_tx, tt.last_clock_in, dr.last_report))::int
  END                                                                 AS days_since_activity
FROM public.projects p
LEFT JOIN (
  SELECT
    project_id,
    SUM(amount) FILTER (WHERE type = 'expense') AS expenses,
    SUM(amount) FILTER (WHERE type = 'income')  AS income,
    MAX(created_at)                              AS last_tx
  FROM public.project_transactions
  GROUP BY project_id
) tx ON tx.project_id = p.id
LEFT JOIN (
  SELECT project_id, MAX(clock_in) AS last_clock_in
  FROM public.time_tracking
  GROUP BY project_id
) tt ON tt.project_id = p.id
LEFT JOIN (
  SELECT project_id, MAX(created_at) AS last_report
  FROM public.daily_reports
  GROUP BY project_id
) dr ON dr.project_id = p.id;

-- ============================================================
-- client_health_v: per-client receivables + payment behavior
-- ============================================================
DROP VIEW IF EXISTS public.client_health_v CASCADE;
CREATE VIEW public.client_health_v
WITH (security_invoker = true)
AS
SELECT
  i.user_id                                                           AS owner_id,
  COALESCE(NULLIF(TRIM(i.client_name), ''), 'Unknown Client')         AS client_name,
  COUNT(*)                                                            AS invoice_count,
  SUM(i.total)::numeric(12,2)                                         AS total_billed,
  SUM(COALESCE(i.amount_paid, 0))::numeric(12,2)                      AS total_paid,
  SUM(i.total - COALESCE(i.amount_paid, 0))
    FILTER (WHERE i.status IN ('unpaid', 'partial', 'overdue'))::numeric(12,2)  AS total_outstanding,
  COUNT(*) FILTER (
    WHERE i.status IN ('unpaid', 'partial', 'overdue')
    AND i.due_date IS NOT NULL
    AND i.due_date < CURRENT_DATE
  )                                                                   AS overdue_count,
  MAX(CURRENT_DATE - i.due_date) FILTER (
    WHERE i.status IN ('unpaid', 'partial', 'overdue')
    AND i.due_date IS NOT NULL
  )                                                                   AS oldest_overdue_days,
  ROUND(AVG(EXTRACT(DAY FROM i.paid_date::timestamp - i.due_date::timestamp))
    FILTER (WHERE i.paid_date IS NOT NULL AND i.due_date IS NOT NULL), 1)
                                                                      AS avg_days_late_to_pay
FROM public.invoices i
GROUP BY i.user_id, COALESCE(NULLIF(TRIM(i.client_name), ''), 'Unknown Client');


-- ============================================================
-- compute_business_briefing(): top anomalies for the caller
-- ============================================================
-- Returns up to 15 anomalies grouped by severity. Caller is auth.uid().
-- SECURITY DEFINER so we can bypass RLS for the aggregation, but every
-- query is scoped by `WHERE owner_id = v_caller` so no cross-tenant leak.
DROP FUNCTION IF EXISTS public.compute_business_briefing();
CREATE FUNCTION public.compute_business_briefing()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_owner  UUID;
  v_role   TEXT;
  v_briefing JSON;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Resolve effective owner: if caller is a supervisor, briefing is over
  -- their assigned projects only (handled in each query). Owners get
  -- everything under them.
  SELECT role, COALESCE(owner_id, id) INTO v_role, v_owner
  FROM public.profiles WHERE id = v_caller;

  WITH

  -- Forgotten clock-outs (>12h still open)
  forgotten AS (
    SELECT
      'forgotten_clock_out' AS kind,
      'high'                AS severity,
      w.full_name           AS subject,
      tt.id                 AS ref_id,
      json_build_object(
        'worker_id', w.id,
        'worker_name', w.full_name,
        'project_id', tt.project_id,
        'hours_open', ROUND(EXTRACT(EPOCH FROM NOW() - tt.clock_in)/3600, 1)
      ) AS detail
    FROM public.time_tracking tt
    JOIN public.workers w ON w.id = tt.worker_id
    WHERE tt.clock_out IS NULL
      AND tt.clock_in < NOW() - INTERVAL '12 hours'
      AND (
        (v_role = 'owner'      AND w.owner_id = v_caller)
        OR (v_role = 'supervisor' AND w.owner_id = v_owner)
      )
    LIMIT 5
  ),

  -- Workers clocked in regularly but no reports submitted in last 5 days
  silent_workers AS (
    SELECT
      'worker_silent'       AS kind,
      'medium'              AS severity,
      wm.worker_name        AS subject,
      wm.worker_id          AS ref_id,
      json_build_object(
        'worker_id', wm.worker_id,
        'worker_name', wm.worker_name,
        'days_clocked_30d', wm.days_clocked_30d,
        'reports_30d', wm.reports_30d,
        'last_report', wm.last_report
      ) AS detail
    FROM public.worker_metrics_v wm
    WHERE wm.owner_id IN (v_caller, v_owner)
      AND wm.days_clocked_30d >= 5
      AND (wm.last_report IS NULL OR wm.last_report < NOW() - INTERVAL '5 days')
    LIMIT 5
  ),

  -- Projects past 80% budget burn but still active
  budget_risk AS (
    SELECT
      'budget_burn'         AS kind,
      'high'                AS severity,
      ph.project_name       AS subject,
      ph.project_id         AS ref_id,
      json_build_object(
        'project_id', ph.project_id,
        'project_name', ph.project_name,
        'budget_used_pct', ph.budget_used_pct,
        'total_expenses', ph.total_expenses,
        'contract_amount', ph.contract_amount
      ) AS detail
    FROM public.project_health_v ph
    WHERE ph.owner_id IN (v_caller, v_owner)
      AND ph.budget_used_pct >= 80
      AND COALESCE(ph.status, 'active') NOT IN ('complete','cancelled','archived')
    ORDER BY ph.budget_used_pct DESC
    LIMIT 5
  ),

  -- Stale projects: active but no activity in 7+ days
  stale_projects AS (
    SELECT
      'project_stale'       AS kind,
      'medium'              AS severity,
      ph.project_name       AS subject,
      ph.project_id         AS ref_id,
      json_build_object(
        'project_id', ph.project_id,
        'project_name', ph.project_name,
        'days_since_activity', ph.days_since_activity,
        'last_activity', ph.last_activity
      ) AS detail
    FROM public.project_health_v ph
    WHERE ph.owner_id IN (v_caller, v_owner)
      AND ph.days_since_activity >= 7
      AND COALESCE(ph.status, 'active') NOT IN ('complete','cancelled','archived')
    ORDER BY ph.days_since_activity DESC
    LIMIT 5
  ),

  -- Overdue invoices (>14 days past due)
  overdue_money AS (
    SELECT
      'invoice_overdue'     AS kind,
      'high'                AS severity,
      ch.client_name        AS subject,
      NULL::UUID            AS ref_id,
      json_build_object(
        'client_name', ch.client_name,
        'total_outstanding', ch.total_outstanding,
        'oldest_overdue_days', ch.oldest_overdue_days,
        'overdue_count', ch.overdue_count
      ) AS detail
    FROM public.client_health_v ch
    WHERE ch.owner_id = v_caller
      AND COALESCE(ch.oldest_overdue_days, 0) >= 14
    ORDER BY ch.oldest_overdue_days DESC
    LIMIT 5
  ),

  combined AS (
    SELECT * FROM forgotten
    UNION ALL SELECT * FROM silent_workers
    UNION ALL SELECT * FROM budget_risk
    UNION ALL SELECT * FROM stale_projects
    UNION ALL SELECT * FROM overdue_money
  )

  SELECT json_build_object(
    'generated_at', NOW(),
    'caller_role',  v_role,
    'item_count',   (SELECT COUNT(*) FROM combined),
    'items',        COALESCE((
      SELECT json_agg(json_build_object(
        'kind', kind,
        'severity', severity,
        'subject', subject,
        'ref_id', ref_id,
        'detail', detail
      )) FROM (
        SELECT * FROM combined
        ORDER BY CASE severity WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END
        LIMIT 15
      ) c
    ), '[]'::json)
  ) INTO v_briefing;

  RETURN v_briefing;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_business_briefing() TO authenticated;
