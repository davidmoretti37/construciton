-- C7: atomic reconciliation
-- Wraps the bank_transactions update + project_transactions update in a single
-- PostgreSQL transaction so a crash mid-flow can't leave them inconsistent.

CREATE OR REPLACE FUNCTION reconcile_bank_to_project_atomic(
  p_bank_tx_id uuid,
  p_project_tx_id uuid,
  p_user_id uuid,
  p_match_confidence numeric,
  p_matched_by text DEFAULT 'auto'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bank_owner uuid;
  v_proj_owner uuid;
BEGIN
  -- Verify both rows belong to the calling user (ownership check).
  -- bank_transactions carries user_id directly; project_transactions does NOT
  -- (it has no user_id/owner_id column) — ownership is derived from the parent project.
  SELECT user_id INTO v_bank_owner FROM bank_transactions WHERE id = p_bank_tx_id;
  SELECT p.user_id INTO v_proj_owner
    FROM project_transactions pt
    JOIN projects p ON p.id = pt.project_id
    WHERE pt.id = p_project_tx_id;

  IF v_bank_owner IS NULL OR v_proj_owner IS NULL THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;
  IF v_bank_owner != p_user_id OR v_proj_owner != p_user_id THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Both updates run inside the same transaction. If either fails, both roll back.
  UPDATE bank_transactions
  SET
    match_status = 'auto_matched',
    matched_transaction_id = p_project_tx_id,
    match_confidence = p_match_confidence,
    matched_at = now(),
    matched_by = p_matched_by
  WHERE id = p_bank_tx_id;

  UPDATE project_transactions
  SET bank_transaction_id = p_bank_tx_id
  WHERE id = p_project_tx_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION reconcile_bank_to_project_atomic(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;
