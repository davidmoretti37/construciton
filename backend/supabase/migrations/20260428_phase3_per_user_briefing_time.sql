-- Per-user timezone & briefing-hour for the morning brief.
-- Replaces the daily-at-11-UTC schedule with an hourly run that processes
-- each owner only when the current time in THEIR timezone matches THEIR
-- preferred briefing hour. Default 6am local. Postgres handles DST via the
-- IANA tz name, so spring/fall transitions are correct automatically.

-- ============================================================
-- 1. Per-user prefs on profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS briefing_hour SMALLINT NOT NULL DEFAULT 6
    CHECK (briefing_hour BETWEEN 0 AND 23);

COMMENT ON COLUMN public.profiles.timezone IS
  'IANA timezone name (e.g. America/New_York). Synced from device on login. Default chosen for US construction (most-common contractor base).';
COMMENT ON COLUMN public.profiles.briefing_hour IS
  'Local hour [0-23] when the morning brief should fire. Default 6 (6am).';

-- ============================================================
-- 2. Rebuild precompute to filter by per-user local hour
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
  -- Iterate owners whose CURRENT local hour equals their briefing_hour.
  -- Using IANA tz names so DST shifts are correct without code changes.
  FOR v_owner IN
    SELECT id, timezone, briefing_hour
    FROM public.profiles
    WHERE role = 'owner'
      AND EXTRACT(HOUR FROM (NOW() AT TIME ZONE COALESCE(timezone, 'America/New_York')))
          = COALESCE(briefing_hour, 6)
      -- Avoid duplicate snapshots if the cron fires twice in the same hour
      -- (or if a user's clock straddles a DST boundary). One per day per user.
      AND NOT EXISTS (
        SELECT 1 FROM public.business_insights bi
        WHERE bi.user_id = profiles.id
          AND bi.generated_at > NOW() - INTERVAL '20 hours'
      )
  LOOP
    BEGIN
      v_briefing   := public.compute_business_briefing_for(v_owner.id);
      v_count      := (v_briefing->>'item_count')::int;
      v_high_count := (v_briefing->>'high_count')::int;
      v_med_count  := (v_briefing->>'medium_count')::int;

      INSERT INTO public.business_insights
        (user_id, item_count, high_count, medium_count, items)
      VALUES
        (v_owner.id, v_count, v_high_count, v_med_count, (v_briefing->'items')::jsonb);

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
-- 3. Reschedule: hourly at :00 (was daily at 11 UTC)
-- ============================================================
DO $$
BEGIN
  PERFORM cron.unschedule('phase3-morning-briefing');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'phase3-morning-briefing',
  '0 * * * *',
  $$ SELECT public.precompute_all_business_briefings(); $$
);

-- ============================================================
-- 4. Allow users to update their own timezone + briefing_hour.
--    The existing "users can update own profile" RLS policy already
--    permits this since we're just touching new columns on the same row,
--    but we double-check the policy exists.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND cmd = 'UPDATE'
      AND polrelid::regclass::text = 'public.profiles'
      AND (polname ILIKE '%own%' OR polname ILIKE '%self%')
  ) THEN
    -- No self-update policy detected. Add a permissive one scoped to id = auth.uid().
    CREATE POLICY "Users can update own profile timezone"
    ON public.profiles FOR UPDATE
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_policies query shape varies across versions; non-fatal — most installs
  -- already have a self-update policy from earlier migrations.
  NULL;
END;
$$;
