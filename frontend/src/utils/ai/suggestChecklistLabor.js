import { supabase } from '../../lib/supabase';
import { API_URL as BACKEND_URL } from '../../config/api';

/**
 * Call the backend AI helper to suggest daily checklist items + labor roles
 * for the project the user is currently configuring.
 *
 * @param {object} params - { projectName, services?, phases? }
 * @returns {Promise<{ checklist_items: Array, labor_roles: Array, source: string } | { error: string }>}
 */
export const suggestChecklistAndLabor = async ({ projectName, services = [], phases = [] }) => {
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
        : { description: s.description || s.name || '', amount: s.amount || 0 })
      .filter(s => typeof s === 'string' ? s.trim() : (s.description || '').trim());

    const cleanedPhases = (phases || []).map(p => ({
      name: p.name || '',
      tasks: Array.isArray(p.tasks)
        ? p.tasks.map(t => typeof t === 'string' ? t : (t.description || '')).filter(Boolean)
        : [],
    }));

    const response = await fetch(`${BACKEND_URL}/api/ai/suggest-checklist-labor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        projectName: String(projectName).trim(),
        services: cleanedServices,
        phases: cleanedPhases,
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
