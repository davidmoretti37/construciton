/**
 * Service Routes & Billing API utilities
 */

import { supabase } from '../../lib/supabase';
import { API_URL } from '../../config/api';

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

// ============================================================
// ROUTES
// ============================================================

export async function createRoute(name, routeDate, assignedWorkerId) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-routes`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, route_date: routeDate, assigned_worker_id: assignedWorkerId || null }),
  });
  if (!response.ok) throw new Error(`Failed to create route: ${response.status}`);
  return response.json();
}

export async function addStop(routeId, visitId, stopOrder) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-routes/${routeId}/stops`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ visit_id: visitId, stop_order: stopOrder }),
  });
  if (!response.ok) throw new Error(`Failed to add stop: ${response.status}`);
  return response.json();
}

export async function reorderStops(routeId, stops) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-routes/${routeId}/stops`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ stops }),
  });
  if (!response.ok) throw new Error(`Failed to reorder stops: ${response.status}`);
  return response.json();
}

export async function removeStop(routeId, stopId) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-routes/${routeId}/stops/${stopId}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) throw new Error(`Failed to remove stop: ${response.status}`);
  return response.json();
}

// ============================================================
// BILLING
// ============================================================

export async function fetchBillingPreview(planId, from, to) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-plans/${planId}/billing-preview?from=${from}&to=${to}`, {
    method: 'GET',
    headers,
  });
  if (!response.ok) throw new Error(`Failed to fetch billing preview: ${response.status}`);
  return response.json();
}

export async function createInvoiceFromPlan(planId, periodStart, periodEnd, notes) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-plans/${planId}/invoice`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ period_start: periodStart, period_end: periodEnd, notes }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Failed to create invoice: ${response.status}`);
  }
  return response.json();
}
