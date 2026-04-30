-- =====================================================
-- SIGNING EXPANSION
-- Adds:
--   1. estimates.signature_required column (default false; opt-in per estimate)
--   2. signatures.document_type extended to include 'subcontract'
--
-- After this migration:
--   - Owners can require a signature when sending an estimate (default off
--     — small/routine estimates don't need it; big custom-quoted jobs do)
--   - The native e-sign service can handle subcontracts (MSAs, Work Orders,
--     CO-to-sub) via the same flow estimates/invoices/COs/contracts use.
-- =====================================================

-- =====================================================
-- 1. estimates.signature_required (opt-in per send)
-- =====================================================
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS signature_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.estimates.signature_required IS
  'When true, sending the estimate fires an e-signature request and the client portal cannot accept via typed name — they must sign. Default false (typed-name acceptance is fine for routine estimates).';

-- Add a current_signature_id pointer if not already there (mirrors invoices/contracts).
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS current_signature_id UUID REFERENCES public.signatures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sent_date TIMESTAMPTZ;

-- =====================================================
-- 2. Extend signatures.document_type CHECK to include subcontract
-- =====================================================
ALTER TABLE public.signatures
  DROP CONSTRAINT IF EXISTS signatures_document_type_check;
ALTER TABLE public.signatures
  ADD CONSTRAINT signatures_document_type_check
  CHECK (document_type IN ('estimate', 'invoice', 'contract', 'change_order', 'subcontract'));

-- =====================================================
-- 3. subcontracts already has esign_request_id, status, signed_at, etc.
-- Verify the columns the e-sign service expects exist (no-op if they do)
-- =====================================================
ALTER TABLE public.subcontracts
  ADD COLUMN IF NOT EXISTS current_signature_id UUID REFERENCES public.signatures(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.subcontracts.current_signature_id IS
  'Pointer to the active signature row. The native e-sign service updates this on completion (mirrors invoices/estimates).';
