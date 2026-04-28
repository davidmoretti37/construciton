-- =====================================================
-- update_supervisor_permissions: owner-callable RPC for permission toggles
-- =====================================================
-- The shared backend PATCH /api/supervisors/:id route silently drops fields
-- it doesn't destructure. Pre-deploy servers therefore swallow the can_*
-- fields without writing them. This RPC bypasses the backend entirely:
--   * SECURITY DEFINER → bypasses RLS
--   * Validates auth.uid() owns the target supervisor profile
--   * Updates only the can_* columns (NULL params leave the column unchanged)
-- The frontend EditSupervisorScreen calls this in addition to the existing
-- update path so permissions are authoritatively persisted regardless of
-- backend deploy state.
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_supervisor_permissions(
  p_supervisor_id UUID,
  p_can_create_projects BOOLEAN DEFAULT NULL,
  p_can_create_estimates BOOLEAN DEFAULT NULL,
  p_can_create_invoices BOOLEAN DEFAULT NULL,
  p_can_message_clients BOOLEAN DEFAULT NULL,
  p_can_pay_workers BOOLEAN DEFAULT NULL,
  p_can_manage_workers BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_supervisor RECORD;
BEGIN
  SELECT id, owner_id, role INTO v_supervisor
  FROM profiles
  WHERE id = p_supervisor_id;

  IF v_supervisor IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Supervisor not found');
  END IF;

  IF v_supervisor.role <> 'supervisor' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target user is not a supervisor');
  END IF;

  IF v_supervisor.owner_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized — only the owner can change supervisor permissions');
  END IF;

  UPDATE profiles SET
    can_create_projects  = COALESCE(p_can_create_projects,  can_create_projects),
    can_create_estimates = COALESCE(p_can_create_estimates, can_create_estimates),
    can_create_invoices  = COALESCE(p_can_create_invoices,  can_create_invoices),
    can_message_clients  = COALESCE(p_can_message_clients,  can_message_clients),
    can_pay_workers      = COALESCE(p_can_pay_workers,      can_pay_workers),
    can_manage_workers   = COALESCE(p_can_manage_workers,   can_manage_workers),
    updated_at = NOW()
  WHERE id = p_supervisor_id;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_supervisor_permissions(UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
