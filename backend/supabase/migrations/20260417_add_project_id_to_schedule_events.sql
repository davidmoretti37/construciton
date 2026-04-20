-- Add project_id to schedule_events so events are cleaned up when a project is deleted
ALTER TABLE schedule_events
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_schedule_events_project_id ON schedule_events(project_id);
