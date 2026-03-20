-- Upgrade daily reports with industry-standard fields
-- All columns nullable JSONB — backward compatible, every section optional

ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS weather JSONB,
  ADD COLUMN IF NOT EXISTS manpower JSONB,
  ADD COLUMN IF NOT EXISTS work_performed JSONB,
  ADD COLUMN IF NOT EXISTS materials JSONB,
  ADD COLUMN IF NOT EXISTS equipment JSONB,
  ADD COLUMN IF NOT EXISTS delays JSONB,
  ADD COLUMN IF NOT EXISTS safety JSONB,
  ADD COLUMN IF NOT EXISTS visitors JSONB,
  ADD COLUMN IF NOT EXISTS photo_captions JSONB,
  ADD COLUMN IF NOT EXISTS next_day_plan TEXT;
