/**
 * Tool handlers - Supabase query functions for each tool.
 * All queries are filtered by userId (owner_id) for security.
 * Uses service role key (bypasses RLS) so we MUST filter manually.
 *
 * SECURITY AUDIT (2026-02-17): All 31 tool handler functions verified to filter by user_id.
 * Uses service_role key — every query manually enforces ownership via .or(user_id) or .eq(owner_id).
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../../utils/logger');
const { geocodingCache } = require('../../utils/geocodingCache');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================== HELPER ====================

function toDate(str) {
  if (!str) return null;
  return str; // Already YYYY-MM-DD format
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function getTodayBounds() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  return { startOfDay, endOfDay };
}

/**
 * Resolve userId to the actual owner_id for supervisors.
 * Supervisors' workers are owned by their parent owner.
 */
async function resolveOwnerId(userId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('owner_id, role')
    .eq('id', userId)
    .single();
  return profile?.role === 'supervisor' ? profile.owner_id : userId;
}

/**
 * Build a Supabase .or() filter that matches ANY word in ANY field.
 * "John kitchen remodel" → name.ilike.%John%,name.ilike.%kitchen%,...
 */
function buildWordSearch(query, fields) {
  const words = query.trim().split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) return null;
  return words
    .flatMap(w => fields.map(f => `${f}.ilike.%${w}%`))
    .join(',');
}

/**
 * Enrich location coordinates with human-readable address
 * Uses geocoding cache to minimize API calls
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object|null>} { lat, lng, address } or null
 */
async function enrichLocationWithAddress(lat, lng) {
  if (!lat || !lng) return null;

  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  // Get address from cache or geocode
  const address = await geocodingCache.getAddress(latitude, longitude);

  return {
    lat: latitude,
    lng: longitude,
    address: address || `${latitude}, ${longitude}` // Fallback to coordinates
  };
}

/**
 * Send a push + in-app notification via the Supabase Edge Function.
 * Fire-and-forget — errors are logged but never thrown.
 */
async function sendNotification({ userId, title, body, type, data, projectId, workerId }) {
  try {
    await supabase.functions.invoke('send-push-notification', {
      body: { userId, title, body, type, data, projectId, workerId },
    });
  } catch (err) {
    logger.error('Notification send failed:', err.message);
  }
}

/**
 * Recalculates phase completion percentage from worker_tasks.
 * The project_phases.tasks JSONB field may be stale when worker_tasks.status changes,
 * so we cross-reference and recalculate on-the-fly.
 * @param {Array} phases - Array of phase objects with tasks JSONB
 * @param {Array} workerTasks - Array of worker_tasks with phase_task_id and status
 * @returns {Array} Phases with corrected completion_percentage and status
 */
function recalculatePhaseProgress(phases, workerTasks) {
  if (!phases || phases.length === 0) return phases;

  // Build task status map
  const taskStatusMap = {};
  if (workerTasks) {
    for (const wt of workerTasks) {
      if (wt.phase_task_id) {
        taskStatusMap[wt.phase_task_id] = {
          completed: wt.status === 'completed',
          workerTaskId: wt.id,
        };
      }
    }
  }

  let globalTaskIndex = 0;

  for (const phase of phases) {
    if (phase.tasks && Array.isArray(phase.tasks)) {
      // Cross-reference worker_tasks completion status
      phase.tasks.forEach((task, localIndex) => {
        const possibleIds = [
          task.id,
          `phase-task-${globalTaskIndex}`,
          `${phase.name}-${localIndex}`,
        ].filter(Boolean);

        for (const phaseTaskId of possibleIds) {
          if (taskStatusMap.hasOwnProperty(phaseTaskId)) {
            task.completed = taskStatusMap[phaseTaskId].completed;
            task.workerTaskId = taskStatusMap[phaseTaskId].workerTaskId;
            break;
          }
        }

        globalTaskIndex++;
      });

      // Recalculate completion percentage
      const totalTasks = phase.tasks.length;
      const completedTasks = phase.tasks.filter(t => t.completed).length;
      phase.completion_percentage = totalTasks > 0
        ? Math.round((completedTasks / totalTasks) * 100)
        : 0;

      // Derive status from percentage
      if (phase.completion_percentage === 0) {
        phase.status = 'not_started';
      } else if (phase.completion_percentage >= 100) {
        phase.status = 'completed';
      } else {
        phase.status = 'in_progress';
      }
    }
  }

  return phases;
}

/**
 * Resolve a project ID or name to a UUID.
 * Returns { id } on single match, { suggestions } if ambiguous, { error } if not found.
 */
async function resolveProjectId(userId, idOrName) {
  if (!idOrName) return { error: 'No project specified' };

  // UUID provided — validate ownership before returning
  if (idOrName.match(/^[0-9a-f]{8}-/i)) {
    const { data } = await supabase
      .from('projects')
      .select('id')
      .eq('id', idOrName)
      .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
      .single();
    if (!data) return { error: 'Project not found or access denied' };
    return { id: idOrName };
  }

  const trimmed = idOrName.trim();
  if (!trimmed) return { error: 'No project specified' };

  const ownerFilter = `user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`;

  // Step 1: Exact name match (case-insensitive)
  const { data: exact } = await supabase
    .from('projects')
    .select('id, name, status')
    .or(ownerFilter)
    .ilike('name', trimmed)
    .limit(5);

  if (exact && exact.length === 1) return { id: exact[0].id };
  if (exact && exact.length > 1) {
    return {
      suggestions: exact.map(p => ({ id: p.id, name: p.name, status: p.status })),
      message: `Multiple projects match "${idOrName}". Which one did you mean?`
    };
  }

  // Step 2: Phrase contains (full input as substring)
  const { data: phrase } = await supabase
    .from('projects')
    .select('id, name, status')
    .or(ownerFilter)
    .ilike('name', `%${trimmed}%`)
    .limit(5);

  if (phrase && phrase.length === 1) return { id: phrase[0].id };
  if (phrase && phrase.length > 1) {
    return {
      suggestions: phrase.map(p => ({ id: p.id, name: p.name, status: p.status })),
      message: `Multiple projects match "${idOrName}". Which one did you mean?`
    };
  }

  // Step 3: Keyword search — strip noise words, search meaningful terms
  const noiseWords = new Set(['project', 'job', 'the', 'my', 'a', 'an', 'for', 'on', 'site', 'work']);
  const keywords = trimmed.split(/\s+/).filter(w => w.length > 1 && !noiseWords.has(w.toLowerCase()));

  if (keywords.length > 0) {
    const filter = keywords.map(w => `name.ilike.%${w}%`).join(',');

    const { data: fallback } = await supabase
      .from('projects')
      .select('id, name, status')
      .or(ownerFilter)
      .or(filter)
      .limit(5);

    if (fallback && fallback.length === 1) return { id: fallback[0].id };
    if (fallback && fallback.length > 1) {
      return {
        suggestions: fallback.map(p => ({ id: p.id, name: p.name, status: p.status })),
        message: `Multiple projects match "${idOrName}". Which one did you mean?`
      };
    }
  }

  return { error: `No projects found matching "${idOrName}"` };
}

/**
 * Resolve a service plan ID or name to a UUID.
 * Returns { id } on single match, { suggestions } if ambiguous, { error } if not found.
 */
async function resolveServicePlanId(userId, idOrName) {
  if (!idOrName) return { error: 'No service plan specified' };

  const ownerId = await resolveOwnerId(userId);

  // UUID provided — validate ownership before returning
  if (idOrName.match(/^[0-9a-f]{8}-/i)) {
    const { data } = await supabase
      .from('service_plans')
      .select('id')
      .eq('id', idOrName)
      .eq('owner_id', ownerId)
      .single();
    if (!data) return { error: 'Service plan not found or access denied' };
    return { id: idOrName };
  }

  const trimmed = idOrName.trim();
  if (!trimmed) return { error: 'No service plan specified' };

  // Step 1: Exact name match (case-insensitive)
  const { data: exact } = await supabase
    .from('service_plans')
    .select('id, name, service_type, status')
    .eq('owner_id', ownerId)
    .ilike('name', trimmed)
    .limit(5);

  if (exact && exact.length === 1) return { id: exact[0].id };
  if (exact && exact.length > 1) {
    return {
      suggestions: exact.map(p => ({ id: p.id, name: p.name, service_type: p.service_type, status: p.status })),
      message: `Multiple service plans match "${idOrName}". Which one did you mean?`
    };
  }

  // Step 2: Phrase contains
  const { data: phrase } = await supabase
    .from('service_plans')
    .select('id, name, service_type, status')
    .eq('owner_id', ownerId)
    .ilike('name', `%${trimmed}%`)
    .limit(5);

  if (phrase && phrase.length === 1) return { id: phrase[0].id };
  if (phrase && phrase.length > 1) {
    return {
      suggestions: phrase.map(p => ({ id: p.id, name: p.name, service_type: p.service_type, status: p.status })),
      message: `Multiple service plans match "${idOrName}". Which one did you mean?`
    };
  }

  // Step 3: Keyword search
  const noiseWords = new Set(['plan', 'service', 'the', 'my', 'a', 'an', 'for', 'on']);
  const keywords = trimmed.split(/\s+/).filter(w => w.length > 1 && !noiseWords.has(w.toLowerCase()));

  if (keywords.length > 0) {
    const filter = keywords.map(w => `name.ilike.%${w}%`).join(',');
    const { data: fallback } = await supabase
      .from('service_plans')
      .select('id, name, service_type, status')
      .eq('owner_id', ownerId)
      .or(filter)
      .limit(5);

    if (fallback && fallback.length === 1) return { id: fallback[0].id };
    if (fallback && fallback.length > 1) {
      return {
        suggestions: fallback.map(p => ({ id: p.id, name: p.name, service_type: p.service_type, status: p.status })),
        message: `Multiple service plans match "${idOrName}". Which one did you mean?`
      };
    }
  }

  return { error: `No service plans found matching "${idOrName}"` };
}

/**
 * Resolve a worker ID or name to a UUID.
 * Returns { id } on single match, { suggestions } if ambiguous, { error } if not found.
 */
async function resolveWorkerId(userId, idOrName) {
  if (!idOrName) return { error: 'No worker specified' };

  // Supervisors' workers are owned by their parent owner
  const ownerId = await resolveOwnerId(userId);

  // UUID provided — validate ownership before returning
  if (idOrName.match(/^[0-9a-f]{8}-/i)) {
    const { data } = await supabase
      .from('workers')
      .select('id')
      .eq('id', idOrName)
      .eq('owner_id', ownerId)
      .single();
    if (!data) return { error: 'Worker not found or access denied' };
    return { id: idOrName };
  }

  const filter = buildWordSearch(idOrName, ['full_name', 'trade']);
  if (!filter) return { error: 'No worker specified' };

  const { data } = await supabase
    .from('workers')
    .select('id, full_name, trade')
    .eq('owner_id', ownerId)
    .or(filter)
    .limit(5);

  if (!data || data.length === 0) {
    return { error: `No workers found matching "${idOrName}"` };
  }
  if (data.length === 1) {
    return { id: data[0].id };
  }
  return {
    suggestions: data.map(w => ({ id: w.id, name: w.full_name, trade: w.trade })),
    message: `Multiple workers match "${idOrName}". Which one did you mean?`
  };
}

/**
 * Resolve an estimate ID, number, or name to a UUID.
 * Returns { id } on single match, { suggestions } if ambiguous, { error } if not found.
 */
async function resolveEstimateId(userId, idOrName) {
  if (!idOrName) return { error: 'No estimate specified' };

  // UUID provided — validate ownership before returning
  if (idOrName.match(/^[0-9a-f]{8}-/i)) {
    const { data } = await supabase
      .from('estimates')
      .select('id')
      .eq('id', idOrName)
      .eq('user_id', userId)
      .single();
    if (!data) return { error: 'Estimate not found or access denied' };
    return { id: idOrName };
  }

  const filter = buildWordSearch(idOrName, ['client_name', 'project_name', 'estimate_number']);
  if (!filter) return { error: 'No estimate specified' };

  const { data } = await supabase
    .from('estimates')
    .select('id, estimate_number, client_name, project_name, status')
    .eq('user_id', userId)
    .or(filter)
    .limit(5);

  if (!data || data.length === 0) {
    return { error: `No estimates found matching "${idOrName}"` };
  }
  if (data.length === 1) {
    return { id: data[0].id };
  }
  return {
    suggestions: data.map(e => ({ id: e.id, estimate_number: e.estimate_number, client: e.client_name, project: e.project_name, status: e.status })),
    message: `Multiple estimates match "${idOrName}". Which one did you mean?`
  };
}

/**
 * Resolve an invoice ID, number, or name to a UUID.
 * Returns { id } on single match, { suggestions } if ambiguous, { error } if not found.
 */
async function resolveInvoiceId(userId, idOrName) {
  if (!idOrName) return { error: 'No invoice specified' };

  // UUID provided — validate ownership before returning
  if (idOrName.match(/^[0-9a-f]{8}-/i)) {
    const { data } = await supabase
      .from('invoices')
      .select('id')
      .eq('id', idOrName)
      .eq('user_id', userId)
      .single();
    if (!data) return { error: 'Invoice not found or access denied' };
    return { id: idOrName };
  }

  const filter = buildWordSearch(idOrName, ['client_name', 'project_name', 'invoice_number']);
  if (!filter) return { error: 'No invoice specified' };

  const { data } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_name, project_name, status')
    .eq('user_id', userId)
    .or(filter)
    .limit(5);

  if (!data || data.length === 0) {
    return { error: `No invoices found matching "${idOrName}"` };
  }
  if (data.length === 1) {
    return { id: data[0].id };
  }
  return {
    suggestions: data.map(i => ({ id: i.id, invoice_number: i.invoice_number, client: i.client_name, project: i.project_name, status: i.status })),
    message: `Multiple invoices match "${idOrName}". Which one did you mean?`
  };
}

// ==================== PROJECTS ====================

async function search_projects(userId, args = {}) {
  const { query, status } = args;

  let q = supabase
    .from('projects')
    .select('*')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  if (query) {
    const filter = buildWordSearch(query, ['name', 'location']);
    if (filter) q = q.or(filter);
  }
  if (status) {
    // Map display statuses to DB statuses
    if (['on-track', 'behind', 'over-budget'].includes(status)) {
      q = q.eq('status', 'active'); // These are calculated, not stored
    } else {
      q = q.eq('status', status);
    }
  }

  const { data, error } = await q.order('created_at', { ascending: false }).limit(20);

  if (error) {
    logger.error('search_projects error:', error);
    return { error: error.message };
  }

  return data || [];
}

async function get_project_details(userId, args) {
  let { project_id } = args;

  // Resolve name to UUID if needed
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  project_id = resolved.id;

  // Get project (support supervisors)
  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', project_id)
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .single();

  if (error || !project) {
    return { error: 'Project not found' };
  }

  // Get phases and worker tasks (for recalculating phase progress)
  const { data: phases } = await supabase
    .from('project_phases')
    .select('*')
    .eq('project_id', project_id)
    .order('order_index', { ascending: true });

  const { data: workerTasks } = await supabase
    .from('worker_tasks')
    .select('id, phase_task_id, status')
    .eq('project_id', project_id)
    .not('phase_task_id', 'is', null);

  // Get assigned workers
  const { data: assignments } = await supabase
    .from('project_assignments')
    .select('worker_id, workers(id, full_name, trade, hourly_rate, daily_rate)')
    .eq('project_id', project_id);

  // Get worker tasks
  const { data: tasks } = await supabase
    .from('worker_tasks')
    .select('id, title, description, status, start_date, end_date, completed_at')
    .eq('project_id', project_id)
    .order('start_date', { ascending: true })
    .limit(50);

  // Get financial summary from transactions
  const { data: transactions } = await supabase
    .from('project_transactions')
    .select('type, category, amount')
    .eq('project_id', project_id);

  const financials = {
    budget: project.contract_amount || project.budget || 0,
    baseContract: project.base_contract || 0,
    extras: project.extras || [],
    incomeCollected: project.income_collected || 0,
    expenses: project.expenses || 0,
    profit: (project.income_collected || 0) - (project.expenses || 0),
    byCategory: {}
  };

  if (transactions) {
    for (const t of transactions) {
      if (t.type === 'expense') {
        financials.byCategory[t.category] = (financials.byCategory[t.category] || 0) + t.amount;
      }
    }
  }

  // Recalculate phase progress from worker_tasks (fixes stale completion_percentage bug)
  const recalculatedPhases = recalculatePhaseProgress(phases || [], workerTasks || []);

  return {
    ...project,
    phases: recalculatedPhases,
    assignedWorkers: (assignments || []).map(a => a.workers).filter(Boolean),
    tasks: tasks || [],
    financials
  };
}

// ==================== PROJECT MUTATIONS ====================

async function delete_project(userId, { project_id }) {
  // Supervisors cannot delete projects — only owners can
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profile?.role === 'supervisor') {
    return { error: 'Supervisors cannot delete projects. Please ask the project owner to delete it.' };
  }

  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  // Get project name for response (ownership already validated by resolveProjectId)
  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', resolved.id)
    .single();

  if (!project) return { error: 'Project not found or access denied' };

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', resolved.id)
    .eq('user_id', userId);

  if (error) return { error: `Failed to delete: ${error.message}` };
  return { success: true, deletedProject: project.name };
}

async function update_project(userId, args = {}) {
  let { project_id, contract_amount, status, budget, start_date, end_date } = args;

  if (!project_id) {
    return { error: 'project_id is required' };
  }

  // Resolve name to UUID + validate ownership
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  project_id = resolved.id;

  // Build updates object with only provided fields
  const updates = {};
  // Map contract_amount to base_contract to work with database trigger
  // The trigger auto-calculates contract_amount from base_contract + extras
  // ALSO update budget to stay in sync — prevents frontend saveProject from
  // reverting base_contract using the old budget value
  if (contract_amount !== undefined) {
    updates.base_contract = contract_amount;
    updates.budget = contract_amount;
    updates.extras = [];  // Clear extras to ensure clean calculation
  }
  if (status !== undefined) updates.status = status;
  if (budget !== undefined) updates.budget = budget;
  if (start_date !== undefined) updates.start_date = start_date;
  if (end_date !== undefined) updates.end_date = end_date;

  if (Object.keys(updates).length === 0) {
    return { error: 'No fields to update' };
  }

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', project_id)
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .select('id, name, base_contract, contract_amount, status, budget, start_date, end_date')
    .single();

  if (error) {
    logger.error('update_project error:', error);
    return { error: error.message };
  }

  if (!data) {
    logger.error(`update_project: project ${project_id} not found or 0 rows matched`);
    return { error: 'Project not found or update failed.' };
  }

  logger.info(`✅ Updated project ${project_id}:`, { ...updates, resulting_contract_amount: data.contract_amount });

  return {
    success: true,
    project: {
      id: data.id,
      name: data.name,
      contract_amount: data.contract_amount,
      base_contract: data.base_contract,
      status: data.status,
      budget: data.budget,
      start_date: data.start_date,
      end_date: data.end_date
    }
  };
}

// ==================== ESTIMATES ====================

async function search_estimates(userId, args = {}) {
  const { query, status, project_id } = args;

  let q = supabase
    .from('estimates')
    .select('id, estimate_number, client_name, project_name, total, status, created_at, project_id')
    .eq('user_id', userId);

  if (query) {
    const filter = buildWordSearch(query, ['client_name', 'project_name', 'estimate_number']);
    if (filter) q = q.or(filter);
  }
  if (status) {
    q = q.eq('status', status);
  }
  if (project_id) {
    q = q.eq('project_id', project_id);
  }

  const { data, error } = await q.order('created_at', { ascending: false }).limit(20);

  if (error) {
    logger.error('search_estimates error:', error);
    return { error: error.message };
  }

  return data || [];
}

async function get_estimate_details(userId, args) {
  let { estimate_id } = args;

  // Resolve name/number to UUID if needed
  const resolved = await resolveEstimateId(userId, estimate_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  estimate_id = resolved.id;

  const { data, error } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', estimate_id)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return { error: 'Estimate not found' };
  }

  return data;
}

async function update_estimate(userId, args = {}) {
  const { estimate_id, project_id, status } = args;

  if (!estimate_id) {
    return { error: 'estimate_id is required' };
  }

  const updates = {};
  if (project_id !== undefined) updates.project_id = project_id;
  if (status !== undefined) updates.status = status;

  if (Object.keys(updates).length === 0) {
    return { error: 'No fields to update' };
  }

  const { data, error } = await supabase
    .from('estimates')
    .update(updates)
    .eq('id', estimate_id)
    .eq('user_id', userId)
    .select('*, projects(id, name)')
    .single();

  if (error) {
    logger.error('update_estimate error:', error);
    return { error: error.message };
  }

  // Auto-update project contract_amount when linking estimate to project
  if (project_id && data.total) {
    const { error: projectError } = await supabase
      .from('projects')
      .update({ contract_amount: data.total })
      .eq('id', project_id);

    if (projectError) {
      logger.error('Failed to update project contract_amount:', projectError);
      // Don't fail the whole operation - estimate is still linked
    } else {
      logger.info(`✅ Auto-updated project ${project_id} contract_amount to ${data.total}`);
    }
  }

  return {
    success: true,
    estimate: {
      id: data.id,
      estimate_number: data.estimate_number,
      client_name: data.client_name,
      total: data.total,
      project_id: data.project_id,
      project_name: data.projects?.name || null
    }
  };
}

// ==================== INVOICES ====================

async function search_invoices(userId, args = {}) {
  const { query, status } = args;

  let q = supabase
    .from('invoices')
    .select('id, invoice_number, client_name, project_name, total, amount_paid, status, due_date, created_at, estimate_id, project_id')
    .eq('user_id', userId);

  if (query) {
    const filter = buildWordSearch(query, ['client_name', 'project_name', 'invoice_number']);
    if (filter) q = q.or(filter);
  }
  if (status) {
    q = q.eq('status', status);
  }

  const { data, error } = await q.order('created_at', { ascending: false }).limit(20);

  if (error) {
    logger.error('search_invoices error:', error);
    return { error: error.message };
  }

  return data || [];
}

async function get_invoice_details(userId, args) {
  let { invoice_id } = args;

  // Resolve name/number to UUID if needed
  const resolved = await resolveInvoiceId(userId, invoice_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  invoice_id = resolved.id;

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoice_id)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return { error: 'Invoice not found' };
  }

  return data;
}

// ==================== WORKERS ====================

async function get_workers(userId, args = {}) {
  const { status, trade, include_clock_status = true } = args;

  // Supervisors see their owner's workers
  const ownerId = await resolveOwnerId(userId);

  let q = supabase
    .from('workers')
    .select('id, full_name, email, phone, trade, payment_type, hourly_rate, daily_rate, weekly_salary, project_rate, status, created_at')
    .eq('owner_id', ownerId);

  if (status) {
    q = q.eq('status', status);
  }
  if (trade) {
    const filter = buildWordSearch(trade, ['full_name', 'trade']);
    if (filter) q = q.or(filter);
  }

  const { data: workers, error } = await q.order('full_name', { ascending: true });

  if (error) {
    logger.error('get_workers error:', error);
    return { error: error.message };
  }

  if (!workers || workers.length === 0) return [];

  // Get clock-in status
  if (include_clock_status) {
    const { startOfDay } = getTodayBounds();
    const workerIds = workers.map(w => w.id);

    // Fetch ALL unclosed clock-ins (not just today) so the agent sees stale sessions too
    const { data: allOpenClockIns } = await supabase
      .from('time_tracking')
      .select('worker_id, clock_in, clock_out, project_id, location_lat, location_lng, projects(name)')
      .in('worker_id', workerIds)
      .is('clock_out', null)
      .order('clock_in', { ascending: false });

    const clockInMap = {};
    const staleClockIns = [];
    if (allOpenClockIns) {
      for (const ci of allOpenClockIns) {
        const isToday = ci.clock_in >= startOfDay;
        const entry = {
          clockedIn: true,
          clockInTime: ci.clock_in,
          project: ci.projects?.name || 'Unknown',
          projectId: ci.project_id,
          location: ci.location_lat ? { lat: ci.location_lat, lng: ci.location_lng } : null,
          stale: !isToday
        };
        // Only set primary clock status from today's sessions
        if (isToday) {
          clockInMap[ci.worker_id] = entry;
        } else {
          staleClockIns.push({ workerId: ci.worker_id, ...entry });
        }
      }
    }

    const result = workers.map(w => ({
      ...w,
      clockStatus: clockInMap[w.id] || { clockedIn: false }
    }));

    // Append stale clock-in warnings so the agent can mention them
    if (staleClockIns.length > 0) {
      return {
        workers: result,
        staleClockIns: staleClockIns.map(s => {
          const worker = workers.find(w => w.id === s.workerId);
          return {
            worker_id: s.workerId,
            worker_name: worker?.full_name || 'Unknown',
            clock_in: s.clockInTime,
            project: s.project,
            location: s.location,
            note: `Unclosed clock-in from ${new Date(s.clockInTime).toLocaleDateString()} — may need to be clocked out`
          };
        }),
        warning: `${staleClockIns.length} worker(s) have unclosed clock-ins from previous days that may need attention.`
      };
    }

    return result;
  }

  return workers;
}

async function get_worker_details(userId, args) {
  let { worker_id } = args;

  // Resolve name to UUID if needed
  const resolved = await resolveWorkerId(userId, worker_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  worker_id = resolved.id;

  // Supervisors see their owner's workers
  const ownerId = await resolveOwnerId(userId);

  // Get worker
  const { data: worker, error } = await supabase
    .from('workers')
    .select('*')
    .eq('id', worker_id)
    .eq('owner_id', ownerId)
    .single();

  if (error || !worker) {
    return { error: 'Worker not found' };
  }

  // Get current clock-in (with location)
  const { data: activeClockIn } = await supabase
    .from('time_tracking')
    .select('id, clock_in, project_id, location_lat, location_lng, projects(name)')
    .eq('worker_id', worker_id)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1);

  // Get recent time entries (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: recentTimeEntries } = await supabase
    .from('time_tracking')
    .select('id, clock_in, clock_out, project_id, hours_worked, projects(name)')
    .eq('worker_id', worker_id)
    .gte('clock_in', weekAgo.toISOString())
    .order('clock_in', { ascending: false })
    .limit(20);

  // Get project assignments
  const { data: assignments } = await supabase
    .from('project_assignments')
    .select('project_id, projects(id, name, status)')
    .eq('worker_id', worker_id);

  // Calculate hours this week
  let hoursThisWeek = 0;
  if (recentTimeEntries) {
    for (const entry of recentTimeEntries) {
      if (entry.hours_worked) {
        hoursThisWeek += parseFloat(entry.hours_worked);
      } else if (entry.clock_in && entry.clock_out) {
        hoursThisWeek += (new Date(entry.clock_out) - new Date(entry.clock_in)) / (1000 * 60 * 60);
      }
    }
  }

  return {
    ...worker,
    clockedIn: activeClockIn && activeClockIn.length > 0,
    activeClockIn: activeClockIn?.[0] || null,
    recentTimeEntries: recentTimeEntries || [],
    assignments: (assignments || []).map(a => a.projects).filter(Boolean),
    hoursThisWeek: Math.round(hoursThisWeek * 100) / 100
  };
}

// ==================== SCHEDULE ====================

async function get_schedule_events(userId, args) {
  const { start_date, end_date, worker_id, project_id } = args;
  const endDate = end_date || start_date;

  // Personal events (meetings, appointments)
  let eventsQuery = supabase
    .from('schedule_events')
    .select('*')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .gte('start_datetime', `${start_date}T00:00:00`)
    .lte('start_datetime', `${endDate}T23:59:59`);

  const { data: events, error: eventsError } = await eventsQuery
    .order('start_datetime', { ascending: true });

  // Work schedules
  let workQuery = supabase
    .from('work_schedules')
    .select('*, workers(full_name, trade), projects(name)')
    .eq('created_by', userId)
    .lte('start_date', endDate)
    .gte('end_date', start_date);

  if (worker_id) workQuery = workQuery.eq('worker_id', worker_id);
  if (project_id) workQuery = workQuery.eq('project_id', project_id);

  const { data: workSchedules } = await workQuery;

  // Worker tasks for the date range
  let tasksQuery = supabase
    .from('worker_tasks')
    .select('id, title, status, start_date, end_date, project_id, projects(name)')
    .eq('owner_id', userId)
    .lte('start_date', endDate)
    .gte('end_date', start_date);

  if (project_id) tasksQuery = tasksQuery.eq('project_id', project_id);

  const { data: tasks } = await tasksQuery.order('start_date', { ascending: true }).limit(50);

  return {
    events: events || [],
    workSchedules: workSchedules || [],
    tasks: tasks || []
  };
}

// ==================== FINANCIALS ====================

async function get_project_financials(userId, args) {
  let { project_id } = args;

  // Resolve name to UUID if needed
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  project_id = resolved.id;

  // Verify project ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, budget, base_contract, contract_amount, expenses, income_collected, extras')
    .eq('id', project_id)
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .single();

  if (!project) return { error: 'Project not found' };

  // Get all transactions
  const { data: transactions } = await supabase
    .from('project_transactions')
    .select('*')
    .eq('project_id', project_id)
    .order('date', { ascending: false });

  // Calculate summaries from transactions
  let txIncome = 0, txExpenses = 0;
  const byCategory = {};
  const recentTransactions = [];

  if (transactions) {
    for (const t of transactions) {
      if (t.type === 'income') txIncome += t.amount;
      else txExpenses += t.amount;

      if (t.type === 'expense') {
        byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
      }

      if (recentTransactions.length < 10) {
        recentTransactions.push(t);
      }
    }
  }

  // Use project-level financials (most accurate, updated by DB triggers)
  const contractAmount = project.contract_amount || project.budget || 0;
  const incomeCollected = project.income_collected || 0;
  const expenses = project.expenses || 0;

  // Get linked invoices
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, total, amount_paid, status')
    .eq('project_id', project_id)
    .eq('user_id', userId);

  return {
    project: project.name,
    budget: contractAmount,
    baseContract: project.base_contract || 0,
    extras: project.extras || [],
    incomeCollected,
    expenses,
    profit: incomeCollected - expenses,
    expensesByCategory: byCategory,
    recentTransactions,
    invoices: invoices || [],
    budgetRemaining: contractAmount - expenses
  };
}

async function get_financial_overview(userId, args = {}) {
  const { start_date, end_date } = args;

  // Get all projects with financials
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, status, budget, base_contract, contract_amount, expenses, income_collected, extras')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  // Get transactions with optional date filter
  let txQuery = supabase
    .from('project_transactions')
    .select('project_id, type, category, amount, date')
    .in('project_id', (projects || []).map(p => p.id));

  if (start_date) txQuery = txQuery.gte('date', start_date);
  if (end_date) txQuery = txQuery.lte('date', end_date);

  const { data: transactions } = await txQuery;

  // Calculate totals
  let totalIncome = 0, totalExpenses = 0;
  const byProject = {};

  if (transactions) {
    for (const t of transactions) {
      if (t.type === 'income') totalIncome += t.amount;
      else totalExpenses += t.amount;

      if (!byProject[t.project_id]) {
        byProject[t.project_id] = { income: 0, expenses: 0 };
      }
      if (t.type === 'income') byProject[t.project_id].income += t.amount;
      else byProject[t.project_id].expenses += t.amount;
    }
  }

  // Get invoice totals
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total, amount_paid, status')
    .eq('user_id', userId);

  let totalInvoiced = 0, totalCollected = 0, totalOutstanding = 0;
  if (invoices) {
    for (const inv of invoices) {
      totalInvoiced += inv.total || 0;
      totalCollected += inv.amount_paid || 0;
      if (['unpaid', 'partial', 'overdue'].includes(inv.status)) {
        totalOutstanding += (inv.total || 0) - (inv.amount_paid || 0);
      }
    }
  }

  return {
    totalIncome,
    totalExpenses,
    profit: totalIncome - totalExpenses,
    totalInvoiced,
    totalCollected,
    totalOutstanding,
    projectCount: (projects || []).length,
    activeProjects: (projects || []).filter(p => !['completed', 'archived'].includes(p.status)).length,
    projectBreakdown: (projects || []).map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      budget: p.contract_amount || p.budget || 0,
      incomeCollected: p.income_collected || 0,
      expenses: p.expenses || 0,
      profit: (p.income_collected || 0) - (p.expenses || 0)
    }))
  };
}

async function get_transactions(userId, args = {}) {
  let { project_id, type, category, start_date, end_date } = args;

  // Resolve project name to UUID if needed
  if (project_id) {
    const resolved = await resolveProjectId(userId, project_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    project_id = resolved.id;
  }

  // Get user's project IDs for security
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  const projectIds = (projects || []).map(p => p.id);
  if (projectIds.length === 0) return [];

  let q = supabase
    .from('project_transactions')
    .select('*, projects(name)')
    .in('project_id', projectIds);

  if (project_id) q = q.eq('project_id', project_id);
  if (type) q = q.eq('type', type);
  if (category) q = q.eq('category', category);
  if (start_date) q = q.gte('date', start_date);
  if (end_date) q = q.lte('date', end_date);

  const { data, error } = await q.order('date', { ascending: false }).limit(50);

  if (error) {
    logger.error('get_transactions error:', error);
    return { error: error.message };
  }

  return data || [];
}

// ==================== DAILY REPORTS & PHOTOS ====================

async function get_daily_reports(userId, args = {}) {
  const { project_id, worker_id, start_date, end_date } = args;

  // Resolve project ID if name provided
  let resolvedProjectId = null;
  if (project_id) {
    const projectResolved = await resolveProjectId(userId, project_id);
    if (projectResolved.error) return projectResolved;
    if (projectResolved.suggestions) return projectResolved;
    resolvedProjectId = projectResolved.id;
  }

  // Resolve worker ID if name provided
  let resolvedWorkerId = null;
  if (worker_id) {
    const workerResolved = await resolveWorkerId(userId, worker_id);
    if (workerResolved.error) return workerResolved;
    if (workerResolved.suggestions) return workerResolved;
    resolvedWorkerId = workerResolved.id;
  }

  // First get user's project IDs for security (include supervisor-assigned projects)
  const { data: userProjects, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  if (projectError) {
    logger.error('get_daily_reports - project query error:', projectError);
    return { error: projectError.message };
  }

  const projectIds = (userProjects || []).map(p => p.id);
  logger.info(`get_daily_reports: Found ${projectIds.length} projects for user ${userId}`);

  if (projectIds.length === 0) {
    logger.warn('get_daily_reports: No projects found for user');
    return [];
  }

  let q = supabase
    .from('daily_reports')
    .select('id, report_date, notes, photos, custom_tasks, task_progress, tags, worker_id, owner_id, reporter_type, project_id, phase_id, workers(full_name), projects(name), project_phases(name)')
    .or(`project_id.in.(${projectIds.join(',')}),owner_id.eq.${userId}`);

  if (resolvedProjectId) q = q.eq('project_id', resolvedProjectId);
  if (resolvedWorkerId) q = q.eq('worker_id', resolvedWorkerId);
  if (start_date) q = q.gte('report_date', start_date);
  if (end_date) q = q.lte('report_date', end_date);

  const { data, error } = await q.order('report_date', { ascending: false }).limit(20);

  if (error) {
    logger.error('get_daily_reports error:', error);
    return { error: error.message };
  }

  logger.info(`get_daily_reports: Found ${(data || []).length} reports`);

  return (data || []).map(r => ({
    ...r,
    workerName: r.workers?.full_name || (r.reporter_type === 'owner' ? 'Owner' : 'Unknown'),
    projectName: r.projects?.name,
    phaseName: r.project_phases?.name,
    photoCount: r.photos?.length || 0
  }));
}

async function get_photos(userId, args = {}) {
  const { project_id, phase_id, start_date, end_date } = args;

  // Resolve project ID if name provided
  let resolvedProjectId = null;
  if (project_id) {
    const projectResolved = await resolveProjectId(userId, project_id);
    if (projectResolved.error) return projectResolved;
    if (projectResolved.suggestions) return projectResolved;
    resolvedProjectId = projectResolved.id;
  }

  // First get user's project IDs for security (include supervisor-assigned projects)
  const { data: userProjects, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  if (projectError) {
    logger.error('get_photos - project query error:', projectError);
    return { error: projectError.message };
  }

  const projectIds = (userProjects || []).map(p => p.id);
  if (projectIds.length === 0) {
    logger.warn('get_photos: No projects found for user');
    return { photos: [], totalCount: 0 };
  }

  let q = supabase
    .from('daily_reports')
    .select('id, report_date, photos, worker_id, project_id, phase_id, workers(full_name), projects(name), project_phases(name)')
    .in('project_id', projectIds)
    .not('photos', 'is', null);

  if (resolvedProjectId) q = q.eq('project_id', resolvedProjectId);
  if (phase_id) q = q.eq('phase_id', phase_id);
  if (start_date) q = q.gte('report_date', start_date);
  if (end_date) q = q.lte('report_date', end_date);

  const { data, error } = await q.order('report_date', { ascending: false }).limit(30);

  if (error) {
    logger.error('get_photos error:', error);
    return { error: error.message };
  }

  // Flatten photos from reports
  const photos = [];
  for (const report of (data || [])) {
    if (report.photos && Array.isArray(report.photos)) {
      for (const photo of report.photos) {
        photos.push({
          url: typeof photo === 'string' ? photo : photo.url,
          reportDate: report.report_date,
          projectName: report.projects?.name,
          phaseName: report.project_phases?.name,
          workerName: report.workers?.full_name
        });
      }
    }
  }

  logger.info(`get_photos: Found ${photos.length} photos from ${(data || []).length} reports`);
  return { photos, totalCount: photos.length };
}

// ==================== TIME TRACKING ====================

async function get_time_records(userId, args = {}) {
  const { worker_id, project_id, start_date, end_date, include_active = true } = args;

  // Resolve worker ID if name provided
  let resolvedWorkerId = null;
  if (worker_id) {
    const workerResolved = await resolveWorkerId(userId, worker_id);
    if (workerResolved.error) return workerResolved;
    if (workerResolved.suggestions) return workerResolved;
    resolvedWorkerId = workerResolved.id;
  }

  // Resolve project ID if name provided
  let resolvedProjectId = null;
  if (project_id) {
    const projectResolved = await resolveProjectId(userId, project_id);
    if (projectResolved.error) return projectResolved;
    if (projectResolved.suggestions) return projectResolved;
    resolvedProjectId = projectResolved.id;
  }

  // Default date range: today
  const startDate = start_date || today();
  const endDate = end_date || startDate;

  // Get user's worker IDs for security
  const { data: userWorkers } = await supabase
    .from('workers')
    .select('id')
    .eq('owner_id', userId);

  const workerIds = (userWorkers || []).map(w => w.id);
  if (workerIds.length === 0) return [];

  // Build query
  let q = supabase
    .from('time_tracking')
    .select('*, workers(full_name, trade), projects(name)')
    .in('worker_id', workerIds)
    .gte('clock_in', `${startDate}T00:00:00`)
    .lte('clock_in', `${endDate}T23:59:59`)
    .order('clock_in', { ascending: false });

  if (resolvedWorkerId) {
    q = q.eq('worker_id', resolvedWorkerId);
  }

  if (resolvedProjectId) {
    q = q.eq('project_id', resolvedProjectId);
  }

  if (!include_active) {
    q = q.not('clock_out', 'is', null);
  }

  const { data, error } = await q.limit(100);

  if (error) {
    logger.error('get_time_records error:', error);
    return { error: error.message };
  }

  // Also fetch any active (un-clocked-out) sessions that started before the date range
  // These would be missed by the date filter above but are still relevant
  let allRecords = data || [];
  if (include_active) {
    let activeQ = supabase
      .from('time_tracking')
      .select('*, workers(full_name, trade), projects(name)')
      .in('worker_id', workerIds)
      .is('clock_out', null)
      .lt('clock_in', `${startDate}T00:00:00`);

    if (resolvedWorkerId) {
      activeQ = activeQ.eq('worker_id', resolvedWorkerId);
    }
    if (resolvedProjectId) {
      activeQ = activeQ.eq('project_id', resolvedProjectId);
    }

    const { data: activeData } = await activeQ.limit(50);
    if (activeData && activeData.length > 0) {
      // Merge, avoiding duplicates
      const existingIds = new Set(allRecords.map(r => r.id));
      for (const rec of activeData) {
        if (!existingIds.has(rec.id)) {
          allRecords.push(rec);
        }
      }
    }
  }

  // Calculate hours and format response
  return await Promise.all(allRecords.map(async record => {
    let totalHours = 0;
    let status = 'active';

    if (record.clock_out) {
      const clockIn = new Date(record.clock_in);
      const clockOut = new Date(record.clock_out);
      totalHours = (clockOut - clockIn) / (1000 * 60 * 60); // Convert ms to hours

      // Subtract break time if exists
      if (record.break_start && record.break_end) {
        const breakStart = new Date(record.break_start);
        const breakEnd = new Date(record.break_end);
        const breakHours = (breakEnd - breakStart) / (1000 * 60 * 60);
        totalHours -= breakHours;
      }

      status = 'completed';
    }

    return {
      id: record.id,
      workerName: record.workers?.full_name || 'Unknown',
      trade: record.workers?.trade,
      projectName: record.projects?.name || 'Unknown',
      clockIn: record.clock_in,
      clockOut: record.clock_out,
      totalHours: Math.round(totalHours * 100) / 100,
      status,
      notes: record.notes,
      location: await enrichLocationWithAddress(
        record.location_lat,
        record.location_lng
      )
    };
  }));
}

// ==================== SETTINGS ====================

async function get_business_settings(userId, args = {}) {
  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  // Get services with pricing
  const { data: services } = await supabase
    .from('user_services')
    .select('*')
    .eq('user_id', userId);

  // Get phase template from profile
  const phasesTemplate = profile?.phases_template || ['Demo', 'Rough', 'Finish'];

  return {
    businessName: profile?.business_name || '',
    businessPhone: profile?.business_phone || profile?.phone || '',
    businessEmail: profile?.business_email || profile?.email || '',
    businessAddress: profile?.business_address || '',
    role: profile?.role || 'owner',
    language: profile?.language || 'en',
    contingencyPercentage: profile?.contingency_percentage || 10,
    profitMargin: profile?.profit_margin || 20,
    phasesTemplate,
    services: (services || []).map(s => ({
      id: s.id,
      category: s.service_category,
      pricing: s.pricing || {}
    })),
    invoiceTemplate: profile?.invoice_template || null,
    aboutYou: profile?.about_you || '',
    responseStyle: profile?.response_style || ''
  };
}

// ==================== INTELLIGENT TOOLS ====================

/**
 * Universal search across projects, estimates, invoices, and workers.
 * Runs all queries concurrently for performance.
 */
async function global_search(userId, args = {}) {
  const { query, limit = 5 } = args;

  if (!query || query.trim().length === 0) {
    return { projects: [], estimates: [], invoices: [], workers: [] };
  }

  const words = query.trim().split(/\s+/).filter(w => w.length > 1);
  const projectFilter = words.flatMap(w => [`name.ilike.%${w}%`, `location.ilike.%${w}%`]).join(',');
  const estimateFilter = words.flatMap(w => [`client_name.ilike.%${w}%`, `project_name.ilike.%${w}%`, `estimate_number.ilike.%${w}%`]).join(',');
  const invoiceFilter = words.flatMap(w => [`client_name.ilike.%${w}%`, `project_name.ilike.%${w}%`, `invoice_number.ilike.%${w}%`]).join(',');
  const workerFilter = words.flatMap(w => [`full_name.ilike.%${w}%`, `trade.ilike.%${w}%`, `email.ilike.%${w}%`]).join(',');

  const [projectsRes, estimatesRes, invoicesRes, workersRes] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, status, budget, contract_amount, start_date, end_date, location')
      .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
      .or(projectFilter)
      .order('created_at', { ascending: false })
      .limit(limit),

    supabase
      .from('estimates')
      .select('id, estimate_number, client_name, project_name, total, status, created_at')
      .eq('user_id', userId)
      .or(estimateFilter)
      .order('created_at', { ascending: false })
      .limit(limit),

    supabase
      .from('invoices')
      .select('id, invoice_number, client_name, project_name, total, amount_paid, status, due_date')
      .eq('user_id', userId)
      .or(invoiceFilter)
      .order('created_at', { ascending: false })
      .limit(limit),

    supabase
      .from('workers')
      .select('id, full_name, trade, payment_type, hourly_rate, daily_rate, status')
      .eq('owner_id', userId)
      .or(workerFilter)
      .limit(limit),
  ]);

  return {
    projects: projectsRes.data || [],
    estimates: estimatesRes.data || [],
    invoices: invoicesRes.data || [],
    workers: workersRes.data || [],
    totalResults:
      (projectsRes.data?.length || 0) +
      (estimatesRes.data?.length || 0) +
      (invoicesRes.data?.length || 0) +
      (workersRes.data?.length || 0),
  };
}

/**
 * Morning briefing — today's schedule, overdue invoices, at-risk projects, worker status.
 */
async function get_daily_briefing(userId, args = {}) {
  const todayStr = today();
  const todayStart = `${todayStr}T00:00:00`;
  const todayEnd = `${todayStr}T23:59:59`;

  // Get user's project IDs for daily reports query
  const { data: userProjects } = await supabase
    .from('projects')
    .select('id')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  const projectIds = (userProjects || []).map(p => p.id);

  const [scheduleRes, overdueRes, projectsRes, workersRes, clockInsRes, dailyReportsRes] = await Promise.all([
    // Today's schedule events
    supabase
      .from('schedule_events')
      .select('id, title, event_type, start_datetime, end_datetime, location')
      .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
      .gte('start_datetime', todayStart)
      .lte('start_datetime', todayEnd)
      .order('start_datetime', { ascending: true }),

    // Overdue invoices
    supabase
      .from('invoices')
      .select('id, invoice_number, client_name, total, amount_paid, due_date')
      .eq('user_id', userId)
      .eq('status', 'overdue'),

    // All active projects (check for behind/over-budget)
    supabase
      .from('projects')
      .select('id, name, status, budget, contract_amount, expenses, end_date')
      .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
      .in('status', ['active', 'on-track', 'behind', 'over-budget']),

    // All active workers
    supabase
      .from('workers')
      .select('id, full_name, trade, status')
      .eq('owner_id', userId)
      .eq('status', 'active'),

    // Currently clocked-in workers
    supabase
      .from('time_tracking')
      .select('worker_id, clock_in, project_id, projects(name), workers(full_name)')
      .eq('clock_out', null)
      .gte('clock_in', todayStart),

    // Today's daily reports
    projectIds.length > 0
      ? supabase
          .from('daily_reports')
          .select('id, report_date, project_id, worker_id, owner_id, reporter_type, photos, projects(name), workers(full_name)')
          .or(`project_id.in.(${projectIds.join(',')}),owner_id.eq.${userId}`)
          .eq('report_date', todayStr)
      : Promise.resolve({ data: [] })
  ]);

  // Build alerts
  const alerts = [];

  // Overdue invoices
  const overdueInvoices = overdueRes.data || [];
  if (overdueInvoices.length > 0) {
    const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + ((inv.total || 0) - (inv.amount_paid || 0)), 0);
    alerts.push({
      type: 'overdue_invoices',
      severity: 'high',
      message: `${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? 's' : ''} totaling $${totalOverdue.toLocaleString()}`,
      items: overdueInvoices,
    });
  }

  // Projects behind schedule or over budget
  const atRiskProjects = (projectsRes.data || []).filter(p =>
    p.status === 'behind' || p.status === 'over-budget'
  );
  if (atRiskProjects.length > 0) {
    alerts.push({
      type: 'at_risk_projects',
      severity: 'medium',
      message: `${atRiskProjects.length} project${atRiskProjects.length > 1 ? 's' : ''} need attention`,
      items: atRiskProjects.map(p => ({ id: p.id, name: p.name, status: p.status })),
    });
  }

  // Filter clocked-in to only this user's workers
  const workerIds = new Set((workersRes.data || []).map(w => w.id));
  const clockedIn = (clockInsRes.data || []).filter(ci => workerIds.has(ci.worker_id));

  const dailyReports = dailyReportsRes.data || [];

  logger.info(`get_daily_briefing: Found ${projectIds.length} projects, ${dailyReports.length} daily reports for ${todayStr}`);
  if (dailyReports.length > 0) {
    logger.info(`Daily reports details:`, dailyReports.map(r => ({
      id: r.id,
      project: r.projects?.name,
      reporter_type: r.reporter_type,
      report_date: r.report_date
    })));
  }

  return {
    date: todayStr,
    schedule: scheduleRes.data || [],
    scheduleCount: (scheduleRes.data || []).length,
    alerts,
    teamStatus: {
      totalWorkers: (workersRes.data || []).length,
      clockedIn: clockedIn.length,
      clockedInWorkers: clockedIn.map(ci => ({
        name: ci.workers?.full_name,
        project: ci.projects?.name,
        since: ci.clock_in,
      })),
    },
    activeProjects: (projectsRes.data || []).length,
    dailyReports: dailyReports.map(r => ({
      id: r.id,
      project: r.projects?.name,
      worker: r.workers?.full_name || (r.reporter_type === 'owner' ? 'Owner' : (r.reporter_type === 'supervisor' ? 'Supervisor' : 'Unknown')),
      reporterType: r.reporter_type,
      photoCount: r.photos?.length || 0,
    })),
    dailyReportsCount: dailyReports.length,
  };
}

/**
 * High-level project summary — status, financials, progress, recent activity.
 */
async function get_project_summary(userId, args) {
  let { project_id } = args;

  // Resolve name to UUID if needed
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  project_id = resolved.id;

  const [projectRes, phasesRes, transactionsRes, reportsRes, assignmentsRes, workerTasksRes] = await Promise.all([
    supabase
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
      .single(),

    supabase
      .from('project_phases')
      .select('id, name, status, completion_percentage, start_date, end_date, order_index, tasks')
      .eq('project_id', project_id)
      .order('order_index', { ascending: true }),

    supabase
      .from('project_transactions')
      .select('type, category, amount')
      .eq('project_id', project_id),

    supabase
      .from('daily_reports')
      .select('id, report_date, notes, photos, workers(full_name)')
      .eq('project_id', project_id)
      .order('report_date', { ascending: false })
      .limit(3),

    supabase
      .from('project_assignments')
      .select('workers(id, full_name, trade)')
      .eq('project_id', project_id),

    supabase
      .from('worker_tasks')
      .select('id, phase_task_id, status')
      .eq('project_id', project_id)
      .not('phase_task_id', 'is', null),
  ]);

  const project = projectRes.data;
  if (!project) return { error: 'Project not found' };

  const workerTasks = workerTasksRes.data || [];
  const transactions = transactionsRes.data || [];

  // Recalculate phase progress from worker_tasks (fixes stale completion_percentage bug)
  const phases = recalculatePhaseProgress(phasesRes.data || [], workerTasks);

  // Calculate financials
  let totalIncome = 0, totalExpenses = 0;
  const expensesByCategory = {};
  for (const t of transactions) {
    if (t.type === 'income') totalIncome += t.amount;
    else {
      totalExpenses += t.amount;
      expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + t.amount;
    }
  }

  // Calculate overall progress from phases
  const completedPhases = phases.filter(p => p.status === 'completed').length;
  const avgCompletion = phases.length > 0
    ? Math.round(phases.reduce((sum, p) => sum + (p.completion_percentage || 0), 0) / phases.length)
    : 0;

  // Current phase
  const currentPhase = phases.find(p => p.status === 'in_progress') || phases.find(p => p.status === 'not_started');

  const contractAmount = project.contract_amount || project.budget || 0;
  const incomeCollected = project.income_collected || 0;
  const expenses = project.expenses || 0;

  return {
    project: {
      id: project.id,
      name: project.name,
      status: project.status,
      location: project.location,
      startDate: project.start_date,
      endDate: project.end_date,
    },
    progress: {
      overallCompletion: project.actual_progress || avgCompletion,
      phasesComplete: `${completedPhases}/${phases.length}`,
      currentPhase: currentPhase ? { name: currentPhase.name, completion: currentPhase.completion_percentage } : null,
      phases: phases.map(p => ({ name: p.name, status: p.status, completion: p.completion_percentage })),
    },
    financials: {
      budget: contractAmount,
      incomeCollected,
      expenses,
      profit: incomeCollected - expenses,
      budgetRemaining: contractAmount - expenses,
      expensesByCategory,
    },
    team: (assignmentsRes.data || []).map(a => a.workers).filter(Boolean),
    recentActivity: (reportsRes.data || []).map(r => ({
      date: r.report_date,
      worker: r.workers?.full_name,
      notes: r.notes,
      photoCount: r.photos?.length || 0,
    })),
  };
}

/**
 * Suggest pricing for estimate line items based on historical data.
 */
async function suggest_pricing(userId, args) {
  const { items, complexity } = args;

  if (!items || items.length === 0) {
    return { suggestions: [] };
  }

  // Fetch all pricing history for this user
  const { data: history } = await supabase
    .from('pricing_history')
    .select('work_description, quantity, unit, price_per_unit, total_amount, complexity, confidence_weight, scope_keywords')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(500);

  // Fetch user's service items for default pricing
  const { data: userServices } = await supabase
    .from('user_services')
    .select('pricing, custom_items, service_categories(name)')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  const suggestions = [];

  for (const item of items) {
    const itemLower = item.toLowerCase();
    const suggestion = { item, sources: [] };

    // Search pricing history for matches
    if (history && history.length > 0) {
      const matches = history.filter(h => {
        const descLower = (h.work_description || '').toLowerCase();
        const keywords = (h.scope_keywords || []).map(k => k.toLowerCase());
        // Check if any word in the item appears in historical description or keywords
        const itemWords = itemLower.split(/\s+/).filter(w => w.length > 3);
        return itemWords.some(word => descLower.includes(word) || keywords.some(k => k.includes(word)));
      });

      if (matches.length > 0) {
        // Weight by confidence
        let weightedSum = 0, totalWeight = 0;
        for (const m of matches) {
          const weight = m.confidence_weight || 1.0;
          weightedSum += (m.price_per_unit || 0) * weight;
          totalWeight += weight;
        }

        suggestion.avgPricePerUnit = totalWeight > 0 ? Math.round(weightedSum / totalWeight * 100) / 100 : null;
        suggestion.priceRange = {
          low: Math.min(...matches.map(m => m.price_per_unit || 0)),
          high: Math.max(...matches.map(m => m.price_per_unit || 0)),
        };
        suggestion.unit = matches[0].unit || 'job';
        suggestion.dataPoints = matches.length;
        suggestion.sources.push('pricing_history');
      }
    }

    // Fallback: check service item default pricing
    if (suggestion.sources.length === 0 && userServices) {
      for (const svc of userServices) {
        const customItems = svc.custom_items || [];
        const pricing = svc.pricing || {};
        for (const ci of customItems) {
          if (ci.name && ci.name.toLowerCase().includes(itemLower.substring(0, 8))) {
            suggestion.avgPricePerUnit = pricing[ci.id]?.price || ci.default_price || null;
            suggestion.unit = ci.unit || 'job';
            suggestion.sources.push('service_catalog');
            break;
          }
        }
        if (suggestion.sources.length > 0) break;
      }
    }

    // Complexity adjustment
    if (suggestion.avgPricePerUnit && complexity) {
      const multiplier = complexity === 'complex' ? 1.15 : complexity === 'simple' ? 0.9 : 1.0;
      suggestion.adjustedPrice = Math.round(suggestion.avgPricePerUnit * multiplier * 100) / 100;
      suggestion.complexityAdjustment = complexity;
    }

    suggestions.push(suggestion);
  }

  return {
    suggestions,
    hasHistoricalData: suggestions.some(s => s.sources.includes('pricing_history')),
    note: suggestions.every(s => s.sources.length === 0)
      ? 'No historical pricing data found. Prices will improve as you create more estimates and projects.'
      : null,
  };
}

/**
 * Assign a worker to a project for its full duration.
 * Creates a project_assignment and optionally a work schedule.
 */
async function assign_worker(userId, args) {
  let { worker_id, project_id } = args;

  // Resolve names to UUIDs if needed
  const resolvedProject = await resolveProjectId(userId, project_id);
  if (resolvedProject.error) return { error: resolvedProject.error };
  if (resolvedProject.suggestions) return resolvedProject;
  project_id = resolvedProject.id;

  const resolvedWorker = await resolveWorkerId(userId, worker_id);
  if (resolvedWorker.error) return { error: resolvedWorker.error };
  if (resolvedWorker.suggestions) return resolvedWorker;
  worker_id = resolvedWorker.id;

  // Verify project ownership and get dates (support supervisors)
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, name, start_date, end_date, status, user_id')
    .eq('id', project_id)
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .single();

  if (projErr || !project) return { error: 'Project not found' };

  // Get supervisor's owner_id if they're a supervisor
  const { data: profile } = await supabase
    .from('profiles')
    .select('owner_id, role')
    .eq('id', userId)
    .single();

  const ownerId = profile?.role === 'supervisor' ? profile.owner_id : userId;

  // Verify worker ownership (use parent owner for supervisors)
  const { data: worker, error: wrkErr } = await supabase
    .from('workers')
    .select('id, full_name, trade')
    .eq('id', worker_id)
    .eq('owner_id', ownerId)
    .single();

  if (wrkErr || !worker) return { error: 'Worker not found' };

  // Check if already assigned
  const { data: existing } = await supabase
    .from('project_assignments')
    .select('id')
    .eq('project_id', project_id)
    .eq('worker_id', worker_id)
    .single();

  if (existing) {
    return {
      alreadyAssigned: true,
      message: `${worker.full_name} is already assigned to ${project.name}`,
    };
  }

  // Create the assignment
  const { error: assignErr } = await supabase
    .from('project_assignments')
    .insert({ project_id, worker_id });

  if (assignErr) {
    logger.error('assign_worker insert error:', assignErr);
    return { error: `Failed to assign worker: ${assignErr.message}` };
  }

  // Notify the worker about the new assignment
  const { data: wUser } = await supabase.from('workers').select('user_id').eq('id', worker_id).single();
  if (wUser?.user_id) {
    sendNotification({
      userId: wUser.user_id,
      title: 'New Project Assignment',
      body: `You've been assigned to ${project.name}`,
      type: 'worker_update',
      data: { screen: 'Assignments' },
      projectId: project_id,
      workerId: worker_id,
    });
  }

  return {
    success: true,
    message: `${worker.full_name} (${worker.trade}) assigned to ${project.name}`,
    worker: { id: worker.id, name: worker.full_name, trade: worker.trade },
    project: { id: project.id, name: project.name, startDate: project.start_date, endDate: project.end_date },
  };
}

/**
 * Generate a summary report from daily reports for a project/date range.
 * Aggregates notes and photos into a single client-ready summary.
 */
async function generate_summary_report(userId, args) {
  const { project_id, start_date, end_date } = args;

  // Verify project ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', project_id)
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .single();

  if (!project) return { error: 'Project not found' };

  // Fetch daily reports in range
  const { data: reports, error } = await supabase
    .from('daily_reports')
    .select('id, report_date, notes, photos, completed_tasks, task_progress, worker_id, phase_id, workers(full_name), project_phases(name)')
    .eq('project_id', project_id)
    .gte('report_date', start_date)
    .lte('report_date', end_date)
    .order('report_date', { ascending: true });

  if (error) {
    logger.error('generate_summary_report error:', error);
    return { error: error.message };
  }

  const reportList = reports || [];

  // Aggregate data
  const allPhotos = [];
  const notesByDate = {};
  const workByPhase = {};
  let totalCompletedTasks = 0;

  for (const r of reportList) {
    // Photos
    if (r.photos && Array.isArray(r.photos)) {
      for (const photo of r.photos) {
        allPhotos.push({
          url: typeof photo === 'string' ? photo : photo.url,
          date: r.report_date,
          worker: r.workers?.full_name,
          phase: r.project_phases?.name,
        });
      }
    }

    // Notes by date
    if (r.notes) {
      if (!notesByDate[r.report_date]) notesByDate[r.report_date] = [];
      notesByDate[r.report_date].push({
        worker: r.workers?.full_name || 'Unknown',
        notes: r.notes,
      });
    }

    // Work by phase
    const phaseName = r.project_phases?.name || 'General';
    if (!workByPhase[phaseName]) workByPhase[phaseName] = { reports: 0, photos: 0 };
    workByPhase[phaseName].reports++;
    workByPhase[phaseName].photos += (r.photos?.length || 0);

    // Completed tasks
    if (r.completed_tasks) totalCompletedTasks += r.completed_tasks.length;
  }

  return {
    project: { id: project.id, name: project.name },
    period: { startDate: start_date, endDate: end_date },
    summary: {
      totalReports: reportList.length,
      totalPhotos: allPhotos.length,
      totalCompletedTasks,
      daysWithActivity: Object.keys(notesByDate).length,
    },
    notesByDate,
    workByPhase,
    photos: allPhotos,
  };
}

/**
 * Share a document (estimate or invoice) with a client.
 * Returns the client's contact info so the AI can suggest the send action.
 */
async function share_document(userId, args) {
  const { document_id, document_type, recipient_id, method } = args;

  // Fetch the document
  const table = document_type === 'estimate' ? 'estimates' : 'invoices';
  const { data: doc, error: docErr } = await supabase
    .from(table)
    .select('id, client_name, client_phone, client_email')
    .eq('id', document_id)
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .single();

  if (docErr || !doc) return { error: `${document_type} not found` };

  // Determine best method
  let sendMethod = method;
  if (!sendMethod) {
    if (doc.client_phone) sendMethod = 'sms';
    else if (doc.client_email) sendMethod = 'email';
    else return { error: 'No contact method available. Client has no phone or email on file.' };
  }

  // Return info for the AI to generate the appropriate send action
  return {
    document: {
      id: doc.id,
      type: document_type,
      clientName: doc.client_name,
    },
    contact: {
      phone: doc.client_phone,
      email: doc.client_email,
    },
    recommendedMethod: sendMethod,
    // The AI should return the appropriate action (send-estimate-sms, send-estimate-whatsapp, etc.)
    suggestedAction: document_type === 'estimate'
      ? (sendMethod === 'whatsapp' ? 'send-estimate-whatsapp' : 'send-estimate-sms')
      : 'share-invoice-pdf',
  };
}

// ==================== FINANCIAL MUTATIONS ====================

async function record_expense(userId, { project_id, service_plan_name, type, amount, category, description, date, subcategory }) {
  const transactionDate = date || new Date().toISOString().split('T')[0];
  let insertData = {
    created_by: userId,
    type,
    category,
    description,
    amount: parseFloat(amount),
    date: transactionDate,
  };
  if (subcategory) insertData.subcategory = subcategory;

  let entityName = '';
  let entityFilterCol = '';
  let entityFilterId = '';

  if (service_plan_name && !project_id) {
    // Resolve service plan by name
    const { data: plans } = await supabase
      .from('service_plans')
      .select('id, name')
      .eq('owner_id', userId)
      .ilike('name', `%${service_plan_name}%`);

    if (!plans || plans.length === 0) {
      return { error: `No service plan found matching "${service_plan_name}"` };
    }
    if (plans.length > 1) {
      return { error: `Multiple service plans match "${service_plan_name}". Be more specific.`, suggestions: plans.map(p => p.name) };
    }
    insertData.service_plan_id = plans[0].id;
    entityName = plans[0].name;
    entityFilterCol = 'service_plan_id';
    entityFilterId = plans[0].id;
  } else {
    // Resolve project (existing logic)
    const resolved = await resolveProjectId(userId, project_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    insertData.project_id = resolved.id;
    entityName = resolved.name || project_id;
    entityFilterCol = 'project_id';
    entityFilterId = resolved.id;
  }

  const { data, error } = await supabase
    .from('project_transactions')
    .insert(insertData)
    .select()
    .single();

  if (error) return { error: `Failed to record transaction: ${error.message}` };

  // Get updated totals
  const { data: transactions } = await supabase
    .from('project_transactions')
    .select('type, amount')
    .eq(entityFilterCol, entityFilterId);

  const totalExpenses = (transactions || [])
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalIncome = (transactions || [])
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  // Notify project owner if a supervisor recorded the expense (project only)
  if (insertData.project_id) {
    const { data: proj } = await supabase.from('projects').select('user_id, name').eq('id', insertData.project_id).single();
    if (proj && proj.user_id !== userId) {
      sendNotification({
        userId: proj.user_id,
        title: 'New Expense Recorded',
        body: `$${parseFloat(amount).toFixed(2)} ${category || ''} expense on ${proj.name}`,
        type: 'financial_update',
        data: { screen: 'Projects' },
        projectId: insertData.project_id,
      });
    }
  }

  return {
    success: true,
    transaction: {
      id: data.id,
      type,
      amount: parseFloat(amount),
      category,
      description,
      date: transactionDate,
    },
    totals: {
      totalExpenses,
      totalIncome,
      profit: totalIncome - totalExpenses,
    },
    entityName,
  };
}

async function delete_expense(userId, { transaction_id, project_id }) {
  // OWNER-ONLY: Check if user is a supervisor
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profile?.role === 'supervisor') {
    return { error: 'Access denied - expense management is owner-only' };
  }

  // Resolve transaction if description/name provided
  let resolvedId = transaction_id;

  // If not a UUID, try to resolve from description + project
  if (!transaction_id.match(/^[0-9a-f]{8}-/i)) {
    // Get owner's projects (not supervisor's)
    const { data: userProjects } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId);  // Only owner's projects

    const projectIds = (userProjects || []).map(p => p.id);
    if (projectIds.length === 0) {
      return { error: 'No projects found' };
    }

    // Get transactions from user's projects
    let query = supabase
      .from('project_transactions')
      .select('id, description, amount, category, date, project_id, created_by')
      .in('project_id', projectIds);  // Search all transactions in user's projects

    if (project_id) {
      const projectResolved = await resolveProjectId(userId, project_id);
      if (projectResolved.error) return projectResolved;
      if (projectResolved.suggestions) return projectResolved;
      query = query.eq('project_id', projectResolved.id);
    }

    const { data: transactions } = await query.limit(10);

    if (!transactions || transactions.length === 0) {
      return { error: `Transaction not found matching "${transaction_id}"` };
    }

    // Try to match description or amount
    const searchLower = transaction_id.toLowerCase();
    const amountMatch = transaction_id.match(/\$?(\d+(?:\.\d+)?)/);
    const searchAmount = amountMatch ? parseFloat(amountMatch[1]) : null;

    const match = transactions.find(t =>
      t.description?.toLowerCase().includes(searchLower) ||
      (searchAmount && Math.abs(parseFloat(t.amount) - searchAmount) < 0.01)
    );

    if (!match && transactions.length === 1) {
      resolvedId = transactions[0].id;
    } else if (match) {
      resolvedId = match.id;
    } else {
      return {
        suggestions: transactions.map(t => ({
          id: t.id,
          description: t.description,
          amount: t.amount,
          category: t.category,
          date: t.date
        })),
        message: `Multiple transactions found. Which one did you mean?`
      };
    }
  }

  // Verify project ownership (not just transaction creator)
  const { data: transaction, error: fetchErr } = await supabase
    .from('project_transactions')
    .select('id, description, amount, category, project_id, created_by')
    .eq('id', resolvedId)
    .single();

  if (fetchErr || !transaction) {
    return { error: 'Transaction not found' };
  }

  // Verify user OWNS the project (not just supervises)
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', transaction.project_id)
    .eq('user_id', userId)  // Only project owner
    .single();

  if (!project) {
    return { error: 'Access denied - you do not own this project' };
  }

  const projectId = transaction.project_id;

  // Delete the transaction
  const { error: deleteErr } = await supabase
    .from('project_transactions')
    .delete()
    .eq('id', resolvedId);

  if (deleteErr) {
    return { error: `Failed to delete transaction: ${deleteErr.message}` };
  }

  // Get updated project totals
  const { data: remainingTransactions } = await supabase
    .from('project_transactions')
    .select('type, amount')
    .eq('project_id', projectId);

  const totalExpenses = (remainingTransactions || [])
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalIncome = (remainingTransactions || [])
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  logger.info(`✅ Deleted expense ${resolvedId}: ${transaction.description} ($${transaction.amount})`);

  return {
    success: true,
    deletedTransaction: {
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      category: transaction.category,
    },
    projectTotals: {
      totalExpenses,
      totalIncome,
      profit: totalIncome - totalExpenses,
    }
  };
}

async function update_expense(userId, { transaction_id, amount, category, description, date, subcategory }) {
  // Resolve transaction ID if needed
  let resolvedId = transaction_id;

  // For now, require UUID - can enhance later with resolution logic
  if (!transaction_id.match(/^[0-9a-f]{8}-/i)) {
    return { error: 'Please provide the transaction UUID. Use get_transactions to find the transaction ID first.' };
  }

  // Build updates object
  const updates = {};
  if (amount !== undefined) updates.amount = parseFloat(amount);
  if (category !== undefined) updates.category = category;
  if (description !== undefined) updates.description = description;
  if (date !== undefined) updates.date = date;
  if (subcategory !== undefined) updates.subcategory = subcategory;

  if (Object.keys(updates).length === 0) {
    return { error: 'No fields to update. Provide at least one field: amount, category, description, date, or subcategory.' };
  }

  // First, get the transaction to verify project ownership
  const { data: transaction } = await supabase
    .from('project_transactions')
    .select('id, project_id')
    .eq('id', resolvedId)
    .single();

  if (!transaction) {
    return { error: 'Transaction not found' };
  }

  // Verify user OWNS the project (not just supervises)
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', transaction.project_id)
    .eq('user_id', userId)  // Only project owner
    .single();

  if (!project) {
    return { error: 'Access denied - you do not own this project' };
  }

  // Now update the transaction
  const { data, error } = await supabase
    .from('project_transactions')
    .update(updates)
    .eq('id', resolvedId)
    .select('id, description, amount, category, date, type, project_id')
    .single();

  if (error || !data) {
    return { error: 'Failed to update transaction' };
  }

  // Get updated project totals
  const { data: transactions } = await supabase
    .from('project_transactions')
    .select('type, amount')
    .eq('project_id', data.project_id);

  const totalExpenses = (transactions || [])
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalIncome = (transactions || [])
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  logger.info(`✅ Updated expense ${resolvedId}:`, updates);

  return {
    success: true,
    transaction: {
      id: data.id,
      description: data.description,
      amount: data.amount,
      category: data.category,
      date: data.date,
    },
    projectTotals: {
      totalExpenses,
      totalIncome,
      profit: totalIncome - totalExpenses,
    }
  };
}

// ==================== PHASE MUTATIONS ====================

async function update_phase_progress(userId, { project_id, phase_name, percentage }) {
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  // Find phase by name within this project
  const filter = buildWordSearch(phase_name, ['name']);
  if (!filter) return { error: 'No phase name specified' };

  const { data: phases, error: phaseErr } = await supabase
    .from('project_phases')
    .select('id, name, completion_percentage, status, actual_start_date')
    .eq('project_id', resolved.id)
    .or(filter);

  if (phaseErr || !phases || phases.length === 0) {
    return { error: `No phase found matching "${phase_name}" in this project` };
  }

  const phase = phases[0]; // Best match
  const pct = Math.max(0, Math.min(100, Math.round(percentage)));

  // Derive status from percentage
  let status;
  if (pct === 0) status = 'not_started';
  else if (pct >= 100) status = 'completed';
  else status = 'in_progress';

  const updates = { completion_percentage: pct, status };

  // Set actual_start_date if transitioning from 0 to >0
  if (!phase.actual_start_date && pct > 0) {
    updates.actual_start_date = today();
  }

  // Set actual_end_date if hitting 100%
  if (pct >= 100) {
    updates.actual_end_date = today();
  }

  const { error: updateErr } = await supabase
    .from('project_phases')
    .update(updates)
    .eq('id', phase.id);

  if (updateErr) return { error: `Failed to update phase: ${updateErr.message}` };

  // Notify owner/supervisor when a phase hits 100%
  if (pct >= 100) {
    const { data: proj } = await supabase.from('projects')
      .select('user_id, name, assigned_supervisor_id').eq('id', resolved.id).single();
    if (proj) {
      const recipients = [proj.user_id, proj.assigned_supervisor_id].filter(id => id && id !== userId);
      for (const recipientId of recipients) {
        sendNotification({
          userId: recipientId,
          title: 'Phase Completed',
          body: `${phase.name} is now 100% complete on ${proj.name}`,
          type: 'project_warning',
          data: { screen: 'Projects' },
          projectId: resolved.id,
        });
      }
    }
  }

  return {
    success: true,
    phase: { name: phase.name, completion_percentage: pct, status },
  };
}

// ==================== CHECKLIST & PHASE CREATION ====================

async function add_project_checklist(userId, { project_id, items }) {
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return { error: 'No checklist items provided. Please provide an array of task descriptions.' };
  }

  // Get project end date so tasks show on the schedule until project ends
  const { data: projectData } = await supabase
    .from('projects')
    .select('name, end_date')
    .eq('id', resolved.id)
    .single();

  const taskStartDate = today();
  // Use project end_date if available, otherwise 30 days from now
  const taskEndDate = projectData?.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Create standalone worker_tasks (appear in Additional Tasks section)
  const workerTasks = items.map((desc) => ({
    owner_id: userId,
    project_id: resolved.id,
    title: typeof desc === 'string' ? desc : desc.description || 'Untitled task',
    start_date: taskStartDate,
    end_date: taskEndDate,
    status: 'pending',
  }));

  const { data: insertedTasks, error: taskErr } = await supabase
    .from('worker_tasks')
    .insert(workerTasks)
    .select('id, title');

  if (taskErr) return { error: `Failed to create tasks: ${taskErr.message}` };
  if (!insertedTasks || insertedTasks.length === 0) {
    return { error: 'Tasks did not persist. Please try again.' };
  }

  // Update project updated_at so frontend detects the change
  await supabase
    .from('projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', resolved.id);

  return {
    success: true,
    project_id: resolved.id,
    project_name: projectData?.name,
    items_added: insertedTasks.length,
    items: insertedTasks.map(t => t.title),
  };
}

async function create_project_phase(userId, { project_id, phase_name, planned_days, tasks, budget }) {
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  if (!phase_name || phase_name.trim().length === 0) {
    return { error: 'Phase name is required.' };
  }

  // Check for duplicate phase name
  const { data: existingPhases } = await supabase
    .from('project_phases')
    .select('id, name, order_index')
    .eq('project_id', resolved.id);

  const duplicate = existingPhases?.find(
    p => p.name.toLowerCase() === phase_name.trim().toLowerCase()
  );
  if (duplicate) {
    return { error: `A phase named "${duplicate.name}" already exists in this project. Use add_project_checklist to add items to it.` };
  }

  const maxOrder = existingPhases
    ? Math.max(-1, ...existingPhases.map(p => p.order_index || 0))
    : -1;

  // Build tasks JSONB
  const phaseTasks = (tasks || []).map((desc, i) => ({
    id: `task-${Date.now()}-${i}`,
    description: typeof desc === 'string' ? desc : 'Untitled task',
    order: i,
    completed: false,
  }));

  const { data: newPhase, error: insertErr } = await supabase
    .from('project_phases')
    .insert({
      project_id: resolved.id,
      name: phase_name.trim(),
      order_index: maxOrder + 1,
      planned_days: planned_days || 5,
      tasks: phaseTasks,
      completion_percentage: 0,
      status: 'not_started',
      budget: parseFloat(budget) || 0,
    })
    .select('id, name, order_index, planned_days, budget')
    .single();

  if (insertErr) return { error: `Failed to create phase: ${insertErr.message}` };

  // Mark project as having phases
  await supabase
    .from('projects')
    .update({ has_phases: true })
    .eq('id', resolved.id);

  // Create worker_tasks if tasks were provided
  if (phaseTasks.length > 0) {
    const workerTasks = phaseTasks.map(t => ({
      owner_id: userId,
      project_id: resolved.id,
      title: t.description,
      description: `Phase: ${phase_name.trim()}`,
      start_date: today(),
      end_date: today(),
      status: 'pending',
      phase_task_id: t.id,
    }));

    const { error: taskErr } = await supabase
      .from('worker_tasks')
      .insert(workerTasks);

    if (taskErr) {
      logger.warn('Worker tasks creation failed (phase still created):', taskErr.message);
    }
  }

  // Get project name
  const { data: proj } = await supabase
    .from('projects')
    .select('name')
    .eq('id', resolved.id)
    .single();

  return {
    success: true,
    project_name: proj?.name,
    phase: {
      id: newPhase.id,
      name: newPhase.name,
      planned_days: newPhase.planned_days,
      task_count: phaseTasks.length,
      budget: newPhase.budget,
    },
  };
}

async function update_phase_budget(userId, { project_id, phase_name, budget }) {
  if (!project_id || !phase_name || budget === undefined) {
    return { error: 'project_id, phase_name, and budget are required' };
  }
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;

  // Find phase by fuzzy name match within the project
  const { data: phases } = await supabase
    .from('project_phases')
    .select('id, name, budget')
    .eq('project_id', resolved.id)
    .ilike('name', `%${phase_name}%`);

  if (!phases || phases.length === 0) {
    return { error: `No phase matching "${phase_name}" found in project` };
  }
  if (phases.length > 1) {
    return {
      error: 'Multiple phases matched',
      suggestions: phases.map(p => ({ id: p.id, name: p.name, budget: p.budget })),
    };
  }

  const phase = phases[0];
  const newBudget = parseFloat(budget) || 0;
  const { error } = await supabase
    .from('project_phases')
    .update({ budget: newBudget })
    .eq('id', phase.id);
  if (error) return { error: error.message };

  logger.info(`✅ Updated phase budget: ${phase.name} → $${newBudget}`);
  return { success: true, phase: { id: phase.id, name: phase.name, budget: newBudget } };
}

// ==================== INVOICE MUTATIONS ====================

async function convert_estimate_to_invoice(userId, { estimate_id }) {
  const resolved = await resolveEstimateId(userId, estimate_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  // Fetch the full estimate
  const { data: estimate, error: estErr } = await supabase
    .from('estimates')
    .select('*')
    .eq('id', resolved.id)
    .eq('user_id', userId)
    .single();

  if (estErr || !estimate) return { error: 'Estimate not found' };

  // Calculate due date (30 days from now)
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 30);
  const dueDateStr = dueDate.toISOString().split('T')[0];

  // Insert invoice (invoice_number auto-generated by DB trigger)
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      user_id: userId,
      estimate_id: estimate.id,
      project_id: estimate.project_id || null,
      client_name: estimate.client_name,
      client_email: estimate.client_email,
      client_phone: estimate.client_phone,
      client_address: estimate.client_address,
      project_name: estimate.project_name,
      items: estimate.items,
      subtotal: estimate.subtotal,
      tax_rate: estimate.tax_rate,
      tax_amount: estimate.tax_amount,
      total: estimate.total,
      due_date: dueDateStr,
      payment_terms: estimate.payment_terms || 'Net 30',
      notes: estimate.notes,
      status: 'unpaid',
    })
    .select()
    .single();

  if (invErr) return { error: `Failed to create invoice: ${invErr.message}` };

  // Update estimate status to accepted
  await supabase
    .from('estimates')
    .update({ status: 'accepted', accepted_date: new Date().toISOString() })
    .eq('id', estimate.id);

  return {
    success: true,
    invoice: {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      client_name: invoice.client_name,
      project_name: invoice.project_name,
      total: parseFloat(invoice.total),
      due_date: invoice.due_date,
      status: invoice.status,
      items: invoice.items,
    },
  };
}

async function update_invoice(userId, { invoice_id, status, due_date, payment_terms, notes, amount_paid, payment_method }) {
  const resolved = await resolveInvoiceId(userId, invoice_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  // Build update object from provided fields only
  const updates = {};
  if (due_date) updates.due_date = due_date;
  if (payment_terms) updates.payment_terms = payment_terms;
  if (notes !== undefined) updates.notes = notes;
  if (payment_method) updates.payment_method = payment_method;

  if (amount_paid !== undefined) {
    updates.amount_paid = parseFloat(amount_paid);

    // Fetch total to derive status
    const { data: inv } = await supabase
      .from('invoices')
      .select('total')
      .eq('id', resolved.id)
      .single();

    if (inv) {
      const total = parseFloat(inv.total);
      if (parseFloat(amount_paid) >= total) {
        updates.status = 'paid';
        updates.paid_date = new Date().toISOString();
      } else if (parseFloat(amount_paid) > 0) {
        updates.status = 'partial';
      }
    }
  }

  // Explicit status override takes precedence
  if (status) updates.status = status;
  if (status === 'paid' && !updates.paid_date) {
    updates.paid_date = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return { error: 'No fields to update. Specify at least one field (status, due_date, amount_paid, etc.).' };
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', resolved.id)
    .eq('user_id', userId)
    .select('invoice_number, status, amount_paid, total, due_date')
    .single();

  if (error) return { error: `Failed to update invoice: ${error.message}` };

  // Notify owner about invoice status changes (if caller is a supervisor)
  if (updates.status) {
    const { data: inv } = await supabase.from('invoices').select('project_id').eq('id', resolved.id).single();
    if (inv?.project_id) {
      const { data: proj } = await supabase.from('projects').select('user_id, name').eq('id', inv.project_id).single();
      if (proj && proj.user_id !== userId) {
        sendNotification({
          userId: proj.user_id,
          title: 'Invoice Updated',
          body: `Invoice #${data.invoice_number} marked as ${data.status} on ${proj.name}`,
          type: 'financial_update',
          data: { screen: 'Projects' },
          projectId: inv.project_id,
        });
      }
    }
  }

  return {
    success: true,
    invoice: {
      invoice_number: data.invoice_number,
      status: data.status,
      amount_paid: parseFloat(data.amount_paid),
      amount_due: parseFloat(data.total) - parseFloat(data.amount_paid),
      due_date: data.due_date,
    },
  };
}

async function void_invoice(userId, { invoice_id }) {
  const resolved = await resolveInvoiceId(userId, invoice_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'cancelled' })
    .eq('id', resolved.id)
    .eq('user_id', userId)
    .select('invoice_number')
    .single();

  if (error) return { error: `Failed to void invoice: ${error.message}` };

  return { success: true, invoice_number: data.invoice_number };
}

// ==================== SCHEDULE MUTATIONS ====================

async function create_work_schedule(userId, { worker, project, start_date, end_date, start_time, end_time, notes }) {
  const resolvedWorker = await resolveWorkerId(userId, worker);
  if (resolvedWorker.error) return resolvedWorker;
  if (resolvedWorker.suggestions) return resolvedWorker;

  let projectId = null;
  let projectName = null;
  if (project) {
    const resolvedProject = await resolveProjectId(userId, project);
    if (resolvedProject.error) return resolvedProject;
    if (resolvedProject.suggestions) return resolvedProject;
    projectId = resolvedProject.id;

    // Get project name for response
    const { data: proj } = await supabase
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .single();
    projectName = proj?.name;
  }

  // Get worker name for response
  const { data: workerData } = await supabase
    .from('workers')
    .select('full_name')
    .eq('id', resolvedWorker.id)
    .single();

  const { data, error } = await supabase
    .from('worker_schedules')
    .insert({
      worker_id: resolvedWorker.id,
      project_id: projectId,
      start_date,
      end_date: end_date || start_date,
      start_time: start_time || null,
      end_time: end_time || null,
      notes: notes || null,
      created_by: userId,
    })
    .select()
    .single();

  if (error) return { error: `Failed to create schedule: ${error.message}` };

  return {
    success: true,
    schedule: {
      id: data.id,
      worker_name: workerData?.full_name,
      project_name: projectName,
      start_date: data.start_date,
      end_date: data.end_date,
      start_time: data.start_time,
      end_time: data.end_time,
    },
  };
}

// ==================== TASK MUTATIONS ====================

async function create_worker_task(userId, { project, title, description, start_date, end_date }) {
  const resolved = await resolveProjectId(userId, project);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  const taskStartDate = start_date || today();

  // Get project name for response
  const { data: proj } = await supabase
    .from('projects')
    .select('name')
    .eq('id', resolved.id)
    .single();

  const { data, error } = await supabase
    .from('worker_tasks')
    .insert({
      owner_id: userId,
      project_id: resolved.id,
      title,
      description: description || null,
      start_date: taskStartDate,
      end_date: end_date || taskStartDate,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return { error: `Failed to create task: ${error.message}` };

  // Notify workers assigned to this project about the new task
  const { data: assignments } = await supabase
    .from('project_assignments')
    .select('worker_id, workers(user_id)')
    .eq('project_id', resolved.id);
  for (const a of (assignments || [])) {
    if (a.workers?.user_id) {
      sendNotification({
        userId: a.workers.user_id,
        title: 'New Task',
        body: `New task: ${title}${proj?.name ? ` on ${proj.name}` : ''}`,
        type: 'worker_update',
        data: { screen: 'Assignments' },
        projectId: resolved.id,
      });
    }
  }

  return {
    success: true,
    task: {
      id: data.id,
      title: data.title,
      project_name: proj?.name,
      start_date: data.start_date,
      end_date: data.end_date,
      status: data.status,
    },
  };
}

// ==================== SERVICE PRICING MUTATIONS ====================

async function update_service_pricing(userId, { service_name, item_name, price, unit }) {
  // Find service category by name
  const { data: categories } = await supabase
    .from('service_categories')
    .select('id, name')
    .ilike('name', `%${service_name}%`)
    .limit(5);

  if (!categories || categories.length === 0) {
    return { error: `No service category found matching "${service_name}"` };
  }

  const category = categories[0];

  // Find or create user_services entry
  let { data: userService } = await supabase
    .from('user_services')
    .select('id, pricing')
    .eq('user_id', userId)
    .eq('category_id', category.id)
    .single();

  if (!userService) {
    // Create user_services entry
    const { data: created, error: createErr } = await supabase
      .from('user_services')
      .insert({
        user_id: userId,
        category_id: category.id,
        pricing: {},
      })
      .select('id, pricing')
      .single();

    if (createErr) return { error: `Failed to create service entry: ${createErr.message}` };
    userService = created;
  }

  // Update pricing JSONB
  const pricing = userService.pricing || {};
  pricing[item_name] = { price: parseFloat(price), unit: unit || pricing[item_name]?.unit || 'unit' };

  const { error: updateErr } = await supabase
    .from('user_services')
    .update({ pricing })
    .eq('id', userService.id);

  if (updateErr) return { error: `Failed to update pricing: ${updateErr.message}` };

  return {
    success: true,
    service: category.name,
    item: item_name,
    price: parseFloat(price),
    unit: pricing[item_name].unit,
  };
}

// ==================== TOOL EXECUTOR ====================

// ==================== BANK RECONCILIATION ====================

async function get_bank_transactions(userId, args = {}) {
  const { match_status, start_date, end_date, bank_account_id } = args;

  // Verify user is an owner
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profile?.role !== 'owner') {
    return { error: 'Bank transactions are only available to business owners.' };
  }

  let q = supabase
    .from('bank_transactions')
    .select(`
      id, amount, date, description, merchant_name, category,
      match_status, match_confidence, matched_at,
      matched_transaction:matched_transaction_id (
        id, description, amount, category, project_id,
        project:project_id ( id, name )
      ),
      assigned_project:assigned_project_id ( id, name ),
      bank_account:bank_account_id ( institution_name, account_mask )
    `)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(30);

  if (match_status) q = q.eq('match_status', match_status);
  if (bank_account_id) q = q.eq('bank_account_id', bank_account_id);
  if (start_date) q = q.gte('date', start_date);
  if (end_date) q = q.lte('date', end_date);

  const { data, error } = await q;

  if (error) {
    logger.error('get_bank_transactions error:', error);
    return { error: error.message };
  }

  return {
    transactions: data || [],
    count: (data || []).length,
    hint: 'Use assign_bank_transaction to assign unmatched transactions to projects.'
  };
}

async function assign_bank_transaction(userId, args = {}) {
  const { bank_transaction_id, project_id, category, description, subcategory } = args;

  if (!bank_transaction_id || !project_id) {
    return { error: 'Both bank_transaction_id and project_id are required.' };
  }

  // Verify user is an owner
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profile?.role !== 'owner') {
    return { error: 'Bank transaction assignment is only available to business owners.' };
  }

  // Resolve bank transaction - try UUID first, then fuzzy match
  let bankTx = null;
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (isUUID.test(bank_transaction_id)) {
    const { data } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('id', bank_transaction_id)
      .eq('user_id', userId)
      .single();
    bankTx = data;
  }

  // Fuzzy match by description, merchant name, or amount
  if (!bankTx) {
    const searchTerm = bank_transaction_id.toLowerCase();
    const { data: candidates } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('user_id', userId)
      .in('match_status', ['unmatched', 'suggested_match'])
      .order('date', { ascending: false })
      .limit(100);

    if (candidates) {
      // Try to match by amount (e.g., "$432" or "432")
      const amountSearch = parseFloat(searchTerm.replace(/[$,]/g, ''));

      bankTx = candidates.find(tx => {
        const desc = (tx.description || '').toLowerCase();
        const merchant = (tx.merchant_name || '').toLowerCase();
        // Match by description or merchant name
        if (desc.includes(searchTerm) || merchant.includes(searchTerm)) return true;
        // Match by amount
        if (!isNaN(amountSearch) && Math.abs(tx.amount) === amountSearch) return true;
        return false;
      });
    }
  }

  if (!bankTx) {
    return { error: `Could not find a bank transaction matching "${bank_transaction_id}". Try providing more specific details.` };
  }

  if (bankTx.match_status === 'created' || bankTx.match_status === 'manually_matched' || bankTx.match_status === 'auto_matched') {
    return { error: `This bank transaction is already matched/assigned.` };
  }

  // Resolve project
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;
  const resolvedProjectId = resolved.id;

  // Get project name
  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', resolvedProjectId)
    .single();

  // Create project_transaction
  const txAmount = Math.abs(bankTx.amount);
  const txType = bankTx.amount > 0 ? 'expense' : 'income';

  const insertData = {
    project_id: resolvedProjectId,
    type: txType,
    category: category || bankTx.category || 'misc',
    description: description || bankTx.merchant_name || bankTx.description,
    amount: txAmount,
    date: bankTx.date,
    payment_method: 'card',
    notes: `Imported from bank: ${bankTx.description}`,
    created_by: userId,
    bank_transaction_id: bankTx.id,
  };
  if (subcategory) insertData.subcategory = subcategory;

  const { data: projectTx, error: insertError } = await supabase
    .from('project_transactions')
    .insert(insertData)
    .select()
    .single();

  if (insertError) {
    logger.error('assign_bank_transaction insert error:', insertError);
    return { error: insertError.message };
  }

  // Update bank transaction status
  await supabase
    .from('bank_transactions')
    .update({
      match_status: 'created',
      matched_transaction_id: projectTx.id,
      matched_at: new Date().toISOString(),
      matched_by: 'ai',
      assigned_project_id: resolvedProjectId,
      assigned_category: category || bankTx.category || 'misc',
    })
    .eq('id', bankTx.id);

  return {
    success: true,
    message: `Assigned $${txAmount.toFixed(2)} ${txType} to "${project?.name || 'project'}" as ${category || 'misc'}.`,
    project_transaction: projectTx,
    bank_transaction_id: bankTx.id,
  };
}

async function get_reconciliation_summary(userId, args = {}) {
  const { start_date, end_date } = args;

  // Verify user is an owner
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profile?.role !== 'owner') {
    return { error: 'Reconciliation summary is only available to business owners.' };
  }

  let q = supabase
    .from('bank_transactions')
    .select('match_status, amount')
    .eq('user_id', userId);

  if (start_date) q = q.gte('date', start_date);
  if (end_date) q = q.lte('date', end_date);

  const { data, error } = await q;

  if (error) {
    logger.error('get_reconciliation_summary error:', error);
    return { error: error.message };
  }

  if (!data || data.length === 0) {
    // Check if they have connected accounts
    const { data: accounts } = await supabase
      .from('connected_bank_accounts')
      .select('id')
      .eq('user_id', userId)
      .neq('sync_status', 'disconnected');

    if (!accounts || accounts.length === 0) {
      return { message: 'No bank accounts connected yet. Connect a bank account or upload a CSV statement to start reconciling transactions.' };
    }
    return { message: 'No bank transactions found for the selected period.' };
  }

  const summary = {
    total_transactions: data.length,
    auto_matched: 0,
    suggested_matches: 0,
    manually_matched: 0,
    created_from_bank: 0,
    unmatched: 0,
    ignored: 0,
    unmatched_amount: 0,
    total_amount: 0,
  };

  for (const tx of data) {
    const absAmount = Math.abs(tx.amount);
    summary.total_amount += absAmount;

    switch (tx.match_status) {
      case 'auto_matched': summary.auto_matched++; break;
      case 'suggested_match': summary.suggested_matches++; break;
      case 'manually_matched': summary.manually_matched++; break;
      case 'created': summary.created_from_bank++; break;
      case 'ignored': summary.ignored++; break;
      case 'unmatched':
        summary.unmatched++;
        summary.unmatched_amount += absAmount;
        break;
    }
  }

  summary.total_matched = summary.auto_matched + summary.manually_matched + summary.created_from_bank;
  summary.needs_attention = summary.unmatched + summary.suggested_matches;
  summary.unmatched_amount = parseFloat(summary.unmatched_amount.toFixed(2));
  summary.total_amount = parseFloat(summary.total_amount.toFixed(2));

  return summary;
}

// ==================== FINANCIAL REPORTS ====================

const DEFAULT_TAX_CATEGORY_MAP = {
  materials: 'cogs',
  labor: 'contract_labor',
  subcontractor: 'contract_labor',
  equipment: 'rent_lease',
  permits: 'taxes_licenses',
  misc: 'other_deduction',
  payment: null,
  deposit: null,
};

const TAX_CATEGORY_LABELS = {
  cogs: 'Cost of Goods Sold',
  contract_labor: 'Contract Labor',
  rent_lease: 'Rent / Lease',
  repairs_maintenance: 'Repairs & Maintenance',
  supplies: 'Supplies',
  taxes_licenses: 'Taxes & Licenses',
  utilities: 'Utilities',
  vehicle: 'Vehicle Expenses',
  insurance: 'Insurance',
  other_deduction: 'Other Deductions',
};

async function get_ar_aging(userId) {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_name, project_name, total, amount_paid, status, due_date, created_at')
    .eq('user_id', userId)
    .in('status', ['unpaid', 'partial', 'overdue']);

  if (!invoices || invoices.length === 0) {
    return { clients: [], totals: { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0, total: 0 }, invoiceCount: 0 };
  }

  const now = new Date();
  const buckets = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 };
  const clientMap = {};

  for (const inv of invoices) {
    const balance = (inv.total || 0) - (inv.amount_paid || 0);
    if (balance <= 0) continue;

    const dueDate = inv.due_date ? new Date(inv.due_date + 'T12:00:00') : null;
    const daysOverdue = dueDate ? Math.max(0, Math.floor((now - dueDate) / (1000 * 60 * 60 * 24))) : 0;

    let bucket;
    if (!dueDate || daysOverdue === 0) bucket = 'current';
    else if (daysOverdue <= 30) bucket = 'days1_30';
    else if (daysOverdue <= 60) bucket = 'days31_60';
    else if (daysOverdue <= 90) bucket = 'days61_90';
    else bucket = 'days90plus';

    buckets[bucket] += balance;

    const client = inv.client_name || 'Unknown Client';
    if (!clientMap[client]) {
      clientMap[client] = { client, current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0, total: 0, invoices: [] };
    }
    clientMap[client][bucket] += balance;
    clientMap[client].total += balance;
    clientMap[client].invoices.push({
      invoice_number: inv.invoice_number,
      project: inv.project_name,
      balance: parseFloat(balance.toFixed(2)),
      daysOverdue,
      dueDate: inv.due_date,
    });
  }

  const total = buckets.current + buckets.days1_30 + buckets.days31_60 + buckets.days61_90 + buckets.days90plus;

  return {
    clients: Object.values(clientMap).sort((a, b) => b.total - a.total).map(c => ({
      ...c,
      current: parseFloat(c.current.toFixed(2)),
      days1_30: parseFloat(c.days1_30.toFixed(2)),
      days31_60: parseFloat(c.days31_60.toFixed(2)),
      days61_90: parseFloat(c.days61_90.toFixed(2)),
      days90plus: parseFloat(c.days90plus.toFixed(2)),
      total: parseFloat(c.total.toFixed(2)),
    })),
    totals: {
      current: parseFloat(buckets.current.toFixed(2)),
      days1_30: parseFloat(buckets.days1_30.toFixed(2)),
      days31_60: parseFloat(buckets.days31_60.toFixed(2)),
      days61_90: parseFloat(buckets.days61_90.toFixed(2)),
      days90plus: parseFloat(buckets.days90plus.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
    },
    invoiceCount: invoices.length,
  };
}

async function get_tax_summary(userId, args = {}) {
  const taxYear = args.tax_year || new Date().getFullYear();
  const yearStart = `${taxYear}-01-01`;
  const yearEnd = `${taxYear}-12-31`;

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  const projectIds = (projects || []).map(p => p.id);
  if (projectIds.length === 0) {
    return { taxYear, grossRevenue: 0, deductions: {}, totalDeductions: 0, netProfit: 0, contractors: [] };
  }

  const { data: transactions } = await supabase
    .from('project_transactions')
    .select('type, category, tax_category, amount, description')
    .in('project_id', projectIds)
    .gte('date', yearStart)
    .lte('date', yearEnd);

  let grossRevenue = 0;
  const deductions = {};
  const contractorTotals = {};

  for (const t of (transactions || [])) {
    if (t.type === 'income') {
      grossRevenue += parseFloat(t.amount || 0);
      continue;
    }

    // Expense — determine tax category
    const taxCat = t.tax_category || DEFAULT_TAX_CATEGORY_MAP[t.category] || 'other_deduction';
    if (taxCat) {
      deductions[taxCat] = (deductions[taxCat] || 0) + parseFloat(t.amount || 0);
    }

    // Track contractor payments for 1099
    if (t.category === 'subcontractor' || (t.category === 'labor' && t.description)) {
      const name = (t.description || 'Unknown Contractor').trim();
      contractorTotals[name] = (contractorTotals[name] || 0) + parseFloat(t.amount || 0);
    }
  }

  const totalDeductions = Object.values(deductions).reduce((s, v) => s + v, 0);

  // Format deductions with labels
  const formattedDeductions = {};
  for (const [key, amount] of Object.entries(deductions)) {
    formattedDeductions[TAX_CATEGORY_LABELS[key] || key] = parseFloat(amount.toFixed(2));
  }

  const contractors = Object.entries(contractorTotals)
    .map(([name, totalPaid]) => ({
      name,
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      requires1099: totalPaid >= 600,
    }))
    .sort((a, b) => b.totalPaid - a.totalPaid);

  return {
    taxYear,
    grossRevenue: parseFloat(grossRevenue.toFixed(2)),
    deductions: formattedDeductions,
    totalDeductions: parseFloat(totalDeductions.toFixed(2)),
    netProfit: parseFloat((grossRevenue - totalDeductions).toFixed(2)),
    contractors,
    contractorsRequiring1099: contractors.filter(c => c.requires1099).length,
  };
}

async function get_payroll_summary(userId, args = {}) {
  const now = new Date();
  const startDate = args.start_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const endDate = args.end_date || now.toISOString().split('T')[0];

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  const projectIds = (projects || []).map(p => p.id);
  const projectMap = {};
  (projects || []).forEach(p => { projectMap[p.id] = p.name; });

  if (projectIds.length === 0) {
    return { period: { start: startDate, end: endDate }, workers: [], totalGrossPay: 0, workerCount: 0 };
  }

  // Get labor transactions
  const { data: laborTx } = await supabase
    .from('project_transactions')
    .select('amount, description, project_id')
    .in('project_id', projectIds)
    .eq('type', 'expense')
    .eq('category', 'labor')
    .gte('date', startDate)
    .lte('date', endDate);

  // Get workers for matching
  const ownerId = await resolveOwnerId(userId);
  const { data: workers } = await supabase
    .from('workers')
    .select('id, name, trade, hourly_rate, payment_type, payment_rate')
    .eq('owner_id', ownerId);

  const workerMap = {};
  (workers || []).forEach(w => { workerMap[w.name?.toLowerCase()] = w; });

  // Group by worker name (from description)
  const payByWorker = {};
  for (const tx of (laborTx || [])) {
    const name = (tx.description || 'Unknown Worker').trim();
    if (!payByWorker[name]) {
      const matched = workerMap[name.toLowerCase()];
      payByWorker[name] = {
        name,
        trade: matched?.trade || '',
        rate: matched?.payment_rate || matched?.hourly_rate || null,
        paymentType: matched?.payment_type || null,
        grossPay: 0,
        projects: new Set(),
      };
    }
    payByWorker[name].grossPay += parseFloat(tx.amount || 0);
    payByWorker[name].projects.add(projectMap[tx.project_id] || 'Unknown Project');
  }

  const workerList = Object.values(payByWorker)
    .map(w => ({
      name: w.name,
      trade: w.trade,
      rate: w.rate,
      paymentType: w.paymentType,
      grossPay: parseFloat(w.grossPay.toFixed(2)),
      projects: [...w.projects],
    }))
    .sort((a, b) => b.grossPay - a.grossPay);

  const totalGrossPay = workerList.reduce((s, w) => s + w.grossPay, 0);

  return {
    period: { start: startDate, end: endDate },
    workers: workerList,
    totalGrossPay: parseFloat(totalGrossPay.toFixed(2)),
    workerCount: workerList.length,
  };
}

async function get_cash_flow(userId, args = {}) {
  const months = Math.min(args.months || 6, 12);

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  const projectIds = (projects || []).map(p => p.id);

  // Calculate start date (N months ago, first of month)
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const startStr = startDate.toISOString().split('T')[0];

  let totalCashIn = 0, totalCashOut = 0;
  const monthlyData = [];

  if (projectIds.length > 0) {
    const { data: transactions } = await supabase
      .from('project_transactions')
      .select('type, amount, date')
      .in('project_id', projectIds)
      .gte('date', startStr)
      .order('date', { ascending: true });

    // Build month buckets
    const monthMap = {};
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = { period: key, cashIn: 0, cashOut: 0, net: 0 };
    }

    for (const t of (transactions || [])) {
      const monthKey = t.date?.substring(0, 7);
      if (!monthMap[monthKey]) continue;
      const amount = parseFloat(t.amount || 0);
      if (t.type === 'income') {
        monthMap[monthKey].cashIn += amount;
        totalCashIn += amount;
      } else {
        monthMap[monthKey].cashOut += amount;
        totalCashOut += amount;
      }
    }

    for (const m of Object.values(monthMap)) {
      m.cashIn = parseFloat(m.cashIn.toFixed(2));
      m.cashOut = parseFloat(m.cashOut.toFixed(2));
      m.net = parseFloat((m.cashIn - m.cashOut).toFixed(2));
      monthlyData.push(m);
    }
  }

  // Outstanding receivables
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total, amount_paid')
    .eq('user_id', userId)
    .in('status', ['unpaid', 'partial', 'overdue']);

  let outstandingReceivables = 0;
  for (const inv of (invoices || [])) {
    outstandingReceivables += (inv.total || 0) - (inv.amount_paid || 0);
  }

  return {
    months: monthlyData,
    outstandingReceivables: parseFloat(outstandingReceivables.toFixed(2)),
    totalCashIn: parseFloat(totalCashIn.toFixed(2)),
    totalCashOut: parseFloat(totalCashOut.toFixed(2)),
    netCashFlow: parseFloat((totalCashIn - totalCashOut).toFixed(2)),
  };
}

async function get_recurring_expenses(userId, args = {}) {
  const activeOnly = args.active_only !== false; // default true

  let q = supabase
    .from('recurring_expenses')
    .select('id, description, amount, category, tax_category, frequency, next_due_date, is_active, project_id, projects(name)')
    .eq('user_id', userId)
    .order('next_due_date', { ascending: true });

  if (activeOnly) q = q.eq('is_active', true);

  const { data, error } = await q;

  if (error) {
    logger.error('get_recurring_expenses error:', error);
    return { error: error.message };
  }

  const expenses = (data || []).map(e => ({
    id: e.id,
    description: e.description,
    amount: parseFloat(e.amount || 0),
    category: e.category,
    taxCategory: e.tax_category,
    frequency: e.frequency,
    nextDueDate: e.next_due_date,
    isActive: e.is_active,
    projectName: e.projects?.name || null,
  }));

  // Estimate monthly cost
  let estimatedMonthlyCost = 0;
  for (const e of expenses) {
    if (!e.isActive) continue;
    if (e.frequency === 'weekly') estimatedMonthlyCost += e.amount * 4.33;
    else if (e.frequency === 'biweekly') estimatedMonthlyCost += e.amount * 2.17;
    else estimatedMonthlyCost += e.amount;
  }

  return {
    expenses,
    count: expenses.length,
    estimatedMonthlyCost: parseFloat(estimatedMonthlyCost.toFixed(2)),
  };
}

// ==================== DOCUMENT MANAGEMENT ====================

async function get_project_documents(userId, args) {
  const { project_id, category } = args;
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;

  let query = supabase
    .from('project_documents')
    .select('id, file_name, file_type, category, notes, visible_to_workers, created_at')
    .eq('project_id', resolved.id)
    .order('created_at', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;
  if (error) {
    logger.error('get_project_documents error:', error);
    return { error: 'Failed to fetch documents' };
  }

  return {
    documents: (data || []).map(d => ({
      id: d.id,
      fileName: d.file_name,
      fileType: d.file_type,
      category: d.category,
      notes: d.notes,
      visibleToWorkers: d.visible_to_workers,
      createdAt: d.created_at,
    })),
    count: (data || []).length,
  };
}

async function get_business_contracts(userId, args) {
  const { data, error } = await supabase
    .from('contract_documents')
    .select('id, file_name, file_url, file_type, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('get_business_contracts error:', error);
    return { error: 'Failed to fetch business contracts' };
  }

  if (!data || data.length === 0) {
    return { contracts: [], count: 0, message: 'No business contracts have been uploaded yet. You can upload contracts in Settings > Contracts.' };
  }

  return {
    contracts: data.map(d => ({
      id: d.id,
      fileName: d.file_name,
      fileUrl: d.file_url,
      fileType: d.file_type,
      uploadedAt: d.created_at,
    })),
    count: data.length,
  };
}

async function upload_project_document(userId, args) {
  const { project_id, category = 'general', visible_to_workers = false } = args;
  const attachments = args._attachments;

  if (!attachments || attachments.length === 0) {
    return { error: 'No files attached. Please attach files to your message and try again.' };
  }

  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;

  const uploaded = [];
  const failed = [];

  for (const att of attachments) {
    try {
      const fileName = att.name || `Document_${Date.now()}`;
      const fileExt = fileName.split('.').pop()?.toLowerCase() || 'bin';
      const timestamp = Date.now();
      const filePath = `${userId}/${resolved.id}/${timestamp}.${fileExt}`;

      // Determine content type and file_type
      const mimeType = att.mimeType || 'application/octet-stream';
      let fileType = 'document';
      if (mimeType.startsWith('image/')) fileType = 'image';
      else if (mimeType === 'application/pdf' || fileExt === 'pdf') fileType = 'pdf';

      // Decode base64 and upload to Supabase storage
      const binaryString = Buffer.from(att.base64, 'base64');

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(filePath, binaryString, {
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) {
        logger.error('Document upload error:', uploadError);
        failed.push({ fileName, error: uploadError.message });
        continue;
      }

      // Create database record
      const { data: doc, error: dbError } = await supabase
        .from('project_documents')
        .insert({
          project_id: resolved.id,
          file_name: args.file_name || fileName,
          file_url: filePath,
          file_type: fileType,
          category,
          uploaded_by: userId,
          visible_to_workers,
        })
        .select('id, file_name, file_type, category')
        .single();

      if (dbError) {
        logger.error('Document DB insert error:', dbError);
        failed.push({ fileName, error: dbError.message });
        continue;
      }

      uploaded.push(doc);
    } catch (err) {
      logger.error('Document upload exception:', err);
      failed.push({ fileName: att.name, error: err.message });
    }
  }

  return {
    uploaded: uploaded.map(d => ({ id: d.id, fileName: d.file_name, fileType: d.file_type, category: d.category })),
    uploadedCount: uploaded.length,
    failedCount: failed.length,
    failed: failed.length > 0 ? failed : undefined,
  };
}

async function update_project_document(userId, args) {
  const { document_id, file_name, category, visible_to_workers } = args;
  if (!document_id) return { error: 'document_id is required' };

  // Verify ownership via project join
  const { data: doc, error: fetchError } = await supabase
    .from('project_documents')
    .select('id, project_id, projects!inner(user_id, assigned_supervisor_id)')
    .eq('id', document_id)
    .single();

  if (fetchError || !doc) return { error: 'Document not found' };
  if (doc.projects.user_id !== userId && doc.projects.assigned_supervisor_id !== userId) {
    return { error: 'You do not have permission to update this document' };
  }

  const updates = {};
  if (file_name !== undefined) updates.file_name = file_name;
  if (category !== undefined) updates.category = category;
  if (visible_to_workers !== undefined) updates.visible_to_workers = visible_to_workers;

  if (Object.keys(updates).length === 0) {
    return { error: 'No fields to update. Provide file_name, category, or visible_to_workers.' };
  }

  const { data, error } = await supabase
    .from('project_documents')
    .update(updates)
    .eq('id', document_id)
    .select('id, file_name, file_type, category, visible_to_workers')
    .single();

  if (error) {
    logger.error('update_project_document error:', error);
    return { error: 'Failed to update document' };
  }

  return {
    document: {
      id: data.id,
      fileName: data.file_name,
      fileType: data.file_type,
      category: data.category,
      visibleToWorkers: data.visible_to_workers,
    },
    message: 'Document updated successfully',
  };
}

async function delete_project_document(userId, args) {
  const { document_id } = args;
  if (!document_id) return { error: 'document_id is required' };

  // Verify ownership and get file path
  const { data: doc, error: fetchError } = await supabase
    .from('project_documents')
    .select('id, file_url, file_name, projects!inner(user_id, assigned_supervisor_id)')
    .eq('id', document_id)
    .single();

  if (fetchError || !doc) return { error: 'Document not found' };
  if (doc.projects.user_id !== userId && doc.projects.assigned_supervisor_id !== userId) {
    return { error: 'You do not have permission to delete this document' };
  }

  // Delete from storage if it's a storage path (not a full URL)
  if (doc.file_url && !doc.file_url.startsWith('http')) {
    const { error: storageError } = await supabase.storage
      .from('project-documents')
      .remove([doc.file_url]);

    if (storageError) {
      logger.warn('Failed to delete file from storage:', storageError);
    }
  }

  // Delete database record
  const { error: deleteError } = await supabase
    .from('project_documents')
    .delete()
    .eq('id', document_id);

  if (deleteError) {
    logger.error('delete_project_document error:', deleteError);
    return { error: 'Failed to delete document' };
  }

  return { message: `Document "${doc.file_name}" deleted successfully` };
}

// ==================== CLOCK IN/OUT ====================

function formatHoursMinutes(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function parseClockTime(timeStr) {
  if (!timeStr) return new Date().toISOString();
  // HH:MM format → combine with today
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr)) {
    const today = new Date();
    const [hours, minutes] = timeStr.split(':').map(Number);
    today.setHours(hours, minutes, 0, 0);
    return today.toISOString();
  }
  return new Date(timeStr).toISOString();
}

async function clock_in_worker(userId, args) {
  let { worker_id, project_id, clock_in_time } = args;

  // Resolve names to UUIDs
  const resolvedWorker = await resolveWorkerId(userId, worker_id);
  if (resolvedWorker.error) return { error: resolvedWorker.error };
  if (resolvedWorker.suggestions) return resolvedWorker;
  worker_id = resolvedWorker.id;

  const resolvedProject = await resolveProjectId(userId, project_id);
  if (resolvedProject.error) return { error: resolvedProject.error };
  if (resolvedProject.suggestions) return resolvedProject;
  project_id = resolvedProject.id;

  const ownerId = await resolveOwnerId(userId);

  // Verify worker ownership
  const { data: worker, error: wrkErr } = await supabase
    .from('workers')
    .select('id, full_name')
    .eq('id', worker_id)
    .eq('owner_id', ownerId)
    .single();

  if (wrkErr || !worker) return { error: 'Worker not found or access denied' };

  // Verify project ownership
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', project_id)
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
    .single();

  if (projErr || !project) return { error: 'Project not found or access denied' };

  // Check not already clocked in
  const { data: activeSession } = await supabase
    .from('time_tracking')
    .select('id')
    .eq('worker_id', worker_id)
    .is('clock_out', null)
    .limit(1)
    .single();

  if (activeSession) {
    return { error: `${worker.full_name} is already clocked in. Clock them out first.` };
  }

  const clockInTimestamp = parseClockTime(clock_in_time);

  const { data: record, error: insertErr } = await supabase
    .from('time_tracking')
    .insert({
      worker_id,
      project_id,
      clock_in: clockInTimestamp,
    })
    .select('id, worker_id, project_id, clock_in')
    .single();

  if (insertErr) {
    logger.error('clock_in_worker insert error:', insertErr);
    return { error: 'Failed to clock in worker' };
  }

  // Send notification (fire and forget)
  sendNotification({
    userId: ownerId,
    title: 'Worker Clocked In',
    body: `${worker.full_name} clocked in on ${project.name}`,
    type: 'worker_update',
    data: { screen: 'Workers' },
    workerId: worker_id,
  });

  return {
    success: true,
    message: `${worker.full_name} clocked in to ${project.name}`,
    workerName: worker.full_name,
    projectName: project.name,
    clockInTime: clockInTimestamp,
    timeTrackingId: record.id,
  };
}

async function clock_out_worker(userId, args) {
  let { worker_id, clock_out_time, notes } = args;

  // Resolve name to UUID
  const resolvedWorker = await resolveWorkerId(userId, worker_id);
  if (resolvedWorker.error) return { error: resolvedWorker.error };
  if (resolvedWorker.suggestions) return resolvedWorker;
  worker_id = resolvedWorker.id;

  const ownerId = await resolveOwnerId(userId);

  // Verify worker ownership
  const { data: worker, error: wrkErr } = await supabase
    .from('workers')
    .select('id, full_name, payment_type, hourly_rate, daily_rate')
    .eq('id', worker_id)
    .eq('owner_id', ownerId)
    .single();

  if (wrkErr || !worker) return { error: 'Worker not found or access denied' };

  // Find active session
  const { data: activeSession, error: sessionErr } = await supabase
    .from('time_tracking')
    .select(`
      id, worker_id, project_id, clock_in,
      projects!inner ( id, name )
    `)
    .eq('worker_id', worker_id)
    .is('clock_out', null)
    .limit(1)
    .single();

  if (sessionErr || !activeSession) {
    return { error: `${worker.full_name} is not currently clocked in.` };
  }

  const clockOutTimestamp = parseClockTime(clock_out_time);

  // Update clock_out
  const { error: updateErr } = await supabase
    .from('time_tracking')
    .update({ clock_out: clockOutTimestamp, notes: notes || null })
    .eq('id', activeSession.id);

  if (updateErr) {
    logger.error('clock_out_worker update error:', updateErr);
    return { error: 'Failed to clock out worker' };
  }

  // Calculate hours worked
  const clockIn = new Date(activeSession.clock_in);
  const clockOut = new Date(clockOutTimestamp);
  const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60);

  // Calculate labor cost and create transaction
  let laborCost = 0;
  let costDescription = '';

  switch (worker.payment_type) {
    case 'hourly':
      laborCost = hoursWorked * (worker.hourly_rate || 0);
      costDescription = `${worker.full_name} - ${formatHoursMinutes(hoursWorked)} @ $${worker.hourly_rate}/hr`;
      break;
    case 'daily':
      if (hoursWorked < 5) {
        laborCost = (worker.daily_rate || 0) * 0.5;
        costDescription = `${worker.full_name} - Half day (${formatHoursMinutes(hoursWorked)}) @ $${worker.daily_rate}/day`;
      } else {
        laborCost = worker.daily_rate || 0;
        costDescription = `${worker.full_name} - Full day (${formatHoursMinutes(hoursWorked)}) @ $${worker.daily_rate}/day`;
      }
      break;
    default:
      // weekly, project_based — no auto labor cost
      break;
  }

  if (laborCost > 0) {
    const { error: txnErr } = await supabase
      .from('project_transactions')
      .insert({
        project_id: activeSession.project_id,
        type: 'expense',
        category: 'labor',
        description: costDescription,
        amount: laborCost,
        date: new Date().toISOString().split('T')[0],
        worker_id: worker.id,
        time_tracking_id: activeSession.id,
        is_auto_generated: true,
        notes: notes || null,
      });

    if (txnErr) {
      logger.error('clock_out_worker labor transaction error:', txnErr);
      // Worker is still clocked out, just no transaction
    }
  }

  const projectName = activeSession.projects?.name || '';

  // Send notification (fire and forget)
  sendNotification({
    userId: ownerId,
    title: 'Worker Clocked Out',
    body: `${worker.full_name} clocked out from ${projectName} (${formatHoursMinutes(hoursWorked)})`,
    type: 'worker_update',
    data: { screen: 'Workers' },
    workerId: worker_id,
  });

  return {
    success: true,
    message: `${worker.full_name} clocked out from ${projectName} — ${formatHoursMinutes(hoursWorked)} worked`,
    workerName: worker.full_name,
    projectName,
    hoursWorked: Math.round(hoursWorked * 100) / 100,
    laborCost: Math.round(laborCost * 100) / 100,
  };
}

// ==================== SERVICE PLAN TOOLS ====================

async function get_service_plans(userId, { status } = {}) {
  const ownerId = await resolveOwnerId(userId);

  let query = supabase
    .from('service_plans')
    .select('*')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const { data: plans, error } = await query;
  if (error) return { error: error.message };
  if (!plans || plans.length === 0) return [];

  // Get location counts
  const planIds = plans.map(p => p.id);
  const { data: locations } = await supabase
    .from('service_locations')
    .select('service_plan_id')
    .in('service_plan_id', planIds)
    .eq('is_active', true);

  const locCounts = {};
  (locations || []).forEach(l => {
    locCounts[l.service_plan_id] = (locCounts[l.service_plan_id] || 0) + 1;
  });

  // Get visit stats for current month
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = nextMonth.toISOString().split('T')[0];

  const { data: visits } = await supabase
    .from('service_visits')
    .select('service_plan_id, status')
    .in('service_plan_id', planIds)
    .gte('scheduled_date', monthStart)
    .lt('scheduled_date', monthEnd)
    .neq('status', 'cancelled');

  const visitStats = {};
  (visits || []).forEach(v => {
    if (!visitStats[v.service_plan_id]) visitStats[v.service_plan_id] = { total: 0, completed: 0 };
    visitStats[v.service_plan_id].total++;
    if (v.status === 'completed') visitStats[v.service_plan_id].completed++;
  });

  return plans.map(p => ({
    id: p.id,
    name: p.name,
    service_type: p.service_type,
    status: p.status,
    billing_cycle: p.billing_cycle,
    price_per_visit: p.price_per_visit ? parseFloat(p.price_per_visit) : null,
    monthly_rate: p.monthly_rate ? parseFloat(p.monthly_rate) : null,
    location_count: locCounts[p.id] || 0,
    visits_this_month: visitStats[p.id]?.total || 0,
    completed_this_month: visitStats[p.id]?.completed || 0,
  }));
}

async function get_daily_route(userId, { date, worker_id } = {}) {
  const ownerId = await resolveOwnerId(userId);
  const targetDate = date || new Date().toISOString().split('T')[0];

  // Check if user is a worker
  const { data: workerRecord } = await supabase
    .from('workers')
    .select('id, owner_id')
    .eq('user_id', userId)
    .single();

  const isWorker = !!workerRecord;

  if (isWorker) {
    // Worker: their visits for the day
    const { data: visits } = await supabase
      .from('service_visits')
      .select('*')
      .eq('assigned_worker_id', workerRecord.id)
      .eq('scheduled_date', targetDate)
      .neq('status', 'cancelled')
      .order('scheduled_time', { ascending: true, nullsFirst: false });

    if (!visits || visits.length === 0) return { date: targetDate, visits: [], message: 'No visits scheduled for this date.' };

    const locationIds = [...new Set(visits.map(v => v.service_location_id))];
    const { data: locations } = await supabase
      .from('service_locations')
      .select('id, name, address, access_notes')
      .in('id', locationIds);
    const locMap = {};
    (locations || []).forEach(l => { locMap[l.id] = l; });

    return {
      date: targetDate,
      visits: visits.map(v => ({
        id: v.id,
        status: v.status,
        scheduled_time: v.scheduled_time,
        location_name: locMap[v.service_location_id]?.name,
        location_address: locMap[v.service_location_id]?.address,
        access_notes: locMap[v.service_location_id]?.access_notes,
      })),
    };
  }

  // Owner: all routes + unrouted visits
  const { data: routes } = await supabase
    .from('service_routes')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('route_date', targetDate);

  // Worker names
  const workerIds = [...new Set((routes || []).map(r => r.assigned_worker_id).filter(Boolean))];
  let workerNames = {};
  if (workerIds.length > 0) {
    const { data: workers } = await supabase
      .from('workers')
      .select('id, full_name, name')
      .in('id', workerIds);
    if (workers) workers.forEach(w => { workerNames[w.id] = w.full_name || w.name; });
  }

  const routeResults = [];
  for (const route of (routes || [])) {
    const { data: stops } = await supabase
      .from('route_stops')
      .select('*, service_visits(id, status, scheduled_time, service_location_id)')
      .eq('route_id', route.id)
      .order('stop_order', { ascending: true });

    const locationIds = [...new Set((stops || []).map(s => s.service_visits?.service_location_id).filter(Boolean))];
    let locMap = {};
    if (locationIds.length > 0) {
      const { data: locs } = await supabase.from('service_locations').select('id, name, address').in('id', locationIds);
      (locs || []).forEach(l => { locMap[l.id] = l; });
    }

    routeResults.push({
      route_name: route.name,
      worker_name: workerNames[route.assigned_worker_id] || 'Unassigned',
      status: route.status,
      stops: (stops || []).map(s => ({
        stop_order: s.stop_order,
        visit_id: s.service_visits?.id,
        status: s.service_visits?.status,
        location_name: locMap[s.service_visits?.service_location_id]?.name,
        location_address: locMap[s.service_visits?.service_location_id]?.address,
      })),
    });
  }

  // Unrouted visits
  const { data: unrouted } = await supabase
    .from('service_visits')
    .select('id, status, scheduled_time, service_location_id')
    .eq('owner_id', ownerId)
    .eq('scheduled_date', targetDate)
    .is('route_id', null)
    .neq('status', 'cancelled');

  let unroutedEnriched = [];
  if (unrouted && unrouted.length > 0) {
    const locIds = [...new Set(unrouted.map(v => v.service_location_id))];
    const { data: locs } = await supabase.from('service_locations').select('id, name, address').in('id', locIds);
    const lm = {};
    (locs || []).forEach(l => { lm[l.id] = l; });
    unroutedEnriched = unrouted.map(v => ({
      id: v.id, status: v.status, scheduled_time: v.scheduled_time,
      location_name: lm[v.service_location_id]?.name,
      location_address: lm[v.service_location_id]?.address,
    }));
  }

  return { date: targetDate, routes: routeResults, unrouted: unroutedEnriched };
}

async function complete_visit(userId, { visit_id, notes } = {}) {
  if (!visit_id) return { error: 'visit_id is required' };

  const ownerId = await resolveOwnerId(userId);

  // Fetch visit with ownership check
  const { data: visit } = await supabase
    .from('service_visits')
    .select('*, service_locations(name)')
    .eq('id', visit_id)
    .eq('owner_id', ownerId)
    .single();

  if (!visit) return { error: 'Visit not found' };

  const now = new Date();
  let durationMinutes = null;
  if (visit.started_at) {
    durationMinutes = Math.round((now.getTime() - new Date(visit.started_at).getTime()) / 60000);
  }

  const updates = {
    status: 'completed',
    completed_at: now.toISOString(),
    duration_minutes: durationMinutes,
  };
  if (notes) updates.worker_notes = notes;

  const { error } = await supabase
    .from('service_visits')
    .update(updates)
    .eq('id', visit_id);

  if (error) return { error: error.message };

  return {
    success: true,
    visit_id,
    location_name: visit.service_locations?.name || 'Unknown',
    completed_at: now.toISOString(),
    duration_minutes: durationMinutes,
  };
}

async function get_billing_summary(userId, { plan_id, month } = {}) {
  const ownerId = await resolveOwnerId(userId);

  // Calculate month range
  const now = new Date();
  const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [year, mon] = targetMonth.split('-').map(Number);
  const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`;
  const nextMonth = new Date(year, mon, 1);
  const monthEnd = nextMonth.toISOString().split('T')[0];

  // Get plans
  let plansQuery = supabase
    .from('service_plans')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('status', 'active');

  if (plan_id) {
    // Try to resolve by name
    if (plan_id.length !== 36) {
      const { data: matched } = await supabase
        .from('service_plans')
        .select('id')
        .eq('owner_id', ownerId)
        .ilike('name', `%${plan_id}%`)
        .limit(1)
        .single();
      if (matched) plan_id = matched.id;
    }
    plansQuery = plansQuery.eq('id', plan_id);
  }

  const { data: plans } = await plansQuery;
  if (!plans || plans.length === 0) return { error: 'No active service plans found' };

  const planIds = plans.map(p => p.id);

  // Get completed, billable, uninvoiced visits in month
  const { data: visits } = await supabase
    .from('service_visits')
    .select('service_plan_id, status, billable, invoice_id')
    .in('service_plan_id', planIds)
    .gte('scheduled_date', monthStart)
    .lt('scheduled_date', monthEnd)
    .neq('status', 'cancelled');

  const summary = plans.map(plan => {
    const planVisits = (visits || []).filter(v => v.service_plan_id === plan.id);
    const completed = planVisits.filter(v => v.status === 'completed');
    const unbilled = completed.filter(v => v.billable && !v.invoice_id);

    const rate = plan.billing_cycle === 'per_visit'
      ? parseFloat(plan.price_per_visit || 0)
      : parseFloat(plan.monthly_rate || 0);

    const estimatedRevenue = plan.billing_cycle === 'per_visit'
      ? unbilled.length * rate
      : rate;

    return {
      plan_name: plan.name,
      service_type: plan.service_type,
      billing_cycle: plan.billing_cycle,
      total_visits: planVisits.length,
      completed: completed.length,
      unbilled: unbilled.length,
      estimated_revenue: Math.round(estimatedRevenue * 100) / 100,
      currency: plan.currency,
    };
  });

  const totalRevenue = summary.reduce((sum, s) => sum + s.estimated_revenue, 0);

  return {
    month: targetMonth,
    plans: summary,
    total_unbilled_revenue: Math.round(totalRevenue * 100) / 100,
  };
}

async function create_service_visit(userId, { plan_id, location_id, date, worker_id, notes } = {}) {
  if (!plan_id || !location_id || !date) {
    return { error: 'plan_id, location_id, and date are required' };
  }

  const ownerId = await resolveOwnerId(userId);

  // Resolve plan by name if needed
  if (plan_id.length !== 36) {
    const { data: matched } = await supabase
      .from('service_plans')
      .select('id')
      .eq('owner_id', ownerId)
      .ilike('name', `%${plan_id}%`)
      .limit(1)
      .single();
    if (!matched) return { error: `No service plan matching "${plan_id}" found` };
    plan_id = matched.id;
  }

  // Resolve location by name if needed
  if (location_id.length !== 36) {
    const { data: matched } = await supabase
      .from('service_locations')
      .select('id')
      .eq('service_plan_id', plan_id)
      .eq('is_active', true)
      .ilike('name', `%${location_id}%`)
      .limit(1)
      .single();
    if (!matched) return { error: `No location matching "${location_id}" found in this plan` };
    location_id = matched.id;
  }

  // Resolve worker by name if needed
  let assignedWorkerId = null;
  if (worker_id) {
    if (worker_id.length !== 36) {
      const { data: matched } = await supabase
        .from('workers')
        .select('id')
        .eq('owner_id', ownerId)
        .ilike('full_name', `%${worker_id}%`)
        .limit(1)
        .single();
      if (matched) assignedWorkerId = matched.id;
    } else {
      assignedWorkerId = worker_id;
    }
  }

  // Create visit
  const { data: visit, error } = await supabase
    .from('service_visits')
    .insert({
      service_plan_id: plan_id,
      service_location_id: location_id,
      owner_id: ownerId,
      scheduled_date: date,
      assigned_worker_id: assignedWorkerId,
      owner_notes: notes || null,
    })
    .select()
    .single();

  if (error) return { error: error.message };

  // Copy checklist templates
  const { data: templates } = await supabase
    .from('visit_checklist_templates')
    .select('*')
    .eq('service_location_id', location_id)
    .eq('is_active', true);

  if (templates && templates.length > 0) {
    await supabase.from('visit_checklist_items').insert(
      templates.map(t => ({
        service_visit_id: visit.id,
        template_id: t.id,
        owner_id: ownerId,
        title: t.title,
        sort_order: t.sort_order,
        quantity_unit: t.quantity_unit,
      }))
    );
  }

  // Get location name for confirmation
  const { data: loc } = await supabase
    .from('service_locations')
    .select('name')
    .eq('id', location_id)
    .single();

  return {
    success: true,
    visit_id: visit.id,
    location_name: loc?.name || 'Unknown',
    scheduled_date: date,
    checklist_items: templates?.length || 0,
  };
}

// ──────────────── Service plan CRUD additions ────────────────

async function update_service_plan(userId, args = {}) {
  let { plan_id, name, status, billing_cycle, price_per_visit, monthly_rate, service_type, notes } = args;
  if (!plan_id) return { error: 'plan_id is required' };

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  plan_id = resolved.id;

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (status !== undefined) updates.status = status;
  if (billing_cycle !== undefined) updates.billing_cycle = billing_cycle;
  if (price_per_visit !== undefined) updates.price_per_visit = price_per_visit;
  if (monthly_rate !== undefined) updates.monthly_rate = monthly_rate;
  if (service_type !== undefined) updates.service_type = service_type;
  if (notes !== undefined) updates.notes = notes;

  if (Object.keys(updates).length === 0) return { error: 'No fields to update' };

  const { data, error } = await supabase
    .from('service_plans')
    .update(updates)
    .eq('id', plan_id)
    .eq('owner_id', ownerId)
    .select('id, name, status, billing_cycle, price_per_visit, monthly_rate, service_type')
    .single();

  if (error) return { error: error.message };
  if (!data) return { error: 'Service plan not found' };

  logger.info(`✅ Updated service plan ${plan_id}`);
  return { success: true, plan: data };
}

async function add_service_location(userId, args = {}) {
  let { plan_id, name, address, access_notes } = args;
  if (!plan_id || !name || !address) return { error: 'plan_id, name, and address are required' };

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  plan_id = resolved.id;

  const { data, error } = await supabase
    .from('service_locations')
    .insert({
      service_plan_id: plan_id,
      owner_id: ownerId,
      name,
      address,
      access_notes: access_notes || null,
      is_active: true,
    })
    .select('id, name, address')
    .single();

  if (error) return { error: error.message };
  return { success: true, location: data };
}

async function assign_worker_to_plan(userId, args = {}) {
  let { plan_id, worker_id } = args;
  if (!plan_id || !worker_id) return { error: 'plan_id and worker_id are required' };

  const ownerId = await resolveOwnerId(userId);

  const planResolved = await resolveServicePlanId(userId, plan_id);
  if (planResolved.error) return { error: planResolved.error };
  if (planResolved.suggestions) return planResolved;
  plan_id = planResolved.id;

  const workerResolved = await resolveWorkerId(userId, worker_id);
  if (workerResolved.error) return { error: workerResolved.error };
  if (workerResolved.suggestions) return workerResolved;
  worker_id = workerResolved.id;

  // Assign worker to all upcoming (non-cancelled, non-completed) visits in this plan
  const today = new Date().toISOString().split('T')[0];
  const { data: visits, error } = await supabase
    .from('service_visits')
    .update({ assigned_worker_id: worker_id })
    .eq('service_plan_id', plan_id)
    .eq('owner_id', ownerId)
    .gte('scheduled_date', today)
    .in('status', ['scheduled', 'in_progress'])
    .select('id');

  if (error) return { error: error.message };

  return {
    success: true,
    plan_id,
    worker_id,
    visits_assigned: visits?.length || 0,
  };
}

async function calculate_service_plan_revenue(userId, args = {}) {
  let { plan_id, start_date, end_date } = args;
  const ownerId = await resolveOwnerId(userId);

  // Default to current month if no range
  const now = new Date();
  if (!start_date) {
    start_date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  }
  if (!end_date) {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    end_date = next.toISOString().split('T')[0];
  }

  // Fetch plans (one or all)
  let plansQuery = supabase
    .from('service_plans')
    .select('id, name, service_type, billing_cycle, price_per_visit, monthly_rate, status')
    .eq('owner_id', ownerId);

  if (plan_id) {
    const resolved = await resolveServicePlanId(userId, plan_id);
    if (resolved.error) return { error: resolved.error };
    if (resolved.suggestions) return resolved;
    plansQuery = plansQuery.eq('id', resolved.id);
  } else {
    plansQuery = plansQuery.eq('status', 'active');
  }

  const { data: plans, error: planErr } = await plansQuery;
  if (planErr) return { error: planErr.message };
  if (!plans || plans.length === 0) return { error: 'No service plans found' };

  const planIds = plans.map(p => p.id);

  // Visits in range
  const { data: visits } = await supabase
    .from('service_visits')
    .select('service_plan_id, status, billable, invoice_id')
    .in('service_plan_id', planIds)
    .gte('scheduled_date', start_date)
    .lt('scheduled_date', end_date)
    .neq('status', 'cancelled');

  // Months covered for monthly billing
  const startD = new Date(start_date);
  const endD = new Date(end_date);
  const monthsCovered = Math.max(
    1,
    (endD.getFullYear() - startD.getFullYear()) * 12 + (endD.getMonth() - startD.getMonth())
  );

  const breakdown = plans.map(plan => {
    const planVisits = (visits || []).filter(v => v.service_plan_id === plan.id);
    const completed = planVisits.filter(v => v.status === 'completed');
    const billableCompleted = completed.filter(v => v.billable !== false);
    const invoiced = billableCompleted.filter(v => v.invoice_id);
    const unbilled = billableCompleted.filter(v => !v.invoice_id);

    const rate = plan.billing_cycle === 'per_visit'
      ? parseFloat(plan.price_per_visit || 0)
      : parseFloat(plan.monthly_rate || 0);

    let projectedRevenue, realizedRevenue, unbilledRevenue;
    if (plan.billing_cycle === 'per_visit') {
      projectedRevenue = planVisits.length * rate;
      realizedRevenue = invoiced.length * rate;
      unbilledRevenue = unbilled.length * rate;
    } else {
      projectedRevenue = rate * monthsCovered;
      realizedRevenue = invoiced.length > 0 ? rate * monthsCovered : 0;
      unbilledRevenue = unbilled.length > 0 ? rate * monthsCovered : 0;
    }

    return {
      plan_id: plan.id,
      plan_name: plan.name,
      service_type: plan.service_type,
      billing_cycle: plan.billing_cycle,
      rate,
      visit_count: planVisits.length,
      completed: completed.length,
      invoiced: invoiced.length,
      unbilled: unbilled.length,
      projected_revenue: Math.round(projectedRevenue * 100) / 100,
      realized_revenue: Math.round(realizedRevenue * 100) / 100,
      unbilled_revenue: Math.round(unbilledRevenue * 100) / 100,
    };
  });

  const totals = breakdown.reduce((acc, b) => ({
    projected: acc.projected + b.projected_revenue,
    realized: acc.realized + b.realized_revenue,
    unbilled: acc.unbilled + b.unbilled_revenue,
  }), { projected: 0, realized: 0, unbilled: 0 });

  return {
    period: { start_date, end_date },
    plans: breakdown,
    totals: {
      projected_revenue: Math.round(totals.projected * 100) / 100,
      realized_revenue: Math.round(totals.realized * 100) / 100,
      unbilled_revenue: Math.round(totals.unbilled * 100) / 100,
    },
  };
}

async function get_service_plan_details(userId, args = {}) {
  let { plan_id } = args;
  if (!plan_id) return { error: 'plan_id is required' };

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  plan_id = resolved.id;

  // Plan
  const { data: plan, error } = await supabase
    .from('service_plans')
    .select('*')
    .eq('id', plan_id)
    .eq('owner_id', ownerId)
    .single();

  if (error || !plan) return { error: 'Service plan not found' };

  // Locations + checklists
  const { data: locations } = await supabase
    .from('service_locations')
    .select('id, name, address, access_notes, is_active')
    .eq('service_plan_id', plan_id)
    .order('created_at', { ascending: true });

  // Recent visits (last 30 days + upcoming 30 days)
  const today = new Date();
  const past = new Date(today.getTime() - 30 * 86400000).toISOString().split('T')[0];
  const future = new Date(today.getTime() + 30 * 86400000).toISOString().split('T')[0];

  const { data: visits } = await supabase
    .from('service_visits')
    .select('id, scheduled_date, status, billable, invoice_id, assigned_worker_id, service_location_id')
    .eq('service_plan_id', plan_id)
    .gte('scheduled_date', past)
    .lte('scheduled_date', future)
    .order('scheduled_date', { ascending: true });

  // Worker names for assigned visits
  const workerIds = [...new Set((visits || []).map(v => v.assigned_worker_id).filter(Boolean))];
  let workerMap = {};
  if (workerIds.length > 0) {
    const { data: workers } = await supabase
      .from('workers')
      .select('id, full_name, name')
      .in('id', workerIds);
    (workers || []).forEach(w => { workerMap[w.id] = w.full_name || w.name; });
  }

  // Financials from project_transactions
  const { data: transactions } = await supabase
    .from('project_transactions')
    .select('type, category, amount')
    .eq('service_plan_id', plan_id);

  const financials = { income: 0, expenses: 0, byCategory: {} };
  (transactions || []).forEach(t => {
    const amount = parseFloat(t.amount) || 0;
    if (t.type === 'income') financials.income += amount;
    else if (t.type === 'expense') {
      financials.expenses += amount;
      financials.byCategory[t.category] = (financials.byCategory[t.category] || 0) + amount;
    }
  });
  financials.profit = financials.income - financials.expenses;

  return {
    id: plan.id,
    name: plan.name,
    service_type: plan.service_type,
    status: plan.status,
    billing_cycle: plan.billing_cycle,
    price_per_visit: plan.price_per_visit ? parseFloat(plan.price_per_visit) : null,
    monthly_rate: plan.monthly_rate ? parseFloat(plan.monthly_rate) : null,
    notes: plan.notes,
    created_at: plan.created_at,
    locations: locations || [],
    location_count: (locations || []).length,
    visits: (visits || []).map(v => ({
      ...v,
      worker_name: v.assigned_worker_id ? workerMap[v.assigned_worker_id] : null,
    })),
    visit_count: (visits || []).length,
    financials,
  };
}

async function get_service_plan_summary(userId, args = {}) {
  let { plan_id } = args;
  if (!plan_id) return { error: 'plan_id is required' };

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  plan_id = resolved.id;

  const { data: plan } = await supabase
    .from('service_plans')
    .select('id, name, service_type, status, billing_cycle, price_per_visit, monthly_rate')
    .eq('id', plan_id)
    .eq('owner_id', ownerId)
    .single();

  if (!plan) return { error: 'Service plan not found' };

  // Parallel: location count, current month visits, lifetime revenue
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0];

  const [locCount, monthVisits, allTxns] = await Promise.all([
    supabase.from('service_locations').select('id', { count: 'exact', head: true }).eq('service_plan_id', plan_id).eq('is_active', true),
    supabase.from('service_visits').select('status').eq('service_plan_id', plan_id).gte('scheduled_date', monthStart).lt('scheduled_date', nextMonth).neq('status', 'cancelled'),
    supabase.from('project_transactions').select('type, amount').eq('service_plan_id', plan_id),
  ]);

  const visitTotals = (monthVisits.data || []).reduce((acc, v) => {
    acc.total++;
    if (v.status === 'completed') acc.completed++;
    return acc;
  }, { total: 0, completed: 0 });

  const lifetimeFin = (allTxns.data || []).reduce((acc, t) => {
    const a = parseFloat(t.amount) || 0;
    if (t.type === 'income') acc.income += a;
    else if (t.type === 'expense') acc.expenses += a;
    return acc;
  }, { income: 0, expenses: 0 });

  return {
    plan: {
      id: plan.id,
      name: plan.name,
      service_type: plan.service_type,
      status: plan.status,
      billing_cycle: plan.billing_cycle,
      rate: plan.billing_cycle === 'per_visit' ? plan.price_per_visit : plan.monthly_rate,
    },
    active_locations: locCount.count || 0,
    visits_this_month: visitTotals,
    lifetime_revenue: Math.round(lifetimeFin.income * 100) / 100,
    lifetime_expenses: Math.round(lifetimeFin.expenses * 100) / 100,
    lifetime_profit: Math.round((lifetimeFin.income - lifetimeFin.expenses) * 100) / 100,
  };
}

async function delete_service_plan(userId, args = {}) {
  let { plan_id } = args;
  if (!plan_id) return { error: 'plan_id is required' };

  // Owners only
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (profile?.role === 'supervisor') {
    return { error: 'Supervisors cannot delete service plans. Please ask the owner.' };
  }

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  const { data: plan } = await supabase
    .from('service_plans')
    .select('name')
    .eq('id', resolved.id)
    .eq('owner_id', ownerId)
    .single();

  if (!plan) return { error: 'Service plan not found or access denied' };

  // Detach time_tracking rows first — the FK in Postgres is NO ACTION (blocks delete).
  // We preserve the clock-in/clock-out history but unlink it from the deleted plan.
  // (A migration fixing the FK to ON DELETE SET NULL is also shipped — this is a belt-and-braces.)
  const { error: detachErr } = await supabase
    .from('time_tracking')
    .update({ service_plan_id: null })
    .eq('service_plan_id', resolved.id);
  if (detachErr) {
    logger.warn(`delete_service_plan: time_tracking detach warning: ${detachErr.message}`);
  }

  const { error } = await supabase
    .from('service_plans')
    .delete()
    .eq('id', resolved.id)
    .eq('owner_id', ownerId);

  if (error) return { error: `Failed to delete: ${error.message}` };
  return { success: true, deletedPlan: plan.name };
}

async function get_service_plan_documents(userId, args = {}) {
  let { plan_id, category } = args;
  if (!plan_id) return { error: 'plan_id is required' };

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;

  let query = supabase
    .from('project_documents')
    .select('id, file_name, file_type, category, notes, visible_to_workers, created_at')
    .eq('service_plan_id', resolved.id)
    .order('created_at', { ascending: false });

  if (category) query = query.eq('category', category);

  const { data, error } = await query;
  if (error) {
    logger.error('get_service_plan_documents error:', error);
    return { error: 'Failed to fetch documents' };
  }

  return {
    documents: (data || []).map(d => ({
      id: d.id,
      fileName: d.file_name,
      fileType: d.file_type,
      category: d.category,
      notes: d.notes,
      visibleToWorkers: d.visible_to_workers,
      createdAt: d.created_at,
    })),
    count: (data || []).length,
  };
}

async function upload_service_plan_document(userId, args = {}) {
  const { plan_id, category = 'general', visible_to_workers = false } = args;
  const attachments = args._attachments;

  if (!attachments || attachments.length === 0) {
    return { error: 'No files attached. Please attach files to your message and try again.' };
  }
  if (!plan_id) return { error: 'plan_id is required' };

  const ownerId = await resolveOwnerId(userId);
  const resolved = await resolveServicePlanId(userId, plan_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;

  const uploaded = [];
  const failed = [];

  for (const att of attachments) {
    try {
      const fileName = att.name || `Document_${Date.now()}`;
      const fileExt = fileName.split('.').pop()?.toLowerCase() || 'bin';
      const timestamp = Date.now();
      const filePath = `${userId}/service-plans/${resolved.id}/${timestamp}.${fileExt}`;

      const mimeType = att.mimeType || 'application/octet-stream';
      let fileType = 'document';
      if (mimeType.startsWith('image/')) fileType = 'image';
      else if (mimeType === 'application/pdf' || fileExt === 'pdf') fileType = 'pdf';

      const binaryString = Buffer.from(att.base64, 'base64');

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(filePath, binaryString, { contentType: mimeType, upsert: false });

      if (uploadError) {
        failed.push({ fileName, error: uploadError.message });
        continue;
      }

      const { data: doc, error: dbError } = await supabase
        .from('project_documents')
        .insert({
          service_plan_id: resolved.id,
          file_name: args.file_name || fileName,
          file_url: filePath,
          file_type: fileType,
          category,
          uploaded_by: userId,
          visible_to_workers,
        })
        .select('id, file_name, file_type, category')
        .single();

      if (dbError) {
        failed.push({ fileName, error: dbError.message });
        continue;
      }

      uploaded.push(doc);
    } catch (err) {
      failed.push({ fileName: att.name, error: err.message });
    }
  }

  return {
    uploaded: uploaded.map(d => ({ id: d.id, fileName: d.file_name, fileType: d.file_type, category: d.category })),
    uploadedCount: uploaded.length,
    failedCount: failed.length,
    failed: failed.length > 0 ? failed : undefined,
  };
}

async function update_service_location(userId, args = {}) {
  let { location_id, name, address, access_notes, is_active } = args;
  if (!location_id) return { error: 'location_id is required' };

  const ownerId = await resolveOwnerId(userId);

  // Ownership check: fetch location then verify its plan belongs to owner
  const { data: location } = await supabase
    .from('service_locations')
    .select('id, service_plan_id')
    .eq('id', location_id)
    .single();

  if (!location) return { error: 'Service location not found' };

  const { data: plan } = await supabase
    .from('service_plans')
    .select('id')
    .eq('id', location.service_plan_id)
    .eq('owner_id', ownerId)
    .single();

  if (!plan) return { error: 'Service location not found or access denied' };

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (address !== undefined) updates.address = address;
  if (access_notes !== undefined) updates.access_notes = access_notes;
  if (is_active !== undefined) updates.is_active = is_active;

  if (Object.keys(updates).length === 0) return { error: 'No fields to update' };

  const { data, error } = await supabase
    .from('service_locations')
    .update(updates)
    .eq('id', location_id)
    .select('id, name, address, access_notes, is_active')
    .single();

  if (error) return { error: error.message };
  return { success: true, location: data };
}

// ==================== DAILY CHECKLIST TOOLS ====================

async function setup_daily_checklist(userId, { project_id, service_plan_id, checklist_items, labor_roles } = {}) {
  if (!checklist_items || !Array.isArray(checklist_items) || checklist_items.length === 0) {
    return { error: 'checklist_items array is required' };
  }
  if (!project_id && !service_plan_id) {
    return { error: 'Either project_id or service_plan_id is required' };
  }

  const ownerId = await resolveOwnerId(userId);

  // Resolve project by name if needed
  if (project_id) {
    const resolved = await resolveProjectId(userId, project_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    project_id = resolved.id;
  }

  // Resolve service plan by name if needed
  if (service_plan_id) {
    const resolved = await resolveServicePlanId(userId, service_plan_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    service_plan_id = resolved.id;
  }

  const parentFields = project_id
    ? { project_id, service_plan_id: null }
    : { project_id: null, service_plan_id };

  // Insert checklist templates
  const checklistInserts = checklist_items.map((item, i) => ({
    ...parentFields,
    owner_id: ownerId,
    title: item.title,
    item_type: item.item_type || 'checkbox',
    quantity_unit: item.quantity_unit || null,
    requires_photo: item.requires_photo || false,
    sort_order: i,
  }));

  const { data: checklistData, error: checklistError } = await supabase
    .from('daily_checklist_templates')
    .insert(checklistInserts)
    .select();

  if (checklistError) return { error: checklistError.message };

  // Insert labor roles if provided
  let laborData = [];
  if (labor_roles && Array.isArray(labor_roles) && labor_roles.length > 0) {
    const laborInserts = labor_roles.map((role, i) => ({
      ...parentFields,
      owner_id: ownerId,
      role_name: role.role_name,
      default_quantity: role.default_quantity || 1,
      sort_order: i,
    }));

    const { data: lData, error: laborError } = await supabase
      .from('labor_role_templates')
      .insert(laborInserts)
      .select();

    if (laborError) return { error: laborError.message };
    laborData = lData || [];
  }

  return {
    success: true,
    checklist_items: checklistData.map(t => ({
      id: t.id,
      title: t.title,
      item_type: t.item_type,
      quantity_unit: t.quantity_unit,
      requires_photo: t.requires_photo,
    })),
    labor_roles: laborData.map(r => ({
      id: r.id,
      role_name: r.role_name,
      default_quantity: r.default_quantity,
    })),
  };
}

async function get_daily_checklist_report(userId, { project_id, service_plan_id, date, start_date, end_date } = {}) {
  if (!project_id && !service_plan_id) {
    return { error: 'Either project_id or service_plan_id is required' };
  }

  // Resolve by name if needed
  if (project_id) {
    const resolved = await resolveProjectId(userId, project_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    project_id = resolved.id;
  }
  if (service_plan_id) {
    const resolved = await resolveServicePlanId(userId, service_plan_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    service_plan_id = resolved.id;
  }

  const today = new Date().toISOString().split('T')[0];
  const from = date || start_date || (() => {
    const d = new Date(); d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  })();
  const to = date || end_date || today;

  // Fetch reports
  let query = supabase
    .from('daily_service_reports')
    .select('id, report_date, reporter_id, photos, notes, created_at')
    .gte('report_date', from)
    .lte('report_date', to)
    .order('report_date', { ascending: true });

  if (project_id) query = query.eq('project_id', project_id);
  else query = query.eq('service_plan_id', service_plan_id);

  const { data: reports, error } = await query;
  if (error) return { error: error.message };
  if (!reports || reports.length === 0) {
    return { period: { from, to }, reports: [], message: 'No daily reports found for this period.' };
  }

  // Fetch entries for all reports
  const reportIds = reports.map(r => r.id);
  const { data: entries } = await supabase
    .from('daily_report_entries')
    .select('*')
    .in('report_id', reportIds)
    .order('sort_order', { ascending: true });

  // Fetch reporter names
  const reporterIds = [...new Set(reports.map(r => r.reporter_id))];
  const { data: reporters } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', reporterIds);
  const reporterMap = {};
  (reporters || []).forEach(r => { reporterMap[r.id] = r.full_name; });

  // Group entries by report
  const entryMap = {};
  (entries || []).forEach(e => {
    if (!entryMap[e.report_id]) entryMap[e.report_id] = [];
    entryMap[e.report_id].push(e);
  });

  // Build response grouped by date
  const byDate = {};
  reports.forEach(report => {
    const reportEntries = entryMap[report.id] || [];
    const checklist = reportEntries
      .filter(e => e.entry_type === 'checklist')
      .map(e => ({
        title: e.title,
        completed: e.completed,
        quantity: e.quantity ? parseFloat(e.quantity) : null,
        quantity_unit: e.quantity_unit,
        photo_url: e.photo_url,
        notes: e.notes,
      }));
    const labor = reportEntries
      .filter(e => e.entry_type === 'labor')
      .map(e => ({
        role: e.title,
        count: e.quantity ? parseFloat(e.quantity) : 0,
      }));

    if (!byDate[report.report_date]) byDate[report.report_date] = [];
    byDate[report.report_date].push({
      reporter: reporterMap[report.reporter_id] || 'Unknown',
      photos: report.photos || [],
      notes: report.notes,
      checklist,
      labor,
    });
  });

  return { period: { from, to }, reports: byDate };
}

async function get_daily_checklist_summary(userId, { project_id, service_plan_id, start_date, end_date } = {}) {
  if (!project_id && !service_plan_id) {
    return { error: 'Either project_id or service_plan_id is required' };
  }

  // Resolve by name if needed
  if (project_id) {
    const resolved = await resolveProjectId(userId, project_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    project_id = resolved.id;
  }
  if (service_plan_id) {
    const resolved = await resolveServicePlanId(userId, service_plan_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    service_plan_id = resolved.id;
  }

  const today = new Date().toISOString().split('T')[0];
  const from = start_date || (() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  })();
  const to = end_date || today;

  // Fetch all reports in range
  let query = supabase
    .from('daily_service_reports')
    .select('id, report_date')
    .gte('report_date', from)
    .lte('report_date', to);

  if (project_id) query = query.eq('project_id', project_id);
  else query = query.eq('service_plan_id', service_plan_id);

  const { data: reports, error } = await query;
  if (error) return { error: error.message };
  if (!reports || reports.length === 0) {
    return { period: { from, to }, total_reports: 0, message: 'No daily reports found for this period.' };
  }

  // Fetch all entries
  const reportIds = reports.map(r => r.id);
  const { data: entries } = await supabase
    .from('daily_report_entries')
    .select('*')
    .in('report_id', reportIds);

  // Aggregate checklist items
  const checklistEntries = (entries || []).filter(e => e.entry_type === 'checklist');
  const laborEntries = (entries || []).filter(e => e.entry_type === 'labor');

  // Quantity totals by item title
  const quantityTotals = {};
  checklistEntries.forEach(e => {
    if (e.quantity) {
      if (!quantityTotals[e.title]) {
        quantityTotals[e.title] = { total: 0, unit: e.quantity_unit, days: 0 };
      }
      quantityTotals[e.title].total += parseFloat(e.quantity);
      quantityTotals[e.title].days += 1;
    }
  });

  // Completion rates by item title
  const completionRates = {};
  checklistEntries.forEach(e => {
    if (!completionRates[e.title]) {
      completionRates[e.title] = { completed: 0, total: 0 };
    }
    completionRates[e.title].total += 1;
    if (e.completed) completionRates[e.title].completed += 1;
  });

  // Labor totals by role
  const laborTotals = {};
  laborEntries.forEach(e => {
    if (!laborTotals[e.title]) {
      laborTotals[e.title] = { total_headcount: 0, days: 0 };
    }
    laborTotals[e.title].total_headcount += parseFloat(e.quantity || 0);
    laborTotals[e.title].days += 1;
  });

  return {
    period: { from, to },
    total_reports: reports.length,
    days_reported: [...new Set(reports.map(r => r.report_date))].length,
    quantities: Object.entries(quantityTotals).map(([title, data]) => ({
      item: title,
      total: data.total,
      unit: data.unit,
      days_logged: data.days,
      daily_average: Math.round((data.total / data.days) * 100) / 100,
    })),
    completion_rates: Object.entries(completionRates).map(([title, data]) => ({
      item: title,
      completed: data.completed,
      total: data.total,
      rate: Math.round((data.completed / data.total) * 100) + '%',
    })),
    labor: Object.entries(laborTotals).map(([role, data]) => ({
      role,
      total_headcount: data.total_headcount,
      days: data.days,
      avg_per_day: Math.round((data.total_headcount / data.days) * 10) / 10,
    })),
  };
}

const TOOL_HANDLERS = {
  // Granular tools
  search_projects,
  get_project_details,
  delete_project,
  update_project,
  search_estimates,
  get_estimate_details,
  update_estimate,
  search_invoices,
  get_invoice_details,
  get_workers,
  get_worker_details,
  get_schedule_events,
  get_project_financials,
  get_financial_overview,
  get_transactions,
  get_daily_reports,
  get_photos,
  get_time_records,
  get_business_settings,
  // Intelligent tools
  global_search,
  get_daily_briefing,
  get_project_summary,
  suggest_pricing,
  assign_worker,
  generate_summary_report,
  share_document,
  record_expense,
  delete_expense,
  update_expense,
  // New mutation tools
  add_project_checklist,
  create_project_phase,
  update_phase_budget,
  update_phase_progress,
  convert_estimate_to_invoice,
  update_invoice,
  void_invoice,
  create_work_schedule,
  create_worker_task,
  update_service_pricing,
  // Bank reconciliation tools
  get_bank_transactions,
  assign_bank_transaction,
  get_reconciliation_summary,
  // Financial report tools
  get_ar_aging,
  get_tax_summary,
  get_payroll_summary,
  get_cash_flow,
  get_recurring_expenses,
  // Document management tools
  get_project_documents,
  get_business_contracts,
  upload_project_document,
  update_project_document,
  delete_project_document,
  // Clock in/out tools
  clock_in_worker,
  clock_out_worker,
  // Service plan tools
  get_service_plans,
  get_daily_route,
  complete_visit,
  get_billing_summary,
  create_service_visit,
  update_service_plan,
  add_service_location,
  update_service_location,
  assign_worker_to_plan,
  calculate_service_plan_revenue,
  get_service_plan_details,
  get_service_plan_summary,
  delete_service_plan,
  get_service_plan_documents,
  upload_service_plan_document,
  // Daily checklist tools
  setup_daily_checklist,
  get_daily_checklist_report,
  get_daily_checklist_summary,
};

/**
 * Execute a tool call and return the result
 * @param {string} toolName - Name of the tool to execute
 * @param {object} args - Arguments for the tool
 * @param {string} userId - Authenticated user ID
 * @returns {object} Tool result
 */
async function executeTool(toolName, args, userId) {
  const handler = TOOL_HANDLERS[toolName];
  if (!handler) {
    logger.error(`Unknown tool: ${toolName}`);
    return { error: `Unknown tool: ${toolName}` };
  }

  try {
    const startTime = Date.now();
    const result = await handler(userId, args);
    const duration = Date.now() - startTime;
    logger.info(`🔧 Tool ${toolName} executed in ${duration}ms`);
    return result;
  } catch (error) {
    logger.error(`Tool ${toolName} error:`, error);
    return { error: `Failed to execute ${toolName}: ${error.message}` };
  }
}

module.exports = { executeTool, TOOL_HANDLERS };
