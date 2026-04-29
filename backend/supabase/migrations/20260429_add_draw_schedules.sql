-- =====================================================
-- DRAW SCHEDULES (progress billing)
-- Created: 2026-04-29
-- Purpose: Enable %-of-contract / fixed-amount draws on
-- larger projects (new construction, $50K+ remodels). A
-- draw is a milestone-based bill against the project's
-- contract_amount; each draw eventually generates a real
-- invoice in the existing `invoices` table.
-- =====================================================

-- =====================================================
-- TABLE: draw_schedules (one per project)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.draw_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  retainage_percent NUMERIC(5,2) NOT NULL DEFAULT 0
    CHECK (retainage_percent >= 0 AND retainage_percent <= 20),

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_draw_schedules_project ON public.draw_schedules(project_id);
CREATE INDEX IF NOT EXISTS idx_draw_schedules_user    ON public.draw_schedules(user_id);

-- =====================================================
-- TABLE: draw_schedule_items (rows: one per draw)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.draw_schedule_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.draw_schedules(id) ON DELETE CASCADE,
  -- Denormalized for cheaper RLS / portal reads
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  order_index INT NOT NULL,
  description TEXT NOT NULL,

  -- Optional link to a project phase (manual trigger is the default
  -- workflow; phase link is informational + future automation hook).
  phase_id UUID REFERENCES public.project_phases(id) ON DELETE SET NULL,

  -- Either a percent of the project's current contract_amount OR a
  -- fixed dollar amount — exactly one is set.
  percent_of_contract NUMERIC(5,2)
    CHECK (percent_of_contract IS NULL OR (percent_of_contract > 0 AND percent_of_contract <= 100)),
  fixed_amount NUMERIC(12,2)
    CHECK (fixed_amount IS NULL OR fixed_amount > 0),
  CHECK ((percent_of_contract IS NOT NULL) <> (fixed_amount IS NOT NULL)),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ready','invoiced','paid','skipped')),
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,

  -- Lien waiver tracking. Defaults to not_required so the UI can hide
  -- this section unless the contractor / bank flips it on per draw.
  waiver_status TEXT NOT NULL DEFAULT 'not_required'
    CHECK (waiver_status IN ('not_required','required','conditional_signed','unconditional_signed')),
  waiver_doc_id UUID,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_draw_items_schedule ON public.draw_schedule_items(schedule_id, order_index);
CREATE INDEX IF NOT EXISTS idx_draw_items_project  ON public.draw_schedule_items(project_id);
CREATE INDEX IF NOT EXISTS idx_draw_items_invoice  ON public.draw_schedule_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_draw_items_user     ON public.draw_schedule_items(user_id);

-- =====================================================
-- VIEW: draw_schedule_progress
-- Computes drawn-to-date / paid-to-date against the live
-- contract_amount so change orders flow through automatically.
-- =====================================================
CREATE OR REPLACE VIEW public.draw_schedule_progress AS
SELECT
  ds.id            AS schedule_id,
  ds.project_id,
  ds.user_id,
  p.contract_amount,
  ds.retainage_percent,
  COALESCE(SUM(
    CASE
      WHEN dsi.percent_of_contract IS NOT NULL
        THEN p.contract_amount * dsi.percent_of_contract / 100.0
      ELSE dsi.fixed_amount
    END
  ) FILTER (WHERE dsi.status IN ('invoiced','paid')), 0)::NUMERIC(14,2) AS drawn_to_date,
  COALESCE(SUM(
    CASE
      WHEN dsi.percent_of_contract IS NOT NULL
        THEN p.contract_amount * dsi.percent_of_contract / 100.0
      ELSE dsi.fixed_amount
    END
  ) FILTER (WHERE dsi.status = 'paid'), 0)::NUMERIC(14,2) AS paid_to_date,
  COUNT(dsi.id) FILTER (WHERE dsi.status IN ('invoiced','paid'))::INT AS draws_billed,
  COUNT(dsi.id)::INT AS draws_total
FROM public.draw_schedules ds
JOIN public.projects p ON p.id = ds.project_id
LEFT JOIN public.draw_schedule_items dsi ON dsi.schedule_id = ds.id
GROUP BY ds.id, ds.project_id, ds.user_id, p.contract_amount, ds.retainage_percent;

COMMENT ON VIEW public.draw_schedule_progress IS
  'Per-project rollup of draws billed vs contract. Percent draws are computed against the LIVE contract_amount, so change orders adjust draw values automatically.';

-- =====================================================
-- RLS — owner + supervisor pattern (mirrors invoices)
-- =====================================================
ALTER TABLE public.draw_schedules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.draw_schedule_items ENABLE ROW LEVEL SECURITY;

-- Owner CRUD
DROP POLICY IF EXISTS draw_schedules_owner_all      ON public.draw_schedules;
DROP POLICY IF EXISTS draw_schedule_items_owner_all ON public.draw_schedule_items;

CREATE POLICY draw_schedules_owner_all
  ON public.draw_schedules
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY draw_schedule_items_owner_all
  ON public.draw_schedule_items
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Supervisor read (mirrors 20260427_supervisor_invoices_schedule_rls.sql)
DROP POLICY IF EXISTS draw_schedules_supervisor_read      ON public.draw_schedules;
DROP POLICY IF EXISTS draw_schedule_items_supervisor_read ON public.draw_schedule_items;

CREATE POLICY draw_schedules_supervisor_read
  ON public.draw_schedules
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE assigned_supervisor_id = auth.uid()
    )
  );

CREATE POLICY draw_schedule_items_supervisor_read
  ON public.draw_schedule_items
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE assigned_supervisor_id = auth.uid()
    )
  );

-- =====================================================
-- updated_at triggers (reuse update_updated_at_column())
-- =====================================================
DROP TRIGGER IF EXISTS trg_draw_schedules_updated_at      ON public.draw_schedules;
DROP TRIGGER IF EXISTS trg_draw_schedule_items_updated_at ON public.draw_schedule_items;

CREATE TRIGGER trg_draw_schedules_updated_at
  BEFORE UPDATE ON public.draw_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_draw_schedule_items_updated_at
  BEFORE UPDATE ON public.draw_schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- Audit log triggers — attached lazily.
-- The generic public.attach_audit_trigger() helper from
-- 20260428_audit_log_triggers.sql may not be applied in
-- every environment yet, so attach only if the helper
-- exists. Once the audit migration runs, future deploys
-- will pick it up automatically.
-- =====================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'attach_audit_trigger'
  ) THEN
    PERFORM public.attach_audit_trigger('draw_schedules');
    PERFORM public.attach_audit_trigger('draw_schedule_items');
  END IF;
END$$;

-- =====================================================
-- Comments
-- =====================================================
COMMENT ON TABLE public.draw_schedules      IS 'Per-project progress billing schedule. One per project.';
COMMENT ON TABLE public.draw_schedule_items IS 'Individual draws within a schedule (deposit, foundation, rough-in, etc.).';
COMMENT ON COLUMN public.draw_schedule_items.percent_of_contract IS 'XOR with fixed_amount. % rows scale with live contract_amount so change orders flow through.';
COMMENT ON COLUMN public.draw_schedule_items.fixed_amount        IS 'XOR with percent_of_contract. Use for flat-amount draws (e.g. $5,000 deposit).';
COMMENT ON COLUMN public.draw_schedule_items.invoice_id          IS 'Set when generate_draw_invoice runs. Status flips back if the invoice is voided.';
COMMENT ON COLUMN public.draw_schedule_items.waiver_status       IS 'Lien-waiver workflow per draw. Default not_required; UI hides until enabled.';
