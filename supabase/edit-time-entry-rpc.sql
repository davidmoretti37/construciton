-- RPC function for editing time entries (bypasses RLS with built-in authorization)
-- Run this in your Supabase SQL editor or as a migration

CREATE OR REPLACE FUNCTION edit_time_entry(
  p_entry_id UUID,
  p_clock_in TIMESTAMPTZ,
  p_clock_out TIMESTAMPTZ,
  p_table TEXT DEFAULT 'worker'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_record_owner_id UUID;
  v_authorized BOOLEAN := FALSE;
  v_hours_worked NUMERIC;
  v_owner_id UUID;
BEGIN
  -- Validate inputs
  IF p_clock_out <= p_clock_in THEN
    RETURN jsonb_build_object('success', false, 'error', 'clock_out must be after clock_in');
  END IF;

  v_hours_worked := EXTRACT(EPOCH FROM (p_clock_out - p_clock_in)) / 3600.0;

  IF p_table = 'supervisor' THEN
    -- Get supervisor_id from the record
    SELECT supervisor_id INTO v_record_owner_id
    FROM supervisor_time_tracking
    WHERE id = p_entry_id;

    IF v_record_owner_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Time entry not found');
    END IF;

    -- Check: is the user the supervisor themselves?
    IF v_record_owner_id = v_user_id THEN
      v_authorized := TRUE;
    END IF;

    -- Check: is the user the owner of this supervisor?
    IF NOT v_authorized THEN
      SELECT owner_id INTO v_owner_id FROM profiles WHERE id = v_record_owner_id;
      IF v_owner_id = v_user_id THEN
        v_authorized := TRUE;
      END IF;
    END IF;

    IF NOT v_authorized THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;

    UPDATE supervisor_time_tracking
    SET clock_in = p_clock_in, clock_out = p_clock_out
    WHERE id = p_entry_id;

  ELSE
    -- Worker time entry
    SELECT worker_id INTO v_record_owner_id
    FROM time_tracking
    WHERE id = p_entry_id;

    IF v_record_owner_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'Time entry not found');
    END IF;

    -- Check: is the user the worker themselves? (worker_id = user profile id)
    IF v_record_owner_id = v_user_id THEN
      v_authorized := TRUE;
    END IF;

    -- Check: is the user the owner of this worker?
    IF NOT v_authorized THEN
      SELECT owner_id INTO v_owner_id FROM workers WHERE id = v_record_owner_id;
      IF v_owner_id = v_user_id THEN
        v_authorized := TRUE;
      END IF;
    END IF;

    -- Check: is the user a supervisor assigned to this worker's project?
    IF NOT v_authorized THEN
      PERFORM 1 FROM time_tracking tt
        JOIN projects p ON p.id = tt.project_id
        WHERE tt.id = p_entry_id
          AND p.assigned_supervisor_id = v_user_id;
      IF FOUND THEN
        v_authorized := TRUE;
      END IF;
    END IF;

    IF NOT v_authorized THEN
      RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
    END IF;

    UPDATE time_tracking
    SET clock_in = p_clock_in, clock_out = p_clock_out, hours_worked = v_hours_worked
    WHERE id = p_entry_id;

  END IF;

  RETURN jsonb_build_object('success', true, 'hours_worked', v_hours_worked);
END;
$$;
