-- FIX: subPortal.js inserts type='sub_invoice_received' and engagements.js inserts
-- type='sub_invoice_paid', but neither value was in notifications_type_check, so
-- those notifications silently failed (caught in try/catch). GCs never learned of
-- new sub invoices and subs never learned of payment. Add the two missing values.
-- Idempotent: drops + re-adds with the full set (existing values preserved + 2 new).
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'appointment_reminder','daily_report_submitted','project_warning','financial_update',
  'worker_update','system','bank_reconciliation','task_update','sub_doc_uploaded',
  'sub_doc_expiring','sub_doc_expired','sub_doc_requested','sub_bid_invitation',
  'sub_bid_submitted','sub_bid_accepted','sub_bid_declined','sub_contract_sent',
  'sub_contract_signed','sub_invoice_sent','sub_payment_received',
  'sub_engagement_status_changed','sub_upgrade_invite','sub_task_assigned','draw_ready',
  'draw_stale','invoice_overdue','co_response_received','co_pending_response','invoice_paid',
  'invoice_partial_payment','payments_active','project_doc_added',
  'sub_invoice_received','sub_invoice_paid'
));
