-- =====================================================
-- WORKFORCE MANAGEMENT TABLES
-- Migration for: Crews, Shift Templates, Worker Availability, Break Tracking
-- Date: 2025-11-27
-- =====================================================

-- =====================================================
-- 1. WORKER CREWS TABLE
-- Groups of workers that can be assigned together
-- =====================================================

CREATE TABLE IF NOT EXISTS worker_crews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  worker_ids UUID[] DEFAULT '{}',
  default_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_worker_crews_user ON worker_crews(user_id);

-- Enable RLS
ALTER TABLE worker_crews ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own crews"
  ON worker_crews FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Auto-update updated_at
CREATE TRIGGER update_worker_crews_updated_at
  BEFORE UPDATE ON worker_crews
  FOR EACH ROW
  EXECUTE FUNCTION update_schedule_events_updated_at();

COMMENT ON TABLE worker_crews IS 'Groups of workers for quick bulk assignment';


-- =====================================================
-- 2. SHIFT TEMPLATES TABLE
-- Reusable shift patterns
-- =====================================================

CREATE TABLE IF NOT EXISTS shift_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_duration INTEGER DEFAULT 0, -- minutes
  break_start TIME, -- optional specific break time
  days TEXT[] DEFAULT ARRAY['mon', 'tue', 'wed', 'thu', 'fri'],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_shift_templates_user ON shift_templates(user_id);

-- Enable RLS
ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own shift templates"
  ON shift_templates FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Auto-update updated_at
CREATE TRIGGER update_shift_templates_updated_at
  BEFORE UPDATE ON shift_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_schedule_events_updated_at();

COMMENT ON TABLE shift_templates IS 'Reusable shift patterns for quick worker scheduling';


-- =====================================================
-- 3. WORKER AVAILABILITY TABLE
-- Track time off, PTO, sick days, unavailability
-- =====================================================

CREATE TABLE IF NOT EXISTS worker_availability (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('off', 'sick', 'pto', 'unavailable', 'partial')),
  reason TEXT,
  time_range JSONB, -- For partial availability: {"start": "08:00", "end": "12:00"}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_worker_availability_user ON worker_availability(user_id);
CREATE INDEX idx_worker_availability_worker ON worker_availability(worker_id);
CREATE INDEX idx_worker_availability_dates ON worker_availability(start_date, end_date);

-- Enable RLS
ALTER TABLE worker_availability ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their workers availability"
  ON worker_availability FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE worker_availability IS 'Tracks worker time off, PTO, sick days, and unavailability periods';


-- =====================================================
-- 4. ADD COLUMNS TO EXISTING TABLES
-- =====================================================

-- Add recurring_id to schedule_events (for linking recurring event instances)
ALTER TABLE schedule_events
ADD COLUMN IF NOT EXISTS recurring_id TEXT;

CREATE INDEX IF NOT EXISTS idx_schedule_events_recurring ON schedule_events(recurring_id);

-- Add breaks JSONB to time_tracking (for multiple breaks per shift)
ALTER TABLE time_tracking
ADD COLUMN IF NOT EXISTS breaks JSONB DEFAULT '[]';

-- Add is_manual flag to time_tracking (for manually created entries)
ALTER TABLE time_tracking
ADD COLUMN IF NOT EXISTS is_manual BOOLEAN DEFAULT false;

-- Add hours_worked to time_tracking (pre-calculated for efficiency)
ALTER TABLE time_tracking
ADD COLUMN IF NOT EXISTS hours_worked NUMERIC(5, 2);

-- NOTE: Keeping original column names clock_in/clock_out (not renaming)
-- to maintain compatibility with existing storage functions


-- =====================================================
-- 5. COMMENTS
-- =====================================================

COMMENT ON COLUMN schedule_events.recurring_id IS 'Links instances of the same recurring event series';
COMMENT ON COLUMN time_tracking.breaks IS 'JSONB array of breaks: [{id, type, start_time, end_time, duration_minutes}]';
COMMENT ON COLUMN time_tracking.is_manual IS 'True if entry was manually created (not via clock in/out)';
COMMENT ON COLUMN time_tracking.hours_worked IS 'Pre-calculated hours for this entry';
