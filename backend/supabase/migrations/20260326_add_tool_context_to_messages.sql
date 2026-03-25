-- Add tool_context column to chat_messages
-- Stores condensed tool call results so conversation context survives session reload
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS tool_context TEXT DEFAULT '';
