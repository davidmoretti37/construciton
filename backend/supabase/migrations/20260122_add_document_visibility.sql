-- Add visible_to_workers column to project_documents table
-- Defaults to false (owner-only by default)

ALTER TABLE public.project_documents
ADD COLUMN IF NOT EXISTS visible_to_workers BOOLEAN DEFAULT false;

-- Add index for faster filtering
CREATE INDEX IF NOT EXISTS idx_project_documents_visibility
ON public.project_documents(project_id, visible_to_workers);

-- Comment for documentation
COMMENT ON COLUMN public.project_documents.visible_to_workers IS 'Whether this document is visible to workers assigned to the project';
