-- =====================================================
-- NOTIFICATIONS SYSTEM
-- Created: 2025-11-26
-- Purpose: Complete notification system with push support
-- =====================================================

-- =========================
-- TABLE: notifications
-- =========================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Notification content
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'appointment_reminder',
    'daily_report_submitted',
    'project_warning',
    'financial_update',
    'worker_update',
    'system'
  )),

  -- Visual styling
  icon TEXT DEFAULT 'notifications',
  color TEXT DEFAULT '#3B82F6',

  -- Navigation on tap
  action_type TEXT DEFAULT 'navigate',
  action_data JSONB DEFAULT '{}',

  -- State
  read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,

  -- Related entities (for querying/grouping)
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  schedule_event_id UUID REFERENCES schedule_events(id) ON DELETE CASCADE,
  daily_report_id UUID REFERENCES daily_reports(id) ON DELETE CASCADE,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_project ON notifications(project_id);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own notifications" ON notifications;
CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can insert notifications" ON notifications;
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

-- =========================
-- TABLE: notification_preferences
-- =========================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,

  -- Push notification toggles
  push_enabled BOOLEAN DEFAULT true,
  push_appointment_reminders BOOLEAN DEFAULT true,
  push_daily_reports BOOLEAN DEFAULT true,
  push_project_warnings BOOLEAN DEFAULT true,
  push_financial_updates BOOLEAN DEFAULT true,
  push_worker_updates BOOLEAN DEFAULT true,

  -- In-app notification toggles
  inapp_enabled BOOLEAN DEFAULT true,
  inapp_appointment_reminders BOOLEAN DEFAULT true,
  inapp_daily_reports BOOLEAN DEFAULT true,
  inapp_project_warnings BOOLEAN DEFAULT true,
  inapp_financial_updates BOOLEAN DEFAULT true,
  inapp_worker_updates BOOLEAN DEFAULT true,

  -- Reminder timing (minutes before appointment)
  appointment_reminder_minutes INTEGER,
  appointment_reminder_with_travel BOOLEAN DEFAULT true,

  -- Quiet hours
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME DEFAULT '22:00',
  quiet_hours_end TIME DEFAULT '07:00',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own preferences" ON notification_preferences;
CREATE POLICY "Users can manage own preferences"
  ON notification_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================
-- TABLE: push_tokens
-- =========================
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  device_type TEXT CHECK (device_type IN ('ios', 'android', 'web')),
  device_name TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id, expo_push_token)
);

-- RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own tokens" ON push_tokens;
CREATE POLICY "Users can manage own tokens"
  ON push_tokens FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id) WHERE is_active = true;

-- =========================
-- TABLE: scheduled_notifications
-- =========================
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What triggered this
  schedule_event_id UUID REFERENCES schedule_events(id) ON DELETE CASCADE,

  -- When to send
  scheduled_for TIMESTAMPTZ NOT NULL,

  -- Notification content (pre-computed)
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL,
  action_data JSONB DEFAULT '{}',

  -- State
  sent BOOLEAN DEFAULT false,
  sent_at TIMESTAMPTZ,
  cancelled BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_pending
  ON scheduled_notifications(scheduled_for)
  WHERE sent = false AND cancelled = false;
CREATE INDEX IF NOT EXISTS idx_scheduled_notifications_event
  ON scheduled_notifications(schedule_event_id);

ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own scheduled notifications" ON scheduled_notifications;
CREATE POLICY "Users can view own scheduled notifications"
  ON scheduled_notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can manage scheduled notifications" ON scheduled_notifications;
CREATE POLICY "Service role can manage scheduled notifications"
  ON scheduled_notifications FOR ALL
  WITH CHECK (true);
