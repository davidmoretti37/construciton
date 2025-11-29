import { supabase } from '../lib/supabase';

/**
 * Project Service
 * Handles project CRUD operations, progress tracking, and velocity calculations
 */

/**
 * Get current user ID from Supabase auth
 * @returns {Promise<string|null>} User ID or null
 */
const getCurrentUserId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
};

/**
 * Calculate time-based completion percentage
 * @param {string} startDate - Project start date (YYYY-MM-DD)
 * @param {string} endDate - Project end date (YYYY-MM-DD)
 * @returns {number} Completion percentage (0-100)
 */
const calculateTimeBasedCompletion = (startDate, endDate) => {
  if (!startDate || !endDate) {
    return 0;
  }

  try {
    // Parse start date
    const [startYear, startMonth, startDay] = startDate.split('-');
    const start = new Date(parseInt(startYear), parseInt(startMonth) - 1, parseInt(startDay));
    start.setHours(0, 0, 0, 0);

    // Parse end date
    const [endYear, endMonth, endDay] = endDate.split('-');
    const end = new Date(parseInt(endYear), parseInt(endMonth) - 1, parseInt(endDay));
    end.setHours(0, 0, 0, 0);

    // Get today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate total days and elapsed days
    const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
    const elapsedDays = Math.round((today - start) / (1000 * 60 * 60 * 24));

    // Handle edge cases
    if (totalDays <= 0) return 0;
    if (elapsedDays < 0) return 0;
    if (elapsedDays >= totalDays) return 100;

    // Calculate percentage
    const percentage = Math.round((elapsedDays / totalDays) * 100);
    return percentage;
  } catch (error) {
    console.error('❌ Error calculating time-based completion:', error);
    return 0;
  }
};

/**
 * Transform project from database format to app format
 * @param {object} dbProject - Project from database
 * @returns {object} App format project
 */
const transformProjectFromDB = (dbProject) => {
  // Parse daysRemaining as a number, handling null/undefined
  let daysRemaining = null;
  if (dbProject.days_remaining !== null && dbProject.days_remaining !== undefined) {
    daysRemaining = parseInt(dbProject.days_remaining);
    if (isNaN(daysRemaining)) {
      daysRemaining = null;
    }
  }

  // Parse new financial fields, with fallback to legacy fields
  // contract_amount is auto-calculated by DB trigger (base_contract + extras)
  const contractAmount = parseFloat(dbProject.contract_amount) || parseFloat(dbProject.budget) || 0;
  const baseContract = parseFloat(dbProject.base_contract) || contractAmount;
  const incomeCollected = parseFloat(dbProject.income_collected) || 0;
  const expenses = parseFloat(dbProject.expenses) || parseFloat(dbProject.spent) || 0;
  const extras = dbProject.extras || [];

  // Auto-calculate completion percentage based on time (days elapsed / total days)
  const percentComplete = calculateTimeBasedCompletion(dbProject.start_date, dbProject.end_date);

  // Calculate status based on progress and financials
  const calculateStatus = () => {
    const storedStatus = dbProject.status || 'active';

    // Only allowed DB statuses: draft, active, completed, archived, scheduled
    if (['draft', 'active', 'completed', 'archived', 'scheduled'].includes(storedStatus)) {
      return storedStatus;
    }

    // If stored status is invalid (old data), default to active
    return 'active';
  };

  // Calculate display status (includes dynamic statuses for UI)
  const calculateDisplayStatus = () => {
    const baseStatus = calculateStatus();

    // If project is not active, return the base status
    if (baseStatus !== 'active') {
      return baseStatus;
    }

    // For active projects, calculate dynamic status based on timeline and budget
    const isOverBudget = expenses > contractAmount;
    const isBehind = daysRemaining !== null && daysRemaining < 0;

    // Priority: over-budget > behind > on-track
    if (isOverBudget) return 'over-budget';
    if (isBehind) return 'behind';
    return 'on-track';
  };

  return {
    id: dbProject.id,
    name: dbProject.name,
    client: dbProject.client, // Client name
    clientPhone: dbProject.client_phone,
    clientEmail: dbProject.client_email,
    aiResponsesEnabled: dbProject.ai_responses_enabled !== false, // Default to true
    // New financial model with extras support
    baseContract: baseContract,
    contractAmount: contractAmount, // This includes base + extras (auto-calculated by DB)
    extras: extras, // Keep extras array for history tracking
    incomeCollected: incomeCollected,
    expenses: expenses,
    profit: incomeCollected - expenses, // Calculated field
    // Legacy fields (kept for backward compatibility)
    budget: contractAmount,
    spent: expenses,
    percentComplete: percentComplete, // Auto-calculated from dates
    status: calculateDisplayStatus(), // Display status (includes dynamic statuses like on-track, behind, over-budget)
    workers: dbProject.workers || [],
    daysRemaining: daysRemaining,
    lastActivity: dbProject.last_activity || 'No activity',
    location: dbProject.location,
    startDate: dbProject.start_date,
    endDate: dbProject.end_date,
    taskDescription: dbProject.task_description,
    estimatedDuration: dbProject.estimated_duration,
    hasPhases: dbProject.has_phases || false, // Whether project uses phases
    // Progress tracking fields
    actual_progress: dbProject.actual_progress || 0,
    progress_override: dbProject.progress_override || false,
    actual_start_date: dbProject.actual_start_date,
    estimated_completion_date: dbProject.estimated_completion_date,
    velocity_tasks_per_day: dbProject.velocity_tasks_per_day || 0,
    createdAt: dbProject.created_at,
    updatedAt: dbProject.updated_at,
  };
};

// ===== PROJECT CRUD =====

/**
 * Save or update a project in Supabase
 * @param {object} projectData - Project data object
 * @returns {Promise<object|null>} Saved project or null if error
 */
export const saveProject = async (projectData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    // Import saveProjectPhases dynamically to avoid circular dependency
    const { saveProjectPhases } = await import('./phaseService');

    // Extract schedule dates if provided
    const startDate = projectData.startDate || projectData.schedule?.startDate || null;
    const endDate = projectData.endDate || projectData.schedule?.estimatedEndDate || null;

    // Auto-calculate completion percentage from dates
    const autoPercentComplete = calculateTimeBasedCompletion(startDate, endDate);

    // Calculate budget from phases or lineItems if not provided
    let calculatedBudget = projectData.budget || projectData.baseContract || projectData.contractAmount || 0;

    if (projectData.phases && projectData.phases.length > 0) {
      // Calculate total from phase budgets
      calculatedBudget = projectData.phases.reduce((sum, phase) => {
        return sum + (parseFloat(phase.budget) || 0);
      }, 0);
    } else if (projectData.lineItems && projectData.lineItems.length > 0) {
      // Calculate total from line items
      calculatedBudget = projectData.lineItems.reduce((sum, item) => {
        return sum + (parseFloat(item.total) || 0);
      }, 0);
    } else if (projectData.total) {
      // Use total if provided
      calculatedBudget = parseFloat(projectData.total) || 0;
    }

    // Transform app format to database format
    const dbProject = {
      user_id: userId,
      name: projectData.projectName || projectData.name || `${projectData.client} - Project`,
      client: projectData.client || null,
      client_phone: projectData.phone || projectData.clientPhone || null,
      client_email: projectData.email || projectData.clientEmail || null,
      location: projectData.location || null,
      ai_responses_enabled: projectData.aiResponsesEnabled !== false, // Default to true
      // New financial model with extras support
      base_contract: calculatedBudget,
      extras: projectData.extras || [],
      // contract_amount is auto-calculated by database trigger (base_contract + sum of extras)
      income_collected: projectData.incomeCollected || 0,
      expenses: projectData.expenses || 0,
      // Legacy fields (for backward compatibility)
      budget: calculatedBudget,
      spent: projectData.spent || projectData.expenses || 0,
      percent_complete: autoPercentComplete, // Auto-calculated from dates
      status: projectData.status || 'active',
      workers: projectData.workers || [],
      days_remaining: projectData.daysRemaining || null,
      last_activity: projectData.lastActivity || 'Just created',
      start_date: startDate,
      end_date: endDate,
      task_description: projectData.scope?.description || projectData.taskDescription || null,
      estimated_duration: projectData.estimatedDuration || null,
      // Indicate if project has phases
      has_phases: !!(projectData.phases && projectData.phases.length > 0),
    };

    // If project has an ID, update it; otherwise insert new
    let result;
    if (projectData.id && !projectData.id.startsWith('temp-')) {
      const { data, error} = await supabase
        .from('projects')
        .update(dbProject)
        .eq('id', projectData.id)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('projects')
        .insert(dbProject)
        .select()
        .single();

      if (error) throw error;
      result = data;
    }

    console.log('✅ Project saved successfully:', result.id);

    // Save phases if provided
    if (projectData.phases && projectData.phases.length > 0) {
      console.log('💾 Saving project phases...');
      await saveProjectPhases(result.id, projectData.phases, projectData.schedule);
    }

    return transformProjectFromDB(result);
  } catch (error) {
    console.error('Error saving project:', error);
    return null;
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
      console.log('No user logged in');
      return [];
    }

    // Import fetchProjectPhases dynamically to avoid circular dependency
    const { fetchProjectPhases } = await import('./phaseService');

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching projects:', error);
      return [];
    }

    // Transform each project and fetch phases if hasPhases is true
    const projects = await Promise.all((data || []).map(async (project) => {
      const transformed = transformProjectFromDB(project);

      // Fetch phases if project has them
      if (transformed.hasPhases) {
        const phases = await fetchProjectPhases(transformed.id);
        transformed.phases = phases || [];
      }

      return transformed;
    }));

    return projects;
  } catch (error) {
    console.error('Error loading projects:', error);
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
      console.error('No user logged in');
      return null;
    }

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Error fetching project:', error);
      return null;
    }

    return transformProjectFromDB(data);
  } catch (error) {
    console.error('Error loading project:', error);
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
      console.error('No user logged in');
      return false;
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting project:', error);
      return false;
    }

    console.log('Project deleted successfully:', projectId);
    return true;
  } catch (error) {
    console.error('Error deleting project:', error);
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

  // Use task as project name
  const projectName = task || 'New Project';

  return {
    id: `temp-${Date.now()}`, // Temporary ID until saved
    name: projectName,
    // New financial model
    contractAmount: budget || 0, // Screenshot budget becomes contract amount
    incomeCollected: 0,
    expenses: 0,
    profit: 0,
    // Legacy fields (for backward compatibility)
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

// ===== PROGRESS TRACKING =====

/**
 * Calculate actual progress from phase completion percentages
 * @param {string} projectId - Project ID
 * @returns {Promise<number>} Average progress percentage
 */
export const calculateActualProgress = async (projectId) => {
  try {
    const { data: phases, error } = await supabase
      .from('project_phases')
      .select('completion_percentage')
      .eq('project_id', projectId);

    if (error || !phases || phases.length === 0) {
      console.error('Error fetching phases for progress:', error);
      return 0;
    }

    // Calculate average completion across all phases
    const totalCompletion = phases.reduce((sum, phase) => {
      return sum + (phase.completion_percentage || 0);
    }, 0);

    const averageProgress = Math.round(totalCompletion / phases.length);

    // Update project's actual progress (only if not manually overridden)
    const { data: project } = await supabase
      .from('projects')
      .select('progress_override')
      .eq('id', projectId)
      .single();

    if (!project?.progress_override) {
      await supabase
        .from('projects')
        .update({ actual_progress: averageProgress })
        .eq('id', projectId);
    }

    return averageProgress;
  } catch (error) {
    console.error('Error in calculateActualProgress:', error);
    return 0;
  }
};

/**
 * Calculate task completion velocity (tasks per day)
 * @param {string} projectId - Project ID
 * @returns {Promise<number>} Velocity (tasks per day)
 */
export const calculateVelocity = async (projectId) => {
  try {
    // Get project start date
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('actual_start_date, start_date')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('Error fetching project for velocity:', projectError);
      return 0;
    }

    const startDate = project.actual_start_date || project.start_date;
    if (!startDate) {
      return 0; // Can't calculate velocity without start date
    }

    // Calculate days elapsed
    const start = new Date(startDate);
    const today = new Date();
    const daysElapsed = Math.max(1, Math.ceil((today - start) / (1000 * 60 * 60 * 24)));

    // Count completed tasks across all phases
    const { data: phases, error: phasesError } = await supabase
      .from('project_phases')
      .select('tasks')
      .eq('project_id', projectId);

    if (phasesError || !phases) {
      console.error('Error fetching phases for velocity:', phasesError);
      return 0;
    }

    let completedTasks = 0;
    phases.forEach(phase => {
      const tasks = phase.tasks || [];
      completedTasks += tasks.filter(t => t.completed).length;
    });

    // Calculate velocity (tasks per day)
    const velocity = completedTasks / daysElapsed;

    // Update project
    await supabase
      .from('projects')
      .update({ velocity_tasks_per_day: velocity.toFixed(2) })
      .eq('id', projectId);

    return velocity;
  } catch (error) {
    console.error('Error in calculateVelocity:', error);
    return 0;
  }
};

/**
 * Calculate estimated completion date based on current velocity
 * @param {string} projectId - Project ID
 * @returns {Promise<object|null>} Estimation details or null
 */
export const calculateEstimatedCompletion = async (projectId) => {
  try {
    // Get project data
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('velocity_tasks_per_day, end_date')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('Error fetching project for completion estimate:', projectError);
      return null;
    }

    const velocity = parseFloat(project.velocity_tasks_per_day);
    if (velocity === 0) {
      return null; // Can't predict without velocity
    }

    // Count total and completed tasks
    const { data: phases, error: phasesError } = await supabase
      .from('project_phases')
      .select('tasks')
      .eq('project_id', projectId);

    if (phasesError || !phases) {
      console.error('Error fetching phases for completion estimate:', phasesError);
      return null;
    }

    let totalTasks = 0;
    let completedTasks = 0;
    phases.forEach(phase => {
      const tasks = phase.tasks || [];
      totalTasks += tasks.length;
      completedTasks += tasks.filter(t => t.completed).length;
    });

    if (totalTasks === 0) {
      return null; // No tasks to estimate from
    }

    const remainingTasks = totalTasks - completedTasks;
    const daysNeeded = Math.ceil(remainingTasks / velocity);

    // Calculate estimated date
    const today = new Date();
    const estimatedDate = new Date(today.getTime() + (daysNeeded * 24 * 60 * 60 * 1000));
    const estimatedDateString = estimatedDate.toISOString().split('T')[0];

    // Calculate days late/early
    let daysLate = 0;
    if (project.end_date) {
      const plannedEnd = new Date(project.end_date);
      daysLate = Math.ceil((estimatedDate - plannedEnd) / (1000 * 60 * 60 * 24));
    }

    // Update project
    await supabase
      .from('projects')
      .update({ estimated_completion_date: estimatedDateString })
      .eq('id', projectId);

    return {
      estimatedDate: estimatedDateString,
      daysNeeded,
      daysLate,
      remainingTasks,
      completedTasks,
      totalTasks
    };
  } catch (error) {
    console.error('Error in calculateEstimatedCompletion:', error);
    return null;
  }
};

/**
 * Update project progress (manual or automatic)
 * @param {string} projectId - Project ID
 * @param {number} actualProgress - Progress percentage (0-100)
 * @param {boolean} isManual - Whether this is a manual override
 * @returns {Promise<boolean>} Success status
 */
export const updateProjectProgress = async (projectId, actualProgress, isManual = false) => {
  try {
    const updates = {
      actual_progress: actualProgress,
      progress_override: isManual
    };

    const { error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', projectId);

    if (error) {
      console.error('Error updating project progress:', error);
      return false;
    }

    // If manual, don't recalculate velocity
    if (!isManual) {
      // Recalculate velocity and estimated completion
      await calculateVelocity(projectId);
      await calculateEstimatedCompletion(projectId);
    }

    return true;
  } catch (error) {
    console.error('Error in updateProjectProgress:', error);
    return false;
  }
};

/**
 * Reset project progress to automatic calculation
 * @param {string} projectId - Project ID
 * @returns {Promise<boolean>} Success status
 */
export const resetProjectProgressToAutomatic = async (projectId) => {
  try {
    // Recalculate from phases
    const actualProgress = await calculateActualProgress(projectId);

    // Update with override = false
    const { error } = await supabase
      .from('projects')
      .update({
        actual_progress: actualProgress,
        progress_override: false
      })
      .eq('id', projectId);

    if (error) {
      console.error('Error resetting progress:', error);
      return false;
    }

    // Recalculate velocity and completion
    await calculateVelocity(projectId);
    await calculateEstimatedCompletion(projectId);

    return true;
  } catch (error) {
    console.error('Error in resetProjectProgressToAutomatic:', error);
    return false;
  }
};

/**
 * Auto-start projects when their start_date arrives
 * Call this on app initialization
 * @returns {Promise<number>} Number of projects started
 */
export const checkAndStartScheduledProjects = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return 0;
    }

    const today = new Date().toISOString().split('T')[0];

    // Find all scheduled projects where start_date <= today
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('status', 'scheduled')
      .lte('start_date', today);

    if (error) {
      console.error('Error fetching scheduled projects:', error);
      return 0;
    }

    if (!projects || projects.length === 0) {
      return 0;
    }

    // Start each project
    for (const project of projects) {
      await supabase
        .from('projects')
        .update({
          status: 'active',
          actual_start_date: today
        })
        .eq('id', project.id);

      console.log(`Auto-started project: ${project.name}`);
    }

    return projects.length;
  } catch (error) {
    console.error('Error in checkAndStartScheduledProjects:', error);
    return 0;
  }
};

// ===== OTHER PROJECT OPERATIONS =====

/**
 * Update project payment structure
 * @param {string} projectId - Project ID
 * @param {string} paymentStructure - Payment structure type
 * @param {string} paymentTerms - Payment terms
 * @returns {Promise<boolean>} Success status
 */
export const updateProjectPaymentStructure = async (projectId, paymentStructure, paymentTerms = null) => {
  try {
    const { error } = await supabase
      .from('projects')
      .update({
        payment_structure: paymentStructure,
        payment_terms: paymentTerms,
      })
      .eq('id', projectId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating project payment structure:', error);
    return false;
  }
};

/**
 * Create a project from an estimate
 * @param {string} estimateId - Estimate ID
 * @returns {Promise<object|null>} Created project or null
 */
export const createProjectFromEstimate = async (estimateId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    // Import getEstimate dynamically to avoid circular dependency
    const { getEstimate } = await import('./estimateService');

    // Fetch the estimate with all data
    const estimate = await getEstimate(estimateId);
    if (!estimate) {
      console.error('Estimate not found');
      return null;
    }

    // Transform estimate data to project format
    const projectData = {
      name: estimate.project_name || estimate.client_name || 'Unnamed Project',
      client: estimate.client_name,
      client_phone: estimate.client_phone,
      client_email: estimate.client_email,
      location: estimate.client_address,
      base_contract: estimate.total || 0,
      contract_amount: estimate.total || 0,
      income_collected: 0,
      expenses: 0,
      phases: estimate.phases || [],
      schedule: estimate.schedule || {},
      scope: estimate.scope || {},
      lineItems: estimate.items || [],
      status: 'active',
      taskDescription: estimate.scope?.description || '',
      estimate_id: estimate.id,
    };

    // Create the project
    const createdProject = await saveProject(projectData);

    if (!createdProject) {
      console.error('Failed to create project from estimate');
      return null;
    }

    // Update estimate status to 'accepted' and link to project
    const { error: updateError } = await supabase
      .from('estimates')
      .update({
        status: 'accepted',
        accepted_date: new Date().toISOString(),
        project_id: createdProject.id,
      })
      .eq('id', estimateId);

    if (updateError) {
      console.error('Error updating estimate status:', updateError);
      // Don't fail the whole operation, project was created successfully
    }

    console.log('✅ Project created from estimate successfully:', createdProject.id);
    return createdProject;
  } catch (error) {
    console.error('Error creating project from estimate:', error);
    return null;
  }
};

/**
 * Fetch active projects for a specific date
 * @param {string} date - Date string (YYYY-MM-DD)
 * @returns {Promise<array>} Array of active projects
 */
export const fetchActiveProjectsForDate = async (date) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('projects')
      .select(`
        *,
        project_phases (
          id,
          name,
          status,
          start_date,
          end_date,
          order_index
        )
      `)
      .eq('user_id', user.id)
      .lte('start_date', date)
      .or(`end_date.gte.${date},end_date.is.null`)
      .order('start_date', { ascending: true });

    if (error) {
      console.error('Error fetching active projects:', error);
      return [];
    }

    // Transform to match app format
    return (data || []).map(project => ({
      ...project,
      startDate: project.start_date,
      endDate: project.end_date,
      phases: project.project_phases || []
    }));
  } catch (error) {
    console.error('Error in fetchActiveProjectsForDate:', error);
    return [];
  }
};
