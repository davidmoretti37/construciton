/**
 * Sub Portal API client.
 *
 * All requests authenticate via the standard Supabase JWT (req.user is the
 * sub's auth.users.id). Magic-link single-purpose pages use the public
 * /api/sub-action/* endpoints separately.
 */

import { API_URL } from '../config/api';
import { supabase } from '../lib/supabase';

async function authedFetch(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch(`${API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

// =============================================================================
// Profile (sub's own data)
// =============================================================================

export const getMe = () => authedFetch('/api/sub-portal/me');

export const updateMe = (updates) =>
  authedFetch('/api/sub-portal/me', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });

// =============================================================================
// Documents
// =============================================================================

export const listMyDocuments = async (subOrganizationId) => {
  const json = await authedFetch(`/api/compliance/documents?sub_organization_id=${encodeURIComponent(subOrganizationId)}`);
  return json.documents || [];
};

export const uploadDocumentBlob = (payload) =>
  authedFetch('/api/compliance/documents/upload-blob', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const getDocumentSignedUrl = (id) =>
  authedFetch(`/api/compliance/documents/${id}/url`);

// =============================================================================
// Engagements / bids / invoices
// =============================================================================

export const listMyEngagements = async () => {
  const json = await authedFetch('/api/sub-portal/engagements');
  return json.engagements || [];
};

export const listMyBids = async () => {
  const json = await authedFetch('/api/sub-portal/bids');
  return json;
};

export const submitBid = (payload) =>
  authedFetch('/api/sub-portal/bids', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const listMyInvoices = async () => {
  const json = await authedFetch('/api/sub-portal/invoices');
  return json.invoices || [];
};

export const createInvoice = (payload) =>
  authedFetch('/api/sub-portal/invoices', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const sendInvoice = (id) =>
  authedFetch(`/api/sub-portal/invoices/${id}/send`, { method: 'POST' });

// =============================================================================
// Public token-gated (no auth)
// =============================================================================

export const redeemActionToken = async (token) => {
  const res = await fetch(`${API_URL}/api/sub-action/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Invalid token');
  return json;
};

export const publicUploadDoc = async (payload) => {
  const res = await fetch(`${API_URL}/api/sub-action/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Upload failed');
  return json;
};
