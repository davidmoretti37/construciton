-- ============================================================
-- CONTRACT DOCUMENTS TABLE & STORAGE
-- ============================================================
-- Stores user-uploaded contract documents (PDFs, images)
-- Users can upload their own contract templates to send to clients

-- Create contract_documents table
CREATE TABLE IF NOT EXISTS public.contract_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image', 'document')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index for fast lookup by user
CREATE INDEX idx_contract_documents_user ON public.contract_documents(user_id);
CREATE INDEX idx_contract_documents_created ON public.contract_documents(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

ALTER TABLE public.contract_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contract documents"
  ON public.contract_documents
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contract documents"
  ON public.contract_documents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contract documents"
  ON public.contract_documents
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own contract documents"
  ON public.contract_documents
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER on_contract_document_updated
  BEFORE UPDATE ON public.contract_documents
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- STORAGE BUCKET
-- ============================================================

-- Create contract-documents storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-documents', 'contract-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for contract-documents bucket
CREATE POLICY "Users can upload their own contract documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'contract-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can view their own contract documents"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'contract-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can update their own contract documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'contract-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can delete their own contract documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'contract-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow public viewing (since bucket is public)
CREATE POLICY "Public can view contract documents"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'contract-documents');
