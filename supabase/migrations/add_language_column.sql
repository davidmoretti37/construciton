-- Migration: Add language column to profiles table
-- Run this if you already have an existing profiles table

-- Add language column with default value 'en'
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';

-- Update existing rows to have default language if they don't have one
UPDATE public.profiles
SET language = 'en'
WHERE language IS NULL OR language = '';
