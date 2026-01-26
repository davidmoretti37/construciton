-- Simple bucket creation without RLS modifications
-- This should work with limited permissions

-- Create storage bucket for documents (invoices, estimates, PDFs)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;
