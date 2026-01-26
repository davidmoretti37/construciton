-- =====================================================
-- WORKING DAYS SUPPORT FOR PROJECTS
-- Created: 2026-01-20
-- Purpose: Allow projects to define their working days schedule
-- =====================================================

-- Add working_days column to projects table as JSONB
-- Default: Monday-Friday [1,2,3,4,5] (using ISO weekday: 1=Monday, 7=Sunday)
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS working_days JSONB DEFAULT '[1,2,3,4,5]'::JSONB;

-- Add non_working_dates column for specific date exceptions
-- Stores array of date strings in YYYY-MM-DD format
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS non_working_dates JSONB DEFAULT '[]'::JSONB;

-- Add comments explaining the columns
COMMENT ON COLUMN public.projects.working_days IS
'Array of ISO weekday numbers representing working days for this project.
1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday, 7=Sunday
Default: [1,2,3,4,5] (Monday-Friday)
Example for weekend work: [1,2,3,4,5,6,7]
Example for Mon/Wed/Fri only: [1,3,5]';

COMMENT ON COLUMN public.projects.non_working_dates IS
'Array of specific dates when work will NOT happen, even if it falls on a working day.
Format: YYYY-MM-DD strings
Example: ["2026-01-25", "2026-02-14", "2026-12-25"]
Use for holidays, one-off days off, etc.';

-- Create validation function for working_days
CREATE OR REPLACE FUNCTION validate_working_days()
RETURNS TRIGGER AS $$
DECLARE
  day_value INTEGER;
  day_element JSONB;
  date_element JSONB;
  date_string TEXT;
BEGIN
  -- =====================
  -- Validate working_days
  -- =====================
  IF NEW.working_days IS NOT NULL THEN
    -- Must be an array
    IF jsonb_typeof(NEW.working_days) != 'array' THEN
      RAISE EXCEPTION 'working_days must be a JSON array, got %', jsonb_typeof(NEW.working_days);
    END IF;

    -- Must not be empty
    IF jsonb_array_length(NEW.working_days) = 0 THEN
      RAISE EXCEPTION 'working_days array cannot be empty - at least one working day required';
    END IF;

    -- Each element must be an integer between 1 and 7
    FOR day_element IN SELECT * FROM jsonb_array_elements(NEW.working_days)
    LOOP
      -- Check if it's a number
      IF jsonb_typeof(day_element) != 'number' THEN
        RAISE EXCEPTION 'working_days elements must be numbers, got %', jsonb_typeof(day_element);
      END IF;

      day_value := day_element::INTEGER;

      -- Check range 1-7
      IF day_value < 1 OR day_value > 7 THEN
        RAISE EXCEPTION 'working_days values must be between 1 (Monday) and 7 (Sunday), got %', day_value;
      END IF;
    END LOOP;
  END IF;

  -- =========================
  -- Validate non_working_dates
  -- =========================
  IF NEW.non_working_dates IS NOT NULL THEN
    -- Must be an array
    IF jsonb_typeof(NEW.non_working_dates) != 'array' THEN
      RAISE EXCEPTION 'non_working_dates must be a JSON array, got %', jsonb_typeof(NEW.non_working_dates);
    END IF;

    -- Each element must be a valid date string (YYYY-MM-DD)
    FOR date_element IN SELECT * FROM jsonb_array_elements(NEW.non_working_dates)
    LOOP
      -- Check if it's a string
      IF jsonb_typeof(date_element) != 'string' THEN
        RAISE EXCEPTION 'non_working_dates elements must be date strings (YYYY-MM-DD), got %', jsonb_typeof(date_element);
      END IF;

      date_string := date_element #>> '{}';

      -- Check if it's a valid date format
      BEGIN
        PERFORM date_string::DATE;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Invalid date format in non_working_dates: %. Use YYYY-MM-DD format.', date_string;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate on insert/update
DROP TRIGGER IF EXISTS validate_working_days_trigger ON public.projects;
CREATE TRIGGER validate_working_days_trigger
  BEFORE INSERT OR UPDATE OF working_days, non_working_dates ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION validate_working_days();
