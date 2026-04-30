/**
 * Tool handlers — projects, project phases, project mutations, project metrics.
 * Split from handlers.js.
 */

const {
  supabase, logger, userSafeError,
  requireSupervisorPermission,
  toDate, today, getTodayBounds,
  resolveOwnerId, resolveProjectId,
  recalculatePhaseProgress,
  redistributeTasksForProject,
  sendNotification, resolveSupervisorRecipient,
} = require('./_shared');

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

  if (error) return userSafeError(error, "Couldn't delete it. Try again.");
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

  // Timeline changed → reflow phase tasks. Fire-and-forget.
  if (start_date !== undefined || end_date !== undefined) {
    redistributeTasksForProject(project_id).catch(() => {});
  }

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

async function get_project_health(userId, args = {}) {
  const { project_id, status, limit = 25 } = args || {};
  let q = supabase
    .from('project_health_v')
    .select('project_id, project_name, status, contract_amount, total_expenses, total_income, budget_used_pct, last_activity, days_since_activity')
    .order('budget_used_pct', { ascending: false, nullsFirst: false })
    .limit(Math.min(limit, 100));
  if (project_id) q = q.eq('project_id', project_id);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return userSafeError(error, "Couldn't load project health.");
  return { projects: data || [] };
}

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

  if (updateErr) return userSafeError(updateErr, "Couldn't update that phase.");

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

  if (taskErr) return userSafeError(taskErr, "Couldn't create those tasks.");
  if (!insertedTasks || insertedTasks.length === 0) {
    return { error: 'Tasks did not persist. Please try again.' };
  }

  // Update project updated_at so frontend detects the change
  await supabase
    .from('projects')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', resolved.id);

  
  // Reflow phase-owned worker_tasks so the calendar is gap-free.
  try { await redistributeTasksForProject(project_id || (args && args.project_id)); } catch (_) {}
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

  if (insertErr) return userSafeError(insertErr, "Couldn't create that phase.");

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

  
  // Reflow phase-owned worker_tasks so the calendar is gap-free.
  try { await redistributeTasksForProject(project_id || (args && args.project_id)); } catch (_) {}
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
  const safeName = String(phase_name).replace(/[%_]/g, '\\$&');
  const { data: phases } = await supabase
    .from('project_phases')
    .select('id, name, budget')
    .eq('project_id', resolved.id)
    .ilike('name', `%${safeName}%`);

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


module.exports = {
  search_projects,
  get_project_details,
  delete_project,
  update_project,
  get_project_financials,
  get_project_health,
  get_project_summary,
  update_phase_progress,
  add_project_checklist,
  create_project_phase,
  update_phase_budget,
};
