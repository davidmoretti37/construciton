-- =====================================================
-- Draw triggers: automate "ready to send" detection
-- Created: 2026-04-29
-- Purpose: Make every draw self-arming. The contractor never has to
-- remember to bill — when a phase completes (or the project goes
-- active for deposit-style draws), the matching draw_schedule_items
-- row flips from 'pending' to 'ready' and a notification is written
-- so the agent / push system can prompt the owner to send it.
-- =====================================================

-- 1. Add trigger_type column
ALTER TABLE public.draw_schedule_items
  ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'phase_completion'
    CHECK (trigger_type IN ('phase_completion', 'project_start', 'manual'));

COMMENT ON COLUMN public.draw_schedule_items.trigger_type IS
  'When should this draw flip to ready? phase_completion (needs phase_id), project_start (deposit-style), or manual (explicit flip via app).';

-- Backfill: any existing row with a phase_id gets phase_completion (already
-- the default), rows without a phase_id get manual so they don't auto-fire.
UPDATE public.draw_schedule_items
   SET trigger_type = 'manual'
 WHERE phase_id IS NULL
   AND trigger_type = 'phase_completion';

-- 2. Helper: write a notification row when a draw becomes ready.
-- Idempotent: skips if a draw_ready notification already exists for this
-- draw item (prevents duplicate pings if a phase is re-completed after a
-- mistake / undo).
CREATE OR REPLACE FUNCTION public.notify_draw_ready(p_item_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_project RECORD;
  v_contract NUMERIC;
  v_retainage NUMERIC;
  v_gross NUMERIC;
  v_net NUMERIC;
  v_existing UUID;
BEGIN
  SELECT dsi.*, ds.retainage_percent
    INTO v_item
    FROM public.draw_schedule_items dsi
    JOIN public.draw_schedules ds ON ds.id = dsi.schedule_id
   WHERE dsi.id = p_item_id;

  IF NOT FOUND OR v_item.user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id, name, contract_amount
    INTO v_project
    FROM public.projects
   WHERE id = v_item.project_id;

  v_contract := COALESCE(v_project.contract_amount, 0);
  v_retainage := COALESCE(v_item.retainage_percent, 0);
  v_gross := CASE
               WHEN v_item.percent_of_contract IS NOT NULL
                 THEN v_contract * v_item.percent_of_contract / 100.0
               ELSE COALESCE(v_item.fixed_amount, 0)
             END;
  v_net := v_gross - (v_gross * v_retainage / 100.0);

  -- Skip if we already pinged for this draw being ready.
  SELECT id INTO v_existing
    FROM public.notifications
   WHERE user_id = v_item.user_id
     AND type = 'draw_ready'
     AND action_data->>'draw_item_id' = p_item_id::text
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications (
    user_id, project_id, title, body, type,
    icon, color, action_type, action_data
  ) VALUES (
    v_item.user_id,
    v_item.project_id,
    'Draw ready to send',
    format('%s: $%s ready to bill — %s',
      COALESCE(v_project.name, 'Project'),
      to_char(v_net, 'FM999,999,999.00'),
      v_item.description
    ),
    'draw_ready',
    'cash-outline',
    '#10B981',
    'send_draw',
    jsonb_build_object(
      'draw_item_id', p_item_id,
      'project_id',   v_item.project_id,
      'gross',        v_gross,
      'retainage',    v_gross * v_retainage / 100.0,
      'net',          v_net
    )
  );
END;
$$;

-- 3. Trigger fn: when a phase's status flips to 'completed', flip every
-- pending draw bound to it (trigger_type = phase_completion) to 'ready'.
CREATE OR REPLACE FUNCTION public.draws_on_phase_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_draw RECORD;
BEGIN
  -- Only act when status crosses INTO 'completed' (not on every update).
  IF NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed' THEN
    FOR v_draw IN
      SELECT id
        FROM public.draw_schedule_items
       WHERE phase_id = NEW.id
         AND trigger_type = 'phase_completion'
         AND status = 'pending'
    LOOP
      UPDATE public.draw_schedule_items
         SET status = 'ready'
       WHERE id = v_draw.id;
      PERFORM public.notify_draw_ready(v_draw.id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_draws_on_phase_completion ON public.project_phases;
CREATE TRIGGER trg_draws_on_phase_completion
  AFTER UPDATE OF status ON public.project_phases
  FOR EACH ROW
  EXECUTE FUNCTION public.draws_on_phase_completion();

-- 4. Trigger fn: when a project flips from draft → active, flip all
-- project_start draws to 'ready'.
CREATE OR REPLACE FUNCTION public.draws_on_project_active()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_draw RECORD;
BEGIN
  IF NEW.status = 'active' AND COALESCE(OLD.status, '') <> 'active' THEN
    FOR v_draw IN
      SELECT id
        FROM public.draw_schedule_items
       WHERE project_id = NEW.id
         AND trigger_type = 'project_start'
         AND status = 'pending'
    LOOP
      UPDATE public.draw_schedule_items
         SET status = 'ready'
       WHERE id = v_draw.id;
      PERFORM public.notify_draw_ready(v_draw.id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_draws_on_project_active ON public.projects;
CREATE TRIGGER trg_draws_on_project_active
  AFTER UPDATE OF status ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.draws_on_project_active();

-- 5. Catch the "project created already-active" path (e.g. final-save jumps
-- straight to 'active'). Without this, project_start draws stay pending.
CREATE OR REPLACE FUNCTION public.draws_on_project_insert_active()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_draw RECORD;
BEGIN
  IF NEW.status = 'active' THEN
    FOR v_draw IN
      SELECT id
        FROM public.draw_schedule_items
       WHERE project_id = NEW.id
         AND trigger_type = 'project_start'
         AND status = 'pending'
    LOOP
      UPDATE public.draw_schedule_items
         SET status = 'ready'
       WHERE id = v_draw.id;
      PERFORM public.notify_draw_ready(v_draw.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_draws_on_project_insert_active ON public.projects;
CREATE TRIGGER trg_draws_on_project_insert_active
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.draws_on_project_insert_active();

-- 6. Also catch the "draw added AFTER its phase already completed" / "draw
-- added on an already-active project" cases. Without this, defining a draw
-- after the trigger condition has already happened leaves it stuck pending.
CREATE OR REPLACE FUNCTION public.arm_draw_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_phase_status TEXT;
  v_project_status TEXT;
BEGIN
  IF NEW.trigger_type = 'phase_completion' AND NEW.phase_id IS NOT NULL THEN
    SELECT status INTO v_phase_status
      FROM public.project_phases
     WHERE id = NEW.phase_id;
    IF v_phase_status = 'completed' AND NEW.status = 'pending' THEN
      NEW.status := 'ready';
    END IF;
  ELSIF NEW.trigger_type = 'project_start' THEN
    SELECT status INTO v_project_status
      FROM public.projects
     WHERE id = NEW.project_id;
    IF v_project_status = 'active' AND NEW.status = 'pending' THEN
      NEW.status := 'ready';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_arm_draw_on_insert ON public.draw_schedule_items;
CREATE TRIGGER trg_arm_draw_on_insert
  BEFORE INSERT ON public.draw_schedule_items
  FOR EACH ROW
  EXECUTE FUNCTION public.arm_draw_on_insert();

-- After the BEFORE INSERT sets status='ready', fire the notification too.
CREATE OR REPLACE FUNCTION public.notify_draw_ready_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'ready' THEN
    PERFORM public.notify_draw_ready(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_draw_ready_after_insert ON public.draw_schedule_items;
CREATE TRIGGER trg_notify_draw_ready_after_insert
  AFTER INSERT ON public.draw_schedule_items
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_draw_ready_after_insert();
