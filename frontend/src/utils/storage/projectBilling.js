// Project Billing — fetcher + action helpers for the unified BillingCard.
// All actions go through backend portalOwner routes so service-role + audit
// + cascade hooks fire consistently.

import { supabase } from '../../lib/supabase';
import { API_URL } from '../../config/api';

async function authedFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error('No auth session');
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) throw new Error(body?.error || `Request failed: ${res.status}`);
  return body;
}

/** Returns { project, counts, action[], upcoming[], history[] } */
export const fetchProjectBilling = (projectId) =>
  authedFetch(`/api/portal-admin/projects/${projectId}/billing`);

// ───── ACTIONS (one-tap from BillingCard or notification) ─────

/** Send a ready draw → generate the invoice, flip status to 'invoiced' */
export const sendDrawNow = async (drawItemId, dueInDays = 30) => {
  // Reuses generate_draw_invoice tool through agent — but for one-tap we go direct
  // via the frontend storage helper that already exists.
  const { generateDrawInvoice } = await import('./projectDraws');
  return generateDrawInvoice(drawItemId, dueInDays);
};

/** Send a polite reminder email for an overdue invoice */
export const nudgeInvoice = (invoiceId) =>
  authedFetch(`/api/portal-admin/invoices/${invoiceId}/nudge`, { method: 'POST' });

/** Resend a CO email to the client (re-fires the original send_change_order email) */
export const resendChangeOrder = async (changeOrderId) => {
  const { sendChangeOrder } = await import('./changeOrders');
  return sendChangeOrder(changeOrderId);
};

/**
 * Bill an approved CO that was set to billing_strategy='project_end' or stuck —
 * generates an invoice for the CO directly. Shortcut for the [Bill] action.
 * Implementation: spawn a one-off invoice with the CO's line items.
 */
export const billChangeOrderNow = (changeOrderId) =>
  authedFetch(`/api/portal-admin/change-orders/${changeOrderId}/bill-now`, { method: 'POST' });
