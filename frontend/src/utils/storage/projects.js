import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from './auth';
import { validateWorkingDays } from './workerTasks';
import subscriptionService from '../../services/subscriptionService';

// ============================================================
// Project Management Functions
// ============================================================

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
    client: dbProject.client,
    clientPhone: dbProject.client_phone,
    clientEmail: dbProject.client_email,
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

    const startDate = projectData.startDate || projectData.schedule?.startDate || null;
    const endDate = projectData.endDate || projectData.schedule?.estimatedEndDate || null;
    const autoPercentComplete = calculateTimeBasedCompletion(startDate, endDate);

    let calculatedBudget = projectData.budget || projectData.baseContract || projectData.contractAmount || 0;

    if (projectData.phases && projectData.phases.length > 0) {
      calculatedBudget = projectData.phases.reduce((sum, phase) => {
        return sum + (parseFloat(phase.budget) || 0);
      }, 0);
    } else if (projectData.lineItems && projectData.lineItems.length > 0) {
      calculatedBudget = projectData.lineItems.reduce((sum, item) => {
        return sum + (parseFloat(item.total) || 0);
      }, 0);
    } else if (projectData.total) {
      calculatedBudget = parseFloat(projectData.total) || 0;
    }

    const dbProject = {
      user_id: userId,
      name: projectData.projectName || projectData.name || `${projectData.client} - Project`,
      client_phone: projectData.phone || projectData.clientPhone || null,
      client_email: projectData.email || projectData.clientEmail || null,
      location: projectData.location || null,
      ai_responses_enabled: projectData.aiResponsesEnabled !== false,
      base_contract: calculatedBudget,
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
    };

    console.log('💾 [saveProject] Working days:', dbProject.working_days);

    let result;
    const isNewProject = !projectData.id || projectData.id.startsWith('temp-');

    // Check subscription limit before creating a new project
    if (isNewProject) {
      try {
        const limitCheck = await subscriptionService.canCreateProject();
        if (!limitCheck.can_create) {
          console.log('⚠️ [saveProject] Project limit reached:', limitCheck);
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
        .select()
        .single();

      if (error) throw error;
      result = data;
      console.log('✅ [saveProject] Updated project:', result.id, 'location:', result.location);
    } else {
      const { data, error } = await supabase
        .from('projects')
        .insert(dbProject)
        .select()
        .single();

      if (error) throw error;
      result = data;
      console.log('✅ [saveProject] Created project:', result.id, 'location:', result.location);
    }

    // Save phases if provided (this also creates worker_tasks distributed across working days)
    if (projectData.phases && projectData.phases.length > 0) {
      const { saveProjectPhases } = await import('./projectPhases');
      await saveProjectPhases(result.id, projectData.phases, projectData.schedule);
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

    return transformProjectFromDB(result);
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

    const { data, error } = await supabase
      .from('projects')
      .select('id, name')
      .eq('user_id', userId)
      .order('name', { ascending: true });

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
 * @returns {Promise<array>} Array of projects
 */
export const fetchProjects = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return [];
    }

    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        project_phases (
          id,
          name,
          planned_days,
          start_date,
          end_date,
          budget,
          tasks,
          completion_percentage,
          status,
          order_index,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
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

      return transformed;
    });

    return projects;
  } catch (error) {
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
        *,
        project_phases (
          id,
          name,
          planned_days,
          start_date,
          end_date,
          budget,
          tasks,
          completion_percentage,
          status,
          order_index,
          created_at,
          updated_at
        )
      `)
      .eq('id', projectId)
      .eq('user_id', userId)
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
    return true;
  } catch (error) {
    console.error('Error in updateNonWorkingDates:', error);
    return false;
  }
};

// Aliases for backward compatibility
export const updateProject = saveProject;
export const transformProject = transformProjectFromDB;
