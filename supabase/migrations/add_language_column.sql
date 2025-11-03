-- Migration: Add language column to profiles table
-- Run this if you already have an existing profiles table

-- Add language column (NULL by default, user must select)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS language TEXT;

-- Clear language for all existing users so they must select it
UPDATE public.profiles
SET language = NULL;
