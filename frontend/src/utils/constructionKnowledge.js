/**
 * Construction Knowledge Graph Utilities
 *
 * Provides access to realistic construction task durations, dependencies,
 * and project templates for intelligent project creation.
 */

import { supabase } from '../lib/supabase';

/**
 * Get project type template with phases and typical durations
 * @param {string} projectType - e.g., 'bathroom_gut_remodel', 'kitchen_full_remodel'
 * @returns {Object|null} Project type template with default phases
 */
export const getProjectTypeTemplate = async (projectType) => {
  try {
    const { data, error } = await supabase
      .from('project_type_templates')
      .select('*')
      .eq('name', projectType)
      .eq('is_active', true)
      .single();

    if (error) {
      return null;
    }

    return data;
  } catch (err) {
    console.error('[ConstructionKnowledge] Error fetching project type:', err);
    return null;
  }
};

/**
 * Get all active project type templates
 * @returns {Array} List of project types with basic info
 */
export const getAllProjectTypes = async () => {
  try {
    const { data, error } = await supabase
      .from('project_type_templates')
      .select('name, display_name, description, complexity, typical_duration_days_avg')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[ConstructionKnowledge] Error fetching project types:', err);
    return [];
  }
};

/**
 * Get task templates for a project type with dependencies
 * @param {string} projectType - e.g., 'bathroom', 'kitchen'
 * @returns {Array} Tasks with durations and dependencies
 */
export const getTasksForProjectType = async (projectType) => {
  try {
    // Get tasks that apply to this project type or are general
    const { data: tasks, error } = await supabase
      .from('construction_task_templates')
      .select(`
        id,
        name,
        description,
        trade,
        duration_hours_min,
        duration_hours_max,
        duration_hours_avg,
        drying_time_hours,
        lead_time_days,
        is_permit_required,
        is_inspection_required,
        phase_category,
        keywords
      `)
      .or(`project_types.cs.{${projectType}},project_types.eq.{}`)
      .order('phase_category');

    if (error) throw error;

    // Get dependencies for these tasks
    const taskIds = (tasks || []).map(t => t.id);

    if (taskIds.length === 0) return [];

    const { data: deps, error: depsError } = await supabase
      .from('task_dependencies')
      .select(`
        task_id,
        depends_on_task_id,
        dependency_type,
        lag_hours,
        is_hard_constraint,
        notes
      `)
      .in('task_id', taskIds);

    if (depsError) {
      console.error('[ConstructionKnowledge] Error fetching dependencies:', depsError);
    }

    // Create a map of task_id to task for dependency lookups
    const taskMap = new Map((tasks || []).map(t => [t.id, t]));

    // Attach dependencies to tasks
    const tasksWithDeps = (tasks || []).map(task => {
      const taskDeps = (deps || [])
        .filter(d => d.task_id === task.id)
        .map(d => ({
          dependsOn: taskMap.get(d.depends_on_task_id)?.name || 'Unknown',
          dependsOnId: d.depends_on_task_id,
          type: d.dependency_type,
          lagHours: d.lag_hours,
          isHard: d.is_hard_constraint,
          notes: d.notes
        }));

      return {
        ...task,
        dependencies: taskDeps
      };
    });

    return tasksWithDeps;
  } catch (err) {
    console.error('[ConstructionKnowledge] Error fetching tasks:', err);
    return [];
  }
};

/**
 * Get scheduling constraints/rules
 * @returns {Array} Active scheduling rules
 */
export const getSchedulingConstraints = async () => {
  try {
    const { data, error } = await supabase
      .from('scheduling_constraints')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('[ConstructionKnowledge] Error fetching constraints:', err);
    return [];
  }
};

/**
 * Detect project type from description
 * @param {string} description - User's project description
 * @returns {Object} Detected project type and complexity
 */
export const detectProjectType = (description) => {
  const desc = description.toLowerCase();

  // Bathroom detection
  if (desc.includes('bathroom') || desc.includes('bath') || desc.includes('shower') || desc.includes('tub')) {
    const isGut = desc.includes('gut') || desc.includes('full') || desc.includes('complete') ||
                  desc.includes('remodel') || desc.includes('renovation') || desc.includes('relocat');
    const isCosmetic = desc.includes('cosmetic') || desc.includes('update') || desc.includes('refresh') ||
                       desc.includes('paint') || desc.includes('vanity only');

    return {
      type: isCosmetic ? 'bathroom_cosmetic' : 'bathroom_gut_remodel',
      category: 'bathroom',
      complexity: isGut ? 'complex' : (isCosmetic ? 'simple' : 'medium'),
      isComplex: isGut,
      needsMoreInfo: !isGut && !isCosmetic
    };
  }

  // Kitchen detection
  if (desc.includes('kitchen')) {
    const isFull = desc.includes('full') || desc.includes('complete') || desc.includes('gut') ||
                   desc.includes('remodel') || desc.includes('renovation') || desc.includes('cabinet');
    const isCosmetic = desc.includes('cosmetic') || desc.includes('update') || desc.includes('refresh') ||
                       desc.includes('paint') || desc.includes('backsplash only');

    return {
      type: isFull ? 'kitchen_full_remodel' : (isCosmetic ? 'kitchen_cosmetic' : 'kitchen_full_remodel'),
      category: 'kitchen',
      complexity: isFull ? 'complex' : (isCosmetic ? 'simple' : 'medium'),
      isComplex: isFull,
      needsMoreInfo: !isFull && !isCosmetic
    };
  }

  // Basement detection
  if (desc.includes('basement')) {
    return {
      type: 'basement_finishing',
      category: 'basement',
      complexity: 'complex',
      isComplex: true,
      needsMoreInfo: true
    };
  }

  // Room addition
  if (desc.includes('addition') || desc.includes('add room') || desc.includes('new room')) {
    return {
      type: 'room_addition',
      category: 'addition',
      complexity: 'complex',
      isComplex: true,
      needsMoreInfo: true
    };
  }

  // Common non-construction services (AI will generate tasks)
  // Cleaning services
  if (desc.includes('clean') || desc.includes('maid') || desc.includes('housekeep')) {
    return {
      type: null,
      category: 'cleaning',
      complexity: desc.includes('deep') ? 'medium' : 'simple',
      isComplex: false,
      needsAIGeneration: true,
      suggestedDuration: desc.includes('deep') ? '4-8 hours' : '2-4 hours'
    };
  }

  // Landscaping/lawn
  if (desc.includes('landscap') || desc.includes('lawn') || desc.includes('yard') || desc.includes('garden') || desc.includes('mow')) {
    return {
      type: null,
      category: 'landscaping',
      complexity: desc.includes('design') || desc.includes('install') ? 'complex' : 'simple',
      isComplex: false,
      needsAIGeneration: true,
      suggestedDuration: '2-6 hours'
    };
  }

  // Pool services
  if (desc.includes('pool') || desc.includes('spa') || desc.includes('hot tub')) {
    return {
      type: null,
      category: 'pool',
      complexity: 'medium',
      isComplex: false,
      needsAIGeneration: true,
      suggestedDuration: '3-5 hours'
    };
  }

  // Pest control
  if (desc.includes('pest') || desc.includes('bee') || desc.includes('wasp') || desc.includes('termite') || desc.includes('rodent') || desc.includes('extermina')) {
    return {
      type: null,
      category: 'pest_control',
      complexity: 'medium',
      isComplex: false,
      needsAIGeneration: true,
      suggestedDuration: '2-4 hours'
    };
  }

  // Pressure washing
  if (desc.includes('pressure wash') || desc.includes('power wash')) {
    return {
      type: null,
      category: 'pressure_washing',
      complexity: 'simple',
      isComplex: false,
      needsAIGeneration: true,
      suggestedDuration: '3-6 hours'
    };
  }

  // Septic/plumbing services (not construction)
  if (desc.includes('septic') || desc.includes('drain clean') || desc.includes('sewer')) {
    return {
      type: null,
      category: 'septic',
      complexity: 'medium',
      isComplex: false,
      needsAIGeneration: true,
      suggestedDuration: '3-6 hours'
    };
  }

  // Moving services
  if (desc.includes('mov') && (desc.includes('house') || desc.includes('furniture') || desc.includes('office'))) {
    return {
      type: null,
      category: 'moving',
      complexity: 'medium',
      isComplex: false,
      needsAIGeneration: true,
      suggestedDuration: '4-10 hours'
    };
  }

  // Default/unknown - AI will figure it out
  return {
    type: null,
    category: 'unknown',
    complexity: 'medium',
    isComplex: false,
    needsAIGeneration: true,
    needsMoreInfo: true
  };
};

/**
 * Check if a service needs AI generation (not in knowledge graph)
 * @param {string} description - User's service description
 * @returns {Object} { needsAIGeneration, category, suggestedApproach }
 */
export const checkIfServiceNeedsAIGeneration = (description) => {
  const detected = detectProjectType(description);

  if (detected.type) {
    // Known construction service - use knowledge graph
    return {
      needsAIGeneration: false,
      isKnownService: true,
      serviceType: detected.type,
      category: detected.category,
      complexity: detected.complexity
    };
  }

  // Unknown or non-construction - AI will generate
  return {
    needsAIGeneration: true,
    isKnownService: false,
    category: detected.category,
    complexity: detected.complexity,
    suggestedDuration: detected.suggestedDuration || 'varies'
  };
};

/**
 * Calculate realistic project duration based on tasks
 * @param {Array} tasks - Array of task templates
 * @param {number} workDaysPerWeek - Number of working days (5-7)
 * @param {number} hoursPerDay - Hours of work per day (default 8)
 * @returns {Object} Duration calculation
 */
export const calculateProjectDuration = (tasks, workDaysPerWeek = 5, hoursPerDay = 8) => {
  let totalHours = 0;
  let totalDryingHours = 0;
  let totalLeadDays = 0;

  (tasks || []).forEach(task => {
    totalHours += task.duration_hours_avg || 0;
    totalDryingHours += task.drying_time_hours || 0;
    totalLeadDays += task.lead_time_days || 0;
  });

  // Calculate work days needed (excluding drying/lead time)
  const workDaysFromLabor = Math.ceil(totalHours / hoursPerDay);

  // Add drying time (converted to days, assuming work continues on other tasks)
  const dryingDays = Math.ceil(totalDryingHours / 24);

  // Total work days (drying time adds to schedule, doesn't parallelize fully)
  const totalWorkDays = workDaysFromLabor + Math.ceil(dryingDays * 0.5); // Assume 50% overlap

  // Convert to calendar days based on work schedule
  const calendarDays = Math.ceil((totalWorkDays / workDaysPerWeek) * 7) + totalLeadDays;

  return {
    totalLaborHours: totalHours,
    dryingTimeHours: totalDryingHours,
    leadTimeDays: totalLeadDays,
    workDays: totalWorkDays,
    calendarDays: calendarDays,
    weeks: Math.ceil(calendarDays / 7)
  };
};

/**
 * Format knowledge graph data for AI prompt context
 * @param {string} projectType - Detected project type
 * @returns {Object} Formatted context for AI prompt
 */
export const getKnowledgeContextForPrompt = async (projectType) => {
  try {
    // Get project type template
    const template = await getProjectTypeTemplate(projectType);

    // Get tasks with dependencies
    const category = projectType?.split('_')[0] || 'bathroom'; // Extract 'bathroom' from 'bathroom_gut_remodel'
    const tasks = await getTasksForProjectType(category);

    // Get constraints
    const constraints = await getSchedulingConstraints();

    // Group tasks by phase
    const tasksByPhase = {};
    (tasks || []).forEach(task => {
      const phase = task.phase_category || 'other';
      if (!tasksByPhase[phase]) tasksByPhase[phase] = [];
      tasksByPhase[phase].push(task);
    });

    // Format for prompt
    return {
      projectTemplate: template,
      tasksByPhase,
      allTasks: tasks,
      constraints,
      summary: {
        totalTasks: tasks.length,
        phases: Object.keys(tasksByPhase),
        typicalDuration: template?.typical_duration_days_avg || 'Unknown',
        complexity: template?.complexity || 'medium'
      }
    };
  } catch (err) {
    console.error('[ConstructionKnowledge] Error building context:', err);
    return null;
  }
};

/**
 * Format tasks as a prompt-friendly string
 * @param {Array} tasks - Task templates
 * @returns {string} Formatted string for AI prompt
 */
export const formatTasksForPrompt = (tasks) => {
  if (!tasks || tasks.length === 0) return 'No task templates available.';

  const phaseOrder = ['planning', 'demo', 'rough', 'inspection', 'drywall', 'paint', 'flooring', 'finish', 'closeout'];

  // Group by phase
  const byPhase = {};
  tasks.forEach(t => {
    const phase = t.phase_category || 'other';
    if (!byPhase[phase]) byPhase[phase] = [];
    byPhase[phase].push(t);
  });

  // Format each phase
  let output = '';
  phaseOrder.forEach(phase => {
    if (byPhase[phase] && byPhase[phase].length > 0) {
      output += `\n**${phase.toUpperCase()} PHASE:**\n`;
      byPhase[phase].forEach(task => {
        const deps = task.dependencies?.length > 0
          ? ` (after: ${task.dependencies.map(d => d.dependsOn).join(', ')})`
          : '';
        const drying = task.drying_time_hours > 0 ? ` [+${task.drying_time_hours}hr drying]` : '';
        output += `- ${task.name}: ${task.duration_hours_avg}hrs avg (${task.duration_hours_min}-${task.duration_hours_max})${drying}${deps}\n`;
      });
    }
  });

  return output;
};

/**
 * Validate task sequence against dependencies
 * @param {Array} proposedTasks - Array of {name, startDate} objects
 * @param {Array} taskTemplates - Task templates with dependencies
 * @returns {Array} List of violations
 */
export const validateTaskSequence = (proposedTasks, taskTemplates) => {
  const violations = [];

  // Create lookup maps
  const taskByName = new Map(taskTemplates.map(t => [t.name.toLowerCase(), t]));
  const proposedByName = new Map(proposedTasks.map(t => [t.name.toLowerCase(), t]));

  proposedTasks.forEach(proposed => {
    const template = taskByName.get(proposed.name.toLowerCase());
    if (!template || !template.dependencies) return;

    template.dependencies.forEach(dep => {
      if (!dep.isHard) return; // Skip soft constraints

      const dependsOnTask = proposedByName.get(dep.dependsOn.toLowerCase());
      if (!dependsOnTask) return; // Dependency not in proposed tasks

      // Check if dependency is scheduled before this task
      if (new Date(dependsOnTask.startDate) >= new Date(proposed.startDate)) {
        violations.push({
          task: proposed.name,
          dependsOn: dep.dependsOn,
          issue: `"${proposed.name}" is scheduled before "${dep.dependsOn}" but must come after`,
          lagHours: dep.lagHours
        });
      }
    });
  });

  return violations;
};

export default {
  getProjectTypeTemplate,
  getAllProjectTypes,
  getTasksForProjectType,
  getSchedulingConstraints,
  detectProjectType,
  checkIfServiceNeedsAIGeneration,
  calculateProjectDuration,
  getKnowledgeContextForPrompt,
  formatTasksForPrompt,
  validateTaskSequence
};
