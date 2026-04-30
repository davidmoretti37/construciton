-- Professional bid package: site location override, site-visit notes,
-- multi-file attachments (plans, photos, specs).
--
-- Subs see the full package: scope of work + map link + photos/plans
-- they can tap to view + a place to submit their bid.

-- 1. Site fields on bid_requests
-- The project carries its own address, but a GC may want to send a sub
-- to a different staging location, or override with a clearer address.
ALTER TABLE bid_requests
  ADD COLUMN IF NOT EXISTS site_address text,
  ADD COLUMN IF NOT EXISTS site_city text,
  ADD COLUMN IF NOT EXISTS site_state_code text,
  ADD COLUMN IF NOT EXISTS site_postal_code text,
  ADD COLUMN IF NOT EXISTS site_visit_notes text;

-- 2. Attachments table
-- One row per uploaded file. attachment_type lets us group them in the
-- UI (Plans / Photos / Specs / Other).
CREATE TABLE IF NOT EXISTS bid_request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_request_id uuid NOT NULL REFERENCES bid_requests(id) ON DELETE CASCADE,
  file_url text NOT NULL,                  -- storage path within `documents` bucket
  file_name text,
  file_mime text,
  file_size_bytes integer,
  attachment_type text NOT NULL DEFAULT 'plan'
    CHECK (attachment_type IN ('plan', 'photo', 'spec', 'other')),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bid_request_attachments_request_idx
  ON bid_request_attachments(bid_request_id);

-- 3. RLS — service role bypasses; readers/writers go through API auth checks.
-- We don't enable user-side RLS here because all access is mediated by
-- our service-role API endpoints which enforce ownership/invitation checks.
ALTER TABLE bid_request_attachments ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (default supabase pattern)
DROP POLICY IF EXISTS bra_service_role_all ON bid_request_attachments;
CREATE POLICY bra_service_role_all
  ON bid_request_attachments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
