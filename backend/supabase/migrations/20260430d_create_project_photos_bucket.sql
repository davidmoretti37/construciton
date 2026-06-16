-- project-photos bucket (private) + RLS
-- Path convention: {projectId}/{uuid}.{ext}
-- The first folder of the object name is the project id; access is granted to
-- the owning user (projects.user_id = auth.uid()) OR any worker assigned to
-- the project via project_assignments.

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-photos', 'project-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "project-photos read" ON storage.objects;
CREATE POLICY "project-photos read" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-photos'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
      UNION
      SELECT pa.project_id
        FROM public.project_assignments pa
        JOIN public.workers w ON w.id = pa.worker_id
       WHERE w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "project-photos insert" ON storage.objects;
CREATE POLICY "project-photos insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-photos'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
      UNION
      SELECT pa.project_id
        FROM public.project_assignments pa
        JOIN public.workers w ON w.id = pa.worker_id
       WHERE w.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "project-photos delete" ON storage.objects;
CREATE POLICY "project-photos delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-photos'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
      UNION
      SELECT pa.project_id
        FROM public.project_assignments pa
        JOIN public.workers w ON w.id = pa.worker_id
       WHERE w.user_id = auth.uid()
    )
  );
