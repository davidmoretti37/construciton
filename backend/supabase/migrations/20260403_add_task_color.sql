-- Add color tag to worker_tasks for visual identification by service/trade
ALTER TABLE worker_tasks ADD COLUMN IF NOT EXISTS color TEXT;
