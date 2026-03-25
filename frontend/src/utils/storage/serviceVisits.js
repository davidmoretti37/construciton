/**
 * Service Visits API utilities
 * Calls backend API endpoints (not direct Supabase) since visits have business logic
 */

import { EXPO_PUBLIC_BACKEND_URL } from '@env';
import { supabase } from '../../lib/supabase';

const API_URL = EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export async function fetchDailyVisits(date) {
  const headers = await getAuthHeaders();
  const dateParam = date || new Date().toISOString().split('T')[0];
  const response = await fetch(`${API_URL}/api/service-visits/daily?date=${dateParam}`, {
    method: 'GET',
    headers,
  });
  if (!response.ok) throw new Error(`Failed to fetch daily visits: ${response.status}`);
  return response.json();
}

export async function startVisit(visitId) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-visits/${visitId}/start`, {
    method: 'POST',
    headers,
  });
  if (!response.ok) throw new Error(`Failed to start visit: ${response.status}`);
  return response.json();
}

export async function completeVisit(visitId) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-visits/${visitId}/complete`, {
    method: 'POST',
    headers,
  });
  if (!response.ok) throw new Error(`Failed to complete visit: ${response.status}`);
  return response.json();
}

export async function fetchChecklist(visitId) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-visits/${visitId}/checklist`, {
    method: 'GET',
    headers,
  });
  if (!response.ok) throw new Error(`Failed to fetch checklist: ${response.status}`);
  return response.json();
}

export async function updateChecklistItem(visitId, itemId, updates) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-visits/${visitId}/checklist/${itemId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error(`Failed to update checklist item: ${response.status}`);
  return response.json();
}

export async function addVisitPhoto(visitId, url, caption) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-visits/${visitId}/photos`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ url, caption }),
  });
  if (!response.ok) throw new Error(`Failed to add photo: ${response.status}`);
  return response.json();
}

export async function updateVisit(visitId, updates) {
  const headers = await getAuthHeaders();
  const response = await fetch(`${API_URL}/api/service-visits/${visitId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error(`Failed to update visit: ${response.status}`);
  return response.json();
}
