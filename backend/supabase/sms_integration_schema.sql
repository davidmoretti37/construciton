-- SMS/WhatsApp Integration Schema Updates
-- Run this in your Supabase SQL Editor

-- 1. Add client phone and AI settings to projects table
ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS client_phone TEXT,
ADD COLUMN IF NOT EXISTS ai_responses_enabled BOOLEAN DEFAULT true;

-- Create index for faster phone lookups
CREATE INDEX IF NOT EXISTS idx_projects_client_phone ON public.projects(client_phone);

-- 2. Add Twilio phone number to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS business_phone_number TEXT,
ADD COLUMN IF NOT EXISTS twilio_account_sid TEXT,
ADD COLUMN IF NOT EXISTS twilio_auth_token TEXT,
ADD COLUMN IF NOT EXISTS twilio_phone_sid TEXT,
ADD COLUMN IF NOT EXISTS phone_provisioned_at TIMESTAMP WITH TIME ZONE;

-- 3. Create conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  message_type TEXT CHECK (message_type IN ('sms', 'whatsapp')) NOT NULL,
  direction TEXT CHECK (direction IN ('inbound', 'outbound')) NOT NULL,
  message_body TEXT NOT NULL,
  ai_response TEXT,
  ai_confidence NUMERIC(3, 2), -- 0.00 to 1.00
  intent_classification TEXT, -- 'general', 'complaint', 'payment', 'schedule', 'unknown'
  needs_attention BOOLEAN DEFAULT false, -- True if escalated to contractor
  handled_by TEXT CHECK (handled_by IN ('ai', 'contractor', 'pending')) DEFAULT 'pending',
  handled_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS for conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Allow contractors to view their own conversations
CREATE POLICY "Users can view own conversations"
  ON public.conversations
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- Allow contractors to insert conversations (for manual replies)
CREATE POLICY "Users can insert own conversations"
  ON public.conversations
  FOR INSERT
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- Allow contractors to update conversations (mark as handled)
CREATE POLICY "Users can update own conversations"
  ON public.conversations
  FOR UPDATE
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE user_id = auth.uid()
    )
  );

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_conversations_project ON public.conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_from ON public.conversations(from_number);
CREATE INDEX IF NOT EXISTS idx_conversations_needs_attention ON public.conversations(needs_attention) WHERE needs_attention = true;
CREATE INDEX IF NOT EXISTS idx_conversations_created ON public.conversations(created_at DESC);

-- 4. Create function to auto-update handled_at timestamp
CREATE OR REPLACE FUNCTION public.update_conversation_handled_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.handled_by IS DISTINCT FROM OLD.handled_by AND NEW.handled_by IS NOT NULL THEN
    NEW.handled_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS on_conversation_handled ON public.conversations;
CREATE TRIGGER on_conversation_handled
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_conversation_handled_at();

-- 5. Add comments for documentation
COMMENT ON COLUMN public.projects.client_phone IS 'Client phone number for SMS/WhatsApp communication';
COMMENT ON COLUMN public.projects.ai_responses_enabled IS 'Whether AI should auto-respond to this client messages';
COMMENT ON COLUMN public.profiles.business_phone_number IS 'Twilio phone number for receiving client messages';
COMMENT ON COLUMN public.conversations.needs_attention IS 'True if message was escalated to contractor';
COMMENT ON COLUMN public.conversations.intent_classification IS 'AI-detected intent: general, complaint, payment, schedule, unknown';

-- Done! Run this migration, then update your app code.
