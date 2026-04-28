-- =====================================================
-- accept_supervisor_invite: copy permission flags from invite to profile
-- =====================================================
-- Companion to 20260427_add_supervisor_permissions.sql.
-- The invite row now carries 6 capability flags. When the supervisor
-- accepts, copy them onto their profile so the frontend gates work.
-- =====================================================

CREATE OR REPLACE FUNCTION accept_supervisor_invite(
  p_invite_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invite RECORD;
  v_user_email TEXT;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

  SELECT * INTO v_invite
  FROM supervisor_invites
  WHERE id = p_invite_id
    AND status = 'pending';

  IF v_invite IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation not found or already processed');
  END IF;

  IF LOWER(v_invite.email) != LOWER(v_user_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Email does not match invitation');
  END IF;

  UPDATE profiles
  SET role = 'supervisor',
      owner_id = v_invite.owner_id,
      payment_type = COALESCE(v_invite.payment_type, 'hourly'),
      hourly_rate = COALESCE(v_invite.hourly_rate, 0),
      daily_rate = COALESCE(v_invite.daily_rate, 0),
      weekly_salary = COALESCE(v_invite.weekly_salary, 0),
      project_rate = COALESCE(v_invite.project_rate, 0),
      can_create_projects = COALESCE(v_invite.can_create_projects, false),
      can_create_estimates = COALESCE(v_invite.can_create_estimates, false),
      can_create_invoices = COALESCE(v_invite.can_create_invoices, false),
      can_message_clients = COALESCE(v_invite.can_message_clients, false),
      can_pay_workers = COALESCE(v_invite.can_pay_workers, false),
      can_manage_workers = COALESCE(v_invite.can_manage_workers, false)
  WHERE id = p_user_id;

  UPDATE supervisor_invites
  SET status = 'accepted',
      accepted_at = NOW()
  WHERE id = p_invite_id;

  RETURN jsonb_build_object(
    'success', true,
    'owner_id', v_invite.owner_id,
    'message', 'Successfully joined as supervisor'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
