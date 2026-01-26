-- Create schedule_events table for personal calendar events (non-work appointments)
-- This is separate from worker_schedules which handles project/phase work assignments

CREATE TABLE IF NOT EXISTS schedule_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE CASCADE, -- Optional, for worker-specific events

  -- Event details
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT CHECK (event_type IN ('meeting', 'pto', 'personal', 'appointment', 'site_visit', 'other')) DEFAULT 'other',
  location TEXT,

  -- Timing
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT false,

  -- Recurrence
  recurring BOOLEAN DEFAULT false,
  recurring_pattern JSONB, -- {frequency: 'daily'|'weekly'|'monthly', interval: 1, end_date: '...', days_of_week: [1,3,5]}

  -- UI
  color TEXT DEFAULT '#3B82F6', -- Hex color for calendar display

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_schedule_events_owner ON schedule_events(owner_id);
CREATE INDEX idx_schedule_events_worker ON schedule_events(worker_id);
CREATE INDEX idx_schedule_events_dates ON schedule_events(start_datetime, end_datetime);
CREATE INDEX idx_schedule_events_type ON schedule_events(event_type);

-- Enable RLS
ALTER TABLE schedule_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Owners can manage their own events
CREATE POLICY "Owners can manage their schedule events"
  ON schedule_events FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Workers can view events assigned to them
CREATE POLICY "Workers can view their assigned events"
  ON schedule_events FOR SELECT
  USING (
    worker_id IN (
      SELECT id FROM workers WHERE user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_schedule_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_schedule_events_updated_at_trigger
  BEFORE UPDATE ON schedule_events
  FOR EACH ROW
  EXECUTE FUNCTION update_schedule_events_updated_at();

-- Comments
COMMENT ON TABLE schedule_events IS 'Personal calendar events for owners (meetings, appointments, PTO). Separate from worker_schedules which handles project work.';
COMMENT ON COLUMN schedule_events.event_type IS 'Type of event: meeting, pto, personal, appointment, site_visit, other';
COMMENT ON COLUMN schedule_events.recurring_pattern IS 'JSONB with frequency, interval, end_date, days_of_week for recurring events';
COMMENT ON COLUMN schedule_events.color IS 'Hex color code for calendar UI display';
