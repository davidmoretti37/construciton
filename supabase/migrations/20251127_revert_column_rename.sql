-- =====================================================
-- REVERT: Rename clock_in_time/clock_out_time back to clock_in/clock_out
-- Run this to fix the column rename from previous migration
-- =====================================================

DO $$
BEGIN
  -- Check if clock_in_time exists and clock_in doesn't
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'time_tracking' AND column_name = 'clock_in_time')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'time_tracking' AND column_name = 'clock_in') THEN
    ALTER TABLE time_tracking RENAME COLUMN clock_in_time TO clock_in;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'time_tracking' AND column_name = 'clock_out_time')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'time_tracking' AND column_name = 'clock_out') THEN
    ALTER TABLE time_tracking RENAME COLUMN clock_out_time TO clock_out;
  END IF;
END $$;
