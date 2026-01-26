-- =====================================================
-- ADD TAGS FIELD TO DAILY REPORTS
-- Created: 2025-11-26
-- Purpose: Add work category tags for intelligent photo filtering
-- =====================================================

-- Add tags column for work category classification
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Add GIN index for efficient tag-based queries
CREATE INDEX IF NOT EXISTS idx_daily_reports_tags ON daily_reports USING GIN (tags);

-- Add comment for documentation
COMMENT ON COLUMN daily_reports.tags IS 'Array of work category tags: [framing, drywall, electrical, plumbing, rough-in, finish, painting, flooring, roofing, hvac, foundation, demolition, cleanup, inspection, other]';
