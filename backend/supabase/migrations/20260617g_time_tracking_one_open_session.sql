-- =====================================================
-- Backstop for the double-clock guard.
--
-- A worker can have at most ONE open time_tracking session (clock_out IS NULL)
-- at a time. The client-side precheck in clockIn() (PR #19) is the UX layer;
-- this partial-unique index is the UNBYPASSABLE DB backstop against a duplicate
-- open session created by a race, a second device, or a direct Supabase insert.
-- Two overlapping open sessions corrupt totalHoursToday and labor-cost math.
--
-- Verified zero existing duplicate open sessions before applying.
-- Idempotent: drops the index first.
-- =====================================================

DROP INDEX IF EXISTS public.uq_time_tracking_one_open_session;
CREATE UNIQUE INDEX uq_time_tracking_one_open_session
  ON public.time_tracking (worker_id)
  WHERE clock_out IS NULL;
