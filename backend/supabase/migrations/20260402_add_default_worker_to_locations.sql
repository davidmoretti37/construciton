-- Add default worker assignment to service locations
-- When visits are generated, they'll auto-assign this worker
ALTER TABLE service_locations ADD COLUMN IF NOT EXISTS default_worker_id UUID REFERENCES workers(id) ON DELETE SET NULL;
