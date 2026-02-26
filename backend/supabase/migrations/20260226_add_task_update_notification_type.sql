-- Add task_update notification type and preference columns
-- This supports notifications for task assignments and updates

-- Drop and recreate the CHECK constraint to include task_update
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'appointment_reminder',
    'daily_report_submitted',
    'project_warning',
    'financial_update',
    'worker_update',
    'system',
    'task_update'
  ));

-- Add preference columns for task updates
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS push_task_updates BOOLEAN DEFAULT true;
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS inapp_task_updates BOOLEAN DEFAULT true;
