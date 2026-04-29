-- =====================================================
-- E-SIGNATURE SYSTEM
-- Created: 2026-04-29
-- Purpose: Native e-signatures for estimates, invoices, contracts.
--          Single-use document-scoped tokens, audit trail, tamper detection.
-- =====================================================

-- =====================================================
-- 1. SIGNATURES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Target document
  document_type TEXT NOT NULL CHECK (document_type IN ('estimate', 'invoice', 'contract')),
  document_id UUID NOT NULL,

  -- Signer identity (captured at request + on signing)
  signer_name TEXT,
  signer_email TEXT,
  signer_phone TEXT,

  -- Signature artifacts (paths in `documents` storage bucket)
  signature_png_path TEXT,
  signed_pdf_path TEXT,

  -- Tamper detection — sha256 of original bytes at request time
  original_doc_hash TEXT,

  -- Audit metadata captured at sign-time
  audit_json JSONB DEFAULT '{}'::jsonb,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'signed', 'declined', 'expired')),
  decline_reason TEXT,
  signed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_signatures_user ON public.signatures(user_id);
CREATE INDEX idx_signatures_document ON public.signatures(document_type, document_id);
CREATE INDEX idx_signatures_status ON public.signatures(status);
CREATE INDEX idx_signatures_created ON public.signatures(created_at DESC);

ALTER TABLE public.signatures ENABLE ROW LEVEL SECURITY;

-- Owners see their own; service role bypasses RLS for portal endpoints
CREATE POLICY "Owners view own signatures" ON public.signatures
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Owners insert own signatures" ON public.signatures
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owners update own signatures" ON public.signatures
  FOR UPDATE USING (user_id = auth.uid());

-- =====================================================
-- 2. SIGNATURE TOKENS (single-use signing links)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.signature_tokens (
  token TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  signature_id UUID NOT NULL REFERENCES public.signatures(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_signature_tokens_signature ON public.signature_tokens(signature_id);
CREATE INDEX idx_signature_tokens_expires ON public.signature_tokens(expires_at);

ALTER TABLE public.signature_tokens ENABLE ROW LEVEL SECURITY;
-- No public RLS policy: only the service role (portal endpoints) reads tokens.
-- Owners interact through the signature row, not the token directly.

-- =====================================================
-- 3. PARENT TABLE COLUMNS (latest signature pointer)
-- =====================================================
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS current_signature_id UUID REFERENCES public.signatures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS current_signature_id UUID REFERENCES public.signatures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

ALTER TABLE public.contract_documents
  ADD COLUMN IF NOT EXISTS current_signature_id UUID REFERENCES public.signatures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;

-- =====================================================
-- 4. UPDATED_AT TRIGGER (reuse existing function from earlier migrations)
-- =====================================================
CREATE TRIGGER update_signatures_updated_at
  BEFORE UPDATE ON public.signatures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.signatures IS 'Native e-signature records for estimates, invoices, and contracts. Each row tracks one signing event with audit trail.';
COMMENT ON TABLE public.signature_tokens IS 'Single-use, document-scoped tokens that authenticate the signing endpoint. Consumed on first successful sign.';
COMMENT ON COLUMN public.signatures.original_doc_hash IS 'SHA-256 hex of the original PDF bytes at request time. Recomputed at sign-time; mismatch => tamper detected.';
COMMENT ON COLUMN public.signatures.audit_json IS 'Captured at sign-time: { ip, user_agent, ts, signed_pdf_hash }';
