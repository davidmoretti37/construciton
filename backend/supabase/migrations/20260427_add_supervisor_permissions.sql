-- =====================================================
-- Supervisor Permission Toggles
-- =====================================================
-- Adds capability toggles owners can grant per supervisor.
-- Defaults: false (matches today's behavior — supervisors are blocked
-- from these actions in hardcoded UI/tool checks until explicitly enabled).
-- Created: 2026-04-27
-- =====================================================

-- Profiles: per-supervisor capabilities (read by frontend gates + backend tools)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS can_create_projects BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_create_estimates BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_create_invoices BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_message_clients BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_pay_workers BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_workers BOOLEAN NOT NULL DEFAULT false;

-- Supervisor invites: same flags so the owner can pre-set permissions
-- at invite time. On accept, these are copied to the new profile row.
ALTER TABLE public.supervisor_invites
  ADD COLUMN IF NOT EXISTS can_create_projects BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_create_estimates BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_create_invoices BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_message_clients BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_pay_workers BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_workers BOOLEAN NOT NULL DEFAULT false;
