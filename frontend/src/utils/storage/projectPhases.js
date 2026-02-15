import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from './auth';
import { isWorkingDay } from './workerTasks';
import { sendPlanningRequest } from '../../services/aiService';

// ============================================================
// Project Phases Functions
// ============================================================

// Keywords to identify task types for intelligent ordering
const CLEANUP_KEYWORDS = ['cleanup', 'clean up', 'final', 'inspection', 'walkthrough', 'test all'];
const PREP_KEYWORDS = ['prep', 'preparation', 'site assessment', 'layout', 'remove existing', 'check plumbing', 'site prep'];

/**
 * AI-powered task redistribution
 * Grabs ALL tasks (including manually added ones) and redistributes them intelligently
 * @param {string} projectId - Project ID
 * @param {string} ownerId - Owner ID
 * @param {Array} phases - Array of phase objects with tasks
 * @param {Object} timeline - { startDate, endDate, workingDays }
 */
export const redistributeAllTasksWithAI = async (projectId, ownerId, phases, timeline) => {
  try {
    console.log('🤖 [AI-DISTRIBUTE] Starting AI task distribution for project:', projectId);

    // 1. Fetch ALL existing tasks for this project (including manually added ones)
    const { data: existingTasks } = await supabase
      .from('worker_tasks')
      .select('*')
      .eq('project_id', projectId);

    // 2. Collect tasks from phases
    const phaseTasks = [];
    phases.forEach(phase => {
      phase.tasks?.forEach(task => {
        phaseTasks.push({
          title: task.description || task.name || 'Untitled task',
          phaseName: phase.name,
          isFromPhase: true,
        });
      });
    });

    // 3. Get manually added tasks (those without phase_task_id)
    const manualTasks = (existingTasks || [])
      .filter(t => !t.phase_task_id)
      .map(t => ({
        title: t.title,
        phaseName: 'Manual',
        isFromPhase: false,
        originalId: t.id,
      }));

    // 4. Combine all tasks
    const allTasks = [...phaseTasks, ...manualTasks];

    if (allTasks.length === 0) {
      console.log('🤖 [AI-DISTRIBUTE] No tasks to distribute');
      return [];
    }

    // 5. Build the AI prompt
    const workingDaysStr = (timeline.workingDays || [1, 2, 3, 4, 5])
      .map(d => ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d])
      .join(', ');

    const prompt = `You are a construction project scheduler. Distribute these tasks intelligently.

TIMELINE:
- Start: ${timeline.startDate}
- End: ${timeline.endDate}
- Working days: ${workingDaysStr}

PHASES:
${phases.map((p, i) => `${i + 1}. ${p.name}: ${p.plannedDays || 1} days`).join('\n')}

TASKS (${allTasks.length} total):
${allTasks.map((t, i) => `${i + 1}. [${t.phaseName}] ${t.title}`).join('\n')}

RULES:
1. Tasks from each phase must fit within that phase's allocated days
2. "Manual" tasks: place them logically based on task description
3. Prep tasks (site assessment, layout, remove existing) go FIRST
4. Main work distributed evenly within phases
5. Cleanup/inspection/testing go on LAST day
6. Consider task DEPENDENCIES - what logically must come before what
7. Each day: 2-4 tasks typical, but adjust based on complexity

Return ONLY a valid JSON array with date for each task (by index):
[{"taskIndex":0,"date":"YYYY-MM-DD"},{"taskIndex":1,"date":"YYYY-MM-DD"}]`;

    console.log('🤖 [AI-DISTRIBUTE] Calling AI to distribute', allTasks.length, 'tasks...');

    // 6. Call AI
    const response = await sendPlanningRequest(prompt, 'You are a construction scheduler. Return ONLY valid JSON array, no explanation.');

    // 7. Parse response - handle potential markdown code blocks and extra text
    let distribution;
    try {
      // If response is already an array, use it directly
      if (Array.isArray(response)) {
        distribution = response;
      } else {
        // Convert to string if not already
        let jsonStr = typeof response === 'string' ? response : JSON.stringify(response);
        // Remove markdown code block if present
        if (jsonStr.includes('```')) {
          jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        }
        // Extract JSON array if there's extra text around it
        const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          jsonStr = arrayMatch[0];
        }
        // Fix common JSON issues (trailing commas from AI responses)
        jsonStr = jsonStr
          .replace(/,\s*]/g, ']')   // Remove trailing commas in arrays
          .replace(/,\s*}/g, '}');  // Remove trailing commas in objects
        distribution = JSON.parse(jsonStr);
      }
    } catch (parseError) {
      console.error('🤖 [AI-DISTRIBUTE] Failed to parse AI response:', response);
      console.error('Parse error:', parseError);
      // Fallback to simple distribution
      return createSimpleDistribution(projectId, ownerId, phases, timeline);
    }

    console.log('🤖 [AI-DISTRIBUTE] AI distribution result:', distribution.length, 'tasks assigned');

    // 8. Delete ALL existing tasks for this project
    await supabase
      .from('worker_tasks')
      .delete()
      .eq('project_id', projectId);

    // 9. Create tasks with AI-assigned dates
    const tasksToCreate = distribution.map(({ taskIndex, date }) => {
      const task = allTasks[taskIndex];
      if (!task) {
        console.warn('🤖 [AI-DISTRIBUTE] Invalid taskIndex:', taskIndex);
        return null;
      }
      return {
        owner_id: ownerId,
        project_id: projectId,
        title: task.title,
        description: task.isFromPhase ? `Phase: ${task.phaseName}` : 'Manually added',
        start_date: date,
        end_date: date, // Will be extended below to fill gaps
        status: 'pending',
        phase_task_id: task.isFromPhase ? `phase-task-${taskIndex}` : null,
      };
    }).filter(Boolean);

    // 10. Fill gaps - extend each task's end_date to day before next task
    // This ensures no blank days on the schedule
    if (tasksToCreate.length > 1) {
      // Sort by start_date
      tasksToCreate.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

      for (let i = 0; i < tasksToCreate.length - 1; i++) {
        const currentTask = tasksToCreate[i];
        const nextTask = tasksToCreate[i + 1];

        // Calculate day before next task starts
        const nextStart = new Date(nextTask.start_date + 'T00:00:00');
        nextStart.setDate(nextStart.getDate() - 1);
        const newEndDate = nextStart.toISOString().split('T')[0];

        // Only extend if there's a gap (don't shrink if tasks overlap)
        if (new Date(newEndDate) > new Date(currentTask.end_date)) {
          currentTask.end_date = newEndDate;
          console.log(`🤖 [AI-DISTRIBUTE] Extended "${currentTask.title}" to ${newEndDate}`);
        }
      }

      // Last task extends to project end date
      const lastTask = tasksToCreate[tasksToCreate.length - 1];
      if (timeline.endDate && new Date(timeline.endDate) > new Date(lastTask.end_date)) {
        lastTask.end_date = timeline.endDate;
        console.log(`🤖 [AI-DISTRIBUTE] Extended last task to project end: ${timeline.endDate}`);
      }
    }

    if (tasksToCreate.length > 0) {
      const { error } = await supabase
        .from('worker_tasks')
        .insert(tasksToCreate);

      if (error) {
        console.error('🤖 [AI-DISTRIBUTE] Error inserting tasks:', error);
        throw error;
      }
    }

    console.log('🤖 [AI-DISTRIBUTE] Successfully created', tasksToCreate.length, 'tasks');
    return tasksToCreate;

  } catch (error) {
    console.error('🤖 [AI-DISTRIBUTE] Error:', error);
    // Fallback to simple distribution on error
    return createSimpleDistribution(projectId, ownerId, phases, timeline);
  }
};

/**
 * Simple fallback distribution (used if AI fails)
 * Preserves manually-added tasks and redistributes them
 */
const createSimpleDistribution = async (projectId, ownerId, phases, timeline) => {
  console.log('🔄 [FALLBACK] Using simple distribution');

  // 1. Fetch manual tasks BEFORE deleting (phase_task_id is NULL for manual tasks)
  const { data: existingTasks } = await supabase
    .from('worker_tasks')
    .select('*')
    .eq('project_id', projectId)
    .is('phase_task_id', null);

  const manualTasks = existingTasks || [];
  console.log(`🔄 [FALLBACK] Found ${manualTasks.length} manual tasks to preserve`);

  // 2. Delete ONLY phase-generated tasks (preserve manual ones)
  await supabase
    .from('worker_tasks')
    .delete()
    .eq('project_id', projectId)
    .not('phase_task_id', 'is', null);

  // 3. Create phase tasks using existing logic
  await createWorkerTasksFromPhases(projectId, ownerId, phases);

  // 4. Redistribute manual tasks across the new timeline
  if (manualTasks.length > 0 && timeline?.startDate && timeline?.endDate) {
    const start = new Date(timeline.startDate + 'T00:00:00');
    const end = new Date(timeline.endDate + 'T00:00:00');
    const totalDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);

    for (let i = 0; i < manualTasks.length; i++) {
      const dayOffset = Math.floor((i / manualTasks.length) * totalDays);
      const taskDate = new Date(start);
      taskDate.setDate(taskDate.getDate() + dayOffset);
      const dateStr = taskDate.toISOString().split('T')[0];

      await supabase
        .from('worker_tasks')
        .update({ start_date: dateStr, end_date: dateStr })
        .eq('id', manualTasks[i].id);
    }
    console.log(`🔄 [FALLBACK] Redistributed ${manualTasks.length} manual tasks`);
  }
};

/**
 * Create worker_tasks from phase tasks, distributed across the ENTIRE project timeline
 * Tasks are sorted intelligently: prep first, work in middle, cleanup/final LAST
 * Cleanup tasks are always scheduled on the last working day
 * @param {string} projectId - Project ID
 * @param {string} ownerId - Project owner ID
 * @param {Array} phases - Array of phase objects with tasks
 */
export const createWorkerTasksFromPhases = async (projectId, ownerId, phases) => {
  try {
    // Fetch project's settings including start/end dates
    const { data: project } = await supabase
      .from('projects')
      .select('start_date, end_date, working_days, non_working_dates')
      .eq('id', projectId)
      .single();

    if (!project?.start_date || !project?.end_date) {
      console.warn('Project missing start/end dates, skipping task creation');
      return;
    }

    const workingDays = project.working_days || [1, 2, 3, 4, 5];
    const nonWorkingDates = project.non_working_dates || [];

    // 1. Collect ALL tasks from all phases
    const allTasks = [];
    for (const phase of phases) {
      if (!phase.tasks?.length) continue;

      phase.tasks.forEach((task, taskIndex) => {
        allTasks.push({
          ...task,
          phaseName: phase.name,
          phaseOrder: phase.order_index || 0,
          taskIndex: taskIndex,
        });
      });
    }

    if (allTasks.length === 0) {
      console.log('No tasks found in phases, skipping task creation');
      return;
    }

    // 2. Sort tasks intelligently: prep first, work in middle, cleanup LAST
    allTasks.sort((a, b) => {
      const aDesc = (a.description || a.name || '').toLowerCase();
      const bDesc = (b.description || b.name || '').toLowerCase();

      const aIsCleanup = CLEANUP_KEYWORDS.some(kw => aDesc.includes(kw));
      const bIsCleanup = CLEANUP_KEYWORDS.some(kw => bDesc.includes(kw));
      const aIsPrep = PREP_KEYWORDS.some(kw => aDesc.includes(kw));
      const bIsPrep = PREP_KEYWORDS.some(kw => bDesc.includes(kw));

      // Prep tasks first
      if (aIsPrep && !bIsPrep) return -1;
      if (!aIsPrep && bIsPrep) return 1;

      // Cleanup tasks last
      if (aIsCleanup && !bIsCleanup) return 1;
      if (!aIsCleanup && bIsCleanup) return -1;

      // Otherwise maintain phase order, then task order
      if (a.phaseOrder !== b.phaseOrder) return a.phaseOrder - b.phaseOrder;
      return a.taskIndex - b.taskIndex;
    });

    console.log('📋 Task order after sorting:', allTasks.map(t => t.description || t.name));

    // 3. Separate cleanup tasks from regular tasks
    const cleanupTasks = allTasks.filter(t => {
      const desc = (t.description || t.name || '').toLowerCase();
      return CLEANUP_KEYWORDS.some(kw => desc.includes(kw));
    });
    const regularTasks = allTasks.filter(t => !cleanupTasks.includes(t));

    // 4. Calculate available working days across the entire project
    const projectStart = new Date(project.start_date + 'T00:00:00');
    const projectEnd = new Date(project.end_date + 'T00:00:00');

    const availableWorkingDays = [];
    const countDate = new Date(projectStart);
    while (countDate <= projectEnd) {
      if (isWorkingDay(countDate, workingDays, nonWorkingDates)) {
        availableWorkingDays.push(new Date(countDate));
      }
      countDate.setDate(countDate.getDate() + 1);
    }

    if (availableWorkingDays.length === 0) {
      console.warn('No working days in project timeline, skipping task creation');
      return;
    }

    // 5. Determine which days to use for regular vs cleanup tasks
    const totalDays = availableWorkingDays.length;
    const lastDay = availableWorkingDays[totalDays - 1];

    // If we have more than 1 day, reserve last day for cleanup
    // Otherwise use the single day for everything
    const daysForRegular = totalDays > 1
      ? availableWorkingDays.slice(0, -1)
      : availableWorkingDays;

    // 6. Distribute regular tasks evenly across non-final days
    const tasksToCreate = [];

    if (regularTasks.length > 0 && daysForRegular.length > 0) {
      const tasksPerDay = Math.ceil(regularTasks.length / daysForRegular.length);
      console.log(`📅 Distributing ${regularTasks.length} regular tasks across ${daysForRegular.length} days (${tasksPerDay} tasks/day)`);

      let dayIndex = 0;
      let tasksOnCurrentDay = 0;

      for (const task of regularTasks) {
        if (dayIndex >= daysForRegular.length) {
          dayIndex = daysForRegular.length - 1;
        }

        const taskDate = daysForRegular[dayIndex];
        const dateString = taskDate.toISOString().split('T')[0];

        tasksToCreate.push({
          owner_id: ownerId,
          project_id: projectId,
          title: task.description || task.name || 'Task',
          description: `Phase: ${task.phaseName}`,
          start_date: dateString,
          end_date: dateString,
          status: 'pending',
          phase_task_id: task.id || `${task.phaseName}-${task.taskIndex}`,
        });

        tasksOnCurrentDay++;
        if (tasksOnCurrentDay >= tasksPerDay && dayIndex < daysForRegular.length - 1) {
          dayIndex++;
          tasksOnCurrentDay = 0;
        }
      }
    }

    // 7. Put ALL cleanup tasks on the LAST day
    if (cleanupTasks.length > 0) {
      const lastDayString = lastDay.toISOString().split('T')[0];
      console.log(`📅 Scheduling ${cleanupTasks.length} cleanup tasks on last day (${lastDayString})`);

      for (const task of cleanupTasks) {
        tasksToCreate.push({
          owner_id: ownerId,
          project_id: projectId,
          title: task.description || task.name || 'Task',
          description: `Phase: ${task.phaseName}`,
          start_date: lastDayString,
          end_date: lastDayString,
          status: 'pending',
          phase_task_id: task.id || `${task.phaseName}-${task.taskIndex}`,
        });
      }
    }

    // 8. Fill gaps - extend each task's end_date to day before next task
    // This ensures no blank days on the schedule
    if (tasksToCreate.length > 1) {
      // Sort by start_date
      tasksToCreate.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

      for (let i = 0; i < tasksToCreate.length - 1; i++) {
        const currentTask = tasksToCreate[i];
        const nextTask = tasksToCreate[i + 1];

        // Calculate day before next task starts
        const nextStart = new Date(nextTask.start_date + 'T00:00:00');
        nextStart.setDate(nextStart.getDate() - 1);
        const newEndDate = nextStart.toISOString().split('T')[0];

        // Only extend if there's a gap (don't shrink if tasks overlap)
        if (new Date(newEndDate) > new Date(currentTask.end_date)) {
          currentTask.end_date = newEndDate;
        }
      }

      // Last task extends to project end date
      const lastTask = tasksToCreate[tasksToCreate.length - 1];
      const projectEndStr = projectEnd.toISOString().split('T')[0];
      if (new Date(projectEndStr) > new Date(lastTask.end_date)) {
        lastTask.end_date = projectEndStr;
      }
    }

    // 9. Insert all tasks into database
    if (tasksToCreate.length > 0) {
      const { error } = await supabase
        .from('worker_tasks')
        .insert(tasksToCreate);

      if (error) {
        console.error('Error creating worker tasks from phases:', error);
      } else {
        console.log(`✅ Created ${tasksToCreate.length} worker tasks from phases (gaps filled)`);
      }
    }
  } catch (error) {
    console.error('Error in createWorkerTasksFromPhases:', error);
  }
};

/**
 * Save project phases to database
 * @param {string} projectId - Project ID
 * @param {Array<object>} phases - Array of phase objects
 * @param {object} schedule - Optional schedule object with phaseSchedule array
 * @returns {Promise<boolean>} Success status
 */
export const saveProjectPhases = async (projectId, phases, schedule = null) => {
  try {
    const { error: deleteError } = await supabase
      .from('project_phases')
      .delete()
      .eq('project_id', projectId);

    if (deleteError) {
      console.error('Error deleting old phases:', deleteError);
      return false;
    }

    if (!phases || phases.length === 0) {
      await supabase
        .from('projects')
        .update({ has_phases: false })
        .eq('id', projectId);
      return true;
    }

    const phasesToInsert = phases.map((phase, index) => {
      const phaseScheduleEntry = schedule?.phaseSchedule?.find(
        ps => ps.phaseName === phase.name
      );

      // Get phase dates from phase object or schedule
      const phaseStartDate = phase.startDate || phaseScheduleEntry?.startDate;
      const phaseEndDate = phase.endDate || phaseScheduleEntry?.endDate;

      // Calculate actual days from dates if available, otherwise use phase.plannedDays
      let calculatedDays = phase.plannedDays || phase.defaultDays || 5;

      if (phaseStartDate && phaseEndDate) {
        const start = new Date(phaseStartDate + 'T00:00:00');
        const end = new Date(phaseEndDate + 'T00:00:00');
        const daysDiff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
        calculatedDays = Math.max(1, daysDiff);
        console.log(`📅 [saveProjectPhases] Phase "${phase.name}": ${phaseStartDate} to ${phaseEndDate} = ${calculatedDays} days`);
      }

      return {
        project_id: projectId,
        name: phase.name,
        order_index: index,
        planned_days: calculatedDays,
        start_date: phaseStartDate || null,
        end_date: phaseEndDate || null,
        completion_percentage: phase.completionPercentage || 0,
        status: phase.status || 'not_started',
        time_extensions: phase.timeExtensions || [],
        tasks: phase.tasks || [],
        budget: phase.budget || 0,
        services: phase.services || [],
      };
    });

    const { error: insertError } = await supabase
      .from('project_phases')
      .insert(phasesToInsert);

    if (insertError) {
      console.error('Error inserting phases:', insertError);
      return false;
    }

    await supabase
      .from('projects')
      .update({ has_phases: true })
      .eq('id', projectId);

    // Delete existing auto-generated worker tasks for this project
    console.log(`🗑️ Deleting old tasks for project ${projectId}...`);
    const { error: deleteTasksError, count: deletedCount } = await supabase
      .from('worker_tasks')
      .delete()
      .eq('project_id', projectId)
      .not('phase_task_id', 'is', null);

    if (deleteTasksError) {
      console.error('Error deleting old tasks:', deleteTasksError);
    } else {
      console.log(`🗑️ Deleted ${deletedCount || 'unknown number of'} old tasks`);
    }

    // Small delay to ensure delete completes before insert
    await new Promise(resolve => setTimeout(resolve, 100));

    // Get the owner ID and create worker tasks from phases
    const userId = await getCurrentUserId();
    if (userId) {
      await createWorkerTasksFromPhases(projectId, userId, phasesToInsert);
    }

    return true;
  } catch (error) {
    console.error('Error in saveProjectPhases:', error);
    return false;
  }
};

/**
 * Fetch all phases for a project with completion status from worker_tasks
 * @param {string} projectId - Project ID
 * @returns {Promise<Array>} Array of phase objects with merged task completion status
 */
export const fetchProjectPhases = async (projectId) => {
  try {
    const { data: phases, error } = await supabase
      .from('project_phases')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Error fetching project phases:', error);
      return [];
    }

    if (!phases || phases.length === 0) {
      return [];
    }

    // Fetch all worker_tasks for this project to get completion status
    // No owner_id filter - workers need to see task completion status too
    const { data: workerTasks, error: taskError } = await supabase
      .from('worker_tasks')
      .select('id, phase_task_id, status')
      .eq('project_id', projectId)
      .not('phase_task_id', 'is', null);

    if (taskError) {
      console.error('Error fetching worker_tasks:', taskError);
    }

    // Create a map of phase_task_id -> { completed, workerTaskId }
    const taskStatusMap = {};
    if (workerTasks) {
      for (const wt of workerTasks) {
        taskStatusMap[wt.phase_task_id] = {
          completed: wt.status === 'completed',
          workerTaskId: wt.id,
        };
      }
    }

    // Merge completion status into phase tasks and calculate progress
    // Use global task index to match phase-task-X format
    let globalTaskIndex = 0;

    for (const phase of phases) {
      if (phase.tasks && Array.isArray(phase.tasks)) {
        phase.tasks.forEach((task, localIndex) => {
          // Try multiple formats to match:
          // 1. task.id (if task has its own ID)
          // 2. phase-task-X (global index format)
          // 3. phaseName-localIndex (per-phase format)
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

        // Calculate phase completion percentage from tasks
        const totalTasks = phase.tasks.length;
        const completedTasks = phase.tasks.filter(t => t.completed).length;
        phase.completion_percentage = totalTasks > 0
          ? Math.round((completedTasks / totalTasks) * 100)
          : 0;
      }
    }

    return phases;
  } catch (error) {
    console.error('Error in fetchProjectPhases:', error);
    return [];
  }
};

/**
 * Update a single phase's progress
 * @param {string} phaseId - Phase ID
 * @param {number} percentage - Completion percentage (0-100)
 * @returns {Promise<boolean>} Success status
 */
export const updatePhaseProgress = async (phaseId, percentage) => {
  try {
    const updateData = {
      completion_percentage: Math.min(100, Math.max(0, percentage)),
    };

    if (percentage >= 100) {
      updateData.status = 'completed';
      updateData.actual_end_date = new Date().toISOString().split('T')[0];
    } else if (percentage > 0) {
      if (updateData.status === 'not_started') {
        updateData.status = 'in_progress';
        updateData.actual_start_date = new Date().toISOString().split('T')[0];
      }
    }

    const { error } = await supabase
      .from('project_phases')
      .update(updateData)
      .eq('id', phaseId);

    if (error) {
      console.error('Error updating phase progress:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updatePhaseProgress:', error);
    return false;
  }
};

/**
 * Extend a phase timeline by adding extra days
 * @param {string} phaseId - Phase ID
 * @param {number} extraDays - Number of days to add
 * @param {string} reason - Reason for extension
 * @returns {Promise<boolean>} Success status
 */
export const extendPhaseTimeline = async (phaseId, extraDays, reason = '') => {
  try {
    const { data: phase, error: fetchError } = await supabase
      .from('project_phases')
      .select('*')
      .eq('id', phaseId)
      .single();

    if (fetchError || !phase) {
      console.error('Error fetching phase:', fetchError);
      return false;
    }

    const timeExtensions = phase.time_extensions || [];
    timeExtensions.push({
      days: extraDays,
      reason,
      dateAdded: new Date().toISOString().split('T')[0],
    });

    let newEndDate = phase.end_date;
    if (newEndDate) {
      const endDate = new Date(newEndDate);
      endDate.setDate(endDate.getDate() + extraDays);
      newEndDate = endDate.toISOString().split('T')[0];
    }

    const { error: updateError } = await supabase
      .from('project_phases')
      .update({
        time_extensions: timeExtensions,
        end_date: newEndDate,
        planned_days: phase.planned_days + extraDays,
      })
      .eq('id', phaseId);

    if (updateError) {
      console.error('Error extending phase timeline:', updateError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in extendPhaseTimeline:', error);
    return false;
  }
};

/**
 * Calculate phase status based on dates and progress
 * @param {object} phase - Phase object
 * @returns {string} Status ('not_started', 'in_progress', 'completed', 'behind')
 */
export const calculatePhaseStatus = (phase) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (phase.status === 'completed' || phase.completion_percentage === 100) {
    return 'completed';
  }

  if (phase.status === 'not_started' && !phase.actual_start_date) {
    return 'not_started';
  }

  if (phase.status === 'in_progress' || phase.actual_start_date) {
    if (phase.end_date) {
      const endDate = new Date(phase.end_date);
      endDate.setHours(0, 0, 0, 0);
      if (today > endDate) {
        return 'behind';
      }
    }
    return 'in_progress';
  }

  return phase.status || 'not_started';
};

/**
 * Update phase dates (start and/or end)
 * @param {string} phaseId - Phase ID
 * @param {object} dates - Object with startDate and/or endDate
 * @returns {Promise<boolean>} Success status
 */
export const updatePhaseDates = async (phaseId, dates) => {
  try {
    const updateData = {};

    if (dates.startDate) {
      updateData.start_date = dates.startDate;
    }

    if (dates.endDate) {
      updateData.end_date = dates.endDate;
    }

    if (dates.startDate && dates.endDate) {
      const start = new Date(dates.startDate);
      const end = new Date(dates.endDate);
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      updateData.planned_days = diffDays;
    }

    const { error } = await supabase
      .from('project_phases')
      .update(updateData)
      .eq('id', phaseId);

    if (error) {
      console.error('Error updating phase dates:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updatePhaseDates:', error);
    return false;
  }
};

/**
 * Mark phase as started
 * @param {string} phaseId - Phase ID
 * @returns {Promise<boolean>} Success status
 */
export const startPhase = async (phaseId) => {
  try {
    const { error } = await supabase
      .from('project_phases')
      .update({
        status: 'in_progress',
        actual_start_date: new Date().toISOString().split('T')[0],
      })
      .eq('id', phaseId);

    if (error) {
      console.error('Error starting phase:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in startPhase:', error);
    return false;
  }
};

/**
 * Mark phase as completed
 * @param {string} phaseId - Phase ID
 * @returns {Promise<boolean>} Success status
 */
export const completePhase = async (phaseId) => {
  try {
    const { error } = await supabase
      .from('project_phases')
      .update({
        status: 'completed',
        completion_percentage: 100,
        actual_end_date: new Date().toISOString().split('T')[0],
      })
      .eq('id', phaseId);

    if (error) {
      console.error('Error completing phase:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in completePhase:', error);
    return false;
  }
};

// ============================================================
// Phase Tasks Management
// ============================================================

/**
 * Add task to phase
 * @param {string} phaseId - Phase ID
 * @param {string} taskDescription - Task description
 * @param {number} order - Task order index
 * @returns {Promise<object|null>} Updated phase or null
 */
export const addTaskToPhase = async (phaseId, taskDescription, order) => {
  try {
    const { data: phase, error: fetchError } = await supabase
      .from('project_phases')
      .select('tasks')
      .eq('id', phaseId)
      .single();

    if (fetchError) throw fetchError;

    const newTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      description: taskDescription,
      order: order || (phase.tasks?.length || 0) + 1,
      completed: false,
      completed_by: null,
      completed_date: null,
      photo_url: null,
    };

    const updatedTasks = [...(phase.tasks || []), newTask];

    const { data, error } = await supabase
      .from('project_phases')
      .update({ tasks: updatedTasks })
      .eq('id', phaseId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding task to phase:', error);
    return null;
  }
};

/**
 * Update phase task
 * @param {string} phaseId - Phase ID
 * @param {string} taskId - Task ID
 * @param {object} updates - Task updates (description, completed, etc.)
 * @returns {Promise<object|null>} Updated phase or null
 */
export const updatePhaseTask = async (phaseId, taskId, updates) => {
  try {
    const { data: phase, error: fetchError } = await supabase
      .from('project_phases')
      .select('tasks')
      .eq('id', phaseId)
      .single();

    if (fetchError) throw fetchError;

    const updatedTasks = (phase.tasks || []).map(task =>
      task.id === taskId ? { ...task, ...updates } : task
    );

    const { data, error } = await supabase
      .from('project_phases')
      .update({ tasks: updatedTasks })
      .eq('id', phaseId)
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error updating phase task:', error);
    return null;
  }
};

/**
 * Mark task as complete
 * @param {string} phaseId - Phase ID
 * @param {string} taskId - Task ID
 * @param {string} workerId - Worker who completed the task
 * @param {string} photoUrl - Optional photo URL
 * @returns {Promise<object|null>} Updated phase or null
 */
export const markTaskComplete = async (phaseId, taskId, workerId = null, photoUrl = null) => {
  try {
    const updates = {
      completed: true,
      completed_by: workerId,
      completed_date: new Date().toISOString(),
      photo_url: photoUrl,
    };

    const updatedPhase = await updatePhaseTask(phaseId, taskId, updates);
    return updatedPhase;
  } catch (error) {
    console.error('Error marking task complete:', error);
    return null;
  }
};

/**
 * Calculate phase progress from tasks (0-100%)
 * @param {string} phaseId - Phase ID
 * @returns {Promise<number>} Completion percentage
 */
export const calculatePhaseProgressFromTasks = async (phaseId) => {
  try {
    const { data: phase, error } = await supabase
      .from('project_phases')
      .select('tasks, completion_percentage')
      .eq('id', phaseId)
      .single();

    if (error) throw error;

    const tasks = phase.tasks || [];
    if (tasks.length === 0) {
      return phase.completion_percentage || 0;
    }

    const totalProgress = tasks.reduce((sum, task) => {
      const taskProgress = task.progress !== undefined
        ? task.progress
        : (task.completed ? 100 : 0);
      return sum + taskProgress;
    }, 0);

    const percentage = Math.round(totalProgress / tasks.length);

    return percentage;
  } catch (error) {
    console.error('Error calculating phase progress:', error);
    return 0;
  }
};

// ============================================================
// Progress Tracking & Velocity System
// ============================================================

/**
 * Calculate actual progress from task completions in worker_tasks table
 * Progress = (completed tasks / total tasks) * 100
 * Includes both phase tasks and manually-added tasks
 * @param {string} projectId - Project ID
 * @returns {Promise<number>} Progress percentage
 */
export const calculateActualProgress = async (projectId) => {
  try {
    // Import the task-based progress calculation from workerTasks
    const { calculateProjectProgressFromTasks, updateProjectProgressFromTasks } = await import('./workerTasks');

    // Calculate progress from task completion
    const { progress } = await calculateProjectProgressFromTasks(projectId);

    // Update the project's actual_progress (no override check - always use task-based)
    await supabase
      .from('projects')
      .update({
        actual_progress: progress,
        progress_override: false // Progress is always task-based now
      })
      .eq('id', projectId);

    return progress;
  } catch (error) {
    console.error('Error in calculateActualProgress:', error);
    return 0;
  }
};

/**
 * Calculate task completion velocity (tasks per day)
 * @param {string} projectId - Project ID
 * @returns {Promise<number>} Velocity
 */
export const calculateVelocity = async (projectId) => {
  try {
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
      return 0;
    }

    const start = new Date(startDate);
    const today = new Date();
    const daysElapsed = Math.max(1, Math.ceil((today - start) / (1000 * 60 * 60 * 24)));

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

    const velocity = completedTasks / daysElapsed;

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
 * @returns {Promise<object|null>} Completion estimate
 */
export const calculateEstimatedCompletion = async (projectId) => {
  try {
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
      return null;
    }

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
      return null;
    }

    const remainingTasks = totalTasks - completedTasks;
    const daysNeeded = Math.ceil(remainingTasks / velocity);

    const today = new Date();
    const estimatedDate = new Date(today.getTime() + (daysNeeded * 24 * 60 * 60 * 1000));
    const estimatedDateString = estimatedDate.toISOString().split('T')[0];

    let daysLate = 0;
    if (project.end_date) {
      const plannedEnd = new Date(project.end_date);
      daysLate = Math.ceil((estimatedDate - plannedEnd) / (1000 * 60 * 60 * 24));
    }

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
 * @param {number} actualProgress - Progress percentage
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

    if (!isManual) {
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
 * Auto-start projects when their start_date arrives
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

    for (const project of projects) {
      await supabase
        .from('projects')
        .update({
          status: 'active',
          actual_start_date: today
        })
        .eq('id', project.id);
    }

    return projects.length;
  } catch (error) {
    console.error('Error in checkAndStartScheduledProjects:', error);
    return 0;
  }
};

/**
 * Reset project progress to automatic calculation
 * @param {string} projectId - Project ID
 * @returns {Promise<boolean>} Success status
 */
export const resetProjectProgressToAutomatic = async (projectId) => {
  try {
    const actualProgress = await calculateActualProgress(projectId);

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

    await calculateVelocity(projectId);
    await calculateEstimatedCompletion(projectId);

    return true;
  } catch (error) {
    console.error('Error in resetProjectProgressToAutomatic:', error);
    return false;
  }
};
