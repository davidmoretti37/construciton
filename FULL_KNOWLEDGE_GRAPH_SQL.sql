-- =====================================================
-- CONSTRUCTION KNOWLEDGE GRAPH - COMPLETE SQL
-- Run this entire script in Supabase SQL Editor
-- Created: 2026-01-27
-- =====================================================

-- ============================================
-- PART 1: CREATE TABLES
-- ============================================

-- 1. CONSTRUCTION TASK TEMPLATES
CREATE TABLE IF NOT EXISTS public.construction_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  trade TEXT NOT NULL,
  duration_hours_min NUMERIC NOT NULL,
  duration_hours_max NUMERIC NOT NULL,
  duration_hours_avg NUMERIC NOT NULL,
  drying_time_hours INTEGER DEFAULT 0,
  lead_time_days INTEGER DEFAULT 0,
  buffer_hours INTEGER DEFAULT 0,
  is_permit_required BOOLEAN DEFAULT FALSE,
  is_inspection_required BOOLEAN DEFAULT FALSE,
  required_materials TEXT[] DEFAULT '{}',
  required_equipment TEXT[] DEFAULT '{}',
  phase_category TEXT CHECK (phase_category IN (
    'planning', 'demo', 'rough', 'inspection',
    'drywall', 'paint', 'flooring', 'finish', 'closeout'
  )),
  project_types TEXT[] DEFAULT '{}',
  is_system_template BOOLEAN DEFAULT TRUE,
  confidence_score NUMERIC DEFAULT 1.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  times_used INTEGER DEFAULT 0,
  times_modified INTEGER DEFAULT 0,
  keywords TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_templates_trade ON public.construction_task_templates(trade);
CREATE INDEX IF NOT EXISTS idx_task_templates_phase ON public.construction_task_templates(phase_category);
CREATE INDEX IF NOT EXISTS idx_task_templates_project_types ON public.construction_task_templates USING GIN(project_types);

-- 2. TASK DEPENDENCIES
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.construction_task_templates(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.construction_task_templates(id) ON DELETE CASCADE,
  dependency_type TEXT CHECK (dependency_type IN (
    'finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'
  )) DEFAULT 'finish_to_start',
  lag_hours INTEGER DEFAULT 0,
  is_hard_constraint BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(task_id, depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_dependencies_task ON public.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_dependencies_depends_on ON public.task_dependencies(depends_on_task_id);

-- 3. SCHEDULING CONSTRAINTS
CREATE TABLE IF NOT EXISTS public.scheduling_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  rule_type TEXT CHECK (rule_type IN (
    'temporal', 'capacity', 'calendar', 'dependency', 'material'
  )) NOT NULL,
  rule_definition JSONB NOT NULL,
  applies_to_trades TEXT[],
  applies_to_project_types TEXT[],
  is_active BOOLEAN DEFAULT TRUE,
  is_system_rule BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_constraints_active ON public.scheduling_constraints(is_active) WHERE is_active = TRUE;

-- 4. TASK LEARNINGS
CREATE TABLE IF NOT EXISTS public.task_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_template_id UUID REFERENCES public.construction_task_templates(id) ON DELETE SET NULL,
  task_name TEXT NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  phase_id UUID REFERENCES public.project_phases(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  estimated_duration_hours NUMERIC,
  actual_duration_hours NUMERIC,
  variance_hours NUMERIC GENERATED ALWAYS AS (actual_duration_hours - estimated_duration_hours) STORED,
  variance_percent NUMERIC GENERATED ALWAYS AS (
    CASE WHEN estimated_duration_hours > 0
    THEN ((actual_duration_hours - estimated_duration_hours) / estimated_duration_hours) * 100
    ELSE NULL END
  ) STORED,
  variance_reason TEXT,
  learned_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learnings_template ON public.task_learnings(task_template_id);
CREATE INDEX IF NOT EXISTS idx_learnings_user ON public.task_learnings(user_id);

-- 5. PROJECT TYPE TEMPLATES
CREATE TABLE IF NOT EXISTS public.project_type_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  complexity TEXT CHECK (complexity IN ('simple', 'medium', 'complex')) DEFAULT 'medium',
  typical_duration_days_min INTEGER,
  typical_duration_days_max INTEGER,
  typical_duration_days_avg INTEGER,
  default_phases JSONB DEFAULT '[]'::jsonb,
  qualifying_questions JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PART 2: ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.construction_task_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Task templates viewable by authenticated" ON public.construction_task_templates FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Task templates modifiable by service role" ON public.construction_task_templates FOR ALL TO service_role USING (TRUE);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dependencies viewable by authenticated" ON public.task_dependencies FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Dependencies modifiable by service role" ON public.task_dependencies FOR ALL TO service_role USING (TRUE);

ALTER TABLE public.scheduling_constraints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Constraints viewable by authenticated" ON public.scheduling_constraints FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Constraints modifiable by service role" ON public.scheduling_constraints FOR ALL TO service_role USING (TRUE);

ALTER TABLE public.task_learnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own learnings" ON public.task_learnings FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users insert own learnings" ON public.task_learnings FOR INSERT WITH CHECK (user_id = auth.uid());

ALTER TABLE public.project_type_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project types viewable by authenticated" ON public.project_type_templates FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "Project types modifiable by service role" ON public.project_type_templates FOR ALL TO service_role USING (TRUE);

-- ============================================
-- PART 3: HELPER FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION update_modified_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER construction_task_templates_updated
  BEFORE UPDATE ON public.construction_task_templates
  FOR EACH ROW EXECUTE FUNCTION update_modified_timestamp();

CREATE TRIGGER project_type_templates_updated
  BEFORE UPDATE ON public.project_type_templates
  FOR EACH ROW EXECUTE FUNCTION update_modified_timestamp();

-- ============================================
-- PART 4: SEED PROJECT TYPE TEMPLATES
-- ============================================

INSERT INTO public.project_type_templates (name, display_name, description, complexity, typical_duration_days_min, typical_duration_days_max, typical_duration_days_avg, default_phases, qualifying_questions) VALUES
('bathroom_gut_remodel', 'Bathroom - Full Gut Remodel', 'Complete bathroom renovation including all fixtures, tile, and finishes', 'complex', 21, 35, 28, '[{"name":"Planning","order":1,"typical_days":3},{"name":"Demo","order":2,"typical_days":2},{"name":"Rough","order":3,"typical_days":5},{"name":"Inspection","order":4,"typical_days":2},{"name":"Drywall","order":5,"typical_days":4},{"name":"Tile","order":6,"typical_days":4},{"name":"Paint","order":7,"typical_days":2},{"name":"Finish","order":8,"typical_days":5}]', '[{"question":"Is this a gut renovation or cosmetic update?","options":["Gut renovation","Cosmetic update"]},{"question":"Moving any plumbing?","options":["Yes","No"]}]'),
('bathroom_cosmetic', 'Bathroom - Cosmetic Update', 'Paint, fixtures, vanity replacement without moving plumbing', 'simple', 5, 10, 7, '[{"name":"Prep","order":1,"typical_days":1},{"name":"Fixtures","order":2,"typical_days":2},{"name":"Paint","order":3,"typical_days":2},{"name":"Cleanup","order":4,"typical_days":1}]', '[{"question":"Replacing vanity?","options":["Yes","No"]}]'),
('kitchen_full_remodel', 'Kitchen - Full Remodel', 'Complete kitchen renovation with new cabinets, counters, appliances', 'complex', 35, 56, 42, '[{"name":"Planning","order":1,"typical_days":5},{"name":"Demo","order":2,"typical_days":3},{"name":"Rough","order":3,"typical_days":5},{"name":"Inspection","order":4,"typical_days":2},{"name":"Drywall","order":5,"typical_days":5},{"name":"Paint","order":6,"typical_days":3},{"name":"Cabinets","order":7,"typical_days":3},{"name":"Counters","order":8,"typical_days":10},{"name":"Finish","order":9,"typical_days":6}]', '[{"question":"Changing layout?","options":["Yes","No"]},{"question":"Cabinet type?","options":["Custom","Stock"]}]'),
('kitchen_cosmetic', 'Kitchen - Cosmetic Update', 'Paint, hardware, backsplash, minor updates', 'simple', 5, 10, 7, '[{"name":"Prep","order":1,"typical_days":1},{"name":"Paint","order":2,"typical_days":3},{"name":"Backsplash","order":3,"typical_days":2},{"name":"Hardware","order":4,"typical_days":1}]', '[]'),
('basement_finishing', 'Basement Finishing', 'Convert unfinished basement to livable space', 'complex', 28, 49, 35, '[{"name":"Planning","order":1,"typical_days":5},{"name":"Framing","order":2,"typical_days":5},{"name":"Rough","order":3,"typical_days":5},{"name":"Inspection","order":4,"typical_days":2},{"name":"Insulation","order":5,"typical_days":2},{"name":"Drywall","order":6,"typical_days":5},{"name":"Paint","order":7,"typical_days":3},{"name":"Flooring","order":8,"typical_days":3},{"name":"Finish","order":9,"typical_days":5}]', '[{"question":"Include bathroom?","options":["Full bath","Half bath","No"]}]'),
('room_addition', 'Room Addition', 'Add new room to existing structure', 'complex', 56, 90, 70, '[{"name":"Design","order":1,"typical_days":14},{"name":"Permits","order":2,"typical_days":14},{"name":"Foundation","order":3,"typical_days":7},{"name":"Framing","order":4,"typical_days":7},{"name":"Roofing","order":5,"typical_days":3},{"name":"Exterior","order":6,"typical_days":5},{"name":"Rough","order":7,"typical_days":5},{"name":"Inspection","order":8,"typical_days":3},{"name":"Interior","order":9,"typical_days":12}]', '[{"question":"Addition size?","options":["Small","Medium","Large"]}]')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- PART 5: SEED TASK TEMPLATES
-- ============================================

-- Planning Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, is_permit_required, lead_time_days, keywords) VALUES
('Initial site assessment', 'Walk site, take measurements, document existing conditions', 'general', 1, 3, 2, 'planning', '{}', false, 0, ARRAY['assessment', 'measure', 'walkthrough']),
('Pull permits', 'Submit permit application and wait for approval', 'general', 2, 8, 4, 'planning', '{}', true, 5, ARRAY['permit', 'approval', 'city', 'county']),
('Material takeoff and ordering', 'Calculate materials needed and place orders', 'general', 2, 6, 4, 'planning', '{}', false, 3, ARRAY['materials', 'order', 'takeoff']),
('Client design review', 'Review plans and selections with client', 'general', 1, 3, 2, 'planning', '{}', false, 0, ARRAY['design', 'review', 'approval', 'selections'])
ON CONFLICT DO NOTHING;

-- Demo Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, drying_time_hours, keywords) VALUES
('Protect adjacent areas', 'Install plastic sheeting, drop cloths, floor protection', 'general', 1, 3, 2, 'demo', '{}', 0, ARRAY['protection', 'plastic', 'drop cloth']),
('Demo - fixtures and appliances', 'Remove toilets, sinks, vanities, appliances', 'demolition', 2, 6, 4, 'demo', '{}', 0, ARRAY['demo', 'remove', 'fixtures', 'appliances']),
('Demo - cabinets', 'Remove existing cabinets and countertops', 'demolition', 4, 10, 6, 'demo', ARRAY['kitchen'], 0, ARRAY['demo', 'cabinets', 'countertops']),
('Demo - flooring', 'Remove existing flooring material', 'demolition', 4, 12, 8, 'demo', '{}', 0, ARRAY['demo', 'flooring', 'tile', 'carpet']),
('Demo - wall tile', 'Remove wall tile and backer board', 'demolition', 4, 10, 6, 'demo', ARRAY['bathroom'], 0, ARRAY['demo', 'tile', 'walls']),
('Demo - drywall', 'Remove drywall for access or replacement', 'demolition', 2, 8, 4, 'demo', '{}', 0, ARRAY['demo', 'drywall', 'walls']),
('Demo - partial wall removal', 'Remove non-load-bearing wall section', 'demolition', 4, 10, 6, 'demo', '{}', 0, ARRAY['demo', 'wall', 'removal']),
('Debris removal and disposal', 'Haul debris to dumpster, clean site', 'demolition', 2, 6, 4, 'demo', '{}', 0, ARRAY['debris', 'disposal', 'cleanup', 'dumpster'])
ON CONFLICT DO NOTHING;

-- Rough Plumbing Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, is_inspection_required, keywords) VALUES
('Rough plumbing - supply lines', 'Install water supply piping', 'plumbing', 4, 12, 8, 'rough', '{}', true, ARRAY['plumbing', 'supply', 'water', 'rough']),
('Rough plumbing - drain/waste/vent', 'Install DWV piping', 'plumbing', 4, 16, 10, 'rough', '{}', true, ARRAY['plumbing', 'drain', 'waste', 'vent', 'rough']),
('Relocate toilet flange', 'Move toilet drain to new location', 'plumbing', 4, 8, 6, 'rough', ARRAY['bathroom'], true, ARRAY['plumbing', 'toilet', 'flange', 'relocate']),
('Install shower pan/drain', 'Set shower pan and connect drain', 'plumbing', 2, 6, 4, 'rough', ARRAY['bathroom'], true, ARRAY['plumbing', 'shower', 'pan', 'drain']),
('Pressure test plumbing', 'Test all connections for leaks', 'plumbing', 1, 2, 1, 'rough', '{}', true, ARRAY['plumbing', 'test', 'pressure', 'leaks'])
ON CONFLICT DO NOTHING;

-- Rough Electrical Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, is_inspection_required, keywords) VALUES
('Rough electrical - new circuits', 'Run new circuit wiring to panel', 'electrical', 4, 12, 8, 'rough', '{}', true, ARRAY['electrical', 'wiring', 'circuits', 'rough']),
('Rough electrical - boxes and wiring', 'Install outlet/switch boxes and wire runs', 'electrical', 4, 10, 6, 'rough', '{}', true, ARRAY['electrical', 'boxes', 'outlets', 'switches']),
('Install dedicated appliance circuits', 'Run circuits for dishwasher, disposal, range, etc.', 'electrical', 4, 8, 6, 'rough', ARRAY['kitchen'], true, ARRAY['electrical', 'appliance', 'circuit', 'dedicated']),
('Install exhaust fan rough-in', 'Wire and duct for bathroom exhaust fan', 'electrical', 2, 4, 3, 'rough', ARRAY['bathroom'], true, ARRAY['electrical', 'exhaust', 'fan', 'vent']),
('Install recessed lighting rough-in', 'Cut holes and wire for recessed lights', 'electrical', 2, 6, 4, 'rough', '{}', true, ARRAY['electrical', 'recessed', 'lights', 'cans'])
ON CONFLICT DO NOTHING;

-- Inspection Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, is_inspection_required, lead_time_days, keywords) VALUES
('Schedule rough inspection', 'Call for rough mechanical inspection', 'general', 0.5, 1, 0.5, 'inspection', '{}', true, 2, ARRAY['inspection', 'rough', 'schedule']),
('Rough inspection', 'Inspector reviews rough plumbing, electrical, HVAC', 'general', 1, 3, 2, 'inspection', '{}', true, 0, ARRAY['inspection', 'rough', 'plumbing', 'electrical']),
('Schedule final inspection', 'Call for final inspection', 'general', 0.5, 1, 0.5, 'inspection', '{}', true, 2, ARRAY['inspection', 'final', 'schedule']),
('Final inspection', 'Final permit sign-off inspection', 'general', 1, 3, 2, 'closeout', '{}', true, 0, ARRAY['inspection', 'final', 'permit', 'close'])
ON CONFLICT DO NOTHING;

-- Drywall Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, drying_time_hours, keywords) VALUES
('Install backer board', 'Install cement backer board in wet areas', 'drywall', 4, 8, 6, 'drywall', ARRAY['bathroom', 'kitchen'], 0, ARRAY['backer', 'cement board', 'durock', 'hardiboard']),
('Hang drywall', 'Install drywall sheets on walls and ceiling', 'drywall', 6, 16, 10, 'drywall', '{}', 0, ARRAY['drywall', 'sheetrock', 'hang']),
('Tape and mud - first coat', 'Apply tape and first coat of joint compound', 'drywall', 3, 8, 5, 'drywall', '{}', 24, ARRAY['drywall', 'tape', 'mud', 'compound', 'first coat']),
('Tape and mud - second coat', 'Apply second coat of joint compound', 'drywall', 3, 8, 5, 'drywall', '{}', 24, ARRAY['drywall', 'mud', 'compound', 'second coat']),
('Tape and mud - finish coat', 'Apply final skim coat', 'drywall', 2, 6, 4, 'drywall', '{}', 24, ARRAY['drywall', 'mud', 'finish', 'skim']),
('Sand drywall', 'Sand all joints smooth', 'drywall', 2, 6, 4, 'drywall', '{}', 0, ARRAY['drywall', 'sand', 'smooth'])
ON CONFLICT DO NOTHING;

-- Paint Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, drying_time_hours, keywords) VALUES
('Paint prep', 'Fill holes, caulk gaps, tape trim, protect floors', 'painting', 2, 6, 4, 'paint', '{}', 0, ARRAY['paint', 'prep', 'caulk', 'fill']),
('Prime walls and ceiling', 'Apply primer coat', 'painting', 2, 6, 4, 'paint', '{}', 4, ARRAY['paint', 'prime', 'primer']),
('Paint walls - first coat', 'Apply first coat of wall paint', 'painting', 3, 8, 5, 'paint', '{}', 4, ARRAY['paint', 'walls', 'first coat']),
('Paint walls - second coat', 'Apply second coat of wall paint', 'painting', 3, 8, 5, 'paint', '{}', 4, ARRAY['paint', 'walls', 'second coat']),
('Paint ceiling', 'Paint ceiling', 'painting', 2, 6, 4, 'paint', '{}', 4, ARRAY['paint', 'ceiling']),
('Paint trim', 'Paint baseboards, door casings, crown molding', 'painting', 3, 10, 6, 'paint', '{}', 4, ARRAY['paint', 'trim', 'baseboards', 'casings']),
('Paint touch-up', 'Final touch-ups after other trades finish', 'painting', 1, 3, 2, 'closeout', '{}', 0, ARRAY['paint', 'touchup', 'final'])
ON CONFLICT DO NOTHING;

-- Tile Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, drying_time_hours, keywords) VALUES
('Waterproof shower/tub area', 'Apply waterproofing membrane', 'tile', 2, 4, 3, 'drywall', ARRAY['bathroom'], 24, ARRAY['waterproof', 'membrane', 'shower', 'redgard']),
('Layout tile pattern', 'Plan tile layout, mark reference lines', 'tile', 1, 3, 2, 'flooring', '{}', 0, ARRAY['tile', 'layout', 'pattern']),
('Install floor tile', 'Set floor tile with thinset', 'tile', 6, 16, 10, 'flooring', '{}', 24, ARRAY['tile', 'floor', 'set', 'thinset']),
('Install wall tile', 'Set wall tile (shower, backsplash)', 'tile', 6, 16, 10, 'flooring', ARRAY['bathroom', 'kitchen'], 24, ARRAY['tile', 'wall', 'shower', 'backsplash']),
('Grout tile', 'Apply grout to tile joints', 'tile', 3, 8, 5, 'flooring', '{}', 24, ARRAY['tile', 'grout', 'joints']),
('Seal grout', 'Apply grout sealer', 'tile', 1, 3, 2, 'flooring', '{}', 2, ARRAY['tile', 'grout', 'seal', 'sealer']),
('Install tile trim/edging', 'Install schluter, bullnose, or other edge trim', 'tile', 1, 4, 2, 'flooring', '{}', 0, ARRAY['tile', 'trim', 'edge', 'schluter'])
ON CONFLICT DO NOTHING;

-- Flooring Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, drying_time_hours, keywords) VALUES
('Prep subfloor', 'Level, repair, and clean subfloor', 'flooring', 2, 6, 4, 'flooring', '{}', 0, ARRAY['floor', 'subfloor', 'prep', 'level']),
('Install underlayment', 'Install foam, cork, or other underlayment', 'flooring', 1, 4, 2, 'flooring', '{}', 0, ARRAY['floor', 'underlayment', 'foam']),
('Install hardwood flooring', 'Install hardwood flooring', 'flooring', 6, 20, 12, 'flooring', '{}', 0, ARRAY['floor', 'hardwood', 'wood']),
('Install laminate/LVP flooring', 'Install laminate or luxury vinyl plank', 'flooring', 4, 16, 8, 'flooring', '{}', 0, ARRAY['floor', 'laminate', 'lvp', 'vinyl plank']),
('Install carpet', 'Install carpet and pad', 'flooring', 3, 10, 6, 'flooring', '{}', 0, ARRAY['floor', 'carpet']),
('Install transitions and trim', 'Install transition strips between rooms', 'flooring', 1, 4, 2, 'flooring', '{}', 0, ARRAY['floor', 'transitions', 'trim'])
ON CONFLICT DO NOTHING;

-- Cabinet Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, lead_time_days, keywords) VALUES
('Install base cabinets', 'Install lower/base cabinets', 'carpentry', 4, 12, 8, 'finish', ARRAY['kitchen', 'bathroom'], 0, ARRAY['cabinets', 'base', 'lower', 'install']),
('Install wall cabinets', 'Install upper/wall cabinets', 'carpentry', 4, 10, 6, 'finish', ARRAY['kitchen', 'bathroom'], 0, ARRAY['cabinets', 'upper', 'wall', 'install']),
('Install vanity', 'Install bathroom vanity cabinet', 'carpentry', 2, 4, 3, 'finish', ARRAY['bathroom'], 0, ARRAY['vanity', 'cabinet', 'bathroom']),
('Template countertops', 'Create template for countertop fabrication', 'countertop', 1, 3, 2, 'finish', ARRAY['kitchen', 'bathroom'], 7, ARRAY['countertop', 'template', 'measure']),
('Install countertops', 'Install fabricated countertops', 'countertop', 2, 6, 4, 'finish', ARRAY['kitchen', 'bathroom'], 0, ARRAY['countertop', 'install', 'granite', 'quartz']),
('Install cabinet hardware', 'Install handles, knobs, soft-close hinges', 'carpentry', 1, 4, 2, 'finish', ARRAY['kitchen', 'bathroom'], 0, ARRAY['cabinets', 'hardware', 'handles', 'knobs'])
ON CONFLICT DO NOTHING;

-- Plumbing Finish Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, keywords) VALUES
('Install toilet', 'Set toilet, connect water, test', 'plumbing', 1, 3, 2, 'finish', ARRAY['bathroom'], ARRAY['plumbing', 'toilet', 'install']),
('Install sink and faucet', 'Install sink, faucet, connect drains and supply', 'plumbing', 2, 4, 3, 'finish', ARRAY['bathroom', 'kitchen'], ARRAY['plumbing', 'sink', 'faucet', 'install']),
('Install shower fixtures', 'Install showerhead, valve trim, handle', 'plumbing', 1, 3, 2, 'finish', ARRAY['bathroom'], ARRAY['plumbing', 'shower', 'fixtures', 'valve']),
('Install garbage disposal', 'Install and wire garbage disposal', 'plumbing', 1, 2, 1.5, 'finish', ARRAY['kitchen'], ARRAY['plumbing', 'disposal', 'garbage']),
('Install dishwasher', 'Connect dishwasher water and drain', 'plumbing', 1, 3, 2, 'finish', ARRAY['kitchen'], ARRAY['plumbing', 'dishwasher', 'appliance']),
('Test all plumbing', 'Run all fixtures, check for leaks', 'plumbing', 0.5, 2, 1, 'closeout', '{}', ARRAY['plumbing', 'test', 'leaks'])
ON CONFLICT DO NOTHING;

-- Electrical Finish Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, keywords) VALUES
('Install outlets and switches', 'Install receptacles, switches, and cover plates', 'electrical', 2, 6, 4, 'finish', '{}', ARRAY['electrical', 'outlets', 'switches', 'receptacles']),
('Install light fixtures', 'Hang and connect light fixtures', 'electrical', 2, 8, 4, 'finish', '{}', ARRAY['electrical', 'lights', 'fixtures']),
('Install exhaust fan', 'Install and connect bathroom exhaust fan', 'electrical', 1, 3, 2, 'finish', ARRAY['bathroom'], ARRAY['electrical', 'exhaust', 'fan']),
('Install under-cabinet lighting', 'Install and wire under-cabinet lights', 'electrical', 2, 4, 3, 'finish', ARRAY['kitchen'], ARRAY['electrical', 'undercabinet', 'lights']),
('Connect appliances', 'Connect range, dishwasher, disposal electrical', 'electrical', 1, 4, 2, 'finish', ARRAY['kitchen'], ARRAY['electrical', 'appliances', 'connect']),
('Test all electrical', 'Test all circuits, GFCIs, switches', 'electrical', 0.5, 2, 1, 'closeout', '{}', ARRAY['electrical', 'test', 'gfci'])
ON CONFLICT DO NOTHING;

-- Trim and Finish Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, keywords) VALUES
('Install baseboards', 'Install and caulk baseboards', 'carpentry', 2, 8, 4, 'finish', '{}', ARRAY['trim', 'baseboards', 'install']),
('Install door casings', 'Install door trim and casings', 'carpentry', 2, 6, 4, 'finish', '{}', ARRAY['trim', 'door', 'casing', 'install']),
('Install interior doors', 'Hang and adjust interior doors', 'carpentry', 2, 8, 4, 'finish', '{}', ARRAY['doors', 'interior', 'hang']),
('Install crown molding', 'Install crown molding', 'carpentry', 3, 10, 6, 'finish', '{}', ARRAY['trim', 'crown', 'molding']),
('Install window trim', 'Install window casings and sills', 'carpentry', 2, 6, 4, 'finish', '{}', ARRAY['trim', 'window', 'casing', 'sill']),
('Install closet shelving', 'Install closet rod and shelving', 'carpentry', 1, 4, 2, 'finish', '{}', ARRAY['closet', 'shelving', 'rod']),
('Install bathroom accessories', 'Install towel bars, TP holder, mirrors', 'general', 1, 3, 2, 'finish', ARRAY['bathroom'], ARRAY['accessories', 'towel bar', 'mirror'])
ON CONFLICT DO NOTHING;

-- Appliance Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, keywords) VALUES
('Install range/cooktop', 'Position and connect range or cooktop', 'general', 1, 3, 2, 'finish', ARRAY['kitchen'], ARRAY['appliance', 'range', 'cooktop', 'stove']),
('Install range hood', 'Mount and duct range hood', 'general', 2, 4, 3, 'finish', ARRAY['kitchen'], ARRAY['appliance', 'hood', 'vent']),
('Install refrigerator', 'Position refrigerator and connect water line', 'general', 0.5, 2, 1, 'finish', ARRAY['kitchen'], ARRAY['appliance', 'refrigerator', 'fridge']),
('Install microwave', 'Install over-range or built-in microwave', 'general', 1, 2, 1.5, 'finish', ARRAY['kitchen'], ARRAY['appliance', 'microwave'])
ON CONFLICT DO NOTHING;

-- Closeout Tasks
INSERT INTO public.construction_task_templates (name, description, trade, duration_hours_min, duration_hours_max, duration_hours_avg, phase_category, project_types, keywords) VALUES
('Site cleanup', 'Remove debris, vacuum, clean all surfaces', 'general', 2, 6, 4, 'closeout', '{}', ARRAY['cleanup', 'clean', 'debris']),
('Punch list walkthrough', 'Walk project with client, document punch items', 'general', 1, 3, 2, 'closeout', '{}', ARRAY['punch', 'walkthrough', 'list']),
('Complete punch list', 'Address all punch list items', 'general', 2, 8, 4, 'closeout', '{}', ARRAY['punch', 'complete', 'fix']),
('Final client walkthrough', 'Final walkthrough, hand over documentation', 'general', 0.5, 2, 1, 'closeout', '{}', ARRAY['final', 'walkthrough', 'handover'])
ON CONFLICT DO NOTHING;

-- ============================================
-- PART 6: SEED TASK DEPENDENCIES
-- ============================================

DO $$
DECLARE
  v_protect_areas UUID;
  v_demo_fixtures UUID;
  v_demo_cabinets UUID;
  v_demo_flooring UUID;
  v_debris UUID;
  v_rough_plumbing UUID;
  v_rough_electrical UUID;
  v_rough_inspection UUID;
  v_backer_board UUID;
  v_waterproof UUID;
  v_hang_drywall UUID;
  v_mud_1 UUID;
  v_mud_2 UUID;
  v_mud_3 UUID;
  v_sand_drywall UUID;
  v_paint_prep UUID;
  v_prime UUID;
  v_paint_1 UUID;
  v_paint_2 UUID;
  v_paint_ceiling UUID;
  v_paint_trim UUID;
  v_base_cabinets UUID;
  v_wall_cabinets UUID;
  v_template_counter UUID;
  v_install_counter UUID;
  v_install_sink UUID;
  v_install_toilet UUID;
  v_tile_floor UUID;
  v_tile_wall UUID;
  v_grout UUID;
  v_outlets UUID;
  v_lights UUID;
BEGIN
  SELECT id INTO v_protect_areas FROM construction_task_templates WHERE name = 'Protect adjacent areas';
  SELECT id INTO v_demo_fixtures FROM construction_task_templates WHERE name = 'Demo - fixtures and appliances';
  SELECT id INTO v_demo_cabinets FROM construction_task_templates WHERE name = 'Demo - cabinets';
  SELECT id INTO v_demo_flooring FROM construction_task_templates WHERE name = 'Demo - flooring';
  SELECT id INTO v_debris FROM construction_task_templates WHERE name = 'Debris removal and disposal';
  SELECT id INTO v_rough_plumbing FROM construction_task_templates WHERE name = 'Rough plumbing - supply lines';
  SELECT id INTO v_rough_electrical FROM construction_task_templates WHERE name = 'Rough electrical - new circuits';
  SELECT id INTO v_rough_inspection FROM construction_task_templates WHERE name = 'Rough inspection';
  SELECT id INTO v_backer_board FROM construction_task_templates WHERE name = 'Install backer board';
  SELECT id INTO v_waterproof FROM construction_task_templates WHERE name = 'Waterproof shower/tub area';
  SELECT id INTO v_hang_drywall FROM construction_task_templates WHERE name = 'Hang drywall';
  SELECT id INTO v_mud_1 FROM construction_task_templates WHERE name = 'Tape and mud - first coat';
  SELECT id INTO v_mud_2 FROM construction_task_templates WHERE name = 'Tape and mud - second coat';
  SELECT id INTO v_mud_3 FROM construction_task_templates WHERE name = 'Tape and mud - finish coat';
  SELECT id INTO v_sand_drywall FROM construction_task_templates WHERE name = 'Sand drywall';
  SELECT id INTO v_paint_prep FROM construction_task_templates WHERE name = 'Paint prep';
  SELECT id INTO v_prime FROM construction_task_templates WHERE name = 'Prime walls and ceiling';
  SELECT id INTO v_paint_1 FROM construction_task_templates WHERE name = 'Paint walls - first coat';
  SELECT id INTO v_paint_2 FROM construction_task_templates WHERE name = 'Paint walls - second coat';
  SELECT id INTO v_paint_ceiling FROM construction_task_templates WHERE name = 'Paint ceiling';
  SELECT id INTO v_paint_trim FROM construction_task_templates WHERE name = 'Paint trim';
  SELECT id INTO v_base_cabinets FROM construction_task_templates WHERE name = 'Install base cabinets';
  SELECT id INTO v_wall_cabinets FROM construction_task_templates WHERE name = 'Install wall cabinets';
  SELECT id INTO v_template_counter FROM construction_task_templates WHERE name = 'Template countertops';
  SELECT id INTO v_install_counter FROM construction_task_templates WHERE name = 'Install countertops';
  SELECT id INTO v_install_sink FROM construction_task_templates WHERE name = 'Install sink and faucet';
  SELECT id INTO v_install_toilet FROM construction_task_templates WHERE name = 'Install toilet';
  SELECT id INTO v_tile_floor FROM construction_task_templates WHERE name = 'Install floor tile';
  SELECT id INTO v_tile_wall FROM construction_task_templates WHERE name = 'Install wall tile';
  SELECT id INTO v_grout FROM construction_task_templates WHERE name = 'Grout tile';
  SELECT id INTO v_outlets FROM construction_task_templates WHERE name = 'Install outlets and switches';
  SELECT id INTO v_lights FROM construction_task_templates WHERE name = 'Install light fixtures';

  -- Demo dependencies
  IF v_protect_areas IS NOT NULL AND v_demo_fixtures IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_demo_fixtures, v_protect_areas, 'finish_to_start', 'Protect areas before demo') ON CONFLICT DO NOTHING;
  END IF;
  IF v_demo_fixtures IS NOT NULL AND v_demo_cabinets IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_demo_cabinets, v_demo_fixtures, 'finish_to_start', 'Remove fixtures before cabinets') ON CONFLICT DO NOTHING;
  END IF;
  IF v_demo_cabinets IS NOT NULL AND v_demo_flooring IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_demo_flooring, v_demo_cabinets, 'finish_to_start', 'Remove cabinets before flooring') ON CONFLICT DO NOTHING;
  END IF;
  IF v_demo_flooring IS NOT NULL AND v_debris IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_debris, v_demo_flooring, 'finish_to_start', 'Remove debris after demo') ON CONFLICT DO NOTHING;
  END IF;

  -- Rough work after demo
  IF v_debris IS NOT NULL AND v_rough_plumbing IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_rough_plumbing, v_debris, 'finish_to_start', 'Clear site before rough plumbing') ON CONFLICT DO NOTHING;
  END IF;
  IF v_debris IS NOT NULL AND v_rough_electrical IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_rough_electrical, v_debris, 'finish_to_start', 'Clear site before rough electrical') ON CONFLICT DO NOTHING;
  END IF;

  -- Inspection after rough work
  IF v_rough_plumbing IS NOT NULL AND v_rough_inspection IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_rough_inspection, v_rough_plumbing, 'finish_to_start', 'Rough plumbing before inspection') ON CONFLICT DO NOTHING;
  END IF;
  IF v_rough_electrical IS NOT NULL AND v_rough_inspection IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_rough_inspection, v_rough_electrical, 'finish_to_start', 'Rough electrical before inspection') ON CONFLICT DO NOTHING;
  END IF;

  -- CRITICAL: Drywall AFTER rough inspection
  IF v_rough_inspection IS NOT NULL AND v_backer_board IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_backer_board, v_rough_inspection, 'finish_to_start', 'Inspection must pass before closing walls') ON CONFLICT DO NOTHING;
  END IF;
  IF v_rough_inspection IS NOT NULL AND v_hang_drywall IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_hang_drywall, v_rough_inspection, 'finish_to_start', 'Inspection must pass before drywall') ON CONFLICT DO NOTHING;
  END IF;

  -- Waterproofing after backer board
  IF v_backer_board IS NOT NULL AND v_waterproof IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_waterproof, v_backer_board, 'finish_to_start', 'Backer board before waterproofing') ON CONFLICT DO NOTHING;
  END IF;

  -- Drywall sequence with DRYING TIMES
  IF v_hang_drywall IS NOT NULL AND v_mud_1 IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_mud_1, v_hang_drywall, 'finish_to_start', 'Hang drywall before taping') ON CONFLICT DO NOTHING;
  END IF;
  IF v_mud_1 IS NOT NULL AND v_mud_2 IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, lag_hours, notes) VALUES (v_mud_2, v_mud_1, 'finish_to_start', 24, '24hr drying between coats') ON CONFLICT DO NOTHING;
  END IF;
  IF v_mud_2 IS NOT NULL AND v_mud_3 IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, lag_hours, notes) VALUES (v_mud_3, v_mud_2, 'finish_to_start', 24, '24hr drying between coats') ON CONFLICT DO NOTHING;
  END IF;
  IF v_mud_3 IS NOT NULL AND v_sand_drywall IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, lag_hours, notes) VALUES (v_sand_drywall, v_mud_3, 'finish_to_start', 24, '24hr drying before sanding') ON CONFLICT DO NOTHING;
  END IF;

  -- Paint sequence
  IF v_sand_drywall IS NOT NULL AND v_paint_prep IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_paint_prep, v_sand_drywall, 'finish_to_start', 'Sand before paint prep') ON CONFLICT DO NOTHING;
  END IF;
  IF v_paint_prep IS NOT NULL AND v_prime IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_prime, v_paint_prep, 'finish_to_start', 'Prep before priming') ON CONFLICT DO NOTHING;
  END IF;
  IF v_prime IS NOT NULL AND v_paint_1 IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, lag_hours, notes) VALUES (v_paint_1, v_prime, 'finish_to_start', 4, '4hr dry after primer') ON CONFLICT DO NOTHING;
  END IF;
  IF v_paint_1 IS NOT NULL AND v_paint_2 IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, lag_hours, notes) VALUES (v_paint_2, v_paint_1, 'finish_to_start', 4, '4hr dry between coats') ON CONFLICT DO NOTHING;
  END IF;
  IF v_paint_2 IS NOT NULL AND v_paint_trim IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_paint_trim, v_paint_2, 'finish_to_start', 'Paint walls before trim') ON CONFLICT DO NOTHING;
  END IF;

  -- Cabinet sequence
  IF v_paint_2 IS NOT NULL AND v_base_cabinets IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_base_cabinets, v_paint_2, 'finish_to_start', 'Paint before cabinets') ON CONFLICT DO NOTHING;
  END IF;
  IF v_base_cabinets IS NOT NULL AND v_wall_cabinets IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_wall_cabinets, v_base_cabinets, 'finish_to_start', 'Base cabinets before uppers') ON CONFLICT DO NOTHING;
  END IF;
  IF v_base_cabinets IS NOT NULL AND v_template_counter IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_template_counter, v_base_cabinets, 'finish_to_start', 'Cabinets before template') ON CONFLICT DO NOTHING;
  END IF;
  IF v_template_counter IS NOT NULL AND v_install_counter IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, lag_hours, notes) VALUES (v_install_counter, v_template_counter, 'finish_to_start', 168, '7 day fabrication time') ON CONFLICT DO NOTHING;
  END IF;
  IF v_install_counter IS NOT NULL AND v_install_sink IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_install_sink, v_install_counter, 'finish_to_start', 'Countertop before sink') ON CONFLICT DO NOTHING;
  END IF;

  -- Tile sequence
  IF v_waterproof IS NOT NULL AND v_tile_wall IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, lag_hours, notes) VALUES (v_tile_wall, v_waterproof, 'finish_to_start', 24, 'Waterproof must cure') ON CONFLICT DO NOTHING;
  END IF;
  IF v_tile_floor IS NOT NULL AND v_grout IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, lag_hours, notes) VALUES (v_grout, v_tile_floor, 'finish_to_start', 24, '24hr set time before grout') ON CONFLICT DO NOTHING;
  END IF;
  IF v_tile_wall IS NOT NULL AND v_grout IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, lag_hours, notes) VALUES (v_grout, v_tile_wall, 'finish_to_start', 24, '24hr set time before grout') ON CONFLICT DO NOTHING;
  END IF;
  IF v_tile_floor IS NOT NULL AND v_install_toilet IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_install_toilet, v_tile_floor, 'finish_to_start', 'Floor tile before toilet') ON CONFLICT DO NOTHING;
  END IF;

  -- Electrical finish after paint
  IF v_paint_2 IS NOT NULL AND v_outlets IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_outlets, v_paint_2, 'finish_to_start', 'Paint before outlets') ON CONFLICT DO NOTHING;
  END IF;
  IF v_paint_ceiling IS NOT NULL AND v_lights IS NOT NULL THEN
    INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type, notes) VALUES (v_lights, v_paint_ceiling, 'finish_to_start', 'Paint ceiling before lights') ON CONFLICT DO NOTHING;
  END IF;

END $$;

-- ============================================
-- PART 7: SEED SCHEDULING CONSTRAINTS
-- ============================================

INSERT INTO public.scheduling_constraints (name, description, rule_type, rule_definition, priority, is_active) VALUES
('Max 8 work hours per day', 'Workers should not exceed 8 hours per day', 'capacity', '{"max_hours_per_day": 8}'::jsonb, 100, true),
('Standard work hours', 'Work typically between 7 AM and 5 PM', 'temporal', '{"work_hours": {"start": "07:00", "end": "17:00"}}'::jsonb, 90, true),
('No Sunday work', 'Default: no work scheduled on Sundays', 'calendar', '{"excluded_days": ["sunday"]}'::jsonb, 80, true),
('Inspection 48-hour lead time', 'Inspections require 48-hour advance scheduling', 'temporal', '{"task_contains": "inspection", "min_lead_time_hours": 48}'::jsonb, 95, true),
('Countertop fabrication time', 'Custom countertops require 7 days for fabrication after template', 'material', '{"task": "Install countertops", "depends_on": "Template countertops", "min_gap_days": 7}'::jsonb, 100, true),
('Cabinet lead time', 'Custom cabinets require 2-4 weeks lead time', 'material', '{"task_contains": "cabinet", "lead_time_weeks_min": 2, "lead_time_weeks_max": 4}'::jsonb, 90, true),
('Drywall mud drying', 'Allow 24 hours between drywall mud coats', 'dependency', '{"task_contains": "mud", "min_gap_hours": 24}'::jsonb, 100, true),
('Paint drying between coats', 'Allow 4 hours between paint coats', 'dependency', '{"task_contains": "paint", "min_gap_hours": 4}'::jsonb, 95, true),
('Tile set time before grout', 'Allow 24 hours for tile to set before grouting', 'dependency', '{"after_task_contains": "tile", "before_task_contains": "grout", "min_gap_hours": 24}'::jsonb, 100, true),
('Grout cure before sealing', 'Allow 48 hours for grout to cure before sealing', 'dependency', '{"after_task_contains": "grout", "before_task_contains": "seal", "min_gap_hours": 48}'::jsonb, 95, true),
('Waterproofing cure time', 'Waterproofing membrane needs 24 hours to cure', 'dependency', '{"after_task_contains": "waterproof", "min_gap_hours": 24}'::jsonb, 100, true),
('Permit processing time', 'Allow 3-5 business days for permit approval', 'temporal', '{"task": "Pull permits", "processing_time_business_days_min": 3, "processing_time_business_days_max": 5}'::jsonb, 90, true)
ON CONFLICT DO NOTHING;

-- ============================================
-- PART 8: AI-GENERATED SERVICES TABLE
-- For unknown/random service types
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_generated_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What the user asked for
  service_name TEXT NOT NULL,
  original_query TEXT,

  -- AI-generated data
  generated_tasks JSONB NOT NULL,
  -- Example: [
  --   {"name": "Site assessment", "duration_hours": 0.5, "order": 1},
  --   {"name": "Main work", "duration_hours": 2, "order": 2}
  -- ]

  estimated_duration_hours NUMERIC,
  complexity TEXT CHECK (complexity IN ('simple', 'medium', 'complex')) DEFAULT 'medium',

  -- Confidence & learning
  confidence_score NUMERIC DEFAULT 0.7 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  times_used INTEGER DEFAULT 1,
  times_modified INTEGER DEFAULT 0,

  -- Promotion tracking (if used enough, can become permanent)
  is_promoted BOOLEAN DEFAULT FALSE,

  -- Metadata
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS idx_ai_services_name ON public.ai_generated_services(service_name);
CREATE INDEX IF NOT EXISTS idx_ai_services_times_used ON public.ai_generated_services(times_used);

-- RLS
ALTER TABLE public.ai_generated_services ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view AI-generated services (shared knowledge)
CREATE POLICY "AI services viewable by authenticated"
  ON public.ai_generated_services FOR SELECT
  TO authenticated USING (TRUE);

-- Users can create AI-generated services
CREATE POLICY "Users can create AI services"
  ON public.ai_generated_services FOR INSERT
  TO authenticated WITH CHECK (TRUE);

-- Users can update usage counts
CREATE POLICY "Users can update AI services"
  ON public.ai_generated_services FOR UPDATE
  TO authenticated USING (TRUE);

-- Trigger for updated_at
CREATE TRIGGER ai_generated_services_updated
  BEFORE UPDATE ON public.ai_generated_services
  FOR EACH ROW EXECUTE FUNCTION update_modified_timestamp();

COMMENT ON TABLE public.ai_generated_services IS 'Stores AI-generated task templates for unknown service types';

-- ============================================
-- DONE!
-- ============================================
-- Tables created: 6
-- Task templates: ~60
-- Dependencies: ~30
-- Constraints: 12
-- Project types: 6
-- AI fallback: 1 table for unknown services
