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

const portalFetch = async (path, options = {}) => {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}/api/portal${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

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
export const fetchProjectActivity = (projectId) => portalFetch(`/projects/${projectId}/activity`);
export const fetchProjectSummaries = (projectId) => portalFetch(`/projects/${projectId}/summaries`);

// Invoices
export const fetchProjectInvoices = (projectId) => portalFetch(`/projects/${projectId}/invoices`);
export const fetchProjectMilestones = (projectId) => portalFetch(`/projects/${projectId}/milestones`);
export const payInvoice = (invoiceId) => portalFetch(`/invoices/${invoiceId}/pay`, { method: 'POST' });

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
