-- =====================================================
-- INVOICE REMINDER LOG
-- One row per (invoice, reminder_type) the cron has emitted.
-- Used to make the invoice-reminder cron idempotent: each
-- tier (pre_due_3, due_today, overdue_7, overdue_14, overdue_30)
-- fires exactly once per invoice.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.invoice_reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN (
    'pre_due_3', 'due_today', 'overdue_7', 'overdue_14', 'overdue_30'
  )),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  email_to TEXT,
  delivery_id TEXT,
  delivery_status TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_reminder_log_unique
  ON public.invoice_reminder_log(invoice_id, reminder_type);

CREATE INDEX IF NOT EXISTS idx_invoice_reminder_log_invoice
  ON public.invoice_reminder_log(invoice_id);

ALTER TABLE public.invoice_reminder_log ENABLE ROW LEVEL SECURITY;

-- Owners can view reminder history for their own invoices.
CREATE POLICY "Owners view invoice reminder log" ON public.invoice_reminder_log
  FOR SELECT USING (
    invoice_id IN (SELECT id FROM public.invoices WHERE user_id = auth.uid())
  );
