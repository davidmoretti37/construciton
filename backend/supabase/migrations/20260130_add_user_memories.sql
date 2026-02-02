-- User Memories Table
-- Stores learned facts from conversations for intelligent, personalized responses
-- Part of the Long-Term Memory System

-- Create the table
CREATE TABLE IF NOT EXISTS user_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Categorization
  category TEXT NOT NULL CHECK (category IN (
    'client_preference',    -- "Mrs. Johnson wants itemized invoices"
    'worker_skill',         -- "Jose is certified for electrical"
    'pricing_pattern',      -- "I usually charge $150/hr for plumbing"
    'business_rule',        -- "Always add 15% contingency"
    'project_insight',      -- "Bathroom at 123 Main had mold issues"
    'correction'            -- User explicitly corrected something
  )),

  -- The actual memory content
  subject TEXT NOT NULL,           -- Who/what this is about ("Jose", "Mrs. Johnson", "plumbing")
  fact TEXT NOT NULL,              -- The actual fact ("is certified for electrical work")
  full_context TEXT,               -- Full sentence for prompt injection

  -- Confidence and learning
  confidence FLOAT DEFAULT 0.7 CHECK (confidence >= 0 AND confidence <= 1),
  times_reinforced INT DEFAULT 1,
  source TEXT DEFAULT 'inferred' CHECK (source IN ('explicit', 'inferred', 'correction')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent exact duplicates
  UNIQUE(user_id, category, subject, fact)
);

-- Indexes for fast retrieval
CREATE INDEX IF NOT EXISTS idx_memories_user ON user_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_memories_category ON user_memories(user_id, category);
CREATE INDEX IF NOT EXISTS idx_memories_subject ON user_memories(user_id, subject);
CREATE INDEX IF NOT EXISTS idx_memories_confidence ON user_memories(user_id, confidence DESC);
CREATE INDEX IF NOT EXISTS idx_memories_last_used ON user_memories(user_id, last_used_at DESC);

-- Enable RLS
ALTER TABLE user_memories ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only manage their own memories
DROP POLICY IF EXISTS "Users can view their own memories" ON user_memories;
CREATE POLICY "Users can view their own memories"
  ON user_memories FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own memories" ON user_memories;
CREATE POLICY "Users can insert their own memories"
  ON user_memories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own memories" ON user_memories;
CREATE POLICY "Users can update their own memories"
  ON user_memories FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own memories" ON user_memories;
CREATE POLICY "Users can delete their own memories"
  ON user_memories FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment for documentation
COMMENT ON TABLE user_memories IS 'Stores learned facts from conversations for personalized AI responses';
COMMENT ON COLUMN user_memories.category IS 'Type of fact: client_preference, worker_skill, pricing_pattern, business_rule, project_insight, correction';
COMMENT ON COLUMN user_memories.confidence IS 'Confidence score 0-1. Corrections start at 1.0, inferred facts at 0.7';
COMMENT ON COLUMN user_memories.times_reinforced IS 'Number of times this fact has been mentioned/confirmed';
