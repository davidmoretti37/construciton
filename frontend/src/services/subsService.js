/**
 * GC-side Subs API client.
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
// Subs
// =============================================================================

export const listSubs = async () => {
  const json = await authedFetch('/api/subs');
  return json.subs || [];
};

export const addSub = (payload) =>
  authedFetch('/api/subs', { method: 'POST', body: JSON.stringify(payload) });

export const getSub = (id) =>
  authedFetch(`/api/subs/${id}`);

export const updateSub = (id, updates) =>
  authedFetch(`/api/subs/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });

export const requestDocFromSub = (id, docType) =>
  authedFetch(`/api/subs/${id}/request-doc`, {
    method: 'POST',
    body: JSON.stringify({ doc_type: docType }),
  });

// =============================================================================
// Engagements
// =============================================================================

export const listEngagements = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  const json = await authedFetch(`/api/engagements${qs ? '?' + qs : ''}`);
  return json.engagements || [];
};

export const createEngagement = (payload) =>
  authedFetch('/api/engagements', { method: 'POST', body: JSON.stringify(payload) });

export const getEngagement = (id) =>
  authedFetch(`/api/engagements/${id}`);

export const updateEngagement = (id, updates) =>
  authedFetch(`/api/engagements/${id}`, { method: 'PATCH', body: JSON.stringify(updates) });

export const createSubcontract = (engagementId, payload) =>
  authedFetch(`/api/engagements/${engagementId}/subcontracts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const listEngagementInvoices = async (id) => {
  const json = await authedFetch(`/api/engagements/${id}/invoices`);
  return json.invoices || [];
};

export const recordPayment = (id, payload) =>
  authedFetch(`/api/engagements/${id}/payments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const getEngagementBalance = (id) =>
  authedFetch(`/api/engagements/${id}/balance`);

// =============================================================================
// Compliance
// =============================================================================

export const listComplianceDocs = async (subOrgId) => {
  const json = await authedFetch(
    `/api/compliance/documents?sub_organization_id=${encodeURIComponent(subOrgId)}`
  );
  return json.documents || [];
};

export const recordComplianceDoc = (payload) =>
  authedFetch('/api/compliance/documents', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

// =============================================================================
// Bidding
// =============================================================================

export const createBidRequest = (payload) =>
  authedFetch('/api/bid-requests', { method: 'POST', body: JSON.stringify(payload) });

export const listBidRequests = async (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  const json = await authedFetch(`/api/bid-requests${qs ? '?' + qs : ''}`);
  return json.bid_requests || [];
};

export const getBidRequest = (id) =>
  authedFetch(`/api/bid-requests/${id}`);

export const inviteSubsToBid = (bidRequestId, subOrgIds) =>
  authedFetch(`/api/bid-requests/${bidRequestId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ sub_organization_ids: subOrgIds }),
  });

export const acceptBid = (bidRequestId, bidId) =>
  authedFetch(`/api/bid-requests/${bidRequestId}/accept-bid`, {
    method: 'POST',
    body: JSON.stringify({ bid_id: bidId }),
  });

export const declineBid = (bidRequestId, bidId) =>
  authedFetch(`/api/bid-requests/${bidRequestId}/decline-bid`, {
    method: 'POST',
    body: JSON.stringify({ bid_id: bidId }),
  });
