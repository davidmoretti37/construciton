import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from './auth';
import { sendPlanningRequest } from '../../services/aiService';

// ============================================================
// Date & Validation Utilities
// ============================================================

/**
 * Safely parse a date input to a Date object
 * Handles various formats: YYYY-MM-DD, ISO timestamp, Date objects
 * @param {string|Date|null|undefined} dateInput - The date to parse
 * @returns {Date|null} Valid Date object or null if invalid
 */
export const safeParseDateToObject = (dateInput) => {
  if (!dateInput) return null;

  // Already a Date object
  if (dateInput instanceof Date) {
    return isNaN(dateInput.getTime()) ? null : dateInput;
  }

  // String input
  if (typeof dateInput === 'string') {
    // If it's already an ISO timestamp (contains 'T'), parse directly
    if (dateInput.includes('T')) {
      const date = new Date(dateInput);
      return isNaN(date.getTime()) ? null : date;
    }
    // If it's YYYY-MM-DD format, add noon time to avoid timezone issues
    const date = new Date(dateInput + 'T12:00:00');
    return isNaN(date.getTime()) ? null : date;
  }

  return null;
};

/**
 * Safely parse a date to YYYY-MM-DD string format
 * @param {string|Date|null|undefined} dateInput - The date to parse
 * @returns {string|null} Date in YYYY-MM-DD format or null if invalid
 */
export const safeParseDateToString = (dateInput) => {
  const dateObj = safeParseDateToObject(dateInput);
  if (!dateObj) return null;
  return dateObj.toISOString().split('T')[0];
};

/**
 * Validate and normalize working days array
 * Ensures it's always a valid array of ISO weekday numbers (1-7)
 * @param {any} workingDays - The working days input to validate
 * @returns {number[]} Valid working days array, defaults to Mon-Fri if invalid
 */
export const validateWorkingDays = (workingDays) => {
  // Must be an array
  if (!Array.isArray(workingDays)) {
    console.warn('⚠️ validateWorkingDays: input is not an array, defaulting to Mon-Fri');
    return [1, 2, 3, 4, 5];
  }

  // Filter to only valid ISO days (1=Monday through 7=Sunday)
  const valid = workingDays.filter(d => Number.isInteger(d) && d >= 1 && d <= 7);

  // Must have at least 1 working day
  if (valid.length === 0) {
    console.warn('⚠️ validateWorkingDays: no valid days found, defaulting to Mon-Fri');
    return [1, 2, 3, 4, 5];
  }

  // Return sorted unique values
  return [...new Set(valid)].sort((a, b) => a - b);
};

// ============================================================
// Task CRUD Operations
// ============================================================

/**
 * Create a new task (owner only)
 */
export const createTask = async (taskData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('worker_tasks')
      .insert({
        owner_id: userId,
        project_id: taskData.projectId,
        title: taskData.title,
        description: taskData.description || null,
        start_date: taskData.startDate,
        end_date: taskData.endDate,
        status: 'pending',
      })
      .select(`
        id, owner_id, project_id, title, description, start_date, end_date, status, completed_at, completed_by, incomplete_reason, incomplete_reported_by, incomplete_reported_at, original_date, phase_task_id, created_at,
        projects:project_id (id, name)
      `)
      .single();

    if (error) {
      console.error('Error creating task:', error);
      return null;
    }

    // Recalculate project progress after adding new task
    if (data?.project_id) {
      await updateProjectProgressFromTasks(data.project_id);
    }

    return data;
  } catch (error) {
    console.error('Error in createTask:', error);
    return null;
  }
};

/**
 * Fetch tasks for a specific project on a specific date
 * Returns tasks where the date falls between start_date and end_date
 */
export const fetchTasksForProject = async (projectId, date) => {
  try {
    if (!projectId || !date) {
      console.warn('fetchTasksForProject called with missing projectId or date');
      return [];
    }

    const { data, error } = await supabase
      .from('worker_tasks')
      .select(`
        id, owner_id, project_id, title, description, start_date, end_date, status, completed_at, completed_by, incomplete_reason, incomplete_reported_by, incomplete_reported_at, original_date, phase_task_id, created_at,
        projects:project_id (id, name),
        completed_worker:completed_by (id, full_name),
        reporter:incomplete_reported_by (id, full_name)
      `)
      .eq('project_id', projectId)
      .lte('start_date', date)
      .gte('end_date', date)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching tasks for project:', error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error('Error in fetchTasksForProject:', error);
    return [];
  }
};

/**
 * Fetch all tasks for a date (owner view - all their projects)
 * Tasks are filtered to only show on their project's working days
 */
export const fetchTasksForDate = async (date) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('worker_tasks')
      .select(`
        id, owner_id, project_id, title, description, start_date, end_date, status, completed_at, completed_by, incomplete_reason, incomplete_reported_by, incomplete_reported_at, original_date, phase_task_id, created_at,
        projects:project_id (id, name, working_days, non_working_dates)
      `)
      .eq('owner_id', userId)
      .lte('start_date', date)
      .gte('end_date', date)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching tasks for date:', error);
      return [];
    }

    // Filter tasks to only show on working days for their project
    const filteredData = (data || []).filter(task => {
      const project = task.projects;
      if (!project) return true; // No project = show task

      // Check if this date is a working day for the project
      const workingDays = project.working_days || [1, 2, 3, 4, 5];
      const nonWorkingDates = project.non_working_dates || [];

      // Check specific non-working dates first
      if (nonWorkingDates.includes(date)) return false;

      // Check weekly working days pattern
      const dateObj = new Date(date + 'T00:00:00');
      const jsDay = dateObj.getDay(); // 0=Sunday, 1=Monday, etc.
      const isoDay = jsDay === 0 ? 7 : jsDay; // Convert to ISO: 1=Monday, 7=Sunday

      return workingDays.includes(isoDay);
    });

    return filteredData;
  } catch (error) {
    console.error('Error in fetchTasksForDate:', error);
    return [];
  }
};

/**
 * Fetch upcoming tasks for a project (tomorrow and beyond)
 */
export const fetchUpcomingTasks = async (projectId, afterDate) => {
  try {
    const { data, error } = await supabase
      .from('worker_tasks')
      .select(`
        id, owner_id, project_id, title, description, start_date, end_date, status, completed_at, completed_by, phase_task_id, created_at,
        projects:project_id (id, name)
      `)
      .eq('project_id', projectId)
      .gt('start_date', afterDate)
      .eq('status', 'pending')
      .order('start_date', { ascending: true })
      .limit(10);

    if (error) {
      console.error('Error fetching upcoming tasks:', error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error('Error in fetchUpcomingTasks:', error);
    return [];
  }
};

/**
 * Calculate project progress from task completion in worker_tasks table
 * Progress = (completed tasks / total tasks) * 100
 * Includes both phase tasks and manually-added tasks
 * @param {string} projectId - Project ID
 * @returns {Promise<{progress: number, completed: number, total: number}>}
 */
export const calculateProjectProgressFromTasks = async (projectId) => {
  try {
    // Get all tasks for this project (no owner_id filter - workers need to see progress too)
    const { data: tasks, error } = await supabase
      .from('worker_tasks')
      .select('id, status')
      .eq('project_id', projectId);

    if (error) {
      console.error('Error fetching tasks for progress:', error);
      return { progress: 0, completed: 0, total: 0 };
    }

    if (!tasks || tasks.length === 0) {
      return { progress: 0, completed: 0, total: 0 };
    }

    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'completed').length;
    const progress = Math.round((completed / total) * 100);

    console.log(`📊 [Progress] Project ${projectId}: ${completed}/${total} tasks = ${progress}%`);

    return { progress, completed, total };
  } catch (error) {
    console.error('Error in calculateProjectProgressFromTasks:', error);
    return { progress: 0, completed: 0, total: 0 };
  }
};

/**
 * Update project progress in database based on task completion
 * @param {string} projectId - Project ID
 * @returns {Promise<boolean>}
 */
export const updateProjectProgressFromTasks = async (projectId) => {
  try {
    const { progress } = await calculateProjectProgressFromTasks(projectId);

    const { error } = await supabase
      .from('projects')
      .update({
        actual_progress: progress,
        progress_override: false, // Always use task-based progress
      })
      .eq('id', projectId);

    if (error) {
      console.error('Error updating project progress:', error);
      return false;
    }

    console.log(`📊 [Progress] Updated project ${projectId} to ${progress}%`);
    return true;
  } catch (error) {
    console.error('Error in updateProjectProgressFromTasks:', error);
    return false;
  }
};

/**
 * Mark a task as complete and update project progress
 */
export const completeTask = async (taskId, workerId) => {
  try {
    const updateData = {
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
    if (workerId) {
      updateData.completed_by = workerId;
    }

    const { data, error } = await supabase
      .from('worker_tasks')
      .update(updateData)
      .eq('id', taskId)
      .select('id, project_id, status, completed_at, completed_by')
      .single();

    if (error) {
      console.error('Error completing task:', error);
      return null;
    }

    // Update project progress after completing task
    if (data?.project_id) {
      await updateProjectProgressFromTasks(data.project_id);
    }

    return data;
  } catch (error) {
    console.error('Error in completeTask:', error);
    return null;
  }
};

/**
 * Uncomplete a task (set back to pending) and update project progress
 */
export const uncompleteTask = async (taskId) => {
  try {
    const { data, error } = await supabase
      .from('worker_tasks')
      .update({
        status: 'pending',
        completed_at: null,
        completed_by: null,
      })
      .eq('id', taskId)
      .select('id, project_id, status, completed_at, completed_by')
      .single();

    if (error) {
      console.error('Error uncompleting task:', error);
      return null;
    }

    // Update project progress after uncompleting task
    if (data?.project_id) {
      await updateProjectProgressFromTasks(data.project_id);
    }

    return data;
  } catch (error) {
    console.error('Error in uncompleteTask:', error);
    return null;
  }
};

/**
 * Mark task as incomplete with a reason
 */
export const markTaskIncomplete = async (taskId, workerId, reason) => {
  try {
    const { data, error } = await supabase
      .from('worker_tasks')
      .update({
        status: 'incomplete',
        incomplete_reason: reason,
        incomplete_reported_by: workerId,
        incomplete_reported_at: new Date().toISOString(),
      })
      .eq('id', taskId)
      .select('id, project_id, status, incomplete_reason, incomplete_reported_by, incomplete_reported_at')
      .single();

    if (error) {
      console.error('Error marking task incomplete:', error);
      return null;
    }
    return data;
  } catch (error) {
    console.error('Error in markTaskIncomplete:', error);
    return null;
  }
};

/**
 * Get tasks that are overdue for a project on a specific date
 * (end_date = date AND status = pending)
 */
export const getOverdueTasks = async (projectId, date) => {
  try {
    const { data, error } = await supabase
      .from('worker_tasks')
      .select('id, project_id, title, description, start_date, end_date, status, created_at')
      .eq('project_id', projectId)
      .eq('end_date', date)
      .eq('status', 'pending');

    if (error) {
      console.error('Error fetching overdue tasks:', error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error('Error in getOverdueTasks:', error);
    return [];
  }
};

/**
 * Update a task (owner only)
 */
export const updateTask = async (taskId, updates) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    const { data, error } = await supabase
      .from('worker_tasks')
      .update({
        title: updates.title,
        description: updates.description,
        start_date: updates.startDate,
        end_date: updates.endDate,
        project_id: updates.projectId,
      })
      .eq('id', taskId)
      .eq('owner_id', userId)
      .select(`
        id, owner_id, project_id, title, description, start_date, end_date, status, completed_at, completed_by, incomplete_reason, incomplete_reported_by, incomplete_reported_at, original_date, phase_task_id, created_at,
        projects:project_id (id, name)
      `)
      .single();

    if (error) {
      console.error('Error updating task:', error);
      return null;
    }
    return data;
  } catch (error) {
    console.error('Error in updateTask:', error);
    return null;
  }
};

/**
 * Delete a task (owner only)
 */
export const deleteTask = async (taskId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return false;

    const { error } = await supabase
      .from('worker_tasks')
      .delete()
      .eq('id', taskId)
      .eq('owner_id', userId);

    if (error) {
      console.error('Error deleting task:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error in deleteTask:', error);
    return false;
  }
};

/**
 * Fetch all tasks for owner (for viewing history/reports)
 */
export const fetchAllTasks = async (filters = {}) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    let query = supabase
      .from('worker_tasks')
      .select(`
        id, owner_id, project_id, title, description, start_date, end_date, status, completed_at, completed_by, incomplete_reason, incomplete_reported_by, incomplete_reported_at, original_date, phase_task_id, created_at,
        projects:project_id (id, name),
        completed_worker:completed_by (id, full_name),
        reporter:incomplete_reported_by (id, full_name)
      `)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (filters.projectId) {
      query = query.eq('project_id', filters.projectId);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.startDate) {
      query = query.gte('start_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('end_date', filters.endDate);
    }

    const { data, error } = await query.limit(200);

    if (error) {
      console.error('Error fetching all tasks:', error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error('Error in fetchAllTasks:', error);
    return [];
  }
};

/**
 * Fetch all tasks for a worker on a specific date
 * Gets tasks from all projects owned by the worker's employer
 * Tasks are filtered to only show on their project's working days
 */
export const fetchTasksForWorker = async (ownerId, date) => {
  try {
    if (!ownerId) return [];

    const { data, error } = await supabase
      .from('worker_tasks')
      .select(`
        id, owner_id, project_id, title, description, start_date, end_date, status, completed_at, completed_by, incomplete_reason, incomplete_reported_by, incomplete_reported_at, original_date, phase_task_id, created_at,
        projects:project_id (id, name, working_days, non_working_dates)
      `)
      .eq('owner_id', ownerId)
      .lte('start_date', date)
      .gte('end_date', date)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching tasks for worker:', error);
      return [];
    }

    // Filter tasks to only show on working days for their project
    const filteredData = (data || []).filter(task => {
      const project = task.projects;
      if (!project) return true; // No project = show task

      // Check if this date is a working day for the project
      const workingDays = project.working_days || [1, 2, 3, 4, 5];
      const nonWorkingDates = project.non_working_dates || [];

      // Check specific non-working dates first
      if (nonWorkingDates.includes(date)) return false;

      // Check weekly working days pattern
      const dateObj = new Date(date + 'T00:00:00');
      const jsDay = dateObj.getDay(); // 0=Sunday, 1=Monday, etc.
      const isoDay = jsDay === 0 ? 7 : jsDay; // Convert to ISO: 1=Monday, 7=Sunday

      return workingDays.includes(isoDay);
    });

    return filteredData;
  } catch (error) {
    console.error('Error in fetchTasksForWorker:', error);
    return [];
  }
};

/**
 * Sync tasks from a project's phases to the calendar (worker_tasks)
 * Use this for existing projects that were created before auto-sync was added
 * @param {string} projectId - The project ID to sync tasks from
 * @returns {Promise<{success: boolean, count: number}>} Result with count of tasks created
 */
export const syncProjectTasksToCalendar = async (projectId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, count: 0 };

    // Fetch the project with its phases
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        start_date,
        end_date,
        project_phases (
          id,
          name,
          start_date,
          end_date,
          tasks
        )
      `)
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (projectError || !project) {
      console.error('Error fetching project for sync:', projectError);
      return { success: false, count: 0 };
    }

    if (!project.project_phases || project.project_phases.length === 0) {
      return { success: true, count: 0, message: 'No phases found' };
    }

    // Check for existing tasks to avoid duplicates
    const { data: existingTasks } = await supabase
      .from('worker_tasks')
      .select('title')
      .eq('project_id', projectId)
      .eq('owner_id', userId);

    const existingTitles = new Set((existingTasks || []).map(t => t.title));

    let createdCount = 0;

    for (const phase of project.project_phases) {
      if (phase.tasks && phase.tasks.length > 0) {
        const phaseStartDate = phase.start_date || project.start_date;
        const phaseEndDate = phase.end_date || project.end_date;

        for (const task of phase.tasks) {
          // Handle both string tasks and object tasks
          const taskTitle = typeof task === 'string' ? task : (task.description || task.title || task.name);

          // Skip if task already exists
          if (!taskTitle || existingTitles.has(taskTitle)) continue;

          const { error } = await supabase
            .from('worker_tasks')
            .insert({
              owner_id: userId,
              project_id: projectId,
              title: taskTitle,
              description: `Phase: ${phase.name}`,
              start_date: phaseStartDate,
              end_date: phaseEndDate,
              status: 'pending',
            });

          if (!error) {
            createdCount++;
            existingTitles.add(taskTitle); // Track to avoid duplicates within same sync
          }
        }
      }
    }

    return { success: true, count: createdCount };
  } catch (error) {
    console.error('Error in syncProjectTasksToCalendar:', error);
    return { success: false, count: 0 };
  }
};

/**
 * Sync tasks from ALL projects to the calendar
 * Use this once to backfill existing projects
 * @returns {Promise<{success: boolean, totalCount: number, projectsProcessed: number}>}
 */
export const syncAllProjectTasksToCalendar = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, totalCount: 0, projectsProcessed: 0 };

    // Fetch all projects with phases
    const { data: projects, error } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId);

    if (error || !projects) {
      console.error('Error fetching projects for sync:', error);
      return { success: false, totalCount: 0, projectsProcessed: 0 };
    }

    let totalCount = 0;
    let projectsProcessed = 0;

    for (const project of projects) {
      const result = await syncProjectTasksToCalendar(project.id);
      if (result.success) {
        totalCount += result.count;
        projectsProcessed++;
      }
    }

    return { success: true, totalCount, projectsProcessed };
  } catch (error) {
    console.error('Error in syncAllProjectTasksToCalendar:', error);
    return { success: false, totalCount: 0, projectsProcessed: 0 };
  }
};

// ============================================================
// Working Days and Bulk Task Shifting Functions
// ============================================================

/**
 * Check if a date is a working day for a project
 * @param {Date} date - Date to check
 * @param {number[]} workingDays - Array of ISO weekday numbers (1=Mon, 7=Sun)
 * @param {string[]} nonWorkingDates - Array of specific non-working dates (YYYY-MM-DD)
 * @returns {boolean} True if it's a working day
 */
export const isWorkingDay = (date, workingDays = [1, 2, 3, 4, 5], nonWorkingDates = []) => {
  // Check if this specific date is in the non-working dates list
  const dateString = date.toISOString().split('T')[0];
  if (nonWorkingDates.includes(dateString)) {
    return false;
  }

  // JavaScript: 0=Sunday, 1=Monday, ... 6=Saturday
  // Convert to ISO: 1=Monday, ... 7=Sunday
  const jsDay = date.getDay();
  const isoDay = jsDay === 0 ? 7 : jsDay;
  return workingDays.includes(isoDay);
};

/**
 * Add N days to a date, optionally skipping non-working days
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @param {number} daysToAdd - Number of days to add (can be negative)
 * @param {number[]|null} workingDays - Working days array, null to use calendar days
 * @param {string[]} nonWorkingDates - Array of specific non-working dates (YYYY-MM-DD)
 * @returns {string} New date in YYYY-MM-DD format
 */
export const shiftDate = (dateString, daysToAdd, workingDays = null, nonWorkingDates = []) => {
  const date = new Date(dateString + 'T00:00:00');

  if (!workingDays || workingDays.length === 0) {
    // Simple calendar day shift
    date.setDate(date.getDate() + daysToAdd);
  } else {
    // Working days shift
    const direction = daysToAdd >= 0 ? 1 : -1;
    let remaining = Math.abs(daysToAdd);

    while (remaining > 0) {
      date.setDate(date.getDate() + direction);
      if (isWorkingDay(date, workingDays, nonWorkingDates)) {
        remaining--;
      }
    }

    // If we land on a non-working day, advance to next working day
    while (!isWorkingDay(date, workingDays, nonWorkingDates)) {
      date.setDate(date.getDate() + direction);
    }
  }

  return date.toISOString().split('T')[0];
};

/**
 * Bulk shift multiple tasks by N days
 * @param {string[]} taskIds - Array of task IDs to shift
 * @param {number} daysToShift - Number of days to shift (positive=forward, negative=backward)
 * @param {number[]|null} workingDays - Working days array (null=calendar days)
 * @param {string[]} nonWorkingDates - Array of specific non-working dates (YYYY-MM-DD)
 * @returns {Promise<{success: boolean, updatedCount: number, errors: string[]}>}
 */
export const bulkShiftTasks = async (taskIds, daysToShift, workingDays = null, nonWorkingDates = []) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, updatedCount: 0, errors: ['Not authenticated'] };

    if (!taskIds || taskIds.length === 0) {
      return { success: false, updatedCount: 0, errors: ['No tasks provided'] };
    }

    // Fetch all tasks to shift
    const { data: tasks, error: fetchError } = await supabase
      .from('worker_tasks')
      .select('id, start_date, end_date')
      .in('id', taskIds)
      .eq('owner_id', userId);

    if (fetchError) {
      return { success: false, updatedCount: 0, errors: [fetchError.message] };
    }

    let updatedCount = 0;
    const errors = [];

    // Update each task
    for (const task of tasks) {
      const newStartDate = shiftDate(task.start_date, daysToShift, workingDays, nonWorkingDates);
      const newEndDate = shiftDate(task.end_date, daysToShift, workingDays, nonWorkingDates);

      const { error: updateError } = await supabase
        .from('worker_tasks')
        .update({
          start_date: newStartDate,
          end_date: newEndDate,
        })
        .eq('id', task.id)
        .eq('owner_id', userId);

      if (updateError) {
        errors.push(`Task ${task.id}: ${updateError.message}`);
      } else {
        updatedCount++;
      }
    }

    return {
      success: errors.length === 0,
      updatedCount,
      errors,
    };
  } catch (error) {
    return { success: false, updatedCount: 0, errors: [error.message] };
  }
};

/**
 * Recalculate task dates when project working days change
 * This "compresses" or "expands" the schedule based on new working days
 *
 * Algorithm:
 * 1. Get all tasks for the project sorted by start_date
 * 2. Get the project's start date (or use first task's date)
 * 3. For each task, calculate its "working day offset" from project start using OLD working days
 * 4. Recalculate actual date using NEW working days
 * 5. Update task dates in database
 *
 * @param {string} projectId - Project ID
 * @param {number[]} oldWorkingDays - Previous working days array (for calculating offsets)
 * @param {number[]} newWorkingDays - New working days array (for placing tasks)
 * @param {string[]} nonWorkingDates - Non-working dates array
 * @returns {Promise<{success: boolean, updatedCount: number, errors: string[]}>}
 */
export const recalculateTaskDatesForProject = async (projectId, oldWorkingDays, newWorkingDays, nonWorkingDates = []) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, updatedCount: 0, errors: ['Not authenticated'] };

    // Get the project to find its start date
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, start_date, working_days')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return { success: false, updatedCount: 0, errors: ['Project not found'] };
    }

    // Get all tasks for this project sorted by start_date
    const { data: tasks, error: tasksError } = await supabase
      .from('worker_tasks')
      .select('id, title, start_date, end_date')
      .eq('project_id', projectId)
      .eq('owner_id', userId)
      .order('start_date', { ascending: true });

    if (tasksError) {
      return { success: false, updatedCount: 0, errors: [tasksError.message] };
    }

    if (!tasks || tasks.length === 0) {
      return { success: true, updatedCount: 0, errors: [] };
    }

    // Determine the project start date (use project start or first task with a date)
    const firstTaskWithDate = tasks.find(t => t.start_date);
    const projectStartDate = project.start_date || firstTaskWithDate?.start_date;

    if (!projectStartDate) {
      return { success: true, updatedCount: 0, errors: [] }; // No dates to work with
    }

    const projectStart = new Date(projectStartDate + 'T00:00:00');

    let updatedCount = 0;
    const errors = [];

    // For each task, calculate offset using OLD working days, then place using NEW working days
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      // Skip tasks with missing dates
      if (!task.start_date || !task.end_date) {
        continue;
      }

      const taskStartDate = new Date(task.start_date + 'T00:00:00');
      const taskEndDate = new Date(task.end_date + 'T00:00:00');

      // Calculate task duration in WORKING days (using OLD working days)
      let workingDayDuration = 0;
      const durationTemp = new Date(taskStartDate);
      while (durationTemp <= taskEndDate) {
        if (isWorkingDay(durationTemp, oldWorkingDays, nonWorkingDates)) {
          workingDayDuration++;
        }
        durationTemp.setDate(durationTemp.getDate() + 1);
      }

      // Ensure at least 1 working day duration
      workingDayDuration = Math.max(1, workingDayDuration);

      // Step 1: Calculate working day offset using OLD working days
      // This tells us the task's logical position in the schedule
      let workingDayOffset = 0;
      const tempDate = new Date(projectStart);
      while (tempDate < taskStartDate) {
        if (isWorkingDay(tempDate, oldWorkingDays, nonWorkingDates)) {
          workingDayOffset++;
        }
        tempDate.setDate(tempDate.getDate() + 1);
      }

      // Step 2: Place at same offset using NEW working days
      let newStartDate = new Date(projectStart);
      let workingDaysFound = 0;

      // First, find the first working day on or after project start (using NEW)
      while (!isWorkingDay(newStartDate, newWorkingDays, nonWorkingDates)) {
        newStartDate.setDate(newStartDate.getDate() + 1);
      }

      // Then count forward to the offset (using NEW)
      while (workingDaysFound < workingDayOffset) {
        newStartDate.setDate(newStartDate.getDate() + 1);
        if (isWorkingDay(newStartDate, newWorkingDays, nonWorkingDates)) {
          workingDaysFound++;
        }
      }

      // Step 3: Calculate new end date by counting WORKING days forward
      let newEndDate = new Date(newStartDate);
      let workingDaysToAdd = workingDayDuration - 1; // -1 because start day counts

      while (workingDaysToAdd > 0) {
        newEndDate.setDate(newEndDate.getDate() + 1);
        if (isWorkingDay(newEndDate, newWorkingDays, nonWorkingDates)) {
          workingDaysToAdd--;
        }
      }

      // Update the task
      const newStartStr = newStartDate.toISOString().split('T')[0];
      const newEndStr = newEndDate.toISOString().split('T')[0];

      // Only update if dates actually changed
      if (newStartStr !== task.start_date || newEndStr !== task.end_date) {
        const { error: updateError } = await supabase
          .from('worker_tasks')
          .update({
            start_date: newStartStr,
            end_date: newEndStr,
          })
          .eq('id', task.id)
          .eq('owner_id', userId);

        if (updateError) {
          errors.push(`Task "${task.title}": ${updateError.message}`);
        } else {
          updatedCount++;
        }
      }
    }

    return {
      success: errors.length === 0,
      updatedCount,
      errors,
    };
  } catch (error) {
    return { success: false, updatedCount: 0, errors: [error.message] };
  }
};

/**
 * AI-powered redistribution of tasks when a workday is toggled OFF
 * Finds tasks on the disabled day, stores original_date, and moves them forward or backward
 * @param {string} projectId - Project ID
 * @param {number} disabledDay - ISO weekday number (1=Mon, 7=Sun) that was toggled off
 * @param {Array} newWorkingDays - Updated array of working days
 * @param {Array} nonWorkingDates - Array of specific non-working dates
 * @returns {Promise<{success: boolean, updatedCount: number, errors: Array}>}
 */
export const redistributeTasksFromDayWithAI = async (projectId, disabledDay, newWorkingDays, nonWorkingDates = []) => {
  try {
    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const disabledDayName = dayNames[disabledDay];
    console.log('🤖 [AI-WORKDAY] Starting AI redistribution for disabled day:', disabledDayName);

    const userId = await getCurrentUserId();
    if (!userId) return { success: false, updatedCount: 0, errors: ['Not authenticated'] };

    // 1. Get project details
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, start_date, end_date')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return { success: false, updatedCount: 0, errors: ['Project not found'] };
    }

    // 2. Get all tasks for this project (only tasks that haven't been moved yet - original_date is null)
    const { data: allTasks, error: tasksError } = await supabase
      .from('worker_tasks')
      .select('id, title, description, start_date, end_date, status, original_date')
      .eq('project_id', projectId)
      .eq('owner_id', userId)
      .order('start_date', { ascending: true });

    if (tasksError) {
      return { success: false, updatedCount: 0, errors: [tasksError.message] };
    }

    if (!allTasks || allTasks.length === 0) {
      return { success: true, updatedCount: 0, errors: [] };
    }

    // 3. Find tasks that fall on the disabled day of the week AND haven't been moved yet
    const tasksOnDisabledDay = allTasks.filter(task => {
      if (!task.start_date) return false;
      // Skip tasks that have already been moved (have original_date set)
      if (task.original_date) return false;

      const taskDate = new Date(task.start_date + 'T12:00:00');
      // JavaScript: 0=Sunday, 1=Monday, etc. Convert to ISO: 1=Monday, 7=Sunday
      const jsDay = taskDate.getDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;
      return isoDay === disabledDay;
    });

    if (tasksOnDisabledDay.length === 0) {
      console.log('🤖 [AI-WORKDAY] No tasks on disabled day, nothing to redistribute');
      return { success: true, updatedCount: 0, errors: [] };
    }

    console.log('🤖 [AI-WORKDAY] Found', tasksOnDisabledDay.length, 'tasks on', disabledDayName);

    // 4. Get tasks on adjacent days for context (for AI prompt)
    const getAdjacentDayTasks = (targetIsoDay) => {
      return allTasks.filter(task => {
        if (!task.start_date) return false;
        const taskDate = new Date(task.start_date + 'T12:00:00');
        const jsDay = taskDate.getDay();
        const isoDay = jsDay === 0 ? 7 : jsDay;
        return isoDay === targetIsoDay;
      });
    };

    // Find previous and next working days (day of week)
    const sortedWorkingDays = [...newWorkingDays].sort((a, b) => a - b);
    const prevWorkingDay = sortedWorkingDays.filter(d => d < disabledDay).pop()
      || sortedWorkingDays[sortedWorkingDays.length - 1];
    const nextWorkingDay = sortedWorkingDays.find(d => d > disabledDay)
      || sortedWorkingDays[0];

    const tasksBefore = getAdjacentDayTasks(prevWorkingDay);
    const tasksAfter = getAdjacentDayTasks(nextWorkingDay);

    // 5. Build the AI prompt
    const workingDaysStr = sortedWorkingDays.map(d => dayNames[d]).join(', ');

    const disabledDayTaskList = tasksOnDisabledDay
      .map((t, i) => `${i + 1}. [ID:${t.id}] "${t.title}" (${t.start_date}) - ${t.description || 'No description'}`)
      .join('\n');

    const beforeTaskList = tasksBefore.length > 0
      ? tasksBefore.map(t => `"${t.title}"`).join(', ')
      : 'No tasks';

    const afterTaskList = tasksAfter.length > 0
      ? tasksAfter.map(t => `"${t.title}"`).join(', ')
      : 'No tasks';

    const prompt = `You are a construction project scheduler. A workday has been disabled and tasks need to be moved.

PROJECT: "${project.name}"
- Timeline: ${project.start_date} to ${project.end_date}
- Working days NOW: ${workingDaysStr}
- Day disabled: ${disabledDayName}

TASKS ON ${disabledDayName.toUpperCase()} (need to be moved):
${disabledDayTaskList}

CONTEXT - Tasks on nearby working days:
- ${dayNames[prevWorkingDay]} tasks: ${beforeTaskList}
- ${dayNames[nextWorkingDay]} tasks: ${afterTaskList}

YOUR TASK:
For each task, decide whether to move it BACKWARD (to previous working day) or FORWARD (to next working day).

Consider:
1. Prep/setup tasks should stay early (move backward)
2. Cleanup/final/inspection tasks should stay late (move forward)
3. Balance the workload - don't overload one day
4. Keep related tasks together when possible

Return ONLY a valid JSON array:
[{"taskId":"<actual-task-id>","direction":"backward"},{"taskId":"<actual-task-id>","direction":"forward"}]`;

    console.log('🤖 [AI-WORKDAY] Calling AI to decide task movement...');

    // 6. Call AI
    const response = await sendPlanningRequest(prompt, 'You are a construction scheduler. Return ONLY valid JSON array, no explanation.');

    // 7. Parse response
    let directions;
    try {
      if (Array.isArray(response)) {
        directions = response;
      } else {
        let jsonStr = typeof response === 'string' ? response : JSON.stringify(response);
        if (jsonStr.includes('```')) {
          jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        }
        const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          jsonStr = arrayMatch[0];
        }
        directions = JSON.parse(jsonStr);
      }
    } catch (parseError) {
      console.error('🤖 [AI-WORKDAY] Failed to parse AI response:', response);
      // Fallback: move all tasks forward
      directions = tasksOnDisabledDay.map(t => ({ taskId: t.id, direction: 'forward' }));
    }

    console.log('🤖 [AI-WORKDAY] AI directions:', directions);

    // 8. Calculate new dates and update tasks (store original_date!)
    let updatedCount = 0;
    const errors = [];

    for (const task of tasksOnDisabledDay) {
      // Find direction for this task (default to forward if not found)
      const directionInfo = directions.find(d => d.taskId === task.id);
      const direction = directionInfo?.direction || 'forward';

      const originalDate = task.start_date; // Store before moving
      const taskDate = new Date(task.start_date + 'T12:00:00');
      let newDate = new Date(taskDate);

      if (direction === 'backward') {
        // Move to previous working day
        let attempts = 0;
        do {
          newDate.setDate(newDate.getDate() - 1);
          const jsDay = newDate.getDay();
          const isoDay = jsDay === 0 ? 7 : jsDay;
          const dateStr = newDate.toISOString().split('T')[0];
          if (newWorkingDays.includes(isoDay) && !nonWorkingDates.includes(dateStr)) {
            break;
          }
          attempts++;
        } while (attempts < 30); // Safety limit
      } else {
        // Move forward to next working day
        let attempts = 0;
        do {
          newDate.setDate(newDate.getDate() + 1);
          const jsDay = newDate.getDay();
          const isoDay = jsDay === 0 ? 7 : jsDay;
          const dateStr = newDate.toISOString().split('T')[0];
          if (newWorkingDays.includes(isoDay) && !nonWorkingDates.includes(dateStr)) {
            break;
          }
          attempts++;
        } while (attempts < 30); // Safety limit
      }

      const newDateStr = newDate.toISOString().split('T')[0];

      // Update task with new date AND store original_date for restoration
      const { error: updateError } = await supabase
        .from('worker_tasks')
        .update({
          start_date: newDateStr,
          end_date: newDateStr,
          original_date: originalDate, // Store original date for restoration
        })
        .eq('id', task.id)
        .eq('owner_id', userId);

      if (updateError) {
        errors.push(`Task "${task.title}": ${updateError.message}`);
      } else {
        updatedCount++;
        console.log(`🤖 [AI-WORKDAY] Moved "${task.title}" ${direction} from ${originalDate} to ${newDateStr}`);
      }
    }

    console.log('🤖 [AI-WORKDAY] Completed. Updated', updatedCount, 'tasks');

    return {
      success: errors.length === 0,
      updatedCount,
      errors,
    };
  } catch (error) {
    console.error('🤖 [AI-WORKDAY] Error:', error);
    return { success: false, updatedCount: 0, errors: [error.message] };
  }
};

/**
 * Restore tasks to their original day when a workday is re-enabled
 * @param {string} projectId - Project ID
 * @param {number} reEnabledDay - ISO weekday number (1=Mon, 7=Sun) that was re-enabled
 * @returns {Promise<{success: boolean, updatedCount: number, errors: Array}>}
 */
export const restoreTasksToOriginalDay = async (projectId, reEnabledDay) => {
  try {
    const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    console.log('🔄 [RESTORE] Restoring tasks to', dayNames[reEnabledDay]);

    const userId = await getCurrentUserId();
    if (!userId) return { success: false, updatedCount: 0, errors: ['Not authenticated'] };

    // Find tasks that have original_date set AND that original_date falls on the re-enabled day
    const { data: tasks, error: tasksError } = await supabase
      .from('worker_tasks')
      .select('id, title, start_date, end_date, original_date')
      .eq('project_id', projectId)
      .eq('owner_id', userId)
      .not('original_date', 'is', null);

    if (tasksError) {
      return { success: false, updatedCount: 0, errors: [tasksError.message] };
    }

    if (!tasks || tasks.length === 0) {
      console.log('🔄 [RESTORE] No tasks with original_date found');
      return { success: true, updatedCount: 0, errors: [] };
    }

    // Filter to tasks whose original_date falls on the re-enabled day of week
    const tasksToRestore = tasks.filter(task => {
      if (!task.original_date) return false;
      const origDate = new Date(task.original_date + 'T12:00:00');
      const jsDay = origDate.getDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;
      return isoDay === reEnabledDay;
    });

    if (tasksToRestore.length === 0) {
      console.log('🔄 [RESTORE] No tasks to restore for', dayNames[reEnabledDay]);
      return { success: true, updatedCount: 0, errors: [] };
    }

    console.log('🔄 [RESTORE] Found', tasksToRestore.length, 'tasks to restore');

    let updatedCount = 0;
    const errors = [];

    for (const task of tasksToRestore) {
      const { error: updateError } = await supabase
        .from('worker_tasks')
        .update({
          start_date: task.original_date,
          end_date: task.original_date,
          original_date: null, // Clear original_date since we're restoring
        })
        .eq('id', task.id)
        .eq('owner_id', userId);

      if (updateError) {
        errors.push(`Task "${task.title}": ${updateError.message}`);
      } else {
        updatedCount++;
        console.log(`🔄 [RESTORE] Restored "${task.title}" to ${task.original_date}`);
      }
    }

    console.log('🔄 [RESTORE] Completed. Restored', updatedCount, 'tasks');

    return {
      success: errors.length === 0,
      updatedCount,
      errors,
    };
  } catch (error) {
    console.error('🔄 [RESTORE] Error:', error);
    return { success: false, updatedCount: 0, errors: [error.message] };
  }
};

/**
 * Move tasks from a specific non-working date to nearby working days
 * @param {string} projectId - Project ID
 * @param {string} dateToMove - The specific date (YYYY-MM-DD) that is now non-working
 * @param {Array} workingDays - Array of working days (ISO weekday numbers)
 * @param {Array} nonWorkingDates - Array of non-working dates
 * @returns {Promise<{success: boolean, updatedCount: number, errors: Array}>}
 */
export const moveTasksFromSpecificDate = async (projectId, dateToMove, workingDays, nonWorkingDates) => {
  try {
    console.log('📅 [MOVE-DATE] Moving tasks from specific date:', dateToMove);

    const userId = await getCurrentUserId();
    if (!userId) return { success: false, updatedCount: 0, errors: ['Not authenticated'] };

    // Find tasks on this specific date that haven't been moved yet
    const { data: tasks, error: tasksError } = await supabase
      .from('worker_tasks')
      .select('id, title, description, start_date, end_date, original_date')
      .eq('project_id', projectId)
      .eq('owner_id', userId)
      .eq('start_date', dateToMove)
      .is('original_date', null); // Only tasks that haven't been moved

    if (tasksError) {
      return { success: false, updatedCount: 0, errors: [tasksError.message] };
    }

    if (!tasks || tasks.length === 0) {
      console.log('📅 [MOVE-DATE] No tasks on', dateToMove);
      return { success: true, updatedCount: 0, errors: [] };
    }

    console.log('📅 [MOVE-DATE] Found', tasks.length, 'tasks to move');

    let updatedCount = 0;
    const errors = [];

    for (const task of tasks) {
      const originalDate = task.start_date;
      const taskDate = new Date(originalDate + 'T12:00:00');

      // Try forward first, then backward if forward doesn't work
      let newDate = new Date(taskDate);
      let found = false;

      // Try forward (up to 14 days)
      for (let i = 1; i <= 14; i++) {
        const tryDate = new Date(taskDate);
        tryDate.setDate(tryDate.getDate() + i);
        const jsDay = tryDate.getDay();
        const isoDay = jsDay === 0 ? 7 : jsDay;
        const dateStr = tryDate.toISOString().split('T')[0];

        if (workingDays.includes(isoDay) && !nonWorkingDates.includes(dateStr)) {
          newDate = tryDate;
          found = true;
          break;
        }
      }

      // If forward didn't work, try backward
      if (!found) {
        for (let i = 1; i <= 14; i++) {
          const tryDate = new Date(taskDate);
          tryDate.setDate(tryDate.getDate() - i);
          const jsDay = tryDate.getDay();
          const isoDay = jsDay === 0 ? 7 : jsDay;
          const dateStr = tryDate.toISOString().split('T')[0];

          if (workingDays.includes(isoDay) && !nonWorkingDates.includes(dateStr)) {
            newDate = tryDate;
            found = true;
            break;
          }
        }
      }

      const newDateStr = newDate.toISOString().split('T')[0];

      const { error: updateError } = await supabase
        .from('worker_tasks')
        .update({
          start_date: newDateStr,
          end_date: newDateStr,
          original_date: originalDate, // Store for restoration
        })
        .eq('id', task.id)
        .eq('owner_id', userId);

      if (updateError) {
        errors.push(`Task "${task.title}": ${updateError.message}`);
      } else {
        updatedCount++;
        console.log(`📅 [MOVE-DATE] Moved "${task.title}" from ${originalDate} to ${newDateStr}`);
      }
    }

    console.log('📅 [MOVE-DATE] Completed. Moved', updatedCount, 'tasks');

    return {
      success: errors.length === 0,
      updatedCount,
      errors,
    };
  } catch (error) {
    console.error('📅 [MOVE-DATE] Error:', error);
    return { success: false, updatedCount: 0, errors: [error.message] };
  }
};

/**
 * Restore tasks to a specific date when it's no longer a non-working date
 * @param {string} projectId - Project ID
 * @param {string} dateToRestore - The specific date (YYYY-MM-DD) to restore tasks to
 * @returns {Promise<{success: boolean, updatedCount: number, errors: Array}>}
 */
export const restoreTasksToSpecificDate = async (projectId, dateToRestore) => {
  try {
    console.log('📅 [RESTORE-DATE] Restoring tasks to:', dateToRestore);

    const userId = await getCurrentUserId();
    if (!userId) return { success: false, updatedCount: 0, errors: ['Not authenticated'] };

    // Find tasks that have original_date matching the date to restore
    const { data: tasks, error: tasksError } = await supabase
      .from('worker_tasks')
      .select('id, title, start_date, end_date, original_date')
      .eq('project_id', projectId)
      .eq('owner_id', userId)
      .eq('original_date', dateToRestore);

    if (tasksError) {
      return { success: false, updatedCount: 0, errors: [tasksError.message] };
    }

    if (!tasks || tasks.length === 0) {
      console.log('📅 [RESTORE-DATE] No tasks to restore for', dateToRestore);
      return { success: true, updatedCount: 0, errors: [] };
    }

    console.log('📅 [RESTORE-DATE] Found', tasks.length, 'tasks to restore');

    let updatedCount = 0;
    const errors = [];

    for (const task of tasks) {
      const { error: updateError } = await supabase
        .from('worker_tasks')
        .update({
          start_date: task.original_date,
          end_date: task.original_date,
          original_date: null, // Clear since we're restoring
        })
        .eq('id', task.id)
        .eq('owner_id', userId);

      if (updateError) {
        errors.push(`Task "${task.title}": ${updateError.message}`);
      } else {
        updatedCount++;
        console.log(`📅 [RESTORE-DATE] Restored "${task.title}" to ${task.original_date}`);
      }
    }

    console.log('📅 [RESTORE-DATE] Completed. Restored', updatedCount, 'tasks');

    return {
      success: errors.length === 0,
      updatedCount,
      errors,
    };
  } catch (error) {
    console.error('📅 [RESTORE-DATE] Error:', error);
    return { success: false, updatedCount: 0, errors: [error.message] };
  }
};

/**
 * Fetch tasks for a project (for selection UI)
 * @param {string} projectId - Project ID
 * @param {object} filters - Optional filters { startDate, endDate, status }
 * @returns {Promise<array>} Array of tasks
 */
export const fetchTasksForSelection = async (projectId, filters = {}) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    let query = supabase
      .from('worker_tasks')
      .select('id, title, description, start_date, end_date, status, project_id')
      .eq('owner_id', userId)
      .eq('project_id', projectId)
      .order('start_date', { ascending: true });

    if (filters.startDate) {
      query = query.gte('start_date', filters.startDate);
    }
    if (filters.endDate) {
      query = query.lte('end_date', filters.endDate);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data, error } = await query;
    if (error) return [];
    return data || [];
  } catch (error) {
    return [];
  }
};
