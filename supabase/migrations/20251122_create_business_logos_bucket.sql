-- Create business-logos storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('business-logos', 'business-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for business-logos bucket
-- Allow authenticated users to upload their own logos
CREATE POLICY "Users can upload their own business logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'business-logos'
  AND (storage.foldername(name))[1] = 'logos'
);

-- Allow authenticated users to update their own logos
CREATE POLICY "Users can update their own business logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'business-logos'
  AND (storage.foldername(name))[1] = 'logos'
);

-- Allow authenticated users to delete their own logos
CREATE POLICY "Users can delete their own business logos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'business-logos'
  AND (storage.foldername(name))[1] = 'logos'
);

-- Allow everyone to read logos (public bucket)
CREATE POLICY "Anyone can view business logos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'business-logos');
