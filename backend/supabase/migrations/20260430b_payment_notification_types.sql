-- =====================================================
-- Add payment-related notification types
-- =====================================================
-- The Stripe webhook handlers insert these on:
--   account.updated → payments_active        (Connect onboarding done)
--   payment_intent.succeeded → invoice_paid  (client paid an invoice)
-- Both rows were previously failing the CHECK constraint silently.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- Existing
    'appointment_reminder',
    'daily_report_submitted',
    'project_warning',
    'financial_update',
    'worker_update',
    'system',
    'bank_reconciliation',
    'task_update',
    'sub_doc_uploaded', 'sub_doc_expiring', 'sub_doc_expired', 'sub_doc_requested',
    'sub_bid_invitation', 'sub_bid_submitted', 'sub_bid_accepted', 'sub_bid_declined',
    'sub_contract_sent', 'sub_contract_signed',
    'sub_invoice_sent', 'sub_payment_received',
    'sub_engagement_status_changed', 'sub_upgrade_invite',
    'draw_ready', 'draw_stale',
    'invoice_overdue',
    'co_response_received', 'co_pending_response',
    -- NEW: payment receiving
    'invoice_paid',
    'invoice_partial_payment',
    'payments_active'
  ));
