-- =====================================================
-- ADD AI PROJECT INSTRUCTIONS COLUMN
-- Created: 2026-02-21
-- Purpose: Allow users to define project templates and
-- default instructions that the AI follows when creating
-- new projects, phases, and checklists.
-- =====================================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_project_instructions TEXT DEFAULT '';

COMMENT ON COLUMN profiles.ai_project_instructions IS 'User-defined project instructions and templates. The AI follows these when creating new projects, adding phases, or building checklists. Supports up to 2000 characters.';
