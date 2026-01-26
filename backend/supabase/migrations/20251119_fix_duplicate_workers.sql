-- =====================================================
-- Fix Duplicate Worker Records
-- =====================================================
-- When a worker self-registers and then receives an invitation,
-- we get duplicate records. This migration merges them.
-- Created: 2025-11-19

-- Function to handle accepting invites with duplicate resolution
CREATE OR REPLACE FUNCTION accept_worker_invite(
  p_worker_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT;
  v_existing_worker_id UUID;
  v_result JSONB;
BEGIN
  -- Get the email from the pending invitation
  SELECT email INTO v_email
  FROM workers
  WHERE id = p_worker_id
    AND status = 'pending'
    AND user_id IS NULL;

  IF v_email IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invitation not found or already accepted'
    );
  END IF;

  -- Check if there's already a worker record with this user_id
  SELECT id INTO v_existing_worker_id
  FROM workers
  WHERE user_id = p_user_id
    AND id != p_worker_id;

  IF v_existing_worker_id IS NOT NULL THEN
    -- Delete the self-registered worker record
    -- Keep the invitation record because it has the owner_id and payment info
    DELETE FROM workers WHERE id = v_existing_worker_id;
  END IF;

  -- Now update the invitation record
  UPDATE workers
  SET user_id = p_user_id,
      status = 'active',
      is_onboarded = true
  WHERE id = p_worker_id
    AND status = 'pending'
    AND user_id IS NULL;

  -- Return success
  RETURN jsonb_build_object(
    'success', true,
    'worker_id', p_worker_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION accept_worker_invite(UUID, UUID) TO authenticated;

-- Add comment
COMMENT ON FUNCTION accept_worker_invite IS
'Accepts a worker invitation and handles duplicate worker records by merging them';
