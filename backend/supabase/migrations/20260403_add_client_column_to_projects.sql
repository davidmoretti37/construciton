-- Add client name column to projects table
-- The original schema defined it but it was never applied
ALTER TABLE projects ADD COLUMN IF NOT EXISTS client TEXT;
