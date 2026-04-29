-- =====================================================
-- CHANGE ORDERS
-- Created: 2026-04-29
-- Purpose: First-class change order entity with state machine,
--          line items, approval cascade to project contract + end_date,
--          and e-signature integration.
--
-- Connects to:
--   - projects (cascade contract_amount via existing extras trigger; end_date)
--   - signatures (extends document_type CHECK to include 'change_order')
--   - approval_events (entity_type='change_order' already allowed)
--   - project_clients (RLS + portal access already gates this)
-- =====================================================

-- =====================================================
-- 1. CHANGE ORDERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  co_number INT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  -- Money
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5, 4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12, 2) GENERATED ALWAYS AS (ROUND(subtotal * tax_rate, 2)) STORED,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,

  -- Schedule
  schedule_impact_days INT NOT NULL DEFAULT 0,

  -- State machine
  -- pending_client = sent (kept for backwards-compat with existing portal route)
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_client', 'viewed', 'approved', 'rejected', 'void')),

  -- Lifecycle timestamps
  sent_at TIMESTAMPTZ,
  client_viewed_at TIMESTAMPTZ,
  client_responded_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,

  -- Approval artifacts
  approved_by_name TEXT,
  client_response_reason TEXT,
  current_signature_id UUID REFERENCES public.signatures(id) ON DELETE SET NULL,
  signature_required BOOLEAN NOT NULL DEFAULT FALSE,

  -- Cascade audit (what we changed when approved)
  applied_contract_delta NUMERIC(12, 2),
  applied_schedule_delta_days INT,
  applied_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (project_id, co_number)
);

CREATE INDEX idx_change_orders_project ON public.change_orders(project_id);
CREATE INDEX idx_change_orders_owner ON public.change_orders(owner_id);
CREATE INDEX idx_change_orders_status ON public.change_orders(status);
CREATE INDEX idx_change_orders_created ON public.change_orders(created_at DESC);

-- =====================================================
-- 2. LINE ITEMS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.change_order_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES public.change_orders(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount NUMERIC(12, 2) GENERATED ALWAYS AS (ROUND(quantity * unit_price, 2)) STORED,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_co_line_items_co ON public.change_order_line_items(change_order_id);

-- =====================================================
-- 3. ATTACHMENTS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.change_order_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id UUID NOT NULL REFERENCES public.change_orders(id) ON DELETE CASCADE,
  document_path TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_co_attachments_co ON public.change_order_attachments(change_order_id);

-- =====================================================
-- 4. EXTEND signatures.document_type TO INCLUDE 'change_order'
-- =====================================================
ALTER TABLE public.signatures
  DROP CONSTRAINT IF EXISTS signatures_document_type_check;
ALTER TABLE public.signatures
  ADD CONSTRAINT signatures_document_type_check
  CHECK (document_type IN ('estimate', 'invoice', 'contract', 'change_order'));

-- =====================================================
-- 5. AUTO-NUMBER TRIGGER (per-project sequential)
-- =====================================================
CREATE OR REPLACE FUNCTION public.assign_co_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.co_number IS NULL OR NEW.co_number = 0 THEN
    SELECT COALESCE(MAX(co_number), 0) + 1
      INTO NEW.co_number
      FROM public.change_orders
      WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assign_co_number ON public.change_orders;
CREATE TRIGGER trg_assign_co_number
  BEFORE INSERT ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_co_number();

-- =====================================================
-- 6. UPDATED_AT TRIGGER (reuse existing fn)
-- =====================================================
DROP TRIGGER IF EXISTS trg_change_orders_updated_at ON public.change_orders;
CREATE TRIGGER trg_change_orders_updated_at
  BEFORE UPDATE ON public.change_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- 7. APPROVAL CASCADE FUNCTION
-- Wraps: status flip, project.extras append (drives existing
-- contract_amount auto-recalc trigger), end_date shift, audit log.
-- Idempotent: returns existing applied_at if already approved.
-- =====================================================
CREATE OR REPLACE FUNCTION public.approve_change_order(
  p_co_id UUID,
  p_approver_name TEXT,
  p_signature_id UUID DEFAULT NULL,
  p_actor_type TEXT DEFAULT 'client',
  p_actor_id UUID DEFAULT NULL
) RETURNS public.change_orders AS $$
DECLARE
  v_co public.change_orders;
  v_extra JSONB;
BEGIN
  -- Lock the row to prevent concurrent approvals
  SELECT * INTO v_co
    FROM public.change_orders
    WHERE id = p_co_id
    FOR UPDATE;

  IF v_co.id IS NULL THEN
    RAISE EXCEPTION 'Change order % not found', p_co_id;
  END IF;

  -- Idempotent: already approved → return as-is
  IF v_co.status = 'approved' THEN
    RETURN v_co;
  END IF;

  IF v_co.status NOT IN ('pending_client', 'viewed') THEN
    RAISE EXCEPTION 'Cannot approve CO in status %', v_co.status;
  END IF;

  -- Flip status + record artifacts
  UPDATE public.change_orders SET
    status = 'approved',
    approved_at = NOW(),
    client_responded_at = NOW(),
    approved_by_name = p_approver_name,
    current_signature_id = COALESCE(p_signature_id, current_signature_id),
    applied_contract_delta = total_amount,
    applied_schedule_delta_days = schedule_impact_days,
    applied_at = NOW()
  WHERE id = p_co_id
  RETURNING * INTO v_co;

  -- Push to projects.extras (existing trigger recalculates contract_amount)
  v_extra := jsonb_build_object(
    'amount', v_co.total_amount,
    'description', 'CO-' || LPAD(v_co.co_number::TEXT, 3, '0') || ': ' || v_co.title,
    'dateAdded', to_char(NOW(), 'YYYY-MM-DD'),
    'change_order_id', v_co.id
  );

  UPDATE public.projects
    SET extras = COALESCE(extras, '[]'::jsonb) || v_extra
    WHERE id = v_co.project_id;

  -- Shift end_date if scheduled impact > 0
  IF v_co.schedule_impact_days IS NOT NULL AND v_co.schedule_impact_days <> 0 THEN
    UPDATE public.projects
      SET end_date = end_date + (v_co.schedule_impact_days || ' days')::INTERVAL
      WHERE id = v_co.project_id AND end_date IS NOT NULL;
  END IF;

  -- Audit log
  INSERT INTO public.approval_events (
    project_id, entity_type, entity_id, action, actor_type, actor_id, notes, metadata
  ) VALUES (
    v_co.project_id,
    'change_order',
    v_co.id,
    'approved',
    p_actor_type,
    COALESCE(p_actor_id, v_co.owner_id),
    'Approved by ' || p_approver_name,
    jsonb_build_object(
      'co_number', v_co.co_number,
      'total_amount', v_co.total_amount,
      'schedule_impact_days', v_co.schedule_impact_days,
      'signature_id', p_signature_id
    )
  );

  RETURN v_co;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 8. REJECT FUNCTION (no cascade, just status + audit)
-- =====================================================
CREATE OR REPLACE FUNCTION public.reject_change_order(
  p_co_id UUID,
  p_reason TEXT,
  p_actor_type TEXT DEFAULT 'client',
  p_actor_id UUID DEFAULT NULL
) RETURNS public.change_orders AS $$
DECLARE
  v_co public.change_orders;
BEGIN
  SELECT * INTO v_co FROM public.change_orders WHERE id = p_co_id FOR UPDATE;

  IF v_co.id IS NULL THEN
    RAISE EXCEPTION 'Change order % not found', p_co_id;
  END IF;

  IF v_co.status = 'rejected' THEN
    RETURN v_co;
  END IF;

  IF v_co.status NOT IN ('pending_client', 'viewed') THEN
    RAISE EXCEPTION 'Cannot reject CO in status %', v_co.status;
  END IF;

  UPDATE public.change_orders SET
    status = 'rejected',
    rejected_at = NOW(),
    client_responded_at = NOW(),
    client_response_reason = p_reason
  WHERE id = p_co_id
  RETURNING * INTO v_co;

  INSERT INTO public.approval_events (
    project_id, entity_type, entity_id, action, actor_type, actor_id, notes
  ) VALUES (
    v_co.project_id, 'change_order', v_co.id, 'rejected',
    p_actor_type, COALESCE(p_actor_id, v_co.owner_id),
    'Rejected: ' || COALESCE(p_reason, 'No reason given')
  );

  RETURN v_co;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 9. ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_order_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_order_attachments ENABLE ROW LEVEL SECURITY;

-- Owners: full CRUD on their own COs
CREATE POLICY "Owners manage own change_orders" ON public.change_orders
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owners manage own CO line_items" ON public.change_order_line_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.change_orders co
      WHERE co.id = change_order_id AND co.owner_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.change_orders co
      WHERE co.id = change_order_id AND co.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners manage own CO attachments" ON public.change_order_attachments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.change_orders co
      WHERE co.id = change_order_id AND co.owner_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.change_orders co
      WHERE co.id = change_order_id AND co.owner_id = auth.uid()
    )
  );

-- Note: client portal endpoints use the service role and bypass RLS.

-- =====================================================
-- 10. COMMENTS
-- =====================================================
COMMENT ON TABLE public.change_orders IS 'First-class change orders with state machine, schedule + cost impact, and approval cascade.';
COMMENT ON COLUMN public.change_orders.status IS 'draft → pending_client (sent) → viewed → approved | rejected. void is terminal owner-cancel.';
COMMENT ON COLUMN public.change_orders.applied_contract_delta IS 'Snapshot of total_amount at time of approval. Source-of-truth for the projects.extras entry pushed by approve_change_order().';
COMMENT ON FUNCTION public.approve_change_order IS 'Atomically flips CO to approved, pushes to projects.extras (drives contract_amount trigger), shifts end_date, writes audit row.';
