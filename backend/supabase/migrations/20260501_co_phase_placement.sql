-- =====================================================
-- Change orders: phase placement
-- =====================================================
-- A CO that adds days/scope should snap into the project's phase timeline.
-- The owner picks one of three placements before sending:
--   - 'before_phase'  → insert NEW phase BEFORE target_phase_id
--   - 'after_phase'   → insert NEW phase AFTER target_phase_id
--   - 'inside_phase'  → merge CO line items into target_phase_id's tasks
--                       and add schedule_impact_days to that phase's planned_days
--
-- When approve_change_order() fires, the cascade applies the placement.
-- Subsequent phases shift forward in time as needed.

ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS phase_placement TEXT
    CHECK (phase_placement IN ('before_phase', 'after_phase', 'inside_phase')),
  ADD COLUMN IF NOT EXISTS target_phase_id UUID
    REFERENCES public.project_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS new_phase_name TEXT,
  ADD COLUMN IF NOT EXISTS applied_phase_id UUID
    REFERENCES public.project_phases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_change_orders_target_phase
  ON public.change_orders(target_phase_id) WHERE target_phase_id IS NOT NULL;

COMMENT ON COLUMN public.change_orders.phase_placement IS
  'How to snap this CO into the project timeline on approval. NULL = legacy, no phase manipulation.';
COMMENT ON COLUMN public.change_orders.target_phase_id IS
  'For before_phase/after_phase: the anchor phase. For inside_phase: the phase the CO merges into.';
COMMENT ON COLUMN public.change_orders.new_phase_name IS
  'For before_phase/after_phase: the new phase name. Defaults to CO title if NULL.';
COMMENT ON COLUMN public.change_orders.applied_phase_id IS
  'After approval: the phase id that was created (before/after) or modified (inside). For audit + reverse-on-revoke.';

-- =====================================================
-- Re-define approve_change_order to apply phase placement
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
  v_target_phase public.project_phases;
  v_new_phase_id UUID;
  v_new_phase_name TEXT;
  v_phase_tasks JSONB;
  v_co_tasks JSONB;
  v_new_order INT;
BEGIN
  -- Lock the CO row to prevent concurrent approvals
  SELECT * INTO v_co FROM public.change_orders WHERE id = p_co_id FOR UPDATE;
  IF v_co.id IS NULL THEN
    RAISE EXCEPTION 'Change order % not found', p_co_id;
  END IF;
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

  -- Shift project end_date if scheduled impact != 0
  IF v_co.schedule_impact_days IS NOT NULL AND v_co.schedule_impact_days <> 0 THEN
    UPDATE public.projects
      SET end_date = end_date + (v_co.schedule_impact_days || ' days')::INTERVAL
      WHERE id = v_co.project_id AND end_date IS NOT NULL;
  END IF;

  -- ============== Apply phase placement (if specified) ==============
  IF v_co.phase_placement IS NOT NULL THEN
    -- Build CO tasks JSON from line items (best-effort; works even if line items missing)
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', li.id,
        'description', li.description,
        'order', li.position,
        'completed', false,
        'source', 'change_order',
        'change_order_id', v_co.id,
        'amount', li.amount
      ) ORDER BY li.position
    ), '[]'::jsonb)
      INTO v_co_tasks
      FROM public.change_order_line_items li
      WHERE li.change_order_id = v_co.id;

    v_new_phase_name := COALESCE(NULLIF(v_co.new_phase_name, ''), v_co.title);

    IF v_co.phase_placement = 'inside_phase' AND v_co.target_phase_id IS NOT NULL THEN
      -- Merge CO tasks into target phase, extend planned_days, shift downstream phases
      SELECT * INTO v_target_phase FROM public.project_phases
        WHERE id = v_co.target_phase_id AND project_id = v_co.project_id
        FOR UPDATE;

      IF v_target_phase.id IS NOT NULL THEN
        UPDATE public.project_phases
          SET tasks = COALESCE(tasks, '[]'::jsonb) || v_co_tasks,
              planned_days = COALESCE(planned_days, 0) + COALESCE(v_co.schedule_impact_days, 0),
              end_date = CASE
                WHEN end_date IS NOT NULL AND v_co.schedule_impact_days IS NOT NULL
                  THEN end_date + (v_co.schedule_impact_days || ' days')::INTERVAL
                ELSE end_date
              END
          WHERE id = v_target_phase.id;

        -- Shift downstream phases forward
        IF v_co.schedule_impact_days IS NOT NULL AND v_co.schedule_impact_days <> 0 THEN
          UPDATE public.project_phases
            SET start_date = start_date + (v_co.schedule_impact_days || ' days')::INTERVAL,
                end_date = end_date + (v_co.schedule_impact_days || ' days')::INTERVAL
            WHERE project_id = v_co.project_id
              AND order_index > v_target_phase.order_index
              AND start_date IS NOT NULL;
        END IF;

        UPDATE public.change_orders SET applied_phase_id = v_target_phase.id WHERE id = v_co.id;
      END IF;

    ELSIF v_co.phase_placement IN ('before_phase', 'after_phase') AND v_co.target_phase_id IS NOT NULL THEN
      -- Insert a new phase, push siblings down to make room
      SELECT * INTO v_target_phase FROM public.project_phases
        WHERE id = v_co.target_phase_id AND project_id = v_co.project_id;

      IF v_target_phase.id IS NOT NULL THEN
        IF v_co.phase_placement = 'before_phase' THEN
          v_new_order := v_target_phase.order_index;
        ELSE
          v_new_order := v_target_phase.order_index + 1;
        END IF;

        -- Shift order_index of phases at or after v_new_order
        UPDATE public.project_phases
          SET order_index = order_index + 1
          WHERE project_id = v_co.project_id AND order_index >= v_new_order;

        -- Shift dates of phases at or after v_new_order forward by schedule_impact_days
        IF v_co.schedule_impact_days IS NOT NULL AND v_co.schedule_impact_days > 0 THEN
          UPDATE public.project_phases
            SET start_date = start_date + (v_co.schedule_impact_days || ' days')::INTERVAL,
                end_date = end_date + (v_co.schedule_impact_days || ' days')::INTERVAL
            WHERE project_id = v_co.project_id
              AND order_index >= v_new_order + 1  -- only the originally-shifted ones
              AND start_date IS NOT NULL;
        END IF;

        -- Insert the new phase. Compute its dates from the anchor.
        INSERT INTO public.project_phases (
          project_id, name, order_index, planned_days,
          start_date, end_date, status, tasks
        ) VALUES (
          v_co.project_id,
          v_new_phase_name,
          v_new_order,
          COALESCE(v_co.schedule_impact_days, 0),
          CASE
            WHEN v_co.phase_placement = 'before_phase' THEN v_target_phase.start_date
            WHEN v_co.phase_placement = 'after_phase'  THEN v_target_phase.end_date
            ELSE NULL
          END,
          CASE
            WHEN v_co.phase_placement = 'before_phase' AND v_target_phase.start_date IS NOT NULL
              THEN v_target_phase.start_date + (COALESCE(v_co.schedule_impact_days, 0) || ' days')::INTERVAL
            WHEN v_co.phase_placement = 'after_phase' AND v_target_phase.end_date IS NOT NULL
              THEN v_target_phase.end_date + (COALESCE(v_co.schedule_impact_days, 0) || ' days')::INTERVAL
            ELSE NULL
          END,
          'not_started',
          v_co_tasks
        ) RETURNING id INTO v_new_phase_id;

        UPDATE public.change_orders SET applied_phase_id = v_new_phase_id WHERE id = v_co.id;
      END IF;
    END IF;
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
      'billing_strategy', v_co.billing_strategy,
      'phase_placement', v_co.phase_placement,
      'target_phase_id', v_co.target_phase_id,
      'applied_phase_id', COALESCE(v_new_phase_id, v_target_phase.id)
    )
  );

  -- Spawn ready draw row when applicable (billing_strategy=invoice_now)
  IF v_co.billing_strategy = 'invoice_now' THEN
    SELECT id INTO v_schedule_id FROM public.draw_schedules
      WHERE project_id = v_co.project_id LIMIT 1;
    IF v_schedule_id IS NOT NULL THEN
      SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_next_order_index
        FROM public.draw_schedule_items WHERE schedule_id = v_schedule_id;
      INSERT INTO public.draw_schedule_items (
        schedule_id, project_id, user_id,
        order_index, description, fixed_amount,
        trigger_type, status, co_id
      ) VALUES (
        v_schedule_id, v_co.project_id, v_co.owner_id,
        v_next_order_index, v_co_label || ': ' || v_co.title,
        v_co.total_amount,
        'change_order_approved', 'ready', v_co.id
      );
    END IF;
  END IF;

  -- Owner notification (separate from draw_ready)
  INSERT INTO public.notifications (
    user_id, project_id, title, body, type, icon, color, action_type, action_data
  ) VALUES (
    v_co.owner_id, v_co.project_id,
    'Change order approved',
    p_approver_name || ' approved ' || v_co_label || ' — $' ||
      to_char(v_co.total_amount, 'FM999,999,990.00'),
    'co_response_received',
    '✅', '#16a34a',
    'view_change_order',
    jsonb_build_object(
      'change_order_id', v_co.id,
      'project_id', v_co.project_id,
      'co_number', v_co.co_number,
      'screen', 'Projects'
    )
  );

  RETURN v_co;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.approve_change_order IS
  'Approves a CO atomically: status flip, contract_amount cascade via projects.extras, end_date shift, phase placement (before/after/inside), draw spawn (invoice_now), audit row, owner notification.';
