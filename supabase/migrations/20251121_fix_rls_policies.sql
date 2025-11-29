-- ============================================================
-- FIX RLS POLICIES: Allow AI Service Generation
-- ============================================================
-- The original migration only allowed SELECT, but we need
-- INSERT permissions for AI-generated services to be saved

-- Allow authenticated users to insert new service categories (for AI generation)
CREATE POLICY "Authenticated users can create services"
  ON public.service_categories
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow authenticated users to insert service items
CREATE POLICY "Authenticated users can create service items"
  ON public.service_items
  FOR INSERT
  WITH CHECK (true);

-- Allow authenticated users to insert phase templates
CREATE POLICY "Authenticated users can create phase templates"
  ON public.service_phase_templates
  FOR INSERT
  WITH CHECK (true);
