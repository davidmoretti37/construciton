-- ============================================================
-- Google Drive Integration: Database Migration
-- Run these statements in the Supabase SQL Editor
-- ============================================================

-- 1. Create oauth_connections table
CREATE TABLE IF NOT EXISTS oauth_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  provider_email TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Ensure one connection per provider per user
  UNIQUE(user_id, provider)
);

-- Index for fast lookups by user + provider
CREATE INDEX IF NOT EXISTS idx_oauth_connections_user_provider
  ON oauth_connections(user_id, provider);

-- 2. Add Drive columns to project_documents
ALTER TABLE project_documents
  ADD COLUMN IF NOT EXISTS drive_file_id TEXT,
  ADD COLUMN IF NOT EXISTS drive_sync_status TEXT DEFAULT NULL;

-- Index for idempotent imports (upsert on drive_file_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_documents_drive_file_id
  ON project_documents(drive_file_id)
  WHERE drive_file_id IS NOT NULL;

-- 3. Add Drive folder column to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

-- ============================================================
-- 4. RLS Policies: users can only access their own connections
-- ============================================================

ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;

-- SELECT: users can read their own rows
CREATE POLICY "Users can view own oauth connections"
  ON oauth_connections FOR SELECT
  USING (auth.uid() = user_id);

-- INSERT: users can insert their own rows
CREATE POLICY "Users can insert own oauth connections"
  ON oauth_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: users can update their own rows
CREATE POLICY "Users can update own oauth connections"
  ON oauth_connections FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- DELETE: users can delete their own rows
CREATE POLICY "Users can delete own oauth connections"
  ON oauth_connections FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- NOTE: The backend uses the service_role key (bypasses RLS),
-- so the callback endpoint can write tokens for any user.
-- These RLS policies protect against direct client access.
-- ============================================================
