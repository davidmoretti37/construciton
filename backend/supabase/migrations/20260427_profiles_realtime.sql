-- =====================================================
-- Add public.profiles to supabase_realtime publication
-- =====================================================
-- Required for the supervisor's app to receive instant updates when the
-- owner toggles permission columns (can_create_projects etc). Without this,
-- the supervisor's profile in AuthContext stays cached until sign-out.
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
