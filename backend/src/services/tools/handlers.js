/**
 * Tool handlers - Supabase query functions for each tool.
 * All queries are filtered by userId (owner_id) for security.
 * Uses service role key (bypasses RLS) so we MUST filter manually.
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
  if (idOrName.match(/^[0-9a-f]{8}-/i)) return { id: idOrName };

  const filter = buildWordSearch(idOrName, ['name']);
  if (!filter) return { error: 'No project specified' };

  const { data } = await supabase
    .from('projects')
    .select('id, name, status')
    .eq('user_id', userId)
    .or(filter)
    .limit(5);

  if (!data || data.length === 0) {
    return { error: `No projects found matching "${idOrName}"` };
  }
  if (data.length === 1) {
    return { id: data[0].id };
  }
  return {
    suggestions: data.map(p => ({ id: p.id, name: p.name, status: p.status })),
    message: `Multiple projects match "${idOrName}". Which one did you mean?`
  };
}

/**
 * Resolve a worker ID or name to a UUID.
 * Returns { id } on single match, { suggestions } if ambiguous, { error } if not found.
 */
async function resolveWorkerId(userId, idOrName) {
  if (!idOrName) return { error: 'No worker specified' };
  if (idOrName.match(/^[0-9a-f]{8}-/i)) return { id: idOrName };

  const filter = buildWordSearch(idOrName, ['full_name', 'trade']);
  if (!filter) return { error: 'No worker specified' };

  const { data } = await supabase
    .from('workers')
    .select('id, full_name, trade')
    .eq('owner_id', userId)
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
  if (idOrName.match(/^[0-9a-f]{8}-/i)) return { id: idOrName };

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
  if (idOrName.match(/^[0-9a-f]{8}-/i)) return { id: idOrName };

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
    .eq('user_id', userId);

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

  // Get project
  const { data: project, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', project_id)
    .eq('user_id', userId)
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
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  // Get project name for response
  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', resolved.id)
    .eq('user_id', userId)
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

  let q = supabase
    .from('workers')
    .select('id, full_name, email, phone, trade, payment_type, hourly_rate, daily_rate, status, created_at')
    .eq('owner_id', userId);

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

  // Get clock-in status for today
  if (include_clock_status) {
    const todayStr = today();
    const { data: clockIns } = await supabase
      .from('time_tracking')
      .select('worker_id, clock_in, clock_out, project_id, projects(name)')
      .in('worker_id', workers.map(w => w.id))
      .gte('clock_in', `${todayStr}T00:00:00`)
      .is('clock_out', null);

    const clockInMap = {};
    if (clockIns) {
      for (const ci of clockIns) {
        clockInMap[ci.worker_id] = {
          clockedIn: true,
          clockInTime: ci.clock_in,
          project: ci.projects?.name || 'Unknown'
        };
      }
    }

    return workers.map(w => ({
      ...w,
      clockStatus: clockInMap[w.id] || { clockedIn: false }
    }));
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

  // Get worker
  const { data: worker, error } = await supabase
    .from('workers')
    .select('*')
    .eq('id', worker_id)
    .eq('owner_id', userId)
    .single();

  if (error || !worker) {
    return { error: 'Worker not found' };
  }

  // Get current clock-in
  const todayStr = today();
  const { data: activeClockIn } = await supabase
    .from('time_tracking')
    .select('id, clock_in, project_id, projects(name)')
    .eq('worker_id', worker_id)
    .is('clock_out', null)
    .order('clock_in', { ascending: false })
    .limit(1);

  // Get recent time entries (last 7 days)
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: recentTimeEntries } = await supabase
    .from('time_tracking')
    .select('id, clock_in, clock_out, project_id, projects(name), total_hours, labor_cost')
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
      hoursThisWeek += entry.total_hours || 0;
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
    .eq('user_id', userId)
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
    .eq('user_id', userId)
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
    .eq('user_id', userId);

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
  const { project_id, type, category, start_date, end_date } = args;

  // Get user's project IDs for security
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId);

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

  // First get user's project IDs for security
  const { data: userProjects, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId);

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
    .select('id, report_date, notes, photos, custom_tasks, task_progress, tags, worker_id, project_id, phase_id, workers(full_name), projects(name), project_phases(name)')
    .in('project_id', projectIds);

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
    workerName: r.workers?.full_name,
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

  // First get user's project IDs for security
  const { data: userProjects, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId);

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

  // Calculate hours and format response
  return await Promise.all((data || []).map(async record => {
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
      .eq('user_id', userId)
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

  const [scheduleRes, overdueRes, projectsRes, workersRes, clockInsRes] = await Promise.all([
    // Today's schedule events
    supabase
      .from('schedule_events')
      .select('id, title, event_type, start_datetime, end_datetime, location')
      .eq('user_id', userId)
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
      .eq('user_id', userId)
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
      .eq('user_id', userId)
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
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(500);

  // Fetch user's service items for default pricing
  const { data: userServices } = await supabase
    .from('user_services')
    .select('pricing, custom_items, service_categories(name)')
    .eq('user_id', userId);

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

  // Verify project ownership and get dates
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('id, name, start_date, end_date, status')
    .eq('id', project_id)
    .eq('user_id', userId)
    .single();

  if (projErr || !project) return { error: 'Project not found' };

  // Verify worker ownership
  const { data: worker, error: wrkErr } = await supabase
    .from('workers')
    .select('id, full_name, trade')
    .eq('id', worker_id)
    .eq('owner_id', userId)
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
    .eq('user_id', userId)
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
    .eq('user_id', userId)
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

async function record_expense(userId, { project_id, type, amount, category, description, date }) {
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  const transactionDate = date || new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('project_transactions')
    .insert({
      project_id: resolved.id,
      created_by: userId,
      type,
      category,
      description,
      amount: parseFloat(amount),
      date: transactionDate,
    })
    .select()
    .single();

  if (error) return { error: `Failed to record transaction: ${error.message}` };

  // Get updated project totals
  const { data: transactions } = await supabase
    .from('project_transactions')
    .select('type, amount')
    .eq('project_id', resolved.id);

  const totalExpenses = (transactions || [])
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalIncome = (transactions || [])
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

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

  return {
    success: true,
    phase: { name: phase.name, completion_percentage: pct, status },
  };
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
    .eq('id', estimate.id)
    .eq('user_id', userId);

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

const TOOL_HANDLERS = {
  // Granular tools
  search_projects,
  get_project_details,
  delete_project,
  search_estimates,
  get_estimate_details,
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
  // New mutation tools
  update_phase_progress,
  convert_estimate_to_invoice,
  update_invoice,
  void_invoice,
  create_work_schedule,
  create_worker_task,
  update_service_pricing,
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
