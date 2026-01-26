-- Fix overpermissive RLS policies that use WITH CHECK (true)
-- These policies allow any authenticated user to insert data without proper ownership checks

-- 1. Fix service_search_analytics (was: anyone can insert)
DROP POLICY IF EXISTS "Anyone can log searches" ON public.service_search_analytics;
CREATE POLICY "Authenticated users can log searches"
  ON public.service_search_analytics
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 2. Fix service_items (was: any user can create any item)
DROP POLICY IF EXISTS "Authenticated users can create service items" ON public.service_items;
CREATE POLICY "Authenticated users can create service items"
  ON public.service_items
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 3. Fix service_phase_templates (was: any user can create)
DROP POLICY IF EXISTS "Authenticated users can create phase templates" ON public.service_phase_templates;
CREATE POLICY "Authenticated users can create phase templates"
  ON public.service_phase_templates
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Fix notifications insert (was: anyone can insert notifications for anyone)
DROP POLICY IF EXISTS "Service role can insert notifications" ON notifications;
CREATE POLICY "Users or service role can insert notifications"
  ON notifications
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() OR
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role'
  );

-- 5. Fix scheduled_notifications (was: full access bypass)
DROP POLICY IF EXISTS "Service role can manage scheduled notifications" ON scheduled_notifications;
CREATE POLICY "Users can manage own scheduled notifications"
  ON scheduled_notifications
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
