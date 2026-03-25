-- Add supervisor assignment to service plans
ALTER TABLE service_plans ADD COLUMN IF NOT EXISTS assigned_supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL;
