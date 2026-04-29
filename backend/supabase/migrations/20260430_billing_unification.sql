-- =====================================================
-- BILLING UNIFICATION
-- Created: 2026-04-30
-- Purpose: Wire change orders into the draws billing pipeline so
--          everything bills through one mechanism. Adds:
--          1. change_orders.billing_strategy
--          2. draw_schedule_items.co_id (FK + 'change_order_approved' trigger)
--          3. notifications.type extension (draw_ready was failing the CHECK)
--          4. approve_change_order() extended to spawn ready draw rows
--          5. emit_stale_billing_notifications() — daily nudge function
-- =====================================================

-- =====================================================
-- 1. CO billing strategy
-- =====================================================
ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS billing_strategy TEXT NOT NULL DEFAULT 'invoice_now'
    CHECK (billing_strategy IN ('invoice_now', 'next_draw', 'project_end'));

COMMENT ON COLUMN public.change_orders.billing_strategy IS
  'Owner choice at send time: invoice_now spawns a ready draw on approval; next_draw bundles into the next draw invoice; project_end sits as pending until manual.';

-- =====================================================
-- 2. draw_schedule_items.co_id + trigger_type extension
-- =====================================================
ALTER TABLE public.draw_schedule_items
  ADD COLUMN IF NOT EXISTS co_id UUID REFERENCES public.change_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_draw_items_co
  ON public.draw_schedule_items(co_id) WHERE co_id IS NOT NULL;

-- Drop and re-add trigger_type CHECK to include change_order_approved
ALTER TABLE public.draw_schedule_items
  DROP CONSTRAINT IF EXISTS draw_schedule_items_trigger_type_check;
ALTER TABLE public.draw_schedule_items
  ADD CONSTRAINT draw_schedule_items_trigger_type_check
  CHECK (trigger_type IN ('phase_completion', 'project_start', 'manual', 'change_order_approved'));

-- =====================================================
-- 3. notifications.type extension
-- The original CHECK rejected 'draw_ready' so the draws notification
-- was failing silently. Add the billing types we need.
-- =====================================================
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- Existing
    'appointment_reminder',
    'daily_report_submitted',
    'project_warning',
    'financial_update',
    'worker_update',
    'system',
    'bank_reconciliation',
    'task_update',
    'sub_doc_uploaded', 'sub_doc_expiring', 'sub_doc_expired', 'sub_doc_requested',
    'sub_bid_invitation', 'sub_bid_submitted', 'sub_bid_accepted', 'sub_bid_declined',
    'sub_contract_sent', 'sub_contract_signed',
    'sub_invoice_sent', 'sub_payment_received',
    'sub_engagement_status_changed', 'sub_upgrade_invite',
    -- New (billing)
    'draw_ready',           -- draw is ready to bill (already inserted by notify_draw_ready, was failing!)
    'draw_stale',           -- draw has been ready for N+ days, owner hasn't sent
    'invoice_overdue',      -- invoice past due_date with unpaid balance
    'co_response_received', -- client approved or rejected a CO
    'co_pending_response'   -- CO sent N+ days ago, no client action
  ));

-- =====================================================
-- 4. approve_change_order() — extended to spawn ready draw on invoice_now
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
  v_schedule_id UUID;
  v_next_order_index INT;
  v_co_label TEXT;
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

  v_co_label := 'CO-' || LPAD(v_co.co_number::TEXT, 3, '0');

  -- Push to projects.extras (existing trigger recalculates contract_amount)
  v_extra := jsonb_build_object(
    'amount', v_co.total_amount,
    'description', v_co_label || ': ' || v_co.title,
    'dateAdded', to_char(NOW(), 'YYYY-MM-DD'),
    'change_order_id', v_co.id
  );

  UPDATE public.projects
    SET extras = COALESCE(extras, '[]'::jsonb) || v_extra
    WHERE id = v_co.project_id;

  -- Shift end_date if scheduled impact != 0
  IF v_co.schedule_impact_days IS NOT NULL AND v_co.schedule_impact_days <> 0 THEN
    UPDATE public.projects
      SET end_date = end_date + (v_co.schedule_impact_days || ' days')::INTERVAL
      WHERE id = v_co.project_id AND end_date IS NOT NULL;
  END IF;

  -- Audit log
  INSERT INTO public.approval_events (
    project_id, entity_type, entity_id, action, actor_type, actor_id, notes, metadata
  ) VALUES (
    v_co.project_id, 'change_order', v_co.id, 'approved',
    p_actor_type, COALESCE(p_actor_id, v_co.owner_id),
    'Approved by ' || p_approver_name,
    jsonb_build_object(
      'co_number', v_co.co_number,
      'total_amount', v_co.total_amount,
      'schedule_impact_days', v_co.schedule_impact_days,
      'signature_id', p_signature_id,
      'billing_strategy', v_co.billing_strategy
    )
  );

  -- ============== NEW: spawn a ready draw row when applicable ==============
  -- Only spawn if billing_strategy='invoice_now' AND the project has a draws schedule.
  -- For 'next_draw' the CO will be merged into the next regular draw invoice
  -- by generate_draw_invoice (changed elsewhere).
  -- For 'project_end' the owner bills it manually at project completion.
  IF v_co.billing_strategy = 'invoice_now' THEN
    SELECT id INTO v_schedule_id
      FROM public.draw_schedules
      WHERE project_id = v_co.project_id
      LIMIT 1;

    IF v_schedule_id IS NOT NULL THEN
      SELECT COALESCE(MAX(order_index), 0) + 1
        INTO v_next_order_index
        FROM public.draw_schedule_items
        WHERE schedule_id = v_schedule_id;

      INSERT INTO public.draw_schedule_items (
        schedule_id, project_id, user_id,
        order_index, description,
        fixed_amount,
        trigger_type, status,
        co_id
      ) VALUES (
        v_schedule_id, v_co.project_id, v_co.owner_id,
        v_next_order_index, v_co_label || ': ' || v_co.title,
        v_co.total_amount,
        'change_order_approved', 'ready',
        v_co.id
      );
      -- The existing trg_notify_draw_ready_after_insert trigger fires automatically
      -- and inserts a notification (now valid since we extended notifications.type).
    END IF;
  END IF;

  -- Always: notify owner that the client responded (separate from draw_ready)
  -- so the chat surface gets a clean event distinct from billing.
  INSERT INTO public.notifications (
    user_id, project_id, title, body, type, icon, color, action_type, action_data
  ) VALUES (
    v_co.owner_id, v_co.project_id,
    'Change order approved',
    p_approver_name || ' approved ' || v_co_label || ' — $' ||
      to_char(v_co.total_amount, 'FM999,999,990.00') ||
      CASE WHEN v_co.billing_strategy = 'invoice_now' AND v_schedule_id IS NOT NULL
        THEN ' (added to your draws as ready to bill)'
        WHEN v_co.billing_strategy = 'next_draw'
        THEN ' (will bundle into your next draw)'
        ELSE ''
      END,
    'co_response_received',
    'checkmark-circle-outline', '#10B981',
    'navigate',
    jsonb_build_object(
      'change_order_id', v_co.id,
      'project_id', v_co.project_id,
      'screen', 'ChangeOrdersList'
    )
  );

  RETURN v_co;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.approve_change_order IS
  'Atomically approves a CO: flips status, pushes to projects.extras (drives contract_amount trigger), shifts end_date, writes audit row, and (when billing_strategy=invoice_now AND project has draws) inserts a ready draw_schedule_items row that fires the standard draw_ready notification.';

-- =====================================================
-- 5. emit_stale_billing_notifications()
-- Daily cron entry point. Idempotent per (user_id, type, entity_id, day).
-- =====================================================
CREATE OR REPLACE FUNCTION public.emit_stale_billing_notifications()
RETURNS TABLE(emitted INT) AS $$
DECLARE
  v_count INT := 0;
  v_added INT := 0;
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW());
BEGIN
  -- Stale ready draws: status='ready' for > 3 days, no notification today
  WITH stale AS (
    SELECT
      dsi.id, dsi.user_id, dsi.project_id, dsi.description,
      p.name AS project_name,
      ds.retainage_percent,
      CASE WHEN dsi.percent_of_contract IS NOT NULL
        THEN COALESCE(p.contract_amount, 0) * dsi.percent_of_contract / 100.0
        ELSE COALESCE(dsi.fixed_amount, 0)
      END AS gross,
      dsi.updated_at AS ready_since
    FROM public.draw_schedule_items dsi
    JOIN public.draw_schedules ds ON ds.id = dsi.schedule_id
    JOIN public.projects p ON p.id = dsi.project_id
    WHERE dsi.status = 'ready'
      AND dsi.updated_at < NOW() - INTERVAL '3 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = dsi.user_id
          AND n.type = 'draw_stale'
          AND n.action_data->>'draw_item_id' = dsi.id::text
          AND n.created_at >= v_today_start
      )
  )
  INSERT INTO public.notifications (
    user_id, project_id, title, body, type, icon, color, action_type, action_data
  )
  SELECT
    user_id, project_id,
    'Draw waiting to be sent',
    project_name || ': $' || to_char(
      gross - (gross * COALESCE(retainage_percent, 0) / 100.0),
      'FM999,999,990.00'
    ) || ' has been ready for ' ||
      EXTRACT(DAY FROM (NOW() - ready_since))::INT || ' days',
    'draw_stale',
    'time-outline', '#F59E0B',
    'send_draw',
    jsonb_build_object(
      'draw_item_id', id,
      'project_id', project_id,
      'gross', gross,
      'net', gross - (gross * COALESCE(retainage_percent, 0) / 100.0)
    )
  FROM stale;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Overdue invoices: due_date < today, amount_due > 0, no notification today
  INSERT INTO public.notifications (
    user_id, project_id, title, body, type, icon, color, action_type, action_data
  )
  SELECT
    inv.user_id, inv.project_id,
    'Invoice overdue',
    COALESCE(inv.client_name, 'Client') || ' — ' || inv.invoice_number ||
      ' is ' || (CURRENT_DATE - inv.due_date) || ' days overdue ($' ||
      to_char(inv.amount_due, 'FM999,999,990.00') || ')',
    'invoice_overdue',
    'alert-circle-outline', '#EF4444',
    'nudge_invoice',
    jsonb_build_object(
      'invoice_id', inv.id,
      'project_id', inv.project_id,
      'amount_due', inv.amount_due,
      'days_overdue', (CURRENT_DATE - inv.due_date)
    )
  FROM public.invoices inv
  WHERE inv.due_date < CURRENT_DATE
    AND inv.amount_due > 0
    AND inv.status IN ('unpaid', 'partial', 'overdue')
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = inv.user_id
        AND n.type = 'invoice_overdue'
        AND n.action_data->>'invoice_id' = inv.id::text
        AND n.created_at >= v_today_start
    );
  GET DIAGNOSTICS v_added := ROW_COUNT;
  v_count := v_count + v_added;

  -- Stale pending COs: sent_at < 5 days ago, status in (pending_client, viewed), no notification today
  INSERT INTO public.notifications (
    user_id, project_id, title, body, type, icon, color, action_type, action_data
  )
  SELECT
    co.owner_id, co.project_id,
    'Client hasn''t responded',
    'CO-' || LPAD(co.co_number::TEXT, 3, '0') || ': ' || co.title ||
      ' — sent ' || EXTRACT(DAY FROM (NOW() - co.sent_at))::INT || ' days ago',
    'co_pending_response',
    'mail-unread-outline', '#F59E0B',
    'resend_co',
    jsonb_build_object(
      'change_order_id', co.id,
      'project_id', co.project_id,
      'co_number', co.co_number
    )
  FROM public.change_orders co
  WHERE co.status IN ('pending_client', 'viewed')
    AND co.sent_at IS NOT NULL
    AND co.sent_at < NOW() - INTERVAL '5 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = co.owner_id
        AND n.type = 'co_pending_response'
        AND n.action_data->>'change_order_id' = co.id::text
        AND n.created_at >= v_today_start
    );
  GET DIAGNOSTICS v_added := ROW_COUNT;
  v_count := v_count + v_added;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.emit_stale_billing_notifications IS
  'Daily idempotent cron entry. Emits draw_stale, invoice_overdue, co_pending_response notifications for billing events that are stuck. Idempotent by (user, type, entity_id, day).';
