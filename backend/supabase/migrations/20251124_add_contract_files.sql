-- ============================================================
-- ADD FILE STORAGE FIELDS TO TYPICAL_CONTRACTS
-- ============================================================
-- Adds fields to store uploaded contract files

ALTER TABLE public.typical_contracts
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_mime_type TEXT;

-- ============================================================
-- CREATE CONTRACTS STORAGE BUCKET
-- ============================================================

-- Create bucket for contracts
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', false)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- STORAGE POLICIES FOR CONTRACTS BUCKET
-- ============================================================

-- Allow users to upload their own contract files
CREATE POLICY "Users can upload own contracts"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'contracts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to view their own contract files
CREATE POLICY "Users can view own contracts"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'contracts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to update their own contract files
CREATE POLICY "Users can update own contracts"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'contracts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to delete their own contract files
CREATE POLICY "Users can delete own contracts"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'contracts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
