-- =====================================================
-- CLIENT PORTAL MIGRATION
-- Adds client portal infrastructure: sessions, settings,
-- branding, approvals, requests, summaries, materials,
-- ratings, and blackout dates.
-- =====================================================

-- =====================================================
-- 1. CLIENT SESSIONS (magic-link auth)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.client_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  session_token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_client_sessions_token ON public.client_sessions(session_token);
CREATE INDEX idx_client_sessions_client ON public.client_sessions(client_id);
CREATE INDEX idx_client_sessions_expires ON public.client_sessions(expires_at);

-- =====================================================
-- 2. CLIENT PORTAL SETTINGS (per-project visibility)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.client_portal_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  show_phases BOOLEAN DEFAULT false,
  show_photos BOOLEAN DEFAULT false,
  show_budget BOOLEAN DEFAULT false,
  show_daily_logs BOOLEAN DEFAULT false,
  show_documents BOOLEAN DEFAULT false,
  show_messages BOOLEAN DEFAULT true,
  show_site_activity BOOLEAN DEFAULT false,
  weekly_summary_enabled BOOLEAN DEFAULT false,
  invoice_reminders BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_portal_settings_project ON public.client_portal_settings(project_id);
CREATE INDEX idx_portal_settings_owner ON public.client_portal_settings(owner_id);

-- =====================================================
-- 3. CLIENT PORTAL BRANDING (per-owner)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.client_portal_branding (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#2563eb',
  accent_color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 4. APPROVAL EVENTS (audit trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.approval_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('estimate', 'invoice', 'phase', 'change_order', 'material_selection')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('sent', 'viewed', 'approved', 'rejected', 'changes_requested', 'signed_off', 'paid')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('owner', 'client')),
  actor_id UUID NOT NULL,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_approval_events_project ON public.approval_events(project_id);
CREATE INDEX idx_approval_events_entity ON public.approval_events(entity_type, entity_id);
CREATE INDEX idx_approval_events_created ON public.approval_events(created_at DESC);

-- =====================================================
-- 5. CLIENT REQUESTS (issues, changes, warranty)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.client_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('issue', 'change_request', 'question', 'warranty')),
  title TEXT NOT NULL,
  description TEXT,
  photos JSONB DEFAULT '[]',
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  owner_response TEXT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_client_requests_project ON public.client_requests(project_id);
CREATE INDEX idx_client_requests_client ON public.client_requests(client_id);
CREATE INDEX idx_client_requests_status ON public.client_requests(status);

-- =====================================================
-- 6. AI WEEKLY SUMMARIES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.ai_weekly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  summary_text TEXT NOT NULL,
  highlights JSONB DEFAULT '[]',
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent')),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_weekly_summaries_project ON public.ai_weekly_summaries(project_id);
CREATE UNIQUE INDEX idx_weekly_summaries_unique_week ON public.ai_weekly_summaries(project_id, week_start);

-- =====================================================
-- 7. MATERIAL SELECTIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.material_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  options JSONB NOT NULL DEFAULT '[]',
  selected_option_index INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'selected', 'confirmed')),
  due_date DATE,
  client_notes TEXT,
  selected_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_material_selections_project ON public.material_selections(project_id);
CREATE INDEX idx_material_selections_client ON public.material_selections(client_id);
CREATE INDEX idx_material_selections_status ON public.material_selections(status);

-- =====================================================
-- 8. SATISFACTION RATINGS
-- =====================================================
CREATE TABLE IF NOT EXISTS public.satisfaction_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES public.project_phases(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  is_project_final BOOLEAN DEFAULT false,
  google_review_prompted BOOLEAN DEFAULT false,
  google_review_clicked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_satisfaction_project ON public.satisfaction_ratings(project_id);
CREATE UNIQUE INDEX idx_satisfaction_unique ON public.satisfaction_ratings(
  project_id,
  client_id,
  COALESCE(phase_id, '00000000-0000-0000-0000-000000000000'::UUID)
);

-- =====================================================
-- 9. CLIENT BLACKOUT DATES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.client_blackout_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  blackout_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_blackout_unique ON public.client_blackout_dates(project_id, blackout_date);

-- =====================================================
-- 10. TABLE ALTERATIONS
-- =====================================================

-- clients.user_id must be nullable (portal-only clients don't need Supabase Auth accounts)
ALTER TABLE public.clients ALTER COLUMN user_id DROP NOT NULL;

-- messages: allow client senders (portal clients don't have auth.users rows)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS client_sender_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;
ALTER TABLE public.messages ALTER COLUMN sender_id DROP NOT NULL;

-- =====================================================
-- 11. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.client_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_portal_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_weekly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.satisfaction_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_blackout_dates ENABLE ROW LEVEL SECURITY;

-- Portal settings: owners manage their own
CREATE POLICY "Owners manage portal settings" ON public.client_portal_settings
  FOR ALL USING (owner_id = auth.uid());

-- Branding: owners manage their own
CREATE POLICY "Owners manage portal branding" ON public.client_portal_branding
  FOR ALL USING (owner_id = auth.uid());

-- Approval events: owners view their project events
CREATE POLICY "Owners view approval events" ON public.approval_events
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Owners insert approval events" ON public.approval_events
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- Client requests: owners view/manage for their projects
CREATE POLICY "Owners manage client requests" ON public.client_requests
  FOR ALL USING (owner_id = auth.uid());

-- Weekly summaries: owners manage for their projects
CREATE POLICY "Owners manage weekly summaries" ON public.ai_weekly_summaries
  FOR ALL USING (owner_id = auth.uid());

-- Material selections: owners manage for their projects
CREATE POLICY "Owners manage material selections" ON public.material_selections
  FOR ALL USING (owner_id = auth.uid());

-- Satisfaction ratings: owners view for their projects
CREATE POLICY "Owners view satisfaction ratings" ON public.satisfaction_ratings
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- Blackout dates: owners view for their projects
CREATE POLICY "Owners view blackout dates" ON public.client_blackout_dates
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- =====================================================
-- 12. UPDATED_AT TRIGGERS
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_client_portal_settings_updated_at
  BEFORE UPDATE ON public.client_portal_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_portal_branding_updated_at
  BEFORE UPDATE ON public.client_portal_branding
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_requests_updated_at
  BEFORE UPDATE ON public.client_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_material_selections_updated_at
  BEFORE UPDATE ON public.material_selections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
