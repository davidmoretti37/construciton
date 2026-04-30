-- Sub-initiated proposals: distinguish GC-originated vs sub-originated
-- bid_requests so the UI can render them differently and the GC sees
-- a "From sub" badge in their inbox.

ALTER TABLE bid_requests
  ADD COLUMN IF NOT EXISTS originated_by_role text NOT NULL DEFAULT 'gc'
    CHECK (originated_by_role IN ('gc', 'sub'));
