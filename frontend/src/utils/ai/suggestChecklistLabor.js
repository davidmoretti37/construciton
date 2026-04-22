import { supabase } from '../../lib/supabase';
import { API_URL as BACKEND_URL } from '../../config/api';

/**
 * Call the backend AI helper to suggest RECURRING daily checklist items +
 * labor roles for the project the user is currently configuring.
 *
 * Note: `phases` was intentionally removed from the request — sending phase
 * tasks to the model caused it to echo phase-completion milestones back as
 * "daily" checks (e.g. "All plumbing pressure tested"). The backend now
 * uses only the project name and a coarse service summary as context.
 *
 * @param {object} params - { projectName, services? }
 * @returns {Promise<{ checklist_items: Array, labor_roles: Array, source: string } | { error: string }>}
 */
export const suggestChecklistAndLabor = async ({ projectName, services = [] }) => {
  if (!projectName || !String(projectName).trim()) {
    return { error: 'Project name is required to generate suggestions.' };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      return { error: 'You must be signed in to use AI suggestions.' };
    }

    const cleanedServices = (services || [])
      .map(s => typeof s === 'string'
        ? s
        : { description: s.description || s.name || '' })
      .filter(s => typeof s === 'string' ? s.trim() : (s.description || '').trim());

    const response = await fetch(`${BACKEND_URL}/api/ai/suggest-checklist-labor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        projectName: String(projectName).trim(),
        services: cleanedServices,
      }),
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const j = await response.json();
        detail = j.error || detail;
      } catch (_) {}
      return { error: detail };
    }

    const data = await response.json();
    return {
      checklist_items: Array.isArray(data.checklist_items) ? data.checklist_items : [],
      labor_roles: Array.isArray(data.labor_roles) ? data.labor_roles : [],
      source: data.source || 'unknown',
    };
  } catch (e) {
    return { error: e.message || 'Failed to reach AI service.' };
  }
};
