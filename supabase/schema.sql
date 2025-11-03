-- Construction Manager Database Schema
-- Run this in your Supabase SQL Editor

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  business_name TEXT,
  business_phone TEXT,
  business_email TEXT,
  trades TEXT[] DEFAULT '{}',
  pricing JSONB DEFAULT '{}'::jsonb,
  language TEXT,
  is_onboarded BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies for profiles table
-- Users can only read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, is_onboarded)
  VALUES (new.id, false);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
DROP TRIGGER IF EXISTS on_profile_updated ON public.profiles;
CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Create projects table
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  client TEXT NOT NULL,
  -- Legacy fields (kept for backward compatibility during migration)
  budget NUMERIC(10, 2) DEFAULT 0,
  spent NUMERIC(10, 2) DEFAULT 0,

  -- New contractor financial tracking fields
  contract_amount NUMERIC(10, 2) DEFAULT 0,  -- Total contract value (what client owes)
  income_collected NUMERIC(10, 2) DEFAULT 0, -- Money actually received from client
  expenses NUMERIC(10, 2) DEFAULT 0,         -- Materials, workers, and other costs
  percent_complete INTEGER DEFAULT 0 CHECK (percent_complete >= 0 AND percent_complete <= 100),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'on-track', 'behind', 'over-budget', 'completed', 'archived')),
  workers TEXT[] DEFAULT '{}',
  days_remaining INTEGER,
  last_activity TEXT,
  location TEXT,
  start_date DATE,
  end_date DATE,
  task_description TEXT,
  estimated_duration TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Enable Row Level Security for projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Create policies for projects table
-- Users can view their own projects
CREATE POLICY "Users can view own projects"
  ON public.projects
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own projects
CREATE POLICY "Users can insert own projects"
  ON public.projects
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own projects
CREATE POLICY "Users can update own projects"
  ON public.projects
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own projects
CREATE POLICY "Users can delete own projects"
  ON public.projects
  FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger to automatically update updated_at for projects
DROP TRIGGER IF EXISTS on_project_updated ON public.projects;
CREATE TRIGGER on_project_updated
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- MIGRATION SCRIPT: Budget Model to Contractor Financial Model
-- ============================================================
-- Run this AFTER creating the table if you have existing data
-- This migrates old budget/spent data to the new financial model

-- For existing installations, add new columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='projects' AND column_name='contract_amount') THEN
    ALTER TABLE public.projects ADD COLUMN contract_amount NUMERIC(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='projects' AND column_name='income_collected') THEN
    ALTER TABLE public.projects ADD COLUMN income_collected NUMERIC(10, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='projects' AND column_name='expenses') THEN
    ALTER TABLE public.projects ADD COLUMN expenses NUMERIC(10, 2) DEFAULT 0;
  END IF;
END $$;

-- Migrate existing data:
-- - budget → contract_amount (what client owes)
-- - spent → expenses (what you've spent on the project)
-- - income_collected starts at 0 (need to manually track what client has paid)
UPDATE public.projects
SET
  contract_amount = COALESCE(budget, 0),
  expenses = COALESCE(spent, 0),
  income_collected = 0
WHERE contract_amount = 0 AND expenses = 0;  -- Only migrate if new fields are empty

-- Optional: After verifying migration and updating all code,
-- uncomment these lines to remove legacy fields
-- ALTER TABLE public.projects DROP COLUMN IF EXISTS budget;
-- ALTER TABLE public.projects DROP COLUMN IF EXISTS spent;
