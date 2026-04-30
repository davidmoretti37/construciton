/**
 * Client Portal API Service
 * Calls backend portal endpoints using Supabase Auth Bearer tokens.
 * Used by client role screens in the mobile app.
 */

import { API_URL } from '../config/api';
import { supabase } from '../lib/supabase';

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  };
};

const portalFetch = async (path, options = {}, _retries = 0) => {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/portal${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  // Auto-retry on rate limit (429) with backoff
  if (res.status === 429 && _retries < 3) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
    const delay = Math.max(retryAfter * 1000, (_retries + 1) * 2000);
    await new Promise(r => setTimeout(r, delay));
    return portalFetch(path, options, _retries + 1);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  return res.json();
};

// Dashboard
export const fetchDashboard = () => portalFetch('/dashboard');

// Projects
export const fetchProject = (projectId) => portalFetch(`/projects/${projectId}`);
export const fetchProjectPhotos = (projectId) => portalFetch(`/projects/${projectId}/photos`);
export const fetchProjectCalendar = (projectId, start, end) => portalFetch(`/projects/${projectId}/calendar?start=${start}&end=${end}`);
export const fetchProjectActivity = (projectId) => portalFetch(`/projects/${projectId}/activity`);
export const fetchProjectSummaries = (projectId) => portalFetch(`/projects/${projectId}/summaries`);

// Money
export const fetchMoneySummary = (projectId) => portalFetch(`/projects/${projectId}/money-summary`);

// Unified billing rollup (estimates + draws + COs + invoices)
export const fetchProjectBilling = (projectId) => portalFetch(`/projects/${projectId}/billing`);

// Documents shared with the client (with signed download URLs)
export const fetchProjectDocuments = (projectId) => portalFetch(`/projects/${projectId}/documents`);

// Approval events feed (sent / signed / approved / paid history)
export const fetchProjectApprovals = (projectId) => portalFetch(`/projects/${projectId}/approvals`);

// Change Orders
export const fetchChangeOrders = (projectId) => portalFetch(`/projects/${projectId}/change-orders`);
export const respondToChangeOrder = (coId, action, name, reason) =>
  portalFetch(`/change-orders/${coId}/respond`, {
    method: 'POST',
    body: JSON.stringify({ action, name, reason }),
  });

// Invoices
export const fetchProjectInvoices = (projectId) => portalFetch(`/projects/${projectId}/invoices`);
export const fetchProjectMilestones = (projectId) => portalFetch(`/projects/${projectId}/milestones`);
export const fetchProjectDraws = (projectId) => portalFetch(`/projects/${projectId}/draws`);
export const payInvoice = (invoiceId) => portalFetch(`/invoices/${invoiceId}/pay`, { method: 'POST' });
export const createPaymentIntent = (invoiceId) => portalFetch(`/invoices/${invoiceId}/create-payment-intent`, { method: 'POST' });

// Estimates
export const fetchProjectEstimates = (projectId) => portalFetch(`/projects/${projectId}/estimates`);
export const respondToEstimate = (estimateId, response) =>
  portalFetch(`/estimates/${estimateId}/respond`, {
    method: 'PATCH',
    body: JSON.stringify(response),
  });

// Messages
export const fetchMessages = (projectId) => portalFetch(`/projects/${projectId}/messages`);
export const sendMessage = (projectId, content) =>
  portalFetch(`/projects/${projectId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });

// Client Requests
export const fetchRequests = (projectId) => portalFetch(`/projects/${projectId}/requests`);
export const createRequest = (projectId, request) =>
  portalFetch(`/projects/${projectId}/requests`, {
    method: 'POST',
    body: JSON.stringify(request),
  });

// Services
export const fetchServices = () => portalFetch('/services');
export const fetchServiceDetail = (serviceId) => portalFetch(`/services/${serviceId}`);

// Branding
export const fetchBranding = () => portalFetch('/branding');

// Rating
export const rateProject = (projectId, rating) =>
  portalFetch(`/projects/${projectId}/rate`, {
    method: 'POST',
    body: JSON.stringify(rating),
  });
