-- Make documents bucket private for better security
-- This prevents unauthorized access to invoice PDFs
-- Access will be controlled via signed URLs with expiration

UPDATE storage.buckets
SET public = false
WHERE id = 'documents';
