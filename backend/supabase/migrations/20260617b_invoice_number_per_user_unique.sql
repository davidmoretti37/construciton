-- =====================================================
-- FIX: invoice_number was UNIQUE globally, not per-user.
--
-- Invoice numbers are generated per business starting at INV-{year}-001
-- (handlers generate per-user sequences). But invoices_invoice_number_key
-- enforced GLOBAL uniqueness, so the FIRST invoice every new user creates
-- (INV-{year}-001) collided with every other user's first invoice — a 23505
-- unique_violation that broke invoice creation for all but the first user.
--
-- estimates already use UNIQUE(user_id, estimate_number) and change_orders use
-- UNIQUE(project_id, co_number); invoices was the lone inconsistency. This
-- aligns invoices to per-user uniqueness. Verified zero existing
-- (user_id, invoice_number) duplicates before applying.
--
-- Idempotent: drops both possible constraint names before adding.
-- =====================================================

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_number_key;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_user_invoice_number_unique;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_user_invoice_number_unique UNIQUE (user_id, invoice_number);
