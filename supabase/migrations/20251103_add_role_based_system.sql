-- =====================================================
-- Role-Based Multi-Tenant System Migration
-- =====================================================
-- This migration adds support for Owner, Worker, and Client roles
-- Created: 2025-11-03

-- =====================================================
-- 1. ADD ROLE COLUMN TO PROFILES
-- =====================================================

-- Add role column with check constraint
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT CHECK (role IN ('owner', 'worker', 'client'));

-- Set existing users to 'owner' (backward compatibility)
UPDATE public.profiles
SET role = 'owner'
WHERE role IS NULL;

-- Make role required going forward
ALTER TABLE public.profiles
ALTER COLUMN role SET NOT NULL;

-- Set default role for new signups
ALTER TABLE public.profiles
ALTER COLUMN role SET DEFAULT 'owner';

-- =====================================================
-- 2. CREATE WORKERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL until claimed by owner
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  trade TEXT,
  hourly_rate NUMERIC(10, 2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
  is_onboarded BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_workers_user_id ON public.workers(user_id);
CREATE INDEX IF NOT EXISTS idx_workers_owner_id ON public.workers(owner_id);
CREATE INDEX IF NOT EXISTS idx_workers_status ON public.workers(status);

-- =====================================================
-- 3. CREATE CLIENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_owner_id ON public.clients(owner_id);

-- =====================================================
-- 4. CREATE PROJECT_CLIENTS TABLE (Share Links)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.project_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  access_token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, client_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_project_clients_project_id ON public.project_clients(project_id);
CREATE INDEX IF NOT EXISTS idx_project_clients_client_id ON public.project_clients(client_id);
CREATE INDEX IF NOT EXISTS idx_project_clients_access_token ON public.project_clients(access_token);

-- =====================================================
-- 5. CREATE PROJECT_ASSIGNMENTS TABLE (Worker Assignments)
-- =====================================================

CREATE TABLE IF NOT EXISTS public.project_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(project_id, worker_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_project_assignments_project_id ON public.project_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_worker_id ON public.project_assignments(worker_id);

-- =====================================================
-- 6. CREATE TIME_TRACKING TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.time_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  clock_in TIMESTAMP WITH TIME ZONE NOT NULL,
  clock_out TIMESTAMP WITH TIME ZONE,
  break_start TIMESTAMP WITH TIME ZONE,
  break_end TIMESTAMP WITH TIME ZONE,
  location_lat NUMERIC(9, 6),
  location_lng NUMERIC(9, 6),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_time_tracking_worker_id ON public.time_tracking(worker_id);
CREATE INDEX IF NOT EXISTS idx_time_tracking_project_id ON public.time_tracking(project_id);
CREATE INDEX IF NOT EXISTS idx_time_tracking_clock_in ON public.time_tracking(clock_in);

-- =====================================================
-- 7. CREATE MESSAGING TABLES
-- =====================================================

-- Conversations (one per project)
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT, -- Optional conversation name
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_project_id ON public.conversations(project_id);

-- Conversation participants
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_read_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON public.conversation_participants(user_id);

-- Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);

-- =====================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- Enable RLS on all new tables
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- WORKERS POLICIES
-- =====================================================

-- Workers can view their own record
CREATE POLICY "Workers can view own record"
ON public.workers FOR SELECT
USING (user_id = auth.uid());

-- Workers can update their own record
CREATE POLICY "Workers can update own record"
ON public.workers FOR UPDATE
USING (user_id = auth.uid());

-- Owners can view workers they own
CREATE POLICY "Owners can view their workers"
ON public.workers FOR SELECT
USING (owner_id = auth.uid());

-- Owners can update their workers
CREATE POLICY "Owners can update their workers"
ON public.workers FOR UPDATE
USING (owner_id = auth.uid());

-- Anyone can insert worker record (self-registration)
CREATE POLICY "Anyone can insert worker record"
ON public.workers FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Owners can delete their workers
CREATE POLICY "Owners can delete their workers"
ON public.workers FOR DELETE
USING (owner_id = auth.uid());

-- =====================================================
-- CLIENTS POLICIES
-- =====================================================

-- Clients can view their own record
CREATE POLICY "Clients can view own record"
ON public.clients FOR SELECT
USING (user_id = auth.uid());

-- Owners can view their clients
CREATE POLICY "Owners can view their clients"
ON public.clients FOR SELECT
USING (owner_id = auth.uid());

-- Owners can insert clients
CREATE POLICY "Owners can insert clients"
ON public.clients FOR INSERT
WITH CHECK (owner_id = auth.uid());

-- Owners can update their clients
CREATE POLICY "Owners can update their clients"
ON public.clients FOR UPDATE
USING (owner_id = auth.uid());

-- Owners can delete their clients
CREATE POLICY "Owners can delete their clients"
ON public.clients FOR DELETE
USING (owner_id = auth.uid());

-- =====================================================
-- PROJECT_CLIENTS POLICIES
-- =====================================================

-- Owners can manage project-client links
CREATE POLICY "Owners can manage project-client links"
ON public.project_clients FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_clients.project_id
    AND projects.user_id = auth.uid()
  )
);

-- Clients can view their project links
CREATE POLICY "Clients can view their project links"
ON public.project_clients FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.clients
    WHERE clients.id = project_clients.client_id
    AND clients.user_id = auth.uid()
  )
);

-- =====================================================
-- PROJECT_ASSIGNMENTS POLICIES
-- =====================================================

-- Owners can manage worker assignments on their projects
CREATE POLICY "Owners can manage worker assignments"
ON public.project_assignments FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = project_assignments.project_id
    AND projects.user_id = auth.uid()
  )
);

-- Workers can view their own assignments
CREATE POLICY "Workers can view their assignments"
ON public.project_assignments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workers
    WHERE workers.id = project_assignments.worker_id
    AND workers.user_id = auth.uid()
  )
);

-- =====================================================
-- TIME_TRACKING POLICIES
-- =====================================================

-- Workers can view and manage their own time entries
CREATE POLICY "Workers can manage own time entries"
ON public.time_tracking FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.workers
    WHERE workers.id = time_tracking.worker_id
    AND workers.user_id = auth.uid()
  )
);

-- Owners can view time entries for their workers
CREATE POLICY "Owners can view worker time entries"
ON public.time_tracking FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workers
    WHERE workers.id = time_tracking.worker_id
    AND workers.owner_id = auth.uid()
  )
);

-- Owners can update/delete time entries for their workers
CREATE POLICY "Owners can manage worker time entries"
ON public.time_tracking FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.workers
    WHERE workers.id = time_tracking.worker_id
    AND workers.owner_id = auth.uid()
  )
);

-- =====================================================
-- UPDATE PROJECTS TABLE RLS
-- =====================================================

-- Drop existing project policies to recreate with role support
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;

-- Owners can do everything with their own projects
CREATE POLICY "Owners can manage own projects"
ON public.projects FOR ALL
USING (user_id = auth.uid());

-- Workers can view projects they're assigned to
CREATE POLICY "Workers can view assigned projects"
ON public.projects FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.project_assignments pa
    JOIN public.workers w ON w.id = pa.worker_id
    WHERE pa.project_id = projects.id
    AND w.user_id = auth.uid()
  )
);

-- Clients can view projects shared with them
CREATE POLICY "Clients can view shared projects"
ON public.projects FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.project_clients pc
    JOIN public.clients c ON c.id = pc.client_id
    WHERE pc.project_id = projects.id
    AND c.user_id = auth.uid()
  )
);

-- =====================================================
-- MESSAGING POLICIES
-- =====================================================

-- Users can view conversations they're part of
CREATE POLICY "Users can view their conversations"
ON public.conversations FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_participants.conversation_id = conversations.id
    AND conversation_participants.user_id = auth.uid()
  )
);

-- Owners can create conversations for their projects
CREATE POLICY "Owners can create conversations"
ON public.conversations FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects
    WHERE projects.id = conversations.project_id
    AND projects.user_id = auth.uid()
  )
);

-- Users can view participant records for their conversations
CREATE POLICY "Users can view conversation participants"
ON public.conversation_participants FOR SELECT
USING (
  conversation_id IN (
    SELECT conversation_id FROM public.conversation_participants
    WHERE user_id = auth.uid()
  )
);

-- Owners can add participants to their project conversations
CREATE POLICY "Owners can add conversation participants"
ON public.conversation_participants FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.projects p ON p.id = c.project_id
    WHERE c.id = conversation_id
    AND p.user_id = auth.uid()
  )
);

-- Users can view messages in their conversations
CREATE POLICY "Users can view messages in their conversations"
ON public.messages FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_participants.conversation_id = messages.conversation_id
    AND conversation_participants.user_id = auth.uid()
  )
);

-- Users can send messages in their conversations
CREATE POLICY "Users can send messages in their conversations"
ON public.messages FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_participants.conversation_id = messages.conversation_id
    AND conversation_participants.user_id = auth.uid()
  )
);

-- =====================================================
-- 9. FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_workers_updated_at
  BEFORE UPDATE ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Remember to run this migration in Supabase SQL editor
-- Test all RLS policies before deploying to production
