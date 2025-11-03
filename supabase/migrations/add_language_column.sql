-- Migration: Add language column to profiles table
-- Run this if you already have an existing profiles table

-- Add language column (NULL by default, user must select)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS language TEXT;

-- IMPORTANT: Clear language for ALL users so they must select it
-- This ensures everyone sees the language selection screen
UPDATE public.profiles
SET language = NULL;
