-- =====================================================
-- Supervisor RLS for daily checklist tables
-- =====================================================
-- Existing policies on daily_checklist_templates, labor_role_templates,
-- daily_service_reports, and daily_report_entries only allowed
-- (owner_id = auth.uid()) or (worker.user_id = auth.uid()) — no supervisor
-- path. Result: supervisors saw zero checklist rows in the agenda even
-- though templates existed under their parent owner.
--
-- These policies grant supervisors read access to templates owned by their
-- parent owner, plus full read/write on reports + entries scoped to that
-- owner. Mirrors the same pattern used for projects RLS.
-- =====================================================

DROP POLICY IF EXISTS checklist_templates_supervisor_read ON public.daily_checklist_templates;
CREATE POLICY checklist_templates_supervisor_read
  ON public.daily_checklist_templates
  FOR SELECT
  USING (
    owner_id IN (
      SELECT p.owner_id FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'supervisor'
    )
  );

DROP POLICY IF EXISTS labor_templates_supervisor_read ON public.labor_role_templates;
CREATE POLICY labor_templates_supervisor_read
  ON public.labor_role_templates
  FOR SELECT
  USING (
    owner_id IN (
      SELECT p.owner_id FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'supervisor'
    )
  );

DROP POLICY IF EXISTS daily_reports_supervisor ON public.daily_service_reports;
CREATE POLICY daily_reports_supervisor
  ON public.daily_service_reports
  FOR ALL
  USING (
    owner_id IN (
      SELECT p.owner_id FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'supervisor'
    )
  )
  WITH CHECK (
    owner_id IN (
      SELECT p.owner_id FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'supervisor'
    )
  );

DROP POLICY IF EXISTS daily_entries_supervisor ON public.daily_report_entries;
CREATE POLICY daily_entries_supervisor
  ON public.daily_report_entries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM daily_service_reports r
      WHERE r.id = daily_report_entries.report_id
        AND r.owner_id IN (
          SELECT p.owner_id FROM profiles p
          WHERE p.id = auth.uid() AND p.role = 'supervisor'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM daily_service_reports r
      WHERE r.id = daily_report_entries.report_id
        AND r.owner_id IN (
          SELECT p.owner_id FROM profiles p
          WHERE p.id = auth.uid() AND p.role = 'supervisor'
        )
    )
  );
