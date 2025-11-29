-- ============================================================
-- SERVICE SYSTEM: Universal Trade Platform
-- ============================================================
-- This migration creates the foundation for unlimited service
-- discovery with AI-powered template generation.
--
-- The system starts with 12 legacy construction trades and
-- grows organically as users search for new services.
-- ============================================================

-- ============================================================
-- 1. SERVICE CATEGORIES TABLE
-- ============================================================
-- Stores all service types (construction, cleaning, pool, etc.)
-- Starts with 12 legacy trades, grows via AI generation
CREATE TABLE IF NOT EXISTS public.service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT, -- Ionicons name
  source TEXT DEFAULT 'ai_generated' CHECK (source IN ('legacy', 'ai_generated', 'custom')),
  times_used INTEGER DEFAULT 0, -- Popularity tracking
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(name) -- Prevent duplicate service names
);

-- Index for fast search
CREATE INDEX idx_service_categories_name ON public.service_categories(name);
CREATE INDEX idx_service_categories_times_used ON public.service_categories(times_used DESC);
CREATE INDEX idx_service_categories_source ON public.service_categories(source);

-- ============================================================
-- 2. SERVICE ITEMS TABLE
-- ============================================================
-- Stores what each service includes (e.g., "Floor Tile", "Fixture Installation")
CREATE TABLE IF NOT EXISTS public.service_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.service_categories(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL, -- 'sq ft', 'hour', 'job', 'unit', 'linear ft'
  default_price NUMERIC(10, 2), -- Optional suggested price (null for AI-generated)
  is_custom BOOLEAN DEFAULT false, -- User-created vs AI-generated
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index for fast lookup by category
CREATE INDEX idx_service_items_category ON public.service_items(category_id);

-- ============================================================
-- 3. SERVICE PHASE TEMPLATES TABLE
-- ============================================================
-- Stores workflow phases for each service type
CREATE TABLE IF NOT EXISTS public.service_phase_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.service_categories(id) ON DELETE CASCADE NOT NULL,
  phase_name TEXT NOT NULL,
  description TEXT,
  default_days INTEGER DEFAULT 1,
  tasks JSONB DEFAULT '[]'::jsonb, -- Array of task strings
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index for fast lookup by category
CREATE INDEX idx_phase_templates_category ON public.service_phase_templates(category_id);
CREATE INDEX idx_phase_templates_order ON public.service_phase_templates(category_id, order_index);

-- ============================================================
-- 4. USER SERVICES TABLE
-- ============================================================
-- Stores which services each user offers (with their custom pricing/phases)
CREATE TABLE IF NOT EXISTS public.user_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.service_categories(id) ON DELETE CASCADE NOT NULL,
  custom_items JSONB DEFAULT '[]'::jsonb, -- User's custom service items
  custom_phases JSONB DEFAULT '[]'::jsonb, -- User's custom workflow phases
  pricing JSONB DEFAULT '{}'::jsonb, -- User's pricing for items
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(user_id, category_id) -- Each user can only have a service once
);

-- Index for fast lookup by user
CREATE INDEX idx_user_services_user ON public.user_services(user_id);
CREATE INDEX idx_user_services_category ON public.user_services(category_id);

-- ============================================================
-- 5. SERVICE SEARCH ANALYTICS TABLE
-- ============================================================
-- Tracks what users search for to improve autocomplete
CREATE TABLE IF NOT EXISTS public.service_search_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_term TEXT NOT NULL,
  category_matched UUID REFERENCES public.service_categories(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  result_found BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index for analytics queries
CREATE INDEX idx_search_analytics_term ON public.service_search_analytics(search_term);
CREATE INDEX idx_search_analytics_created ON public.service_search_analytics(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================

-- Service Categories: Everyone can read (public catalog)
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service categories are viewable by everyone"
  ON public.service_categories
  FOR SELECT
  USING (true);

-- Service Items: Everyone can read
ALTER TABLE public.service_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service items are viewable by everyone"
  ON public.service_items
  FOR SELECT
  USING (true);

-- Service Phase Templates: Everyone can read
ALTER TABLE public.service_phase_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Phase templates are viewable by everyone"
  ON public.service_phase_templates
  FOR SELECT
  USING (true);

-- User Services: Users can only see/edit their own
ALTER TABLE public.user_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own services"
  ON public.user_services
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own services"
  ON public.user_services
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own services"
  ON public.user_services
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own services"
  ON public.user_services
  FOR DELETE
  USING (auth.uid() = user_id);

-- Search Analytics: Users can insert, admins can read
ALTER TABLE public.service_search_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can log searches"
  ON public.service_search_analytics
  FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE TRIGGER on_service_category_updated
  BEFORE UPDATE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER on_user_service_updated
  BEFORE UPDATE ON public.user_services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Increment times_used when a user adds a service
CREATE OR REPLACE FUNCTION public.increment_service_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.service_categories
  SET times_used = times_used + 1
  WHERE id = NEW.category_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_user_service_created
  AFTER INSERT ON public.user_services
  FOR EACH ROW EXECUTE FUNCTION public.increment_service_usage();

-- ============================================================
-- MIGRATION: Seed with 12 Legacy Construction Trades
-- ============================================================

-- Insert the existing 12 construction trades
INSERT INTO public.service_categories (name, description, icon, source, times_used) VALUES
  ('Painting', 'Interior and exterior painting services', 'color-palette-outline', 'legacy', 0),
  ('Tile Installation', 'Floor, backsplash, and shower tile work', 'grid-outline', 'legacy', 0),
  ('Carpentry', 'Framing, finish work, and custom carpentry', 'hammer-outline', 'legacy', 0),
  ('Countertops', 'Granite, quartz, and laminate installation', 'square-outline', 'legacy', 0),
  ('Drywall', 'Installation, taping, mudding, and texture', 'copy-outline', 'legacy', 0),
  ('Plumbing', 'Fixture installation, repairs, and pipe work', 'water-outline', 'legacy', 0),
  ('Electrical', 'Wiring, outlets, lighting, and panel work', 'flash-outline', 'legacy', 0),
  ('Flooring', 'Hardwood, laminate, vinyl, and tile flooring', 'layers-outline', 'legacy', 0),
  ('Roofing', 'Shingle installation, repairs, and gutters', 'home-outline', 'legacy', 0),
  ('Concrete', 'Slabs, driveways, stamped concrete', 'apps-outline', 'legacy', 0),
  ('Landscaping', 'Lawn care, planting, and hardscaping', 'leaf-outline', 'legacy', 0),
  ('HVAC', 'Heating, ventilation, and air conditioning', 'thermometer-outline', 'legacy', 0)
ON CONFLICT (name) DO NOTHING;

-- Store category IDs for later use
DO $$
DECLARE
  painting_id UUID;
  tile_id UUID;
  carpentry_id UUID;
  countertops_id UUID;
  drywall_id UUID;
  plumbing_id UUID;
  electrical_id UUID;
  flooring_id UUID;
  roofing_id UUID;
  concrete_id UUID;
  landscaping_id UUID;
  hvac_id UUID;
BEGIN
  -- Get IDs
  SELECT id INTO painting_id FROM public.service_categories WHERE name = 'Painting';
  SELECT id INTO tile_id FROM public.service_categories WHERE name = 'Tile Installation';
  SELECT id INTO carpentry_id FROM public.service_categories WHERE name = 'Carpentry';
  SELECT id INTO countertops_id FROM public.service_categories WHERE name = 'Countertops';
  SELECT id INTO drywall_id FROM public.service_categories WHERE name = 'Drywall';
  SELECT id INTO plumbing_id FROM public.service_categories WHERE name = 'Plumbing';
  SELECT id INTO electrical_id FROM public.service_categories WHERE name = 'Electrical';
  SELECT id INTO flooring_id FROM public.service_categories WHERE name = 'Flooring';
  SELECT id INTO roofing_id FROM public.service_categories WHERE name = 'Roofing';
  SELECT id INTO concrete_id FROM public.service_categories WHERE name = 'Concrete';
  SELECT id INTO landscaping_id FROM public.service_categories WHERE name = 'Landscaping';
  SELECT id INTO hvac_id FROM public.service_categories WHERE name = 'HVAC';

  -- Insert service items for Painting
  INSERT INTO public.service_items (category_id, name, description, unit, default_price, order_index) VALUES
    (painting_id, 'Interior Painting', 'Paint interior walls and ceilings', 'sq ft', 3.50, 0),
    (painting_id, 'Exterior Painting', 'Paint exterior surfaces', 'sq ft', 4.00, 1),
    (painting_id, 'Trim/Molding', 'Paint trim and molding work', 'linear ft', 2.50, 2),
    (painting_id, 'Labor Rate', 'Hourly labor rate', 'hour', 45.00, 3);

  -- Insert service items for Tile
  INSERT INTO public.service_items (category_id, name, description, unit, default_price, order_index) VALUES
    (tile_id, 'Floor Tile', 'Install floor tile', 'sq ft', 6.00, 0),
    (tile_id, 'Backsplash', 'Install kitchen/bathroom backsplash', 'sq ft', 8.00, 1),
    (tile_id, 'Shower Tile', 'Install shower tile work', 'sq ft', 10.00, 2),
    (tile_id, 'Grout/Sealing', 'Grout and seal tile work', 'sq ft', 2.00, 3);

  -- Insert service items for Carpentry
  INSERT INTO public.service_items (category_id, name, description, unit, default_price, order_index) VALUES
    (carpentry_id, 'Framing', 'Structural framing work', 'sq ft', 4.50, 0),
    (carpentry_id, 'Finish Carpentry', 'Finish carpentry and trim work', 'hour', 55.00, 1),
    (carpentry_id, 'Custom Cabinets', 'Custom cabinet installation', 'unit', 500.00, 2),
    (carpentry_id, 'Deck Building', 'Deck construction', 'sq ft', 15.00, 3);

  -- Insert service items for Countertops
  INSERT INTO public.service_items (category_id, name, description, unit, default_price, order_index) VALUES
    (countertops_id, 'Granite Install', 'Granite countertop installation', 'sq ft', 60.00, 0),
    (countertops_id, 'Quartz Install', 'Quartz countertop installation', 'sq ft', 70.00, 1),
    (countertops_id, 'Laminate Install', 'Laminate countertop installation', 'sq ft', 25.00, 2),
    (countertops_id, 'Demolition/Removal', 'Remove old countertops', 'job', 300.00, 3);

  -- Insert service items for Drywall
  INSERT INTO public.service_items (category_id, name, description, unit, default_price, order_index) VALUES
    (drywall_id, 'Drywall Installation', 'Install drywall sheets', 'sq ft', 2.00, 0),
    (drywall_id, 'Taping/Mudding', 'Tape and mud seams', 'sq ft', 1.50, 1),
    (drywall_id, 'Texture', 'Apply wall texture', 'sq ft', 1.25, 2),
    (drywall_id, 'Repair Work', 'Drywall repair services', 'hour', 50.00, 3);

  -- Insert service items for Plumbing
  INSERT INTO public.service_items (category_id, name, description, unit, default_price, order_index) VALUES
    (plumbing_id, 'Fixture Installation', 'Install plumbing fixtures', 'unit', 150.00, 0),
    (plumbing_id, 'Repair Work', 'Plumbing repair services', 'hour', 85.00, 1),
    (plumbing_id, 'Pipe Work', 'Install/replace pipes', 'linear ft', 12.00, 2),
    (plumbing_id, 'Drain Cleaning', 'Clean and clear drains', 'job', 200.00, 3);

  -- Insert service items for Electrical
  INSERT INTO public.service_items (category_id, name, description, unit, default_price, order_index) VALUES
    (electrical_id, 'Outlet Installation', 'Install electrical outlets', 'unit', 75.00, 0),
    (electrical_id, 'Light Fixture Install', 'Install light fixtures', 'unit', 125.00, 1),
    (electrical_id, 'Panel Work', 'Electrical panel work', 'hour', 95.00, 2),
    (electrical_id, 'Wiring', 'Install electrical wiring', 'linear ft', 3.50, 3);

  -- Insert service items for Flooring
  INSERT INTO public.service_items (category_id, name, description, unit, default_price, order_index) VALUES
    (flooring_id, 'Hardwood Installation', 'Install hardwood flooring', 'sq ft', 8.00, 0),
    (flooring_id, 'Laminate Installation', 'Install laminate flooring', 'sq ft', 4.50, 1),
    (flooring_id, 'Vinyl Installation', 'Install vinyl flooring', 'sq ft', 3.50, 2),
    (flooring_id, 'Floor Removal', 'Remove old flooring', 'sq ft', 2.00, 3);

  -- Insert service items for Roofing
  INSERT INTO public.service_items (category_id, name, description, unit, default_price, order_index) VALUES
    (roofing_id, 'Shingle Installation', 'Install roofing shingles', 'sq ft', 5.50, 0),
    (roofing_id, 'Roof Repair', 'Roof repair services', 'hour', 75.00, 1),
    (roofing_id, 'Gutter Installation', 'Install gutters', 'linear ft', 8.00, 2),
    (roofing_id, 'Old Roof Removal', 'Remove old roofing', 'sq ft', 1.50, 3);

  -- Insert service items for Concrete
  INSERT INTO public.service_items (category_id, name, description, unit, default_price, order_index) VALUES
    (concrete_id, 'Concrete Slab', 'Pour concrete slab', 'sq ft', 6.00, 0),
    (concrete_id, 'Driveway', 'Pour driveway', 'sq ft', 7.50, 1),
    (concrete_id, 'Stamped Concrete', 'Stamped decorative concrete', 'sq ft', 12.00, 2),
    (concrete_id, 'Concrete Repair', 'Repair concrete work', 'hour', 65.00, 3);

  -- Insert service items for Landscaping
  INSERT INTO public.service_items (category_id, name, description, unit, default_price, order_index) VALUES
    (landscaping_id, 'Lawn Installation', 'Install new lawn', 'sq ft', 1.50, 0),
    (landscaping_id, 'Planting', 'Plant trees, shrubs, flowers', 'unit', 45.00, 1),
    (landscaping_id, 'Hardscaping', 'Patios, walkways, walls', 'sq ft', 15.00, 2),
    (landscaping_id, 'Maintenance', 'Lawn and garden maintenance', 'hour', 40.00, 3);

  -- Insert service items for HVAC
  INSERT INTO public.service_items (category_id, name, description, unit, default_price, order_index) VALUES
    (hvac_id, 'Unit Installation', 'Install HVAC unit', 'unit', 3500.00, 0),
    (hvac_id, 'Repair Work', 'HVAC repair services', 'hour', 95.00, 1),
    (hvac_id, 'Ductwork', 'Install ductwork', 'linear ft', 15.00, 2),
    (hvac_id, 'Maintenance', 'HVAC maintenance service', 'job', 150.00, 3);

END $$;

-- ============================================================
-- SEED PHASE TEMPLATES FOR LEGACY TRADES
-- ============================================================
-- (This will be a long section - continuing in next migration if needed)
-- For now, we'll add a few key examples

DO $$
DECLARE
  painting_id UUID;
  plumbing_id UUID;
  electrical_id UUID;
BEGIN
  SELECT id INTO painting_id FROM public.service_categories WHERE name = 'Painting';
  SELECT id INTO plumbing_id FROM public.service_categories WHERE name = 'Plumbing';
  SELECT id INTO electrical_id FROM public.service_categories WHERE name = 'Electrical';

  -- Painting phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index) VALUES
    (painting_id, 'Preparation', 'Surface prep and priming', 2, '["Patch holes", "Sand surfaces", "Clean surfaces", "Apply primer"]'::jsonb, 0),
    (painting_id, 'First Coat', 'First coat application', 2, '["Cut in edges", "Roll walls", "Paint ceiling", "Dry time"]'::jsonb, 1),
    (painting_id, 'Second Coat', 'Second coat and touch-ups', 2, '["Apply second coat", "Touch up areas", "Inspect finish"]'::jsonb, 2),
    (painting_id, 'Cleanup', 'Final cleanup', 1, '["Remove tape", "Clean equipment", "Remove drop cloths", "Final walkthrough"]'::jsonb, 3);

  -- Plumbing phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index) VALUES
    (plumbing_id, 'Planning & Permits', 'Planning and permits', 2, '["Create plumbing plan", "Submit permits", "Get approval"]'::jsonb, 0),
    (plumbing_id, 'Rough Plumbing', 'Pipe installation', 3, '["Install supply lines", "Install drain lines", "Install vents", "Rough plumbing inspection"]'::jsonb, 1),
    (plumbing_id, 'Fixture Installation', 'Installing fixtures', 2, '["Install sinks", "Install toilets", "Install tubs/showers", "Connect fixtures"]'::jsonb, 2),
    (plumbing_id, 'Testing & Inspection', 'Pressure testing and inspection', 1, '["Pressure test", "Final inspection", "Fix any leaks"]'::jsonb, 3);

  -- Electrical phases
  INSERT INTO public.service_phase_templates (category_id, phase_name, description, default_days, tasks, order_index) VALUES
    (electrical_id, 'Planning & Permits', 'Design and permit approval', 2, '["Create electrical plan", "Submit permits", "Receive approval"]'::jsonb, 0),
    (electrical_id, 'Rough-In', 'Wiring and electrical boxes', 3, '["Run electrical wire", "Install boxes", "Install conduit", "Rough-in inspection"]'::jsonb, 1),
    (electrical_id, 'Panel Installation', 'Electrical panel setup', 1, '["Install panel", "Connect circuits", "Label breakers"]'::jsonb, 2),
    (electrical_id, 'Final Installation', 'Fixtures and final connections', 2, '["Install switches and outlets", "Install light fixtures", "Install specialty items"]'::jsonb, 3),
    (electrical_id, 'Testing & Inspection', 'Code compliance testing', 1, '["Test all circuits", "Final inspection", "Correct any issues"]'::jsonb, 4);

END $$;

-- ============================================================
-- UTILITY FUNCTIONS
-- ============================================================

-- Function to search services by name (used by AI service discovery)
CREATE OR REPLACE FUNCTION public.search_services(search_query TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  icon TEXT,
  times_used INTEGER,
  similarity REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id,
    sc.name,
    sc.description,
    sc.icon,
    sc.times_used,
    similarity(sc.name, search_query) AS similarity
  FROM public.service_categories sc
  WHERE sc.is_active = true
    AND (
      sc.name ILIKE '%' || search_query || '%'
      OR similarity(sc.name, search_query) > 0.3
    )
  ORDER BY similarity DESC, times_used DESC
  LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Enable trigram extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create trigram index for fuzzy search
CREATE INDEX idx_service_categories_name_trgm ON public.service_categories USING gin (name gin_trgm_ops);

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- Next steps:
-- 1. Update profiles table to reference user_services instead of trades array
-- 2. Create migration script for existing users
-- 3. Build AI service discovery service
-- ============================================================
