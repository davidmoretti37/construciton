import { supabase } from '../../lib/supabase';
import { getCurrentUserId, getCurrentUserContext } from './auth';
import { validateWorkingDays } from './workerTasks';
import subscriptionService from '../../services/subscriptionService';
import { getSupervisorsForOwner } from './workers';
import { cacheData, getCachedData, clearCache } from '../../services/offlineCache';

// ============================================================
// Project Management Functions
// ============================================================

/**
 * Apply a filter that excludes draft-status projects from a PostgREST query.
 * Used by selectors/pickers so drafts can't be linked to estimates, tasks, etc.
 * Keep this as a single-use helper so the exclusion rule lives in one place.
 * @param {object} query - Supabase query builder
 * @returns {object} Query with draft-exclusion applied
 */
const applyActiveFilter = (query) => {
  // neq('status', 'draft') covers the new draft workflow without affecting
  // 'active', 'scheduled', 'completed', 'archived', 'on_hold', etc.
  return query.neq('status', 'draft');
};

/**
 * Calculate time-based completion percentage
 * @param {string} startDate - Project start date (YYYY-MM-DD)
 * @param {string} endDate - Project end date (YYYY-MM-DD)
 * @returns {number} Completion percentage (0-100)
 */
export const calculateTimeBasedCompletion = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return 0;
  }

  try {
    const [startYear, startMonth, startDay] = startDate.split('-');
    const start = new Date(parseInt(startYear), parseInt(startMonth) - 1, parseInt(startDay));
    start.setHours(0, 0, 0, 0);

    const [endYear, endMonth, endDay] = endDate.split('-');
    const end = new Date(parseInt(endYear), parseInt(endMonth) - 1, parseInt(endDay));
    end.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.round((today - start) / (1000 * 60 * 60 * 24));

    if (totalDays <= 0) return 0;
    if (elapsedDays < 0) return 0;
    if (elapsedDays >= totalDays) return 100;

    return Math.round((elapsedDays / totalDays) * 100);
  } catch (error) {
    return 0;
  }
};

/**
 * Transform project from database format to app format
 * @param {object} dbProject - Project from database
 * @returns {object} App format project
 */
export const transformProjectFromDB = (dbProject) => {
  let daysRemaining = null;
  if (dbProject.days_remaining !== null && dbProject.days_remaining !== undefined) {
    daysRemaining = parseInt(dbProject.days_remaining);
    if (isNaN(daysRemaining)) {
      daysRemaining = null;
    }
  }

  const contractAmount = parseFloat(dbProject.contract_amount) || parseFloat(dbProject.budget) || 0;
  const baseContract = parseFloat(dbProject.base_contract) || contractAmount;
  const incomeCollected = parseFloat(dbProject.income_collected) || 0;
  const expenses = parseFloat(dbProject.expenses) || parseFloat(dbProject.spent) || 0;
  const extras = dbProject.extras || [];

  // Use actual_progress from database (calculated from completed tasks), fallback to 0
  const percentComplete = dbProject.actual_progress ?? 0;

  const calculateStatus = () => {
    const storedStatus = dbProject.status || 'active';
    if (['draft', 'active', 'completed', 'archived'].includes(storedStatus)) {
      return storedStatus;
    }
    return 'active';
  };

  const calculateDisplayStatus = () => {
    const baseStatus = calculateStatus();
    if (baseStatus !== 'active') {
      return baseStatus;
    }
    const isOverBudget = expenses > contractAmount;
    const isBehind = daysRemaining !== null && daysRemaining < 0;
    if (isOverBudget) return 'over-budget';
    if (isBehind) return 'behind';
    return 'on-track';
  };

  return {
    id: dbProject.id,
    name: dbProject.name,
    client: dbProject.client_name || dbProject.client || null,
    clientPhone: dbProject.client_phone,
    clientEmail: dbProject.client_email,
    services: dbProject.services || [],
    aiResponsesEnabled: dbProject.ai_responses_enabled !== false,
    baseContract: baseContract,
    contractAmount: contractAmount,
    extras: extras,
    incomeCollected: incomeCollected,
    expenses: expenses,
    profit: incomeCollected - expenses,
    budget: contractAmount,
    spent: expenses,
    percentComplete: percentComplete,
    status: calculateDisplayStatus(),
    isDraft: (dbProject.status || '') === 'draft',
    workers: dbProject.workers || [],
    daysRemaining: daysRemaining,
    lastActivity: dbProject.last_activity || 'No activity',
    location: dbProject.location,
    startDate: dbProject.start_date,
    endDate: dbProject.end_date,
    taskDescription: dbProject.task_description,
    estimatedDuration: dbProject.estimated_duration,
    hasPhases: dbProject.has_phases || false,
    workingDays: dbProject.working_days || [1, 2, 3, 4, 5],
    nonWorkingDates: dbProject.non_working_dates || [],
    createdAt: dbProject.created_at,
    updatedAt: dbProject.updated_at,
    // Project assignment info (for hierarchy)
    createdBy: dbProject.user_id,
    assignedTo: dbProject.assigned_supervisor_id || null,
    isAssigned: !!dbProject.assigned_supervisor_id,
    linkedEstimateId: dbProject.linked_estimate_id || null,
  };
};

/**
 * Save or update a project in Supabase
 * @param {object} projectData - Project data object
 * @returns {Promise<object|null>} Saved project or null if error
 */
export const saveProject = async (projectData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return null;
    }

    // If the current user is a supervisor, the project belongs to their owner
    // (user_id) and they're set as the assigned supervisor. RLS policy
    // `supervisor_can_create_projects` enforces this server-side.
    let projectOwnerId = userId;
    let supervisorAssignmentOverride = null;
    try {
      const { data: prof } = await supabase
        .from('profiles')
        .select('role, owner_id, can_create_projects')
        .eq('id', userId)
        .single();
      if (prof?.role === 'supervisor') {
        if (!prof.can_create_projects) {
          return { error: 'permission_denied', reason: "You don't have permission to create projects." };
        }
        if (!prof.owner_id) {
          return { error: 'permission_denied', reason: 'Your supervisor account is not linked to an owner.' };
        }
        projectOwnerId = prof.owner_id;
        supervisorAssignmentOverride = userId;
      }
    } catch (e) {
      // Fall through with original userId — RLS will reject if invalid.
    }

    const startDate = projectData.startDate || projectData.schedule?.startDate || null;
    const endDate = projectData.endDate || projectData.schedule?.estimatedEndDate || null;
    const autoPercentComplete = calculateTimeBasedCompletion(startDate, endDate);

    let calculatedBudget = projectData.budget ?? projectData.baseContract ?? projectData.contractAmount ?? projectData.contract_amount ?? projectData.base_contract ?? 0;
    // Ensure we have a number (not a falsy non-zero value)
    calculatedBudget = parseFloat(calculatedBudget) || 0;

    // Only recalculate from phases/lineItems if no explicit budget/contract amount was provided
    if (calculatedBudget === 0 && projectData.phases && projectData.phases.length > 0) {
      calculatedBudget = projectData.phases.reduce((sum, phase) => {
        return sum + (parseFloat(phase.budget) || 0);
      }, 0);
    } else if (calculatedBudget === 0 && projectData.lineItems && projectData.lineItems.length > 0) {
      calculatedBudget = projectData.lineItems.reduce((sum, item) => {
        return sum + (parseFloat(item.total) || 0);
      }, 0);
    } else if (calculatedBudget === 0 && projectData.total) {
      calculatedBudget = parseFloat(projectData.total) || 0;
    }

    const dbProject = {
      user_id: projectOwnerId,
      name: projectData.projectName || projectData.name || `${projectData.client || 'New'} - Project`,
      client_name: projectData.client || projectData.clientName || null,
      client_phone: projectData.phone || projectData.clientPhone || null,
      client_email: projectData.email || projectData.clientEmail || null,
      location: projectData.location || null,
      services: projectData.services || [],
      ai_responses_enabled: projectData.aiResponsesEnabled !== false,
      base_contract: calculatedBudget,
      contract_amount: calculatedBudget,
      client_address: projectData.clientAddress || projectData.location || null,
      extras: projectData.extras || [],
      income_collected: projectData.incomeCollected || 0,
      expenses: projectData.expenses || 0,
      budget: calculatedBudget,
      spent: projectData.spent || projectData.expenses || 0,
      percent_complete: autoPercentComplete,
      status: projectData.status || 'active',
      workers: projectData.workers || [],
      days_remaining: projectData.daysRemaining || null,
      last_activity: projectData.lastActivity || 'Just created',
      start_date: startDate,
      end_date: endDate,
      task_description: projectData.scope?.description || projectData.taskDescription || null,
      estimated_duration: projectData.estimatedDuration || null,
      has_phases: !!(projectData.phases && projectData.phases.length > 0),
      working_days: validateWorkingDays(projectData.workingDays),
      non_working_dates: projectData.nonWorkingDates || [],
      assigned_supervisor_id: supervisorAssignmentOverride || projectData.assignedSupervisorId || null,
      linked_estimate_id: projectData.linkedEstimateId !== undefined
        ? projectData.linkedEstimateId
        : (projectData.linked_estimate_id !== undefined ? projectData.linked_estimate_id : null),
    };

    let result;
    const isNewProject = !projectData.id || projectData.id.startsWith('temp-');

    // Check subscription limit before creating a new project
    // Skip in development/testing mode (matches TESTING_MODE in SubscriptionContext)
    const skipLimitCheck = true;
    if (isNewProject && !skipLimitCheck) {
      try {
        const limitCheck = await subscriptionService.canCreateProject();
        if (!limitCheck.can_create) {
          return {
            error: 'limit_reached',
            reason: limitCheck.reason,
            active_count: limitCheck.active_count,
            limit: limitCheck.limit,
            plan_tier: limitCheck.plan_tier,
          };
        }
      } catch (subError) {
        // If subscription check fails, allow project creation (fail open)
        console.warn('⚠️ [saveProject] Subscription check failed, allowing creation:', subError);
      }
    }

    if (!isNewProject) {
      const { data, error } = await supabase
        .from('projects')
        .update(dbProject)
        .eq('id', projectData.id)
        .eq('user_id', userId)
        .select('id, name, client_name, client_phone, client_email, services, ai_responses_enabled, base_contract, contract_amount, extras, income_collected, expenses, spent, actual_progress, status, workers, days_remaining, last_activity, location, start_date, end_date, task_description, estimated_duration, has_phases, working_days, non_working_dates, created_at, updated_at, user_id, assigned_supervisor_id, budget, linked_estimate_id')
        .single();

      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('projects')
        .insert(dbProject)
        .select('id, name, client_name, client_phone, client_email, services, ai_responses_enabled, base_contract, contract_amount, extras, income_collected, expenses, spent, actual_progress, status, workers, days_remaining, last_activity, location, start_date, end_date, task_description, estimated_duration, has_phases, working_days, non_working_dates, created_at, updated_at, user_id, assigned_supervisor_id, budget, linked_estimate_id')
        .single();

      if (error) throw error;
      result = data;
    }

    // Save phases if provided. Use the NON-destructive upsert so a network
    // blip mid-save can't wipe pre-existing phases (the old destructive path
    // deleted everything first, then re-inserted — a failed insert left the
    // project with zero phases).
    let phaseSaveOk = true;
    let failedPhaseIds = [];
    if (projectData.phases && projectData.phases.length > 0) {
      const { upsertProjectPhases } = await import('./projectPhases');
      const phaseResult = await upsertProjectPhases(
        result.id,
        projectData.phases,
        projectData.schedule
      );
      if (phaseResult === false) {
        phaseSaveOk = false;
      } else if (phaseResult && phaseResult.ok === false) {
        phaseSaveOk = false;
        failedPhaseIds = phaseResult.failedPhaseIds || [];
      }

      // Auto-create trade budgets from phase names (seed with $0 — owner sets amounts later).
      // Skip placeholder names like "Phase 7" that come from handleAddPhase's
      // default; those previously orphaned rows in project_trade_budgets when
      // the user renamed or removed the phase, showing up as ghost entries in
      // the "Other Trades" section.
      try {
        const PLACEHOLDER_NAME = /^\s*Phase\s+\d+\s*$/i;
        const { data: existingBudgets } = await supabase
          .from('project_trade_budgets')
          .select('trade_name')
          .eq('project_id', result.id);
        const existingNames = new Set((existingBudgets || []).map(b => b.trade_name.toLowerCase()));
        const newBudgets = projectData.phases
          .filter(p => p.name && !PLACEHOLDER_NAME.test(p.name) && !existingNames.has(p.name.toLowerCase()))
          .map(p => ({ project_id: result.id, trade_name: p.name, budget_amount: parseFloat(p.budget) || 0 }));
        if (newBudgets.length > 0) {
          await supabase.from('project_trade_budgets').insert(newBudgets);
        }
      } catch (e) {
        // Table may not exist yet — silent fail
      }
    }

    // Save trade budgets if provided
    if (projectData.trades && projectData.trades.length > 0) {
      try {
        const { data: existingBudgets } = await supabase
          .from('project_trade_budgets')
          .select('id, trade_name')
          .eq('project_id', result.id);
        const existingMap = new Map((existingBudgets || []).map(b => [b.id, b.trade_name]));

        // Determine which to insert, update, or delete
        const incomingDbIds = new Set(projectData.trades.filter(t => t.dbId).map(t => t.dbId));
        const toDelete = (existingBudgets || []).filter(b => !incomingDbIds.has(b.id)).map(b => b.id);
        const toInsert = projectData.trades.filter(t => !t.dbId);
        const toUpdate = projectData.trades.filter(t => t.dbId);

        if (toDelete.length > 0) {
          await supabase.from('project_trade_budgets').delete().in('id', toDelete);
        }
        if (toInsert.length > 0) {
          await supabase.from('project_trade_budgets').insert(
            toInsert.map(t => ({ project_id: result.id, trade_name: t.name, budget_amount: t.amount }))
          );
        }
        for (const t of toUpdate) {
          await supabase.from('project_trade_budgets')
            .update({ trade_name: t.name, budget_amount: t.amount })
            .eq('id', t.dbId);
        }
      } catch (e) {
        console.error('Error saving trade budgets:', e);
      }
    }

    // Record pricing to history when project is completed
    if (result.status === 'completed' && (result.contract_amount || result.base_contract)) {
      try {
        const { recordProjectPricing } = require('../../services/pricingIntelligence');
        await recordProjectPricing({
          id: result.id,
          name: result.name,
          contract_amount: result.contract_amount || result.base_contract,
          task_description: result.task_description,
          end_date: result.end_date,
        });
      } catch (pricingErr) {
        // Silent fail for pricing recording
      }
    }

    // Persist daily checklist + labor role templates if provided (draft
    // autosave sends them every 2s; we idempotently reconcile).
    if (Array.isArray(projectData.checklist_items)) {
      try {
        const clean = projectData.checklist_items
          .filter(c => c && (c.title || '').trim())
          .map((c, i) => ({
            project_id: result.id,
            owner_id: userId,
            title: String(c.title).trim(),
            item_type: c.item_type === 'quantity' ? 'quantity' : 'checkbox',
            quantity_unit: c.quantity_unit || null,
            requires_photo: !!c.requires_photo,
            sort_order: i,
          }));
        // Simple strategy: delete-then-insert, scoped to this project. The
        // templates table has no child references, so this is safe.
        await supabase.from('daily_checklist_templates').delete().eq('project_id', result.id);
        if (clean.length > 0) {
          await supabase.from('daily_checklist_templates').insert(clean);
        }
      } catch (e) {
        console.warn('[saveProject] checklist_items persist failed:', e?.message);
      }
    }
    if (Array.isArray(projectData.labor_roles)) {
      try {
        const clean = projectData.labor_roles
          .filter(r => r && (r.role_name || '').trim())
          .map((r, i) => ({
            project_id: result.id,
            owner_id: userId,
            role_name: String(r.role_name).trim(),
            default_quantity: Math.max(1, parseInt(r.default_quantity, 10) || 1),
            sort_order: i,
          }));
        await supabase.from('labor_role_templates').delete().eq('project_id', result.id);
        if (clean.length > 0) {
          await supabase.from('labor_role_templates').insert(clean);
        }
      } catch (e) {
        console.warn('[saveProject] labor_roles persist failed:', e?.message);
      }
    }

    clearCache('projects');
    const transformed = transformProjectFromDB(result);
    // Surface partial-phase-save information so UI can warn instead of silently
    // navigating to a project with missing phases.
    transformed.phaseSaveOk = phaseSaveOk;
    transformed.failedPhaseIds = failedPhaseIds;
    return transformed;
  } catch (error) {
    console.error('❌ [saveProject] Error:', error);
    return null;
  }
};

/**
 * Fetch basic project info (id, name) for dropdowns/selectors
 * @returns {Promise<array>} Array of {id, name} objects
 */
export const fetchProjectsBasic = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return [];
    }

    // Exclude drafts — this function feeds estimate pickers, task pickers, etc.
    // Drafts must never be offered as link targets.
    let query = supabase
      .from('projects')
      .select('id, name')
      .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
      .order('name', { ascending: true });
    query = applyActiveFilter(query);
    const { data, error } = await query;

    if (error) {
      console.error('Error fetching projects basic:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchProjectsBasic:', error);
    return [];
  }
};

/**
 * Fetch all projects for the current user
 * Includes both owned projects AND projects assigned to the user (for supervisors)
 * @returns {Promise<array>} Array of projects
 */
export const fetchProjects = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return [];
    }

    // Fetch projects where user is owner OR assigned supervisor
    // This allows supervisors to see projects assigned to them by the owner
    const { data, error } = await supabase
      .from('projects')
      .select(`
        id, name, client_name, client_phone, client_email, services, ai_responses_enabled,
        base_contract, contract_amount, extras, income_collected, expenses, spent,
        actual_progress, status, workers, days_remaining, last_activity, location,
        start_date, end_date, task_description, estimated_duration, has_phases,
        working_days, non_working_dates, created_at, updated_at, user_id,
        assigned_supervisor_id, budget,
        project_phases (
          id, name, planned_days, start_date, end_date, budget, tasks,
          completion_percentage, status, order_index, created_at, updated_at
        )
      `)
      .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('❌ [fetchProjects] Error:', error);
      // Offline fallback: return cached data
      const cached = getCachedData('projects', true);
      if (cached) {
        return cached;
      }
      return [];
    }

    // Note: Database trigger (trigger_update_project_totals) automatically updates
    // projects.expenses and projects.income_collected when transactions are added/modified.
    // No need to aggregate from transactions here.

    const projects = (data || []).map((project) => {
      const transformed = transformProjectFromDB(project);

      if (project.project_phases && project.project_phases.length > 0) {
        transformed.phases = project.project_phases.sort((a, b) =>
          (a.order_index || 0) - (b.order_index || 0)
        );
        transformed.hasPhases = true;
      }

      // Add attribution for supervisor context awareness
      // This helps the AI understand which projects the supervisor created vs which were assigned
      transformed.isOwnedByMe = project.user_id === userId;
      transformed.isAssignedToMe = project.assigned_supervisor_id === userId;
      transformed.attribution = project.user_id === userId
        ? 'created_by_you'
        : 'assigned_to_you';

      return transformed;
    });

    // Cache for offline access
    cacheData('projects', projects);
    return projects;
  } catch (error) {
    console.error('❌ [fetchProjects] Exception:', error);
    // Offline fallback
    const cached = getCachedData('projects', true);
    if (cached) return cached;
    return [];
  }
};

/**
 * Fetch all projects across all supervisors under this owner
 * Used by owner's AI chat to see company-wide project data
 * Includes supervisor_name for attribution
 * @returns {Promise<array>} Projects with supervisor info
 */
export const fetchProjectsForOwner = async () => {
  try {
    const context = await getCurrentUserContext();
    if (!context) return [];

    // If not owner, fall back to regular fetchProjects
    if (!context.isOwner) {
      return fetchProjects();
    }

    // Get all supervisors under this owner
    const supervisors = await getSupervisorsForOwner(context.userId);
    const supervisorIds = supervisors.map(s => s.id);
    const supervisorNames = Object.fromEntries(
      supervisors.map(s => [s.id, s.business_name || 'Supervisor'])
    );

    // Include owner's own projects too
    const allIds = [context.userId, ...supervisorIds];

    const { data, error } = await supabase
      .from('projects')
      .select(`
        id, name, client_name, client_phone, client_email, services, ai_responses_enabled,
        base_contract, contract_amount, extras, income_collected, expenses, spent,
        actual_progress, status, workers, days_remaining, last_activity, location,
        start_date, end_date, task_description, estimated_duration, has_phases,
        working_days, non_working_dates, created_at, updated_at, user_id,
        assigned_supervisor_id, budget,
        project_phases (
          id, name, planned_days, start_date, end_date, budget, tasks,
          completion_percentage, status, order_index, created_at, updated_at
        )
      `)
      .in('user_id', allIds)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching projects for owner:', error);
      return [];
    }

    // Transform and add supervisor attribution with creator/manager distinction
    const projects = (data || []).map((project) => {
      const transformed = transformProjectFromDB(project);

      // Determine who created and who manages
      const creatorId = project.user_id;
      const managerId = project.assigned_supervisor_id || project.user_id;

      // Created by
      transformed.created_by_id = creatorId;
      transformed.created_by_name = creatorId === context.userId
        ? 'You (Owner)'
        : (supervisorNames[creatorId] || 'Unknown');

      // Managed by (assigned supervisor, or creator if not assigned)
      transformed.managed_by_id = managerId;
      transformed.managed_by_name = managerId === context.userId
        ? 'You (Owner)'
        : (supervisorNames[managerId] || 'Unknown');

      // Assignment status
      if (creatorId === context.userId && !project.assigned_supervisor_id) {
        transformed.assignment_status = 'owner_direct'; // Owner created, owner manages
      } else if (creatorId === context.userId && project.assigned_supervisor_id) {
        transformed.assignment_status = 'assigned_to_supervisor'; // Owner created, assigned to supervisor
      } else {
        transformed.assignment_status = 'supervisor_own'; // Supervisor created and manages
      }

      // Legacy field for backward compatibility
      transformed.supervisor_name = transformed.managed_by_name;
      transformed.supervisor_id = managerId;

      if (project.project_phases && project.project_phases.length > 0) {
        transformed.phases = project.project_phases.sort((a, b) =>
          (a.order_index || 0) - (b.order_index || 0)
        );
        transformed.hasPhases = true;
      }

      return transformed;
    });

    return projects;
  } catch (error) {
    console.error('Error in fetchProjectsForOwner:', error);
    return [];
  }
};

/**
 * Get a single project by ID
 * @param {string} projectId - Project ID
 * @returns {Promise<object|null>} Project object or null
 */
export const getProject = async (projectId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return null;
    }

    const { data, error } = await supabase
      .from('projects')
      .select(`
        id, name, client_name, client_phone, client_email, services, ai_responses_enabled,
        base_contract, contract_amount, extras, income_collected, expenses, spent,
        actual_progress, status, workers, days_remaining, last_activity, location,
        start_date, end_date, task_description, estimated_duration, has_phases,
        working_days, non_working_dates, created_at, updated_at, user_id,
        assigned_supervisor_id, budget,
        project_phases (
          id, name, planned_days, start_date, end_date, budget, tasks,
          completion_percentage, status, order_index, created_at, updated_at
        )
      `)
      .eq('id', projectId)
      .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`)
      .single();

    if (error) {
      return null;
    }

    // Note: Database trigger (trigger_update_project_totals) automatically updates
    // projects.expenses and projects.income_collected when transactions are added/modified.
    const transformed = transformProjectFromDB(data);

    // Add phases if they exist (same as fetchProjects does)
    if (data.project_phases && data.project_phases.length > 0) {
      transformed.phases = data.project_phases.sort((a, b) =>
        (a.order_index || 0) - (b.order_index || 0)
      );
      transformed.hasPhases = true;
    }

    return transformed;
  } catch (error) {
    return null;
  }
};

/**
 * Delete a project by ID
 * @param {string} projectId - Project ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteProject = async (projectId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return false;
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) {
      return false;
    }

    clearCache('projects');
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Transform screenshot analysis data to project format
 * @param {object} screenshotData - Data from screenshot analysis
 * @returns {object} Project format object ready to save
 */
export const transformScreenshotToProject = (screenshotData) => {
  const { worker, location, date, time, task, budget, estimatedDuration } = screenshotData;
  const projectName = task || 'New Project';

  return {
    id: `temp-${Date.now()}`,
    name: projectName,
    contractAmount: budget || 0,
    incomeCollected: 0,
    expenses: 0,
    profit: 0,
    budget: budget || 0,
    spent: 0,
    percentComplete: 0,
    status: 'active',
    workers: worker ? [worker] : [],
    daysRemaining: null,
    lastActivity: 'Just created',
    location: location || null,
    startDate: date || new Date().toISOString().split('T')[0],
    endDate: null,
    taskDescription: task || null,
    estimatedDuration: estimatedDuration || null,
  };
};

/**
 * Update project working days
 * @param {string} projectId - Project ID
 * @param {number[]} workingDays - Array of ISO weekday numbers (1-7)
 * @returns {Promise<boolean>} Success status
 */
export const updateProjectWorkingDays = async (projectId, workingDays) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('projects')
      .update({ working_days: workingDays })
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating working days:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error in updateProjectWorkingDays:', error);
    return false;
  }
};

/**
 * Get project working days
 * @param {string} projectId - Project ID
 * @returns {Promise<number[]>} Array of ISO weekday numbers
 */
export const getProjectWorkingDays = async (projectId) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('working_days')
      .eq('id', projectId)
      .single();

    if (error) return [1, 2, 3, 4, 5]; // Default Mon-Fri
    return data?.working_days || [1, 2, 3, 4, 5];
  } catch (error) {
    return [1, 2, 3, 4, 5];
  }
};

/**
 * Get project non-working dates (specific date exceptions)
 * @param {string} projectId - Project ID
 * @returns {Promise<string[]>} Array of date strings (YYYY-MM-DD)
 */
export const getProjectNonWorkingDates = async (projectId) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('non_working_dates')
      .eq('id', projectId)
      .single();

    if (error) return [];
    return data?.non_working_dates || [];
  } catch (error) {
    return [];
  }
};

/**
 * Add a non-working date to a project
 * @param {string} projectId - Project ID
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {Promise<boolean>} Success status
 */
export const addNonWorkingDate = async (projectId, date) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    // Get current non-working dates
    const current = await getProjectNonWorkingDates(projectId);

    // Don't add duplicates
    if (current.includes(date)) return true;

    const updated = [...current, date].sort();

    const { error } = await supabase
      .from('projects')
      .update({ non_working_dates: updated })
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error adding non-working date:', error);
      return false;
    }
    try {
      const { redistributeProjectTasks } = await import('../scheduling/redistributeProjectTasks');
      redistributeProjectTasks(projectId);
    } catch (_) { /* fire-and-forget */ }
    return true;
  } catch (error) {
    console.error('Error in addNonWorkingDate:', error);
    return false;
  }
};

/**
 * Remove a non-working date from a project
 * @param {string} projectId - Project ID
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {Promise<boolean>} Success status
 */
export const removeNonWorkingDate = async (projectId, date) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    // Get current non-working dates
    const current = await getProjectNonWorkingDates(projectId);
    const updated = current.filter(d => d !== date);

    const { error } = await supabase
      .from('projects')
      .update({ non_working_dates: updated })
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error removing non-working date:', error);
      return false;
    }
    try {
      const { redistributeProjectTasks } = await import('../scheduling/redistributeProjectTasks');
      redistributeProjectTasks(projectId);
    } catch (_) { /* fire-and-forget */ }
    return true;
  } catch (error) {
    console.error('Error in removeNonWorkingDate:', error);
    return false;
  }
};

/**
 * Update all non-working dates for a project
 * @param {string} projectId - Project ID
 * @param {string[]} dates - Array of date strings (YYYY-MM-DD)
 * @returns {Promise<boolean>} Success status
 */
export const updateNonWorkingDates = async (projectId, dates) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('projects')
      .update({ non_working_dates: dates })
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating non-working dates:', error);
      return false;
    }
    try {
      const { redistributeProjectTasks } = await import('../scheduling/redistributeProjectTasks');
      redistributeProjectTasks(projectId);
    } catch (_) { /* fire-and-forget */ }
    return true;
  } catch (error) {
    console.error('Error in updateNonWorkingDates:', error);
    return false;
  }
};

/**
 * Assign a project to a supervisor to manage
 * Only owners can assign their own projects
 * @param {string} projectId - Project ID
 * @param {string|null} supervisorId - Supervisor ID (null to unassign)
 * @returns {Promise<{success: boolean, error?: string, action?: string}>}
 */
export const assignProjectToSupervisor = async (projectId, supervisorId) => {
  try {
    const { data, error } = await supabase.rpc('assign_project_to_supervisor', {
      p_project_id: projectId,
      p_supervisor_id: supervisorId,
    });

    if (error) {
      console.error('Error assigning project:', error);
      return { success: false, error: error.message };
    }

    return data || { success: false, error: 'No response' };
  } catch (error) {
    console.error('Error in assignProjectToSupervisor:', error);
    return { success: false, error: error.message };
  }
};

// Aliases for backward compatibility
export const updateProject = saveProject;
export const transformProject = transformProjectFromDB;
