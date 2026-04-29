// Change Order persistence — mirrors estimates.js / invoices.js patterns.
// All writes go through the backend portalOwner routes (which use service-role
// to bypass RLS and run the proper validation/cascade hooks).

import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from './auth';
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
  if (!res.ok) {
    const msg = body?.error || `Request failed: ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

/**
 * Create a draft change order. Called from the chat preview card's Save button.
 * Accepts the camelCase shape the agent emits and remaps to snake_case for the API.
 */
export const saveChangeOrder = async (data) => {
  if (!data?.project_id) throw new Error('Change order needs a project_id');
  if (!data?.title) throw new Error('Change order needs a title');
  await getCurrentUserId(); // ensures session

  const body = {
    project_id: data.project_id,
    title: data.title,
    description: data.description || null,
    schedule_impact_days: Number(data.scheduleImpactDays ?? data.schedule_impact_days ?? 0),
    tax_rate: Number(data.taxRate ?? data.tax_rate ?? 0),
    signature_required: !!(data.signatureRequired ?? data.signature_required ?? false),
    billing_strategy: data.billingStrategy ?? data.billing_strategy ?? 'invoice_now',
    line_items: (data.lineItems || data.line_items || []).map((li, idx) => ({
      description: li.description || '',
      quantity: Number(li.quantity ?? 1),
      unit: li.unit || null,
      unit_price: Number(li.unit_price ?? li.unitPrice ?? 0),
      category: li.category || null,
      position: idx + 1,
    })),
  };

  return authedFetch('/api/portal-admin/change-orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};

export const updateChangeOrder = async (id, data) => {
  if (!id) throw new Error('No change order id');
  const body = {};
  if (data.title !== undefined) body.title = data.title;
  if (data.description !== undefined) body.description = data.description;
  if (data.scheduleImpactDays !== undefined || data.schedule_impact_days !== undefined) {
    body.schedule_impact_days = Number(data.scheduleImpactDays ?? data.schedule_impact_days);
  }
  if (data.taxRate !== undefined || data.tax_rate !== undefined) {
    body.tax_rate = Number(data.taxRate ?? data.tax_rate);
  }
  if (data.signatureRequired !== undefined || data.signature_required !== undefined) {
    body.signature_required = !!(data.signatureRequired ?? data.signature_required);
  }
  if (data.billingStrategy !== undefined || data.billing_strategy !== undefined) {
    body.billing_strategy = data.billingStrategy ?? data.billing_strategy;
  }
  if (Array.isArray(data.lineItems) || Array.isArray(data.line_items)) {
    body.line_items = (data.lineItems || data.line_items).map((li, idx) => ({
      description: li.description || '',
      quantity: Number(li.quantity ?? 1),
      unit: li.unit || null,
      unit_price: Number(li.unit_price ?? li.unitPrice ?? 0),
      category: li.category || null,
      position: idx + 1,
    }));
  }
  return authedFetch(`/api/portal-admin/change-orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
};

export const sendChangeOrder = async (id) => {
  if (!id) throw new Error('No change order id');
  return authedFetch(`/api/portal-admin/change-orders/${id}/send`, { method: 'POST' });
};

export const recallChangeOrder = async (id) => {
  if (!id) throw new Error('No change order id');
  return authedFetch(`/api/portal-admin/change-orders/${id}/recall`, { method: 'POST' });
};

export const voidChangeOrder = async (id, reason) => {
  if (!id) throw new Error('No change order id');
  return authedFetch(`/api/portal-admin/change-orders/${id}/void`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason || null }),
  });
};

export const fetchChangeOrders = async (projectId) => {
  const path = projectId
    ? `/api/portal-admin/change-orders?project_id=${encodeURIComponent(projectId)}`
    : '/api/portal-admin/change-orders';
  return authedFetch(path);
};

export const getChangeOrder = async (id) => {
  if (!id) return null;
  return authedFetch(`/api/portal-admin/change-orders/${id}`);
};
