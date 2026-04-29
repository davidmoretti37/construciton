-- Phase-3 proactive layer: persist business briefings nightly so the home
-- screen + notification bell can surface "what needs attention" without
-- waiting for the user to ask. The on-demand RPC remains as a fallback.

-- ============================================================
-- 1. Storage table for the nightly snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS public.business_insights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  item_count    INTEGER NOT NULL DEFAULT 0,
  high_count    INTEGER NOT NULL DEFAULT 0,
  medium_count  INTEGER NOT NULL DEFAULT 0,
  items         JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_business_insights_user_recent
  ON public.business_insights(user_id, generated_at DESC);

ALTER TABLE public.business_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own briefings" ON public.business_insights;
CREATE POLICY "Users read own briefings"
ON public.business_insights FOR SELECT
USING (user_id = auth.uid());

-- Supervisors can also see their owner's briefings (so the team gets the
-- same morning view).
DROP POLICY IF EXISTS "Supervisors read owner briefings" ON public.business_insights;
CREATE POLICY "Supervisors read owner briefings"
ON public.business_insights FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'supervisor'
      AND p.owner_id = business_insights.user_id
  )
);

-- ============================================================
-- 2. Refactor: extract briefing core into a parameterised helper.
--    The on-demand RPC and the cron job both call it.
-- ============================================================
DROP FUNCTION IF EXISTS public.compute_business_briefing_for(UUID);
CREATE FUNCTION public.compute_business_briefing_for(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role     TEXT;
  v_owner    UUID;
  v_briefing JSON;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;

  SELECT role, COALESCE(owner_id, id) INTO v_role, v_owner
  FROM public.profiles WHERE id = p_user_id;

  WITH
  forgotten AS (
    SELECT
      'forgotten_clock_out'::text AS kind,
      'high'::text                AS severity,
      w.full_name                 AS subject,
      tt.id                       AS ref_id,
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
        (v_role = 'owner'      AND w.owner_id = p_user_id)
        OR (v_role = 'supervisor' AND w.owner_id = v_owner)
      )
    LIMIT 5
  ),
  silent_workers AS (
    SELECT
      'worker_silent'::text       AS kind,
      'medium'::text              AS severity,
      w.full_name                 AS subject,
      w.id                        AS ref_id,
      json_build_object(
        'worker_id', w.id,
        'worker_name', w.full_name,
        'days_clocked_30d', tt_agg.days_clocked_30d,
        'last_report', dr_agg.last_report
      ) AS detail
    FROM public.workers w
    LEFT JOIN (
      SELECT worker_id, COUNT(DISTINCT DATE(clock_in)) AS days_clocked_30d
      FROM public.time_tracking
      WHERE clock_in >= NOW() - INTERVAL '30 days'
      GROUP BY worker_id
    ) tt_agg ON tt_agg.worker_id = w.id
    LEFT JOIN (
      SELECT worker_id, MAX(created_at) AS last_report
      FROM public.daily_reports
      GROUP BY worker_id
    ) dr_agg ON dr_agg.worker_id = w.id
    WHERE w.promoted_to_supervisor IS NOT TRUE
      AND COALESCE(tt_agg.days_clocked_30d, 0) >= 5
      AND (dr_agg.last_report IS NULL OR dr_agg.last_report < NOW() - INTERVAL '5 days')
      AND (
        (v_role = 'owner'      AND w.owner_id = p_user_id)
        OR (v_role = 'supervisor' AND w.owner_id = v_owner)
      )
    LIMIT 5
  ),
  budget_risk AS (
    SELECT
      'budget_burn'::text         AS kind,
      'high'::text                AS severity,
      p.name                      AS subject,
      p.id                        AS ref_id,
      json_build_object(
        'project_id', p.id,
        'project_name', p.name,
        'budget_used_pct', ROUND(100.0 * COALESCE(tx.expenses, 0) / p.contract_amount, 1),
        'total_expenses', COALESCE(tx.expenses, 0),
        'contract_amount', p.contract_amount
      ) AS detail
    FROM public.projects p
    LEFT JOIN (
      SELECT project_id, SUM(amount) FILTER (WHERE type = 'expense') AS expenses
      FROM public.project_transactions GROUP BY project_id
    ) tx ON tx.project_id = p.id
    WHERE p.contract_amount IS NOT NULL
      AND p.contract_amount > 0
      AND COALESCE(tx.expenses, 0) >= 0.8 * p.contract_amount
      AND COALESCE(p.status, 'active') NOT IN ('complete','cancelled','archived')
      AND (
        (v_role = 'owner'      AND p.user_id = p_user_id)
        OR (v_role = 'supervisor' AND p.assigned_supervisor_id = p_user_id)
      )
    ORDER BY (COALESCE(tx.expenses, 0) / NULLIF(p.contract_amount, 0)) DESC
    LIMIT 5
  ),
  stale_projects AS (
    SELECT
      'project_stale'::text       AS kind,
      'medium'::text              AS severity,
      p.name                      AS subject,
      p.id                        AS ref_id,
      json_build_object(
        'project_id', p.id,
        'project_name', p.name,
        'days_since_activity', EXTRACT(DAY FROM NOW() - last_act)::int,
        'last_activity', last_act
      ) AS detail
    FROM public.projects p
    LEFT JOIN LATERAL (
      SELECT GREATEST(
        (SELECT MAX(created_at) FROM public.project_transactions WHERE project_id = p.id),
        (SELECT MAX(clock_in)   FROM public.time_tracking         WHERE project_id = p.id),
        (SELECT MAX(created_at) FROM public.daily_reports         WHERE project_id = p.id)
      ) AS last_act
    ) la ON TRUE
    WHERE COALESCE(p.status, 'active') NOT IN ('complete','cancelled','archived')
      AND last_act IS NOT NULL
      AND last_act < NOW() - INTERVAL '7 days'
      AND (
        (v_role = 'owner'      AND p.user_id = p_user_id)
        OR (v_role = 'supervisor' AND p.assigned_supervisor_id = p_user_id)
      )
    ORDER BY last_act ASC
    LIMIT 5
  ),
  overdue_money AS (
    SELECT
      'invoice_overdue'::text     AS kind,
      'high'::text                AS severity,
      COALESCE(NULLIF(TRIM(i.client_name), ''), 'Unknown Client') AS subject,
      NULL::UUID                  AS ref_id,
      json_build_object(
        'client_name', COALESCE(NULLIF(TRIM(i.client_name), ''), 'Unknown Client'),
        'total_outstanding', SUM(i.total - COALESCE(i.amount_paid, 0)),
        'oldest_overdue_days', MAX(CURRENT_DATE - i.due_date),
        'overdue_count', COUNT(*)
      ) AS detail
    FROM public.invoices i
    WHERE i.status IN ('unpaid', 'partial', 'overdue')
      AND i.due_date IS NOT NULL
      AND i.due_date < CURRENT_DATE - INTERVAL '14 days'
      AND v_role = 'owner'
      AND i.user_id = p_user_id
    GROUP BY COALESCE(NULLIF(TRIM(i.client_name), ''), 'Unknown Client')
    ORDER BY MAX(CURRENT_DATE - i.due_date) DESC
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
    'high_count',   (SELECT COUNT(*) FROM combined WHERE severity = 'high'),
    'medium_count', (SELECT COUNT(*) FROM combined WHERE severity = 'medium'),
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

GRANT EXECUTE ON FUNCTION public.compute_business_briefing_for(UUID) TO authenticated;

-- Re-define the on-demand RPC to delegate to the helper.
CREATE OR REPLACE FUNCTION public.compute_business_briefing()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  RETURN public.compute_business_briefing_for(v_caller);
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_business_briefing() TO authenticated;

-- ============================================================
-- 3. Nightly precompute: store snapshots + drop in-app notifications
-- ============================================================
CREATE OR REPLACE FUNCTION public.precompute_all_business_briefings()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner       RECORD;
  v_briefing    JSON;
  v_high_count  INT;
  v_med_count   INT;
  v_count       INT;
  v_processed   INT := 0;
  v_prefs       RECORD;
BEGIN
  FOR v_owner IN
    SELECT id FROM public.profiles WHERE role = 'owner'
  LOOP
    BEGIN
      v_briefing := public.compute_business_briefing_for(v_owner.id);
      v_count    := (v_briefing->>'item_count')::int;
      v_high_count := (v_briefing->>'high_count')::int;
      v_med_count  := (v_briefing->>'medium_count')::int;

      INSERT INTO public.business_insights
        (user_id, item_count, high_count, medium_count, items)
      VALUES
        (v_owner.id, v_count, v_high_count, v_med_count, (v_briefing->'items')::jsonb);

      -- Drop a single in-app notification when there's something to look at.
      -- Respects user prefs: master inapp toggle + project_warnings category.
      IF v_count > 0 THEN
        SELECT inapp_enabled, inapp_project_warnings INTO v_prefs
        FROM public.notification_preferences WHERE user_id = v_owner.id;

        IF (v_prefs.inapp_enabled IS NULL OR v_prefs.inapp_enabled = TRUE)
           AND (v_prefs.inapp_project_warnings IS NULL OR v_prefs.inapp_project_warnings = TRUE)
        THEN
          INSERT INTO public.notifications
            (user_id, title, body, type, icon, color, action_data)
          VALUES (
            v_owner.id,
            'Morning Brief',
            CASE
              WHEN v_high_count > 0 THEN
                v_high_count || ' urgent item' || (CASE WHEN v_high_count = 1 THEN '' ELSE 's' END)
                || (CASE WHEN v_med_count > 0 THEN ' + ' || v_med_count || ' to review' ELSE '' END)
              ELSE
                v_count || ' item' || (CASE WHEN v_count = 1 THEN '' ELSE 's' END) || ' to review'
            END,
            'project_warning',
            'sunny-outline',
            CASE WHEN v_high_count > 0 THEN '#EF4444' ELSE '#F59E0B' END,
            json_build_object('screen', 'Home', 'source', 'morning_brief')::jsonb
          );
        END IF;
      END IF;

      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'precompute briefing failed for user %: %', v_owner.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_processed;
END;
$$;

GRANT EXECUTE ON FUNCTION public.precompute_all_business_briefings() TO postgres;

-- ============================================================
-- 4. Schedule it. 11:00 UTC ≈ 6am EST / 5am CST / 3am PST.
--    Idempotent unschedule first, then schedule.
-- ============================================================
DO $$
BEGIN
  PERFORM cron.unschedule('phase3-morning-briefing');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'phase3-morning-briefing',
  '0 11 * * *',
  $$ SELECT public.precompute_all_business_briefings(); $$
);
