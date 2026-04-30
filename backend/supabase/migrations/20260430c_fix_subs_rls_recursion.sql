-- =====================================================
-- Fix RLS infinite recursion: sub_organizations ↔ sub_engagements
-- Created: 2026-04-30
--
-- Symptom: Postgres "42P17 infinite recursion detected in policy for
-- relation sub_organizations" thrown on unrelated queries (worker_tasks,
-- project_documents) because they touch sub_engagements which then
-- back-queries sub_organizations.
--
-- Cause: two cross-table RLS policies form a cycle:
--   sub_organizations.sub_org_gc_engaged_read → SELECT FROM sub_engagements
--   sub_engagements.engagements_sub_read       → SELECT FROM sub_organizations
-- Each policy evaluation triggers the other's policy → infinite loop.
--
-- Fix: wrap the cross-checks in SECURITY DEFINER functions. Definer
-- functions execute with the function owner's privileges and bypass RLS
-- internally, breaking the cycle. Behavior is identical.
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_gc_engaged_with_sub(p_sub_id UUID, p_gc_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.sub_engagements
     WHERE sub_organization_id = p_sub_id
       AND gc_user_id = p_gc_id
       AND status <> 'cancelled'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_user_sub_owner_for_engagement(p_sub_org_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.sub_organizations
     WHERE id = p_sub_org_id
       AND auth_user_id = p_user_id
  );
$$;

-- Rewrite the cycle-causing policies to use the helper functions.
DROP POLICY IF EXISTS sub_org_gc_engaged_read ON public.sub_organizations;
CREATE POLICY sub_org_gc_engaged_read
  ON public.sub_organizations
  FOR SELECT
  USING (public.is_gc_engaged_with_sub(id, auth.uid()));

DROP POLICY IF EXISTS engagements_sub_read ON public.sub_engagements;
CREATE POLICY engagements_sub_read
  ON public.sub_engagements
  FOR SELECT
  USING (public.is_user_sub_owner_for_engagement(sub_organization_id, auth.uid()));

-- Lock down the helper functions so callers can't poke at them maliciously.
REVOKE ALL ON FUNCTION public.is_gc_engaged_with_sub(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_gc_engaged_with_sub(UUID, UUID) TO authenticated, anon, service_role;

REVOKE ALL ON FUNCTION public.is_user_sub_owner_for_engagement(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_user_sub_owner_for_engagement(UUID, UUID) TO authenticated, anon, service_role;
