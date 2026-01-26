-- Add structured location and travel time fields to schedule_events
-- This enables intelligent scheduling with geocoding and travel time awareness

-- Add location fields
ALTER TABLE schedule_events
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS formatted_address TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8),
  ADD COLUMN IF NOT EXISTS place_id TEXT,
  ADD COLUMN IF NOT EXISTS estimated_travel_time_minutes INTEGER;

-- Add index for location-based queries
CREATE INDEX IF NOT EXISTS idx_schedule_events_location ON schedule_events(latitude, longitude);

-- Add comments for documentation
COMMENT ON COLUMN schedule_events.address IS 'User-entered address (may be informal like "his house" or "123 Main St")';
COMMENT ON COLUMN schedule_events.formatted_address IS 'Google-formatted address for consistency and display';
COMMENT ON COLUMN schedule_events.latitude IS 'Geocoded latitude coordinate';
COMMENT ON COLUMN schedule_events.longitude IS 'Geocoded longitude coordinate';
COMMENT ON COLUMN schedule_events.place_id IS 'Google Places ID for consistent location reference';
COMMENT ON COLUMN schedule_events.estimated_travel_time_minutes IS 'Calculated travel time from previous event on same day (includes buffer)';
