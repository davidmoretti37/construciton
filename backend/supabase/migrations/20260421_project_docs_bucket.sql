-- Canonicalize project_documents table + create project-docs storage bucket
-- This migration is idempotent — safe to re-run.

-- 1. project_documents table (created via Supabase UI in prod; this captures DDL for fresh envs)
CREATE TABLE IF NOT EXISTS public.project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  service_plan_id UUID REFERENCES public.service_plans(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  category TEXT DEFAULT 'general',
  notes TEXT,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  visible_to_workers BOOLEAN DEFAULT false,
  drive_file_id TEXT,
  drive_sync_status TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT project_documents_parent_chk
    CHECK ((project_id IS NOT NULL) OR (service_plan_id IS NOT NULL))
);

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_documents_owner ON public.project_documents;
CREATE POLICY project_documents_owner ON public.project_documents
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_documents.project_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.service_plans sp
      WHERE sp.id = project_documents.service_plan_id AND sp.user_id = auth.uid()
    )
    OR uploaded_by = auth.uid()
  );

-- 2. project-docs bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-docs', 'project-docs', false)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS — path is `userId/projectId/...`, so first folder == auth.uid()
DROP POLICY IF EXISTS "project-docs owner read" ON storage.objects;
CREATE POLICY "project-docs owner read" ON storage.objects FOR SELECT
  USING (bucket_id = 'project-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "project-docs owner write" ON storage.objects;
CREATE POLICY "project-docs owner write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "project-docs owner update" ON storage.objects;
CREATE POLICY "project-docs owner update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'project-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "project-docs owner delete" ON storage.objects;
CREATE POLICY "project-docs owner delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'project-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
