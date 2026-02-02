/**
 * ConflictDetector - Proactive issue identification for agents
 *
 * Detects potential problems BEFORE they happen:
 * - Scheduling conflicts (double-booking workers)
 * - Skill mismatches (wrong worker for job type)
 * - Budget issues (over budget, negative cash flow)
 *
 * Used by reasoning framework to catch problems proactively.
 */

/**
 * Check for scheduling conflicts when assigning a worker
 * @param {string} workerId - The worker being scheduled
 * @param {Date[]} requestedDates - Array of dates being requested
 * @param {Array} existingSchedule - Current schedule/assignments
 * @returns {Array} - Array of conflict objects
 */
export function detectSchedulingConflicts(workerId, requestedDates, existingSchedule) {
  const conflicts = [];

  if (!existingSchedule || !requestedDates?.length) {
    return conflicts;
  }

  existingSchedule.forEach(assignment => {
    if (assignment.worker_id === workerId || assignment.workerId === workerId) {
      requestedDates.forEach(date => {
        const dateToCheck = typeof date === 'string' ? new Date(date) : date;
        const startDate = new Date(assignment.start_date || assignment.startDate);
        const endDate = new Date(assignment.end_date || assignment.endDate);

        if (isDateInRange(dateToCheck, startDate, endDate)) {
          conflicts.push({
            type: 'double_booking',
            date: formatDate(dateToCheck),
            existingProject: assignment.project_name || assignment.projectName,
            existingTask: assignment.task || assignment.description,
            severity: 'high',
            message: `Worker already assigned to "${assignment.project_name || assignment.projectName}" on ${formatDate(dateToCheck)}`
          });
        }
      });
    }
  });

  return conflicts;
}

/**
 * Check if worker has the skills needed for a task
 * @param {Object} worker - Worker object with trade/skills info
 * @param {string[]} requiredSkills - Array of skills needed for the task
 * @returns {Array} - Array of mismatch objects
 */
export function detectSkillMismatch(worker, requiredSkills) {
  const mismatches = [];

  if (!worker || !requiredSkills?.length) {
    return mismatches;
  }

  // Normalize worker's skills (trade field, could be comma-separated)
  const workerSkills = (worker.trade || worker.skills || '')
    .toLowerCase()
    .split(/[,\/]/)
    .map(s => s.trim())
    .filter(Boolean);

  // Common skill aliases
  const skillAliases = {
    'electrical': ['electrician', 'electric', 'wiring'],
    'plumbing': ['plumber', 'pipes', 'piping'],
    'tile': ['tiling', 'tiles', 'tilework'],
    'drywall': ['sheetrock', 'drywall installation'],
    'painting': ['painter', 'paint'],
    'carpentry': ['carpenter', 'woodwork', 'framing'],
    'hvac': ['heating', 'cooling', 'air conditioning'],
    'roofing': ['roofer', 'roof'],
    'flooring': ['floors', 'floor installation'],
    'demolition': ['demo', 'tear out'],
    'general': ['general labor', 'helper', 'laborer']
  };

  requiredSkills.forEach(required => {
    const requiredLower = required.toLowerCase().trim();

    // Check direct match
    let hasSkill = workerSkills.some(ws => ws.includes(requiredLower) || requiredLower.includes(ws));

    // Check aliases
    if (!hasSkill) {
      const aliases = skillAliases[requiredLower] || [];
      hasSkill = workerSkills.some(ws =>
        aliases.some(alias => ws.includes(alias) || alias.includes(ws))
      );

      // Also check reverse (worker skill might be the canonical name)
      if (!hasSkill) {
        for (const [canonical, aliasGroup] of Object.entries(skillAliases)) {
          if (aliasGroup.includes(requiredLower) || canonical === requiredLower) {
            hasSkill = workerSkills.some(ws => ws.includes(canonical) || aliasGroup.some(a => ws.includes(a)));
            if (hasSkill) break;
          }
        }
      }
    }

    if (!hasSkill) {
      mismatches.push({
        type: 'skill_mismatch',
        required: required,
        workerName: worker.full_name || worker.name,
        workerHas: worker.trade || 'Not specified',
        severity: 'medium',
        message: `Task needs "${required}" but ${worker.full_name || 'worker'} does "${worker.trade || 'unspecified work'}"`
      });
    }
  });

  return mismatches;
}

/**
 * Check for budget/financial issues on a project
 * @param {Object} project - Project with financial data
 * @param {number} newExpense - New expense being added (optional)
 * @param {number} newIncome - New income being added (optional)
 * @returns {Array} - Array of issue objects
 */
export function detectBudgetIssues(project, newExpense = 0, newIncome = 0) {
  const issues = [];

  if (!project) return issues;

  const currentExpenses = (project.expenses || 0) + newExpense;
  const currentIncome = (project.incomeCollected || 0) + newIncome;
  const contractAmount = project.contractAmount || 0;

  // Critical: Expenses exceed contract (losing money on the job)
  if (currentExpenses > contractAmount && contractAmount > 0) {
    issues.push({
      type: 'over_budget',
      expenses: currentExpenses,
      budget: contractAmount,
      overBy: currentExpenses - contractAmount,
      projectName: project.name,
      severity: 'critical',
      message: `OVER BUDGET: Expenses ($${currentExpenses.toLocaleString()}) exceed contract ($${contractAmount.toLocaleString()}) by $${(currentExpenses - contractAmount).toLocaleString()}`
    });
  }

  // High: Expenses exceed income collected (negative cash flow)
  if (currentExpenses > currentIncome && currentIncome > 0) {
    issues.push({
      type: 'negative_cash_flow',
      expenses: currentExpenses,
      income: currentIncome,
      deficit: currentExpenses - currentIncome,
      projectName: project.name,
      severity: 'high',
      message: `Negative cash flow: Expenses ($${currentExpenses.toLocaleString()}) exceed collected income ($${currentIncome.toLocaleString()}) by $${(currentExpenses - currentIncome).toLocaleString()}`
    });
  }

  // Medium: Low collection rate on significant project progress
  if (contractAmount > 0) {
    const collectionRate = currentIncome / contractAmount;
    const expenseRate = currentExpenses / contractAmount;

    // If we've spent >50% but collected <30%, flag it
    if (expenseRate > 0.5 && collectionRate < 0.3) {
      issues.push({
        type: 'low_collection',
        collected: currentIncome,
        contract: contractAmount,
        collectionRate: Math.round(collectionRate * 100),
        expenseRate: Math.round(expenseRate * 100),
        projectName: project.name,
        severity: 'medium',
        message: `Low collection: Only ${Math.round(collectionRate * 100)}% collected but ${Math.round(expenseRate * 100)}% of budget spent`
      });
    }
  }

  // Warning: Approaching budget limit (>80% spent)
  if (contractAmount > 0 && currentExpenses / contractAmount > 0.8 && currentExpenses <= contractAmount) {
    const percentSpent = Math.round((currentExpenses / contractAmount) * 100);
    issues.push({
      type: 'approaching_budget',
      expenses: currentExpenses,
      budget: contractAmount,
      percentSpent,
      remaining: contractAmount - currentExpenses,
      projectName: project.name,
      severity: 'low',
      message: `${percentSpent}% of budget spent ($${(contractAmount - currentExpenses).toLocaleString()} remaining)`
    });
  }

  return issues;
}

/**
 * Check for timeline issues on a project
 * @param {Object} project - Project with date info
 * @param {Date} currentDate - Today's date
 * @returns {Array} - Array of issue objects
 */
export function detectTimelineIssues(project, currentDate = new Date()) {
  const issues = [];

  if (!project) return issues;

  const endDate = project.end_date || project.endDate;
  const status = project.status || 'active';

  if (endDate && status !== 'completed') {
    const end = new Date(endDate);
    const daysUntilEnd = Math.ceil((end - currentDate) / (1000 * 60 * 60 * 24));

    if (daysUntilEnd < 0) {
      issues.push({
        type: 'overdue',
        daysOverdue: Math.abs(daysUntilEnd),
        endDate: formatDate(end),
        projectName: project.name,
        severity: 'high',
        message: `Project is ${Math.abs(daysUntilEnd)} days overdue (was due ${formatDate(end)})`
      });
    } else if (daysUntilEnd <= 7) {
      issues.push({
        type: 'deadline_approaching',
        daysRemaining: daysUntilEnd,
        endDate: formatDate(end),
        projectName: project.name,
        severity: 'medium',
        message: `Deadline in ${daysUntilEnd} days (${formatDate(end)})`
      });
    }
  }

  return issues;
}

/**
 * Format detected conflicts/issues for prompt injection
 * @param {Array} conflicts - Array of conflict/issue objects
 * @param {Object} options - Formatting options
 * @returns {string} - Formatted string for prompt
 */
export function formatConflictsForPrompt(conflicts, options = {}) {
  if (!conflicts?.length) return '';

  const { minSeverity = 'medium', maxItems = 5 } = options;

  // Filter by severity
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const minSeverityLevel = severityOrder[minSeverity] ?? 2;

  const filtered = conflicts
    .filter(c => (severityOrder[c.severity] ?? 3) <= minSeverityLevel)
    .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))
    .slice(0, maxItems);

  if (!filtered.length) return '';

  let text = '\n\n## DETECTED ISSUES - Address in your response\n';

  filtered.forEach(c => {
    const icon = c.severity === 'critical' ? '!!!' :
                 c.severity === 'high' ? '!!' :
                 c.severity === 'medium' ? '!' : '-';

    text += `${icon} ${c.message}\n`;
  });

  text += '\n';
  return text;
}

/**
 * Run all relevant conflict checks based on context
 * @param {Object} context - Agent context with projects, workers, schedule
 * @returns {Array} - All detected conflicts
 */
export function runAllConflictChecks(context) {
  const allConflicts = [];

  // Check budget issues across all projects
  if (context.projects?.length) {
    context.projects.forEach(project => {
      const budgetIssues = detectBudgetIssues(project);
      const timelineIssues = detectTimelineIssues(project, new Date(context.currentDate));
      allConflicts.push(...budgetIssues, ...timelineIssues);
    });
  }

  return allConflicts;
}

// ============ Helper Functions ============

/**
 * Check if a date falls within a range
 */
function isDateInRange(date, start, end) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const s = new Date(start);
  s.setHours(0, 0, 0, 0);

  const e = new Date(end);
  e.setHours(23, 59, 59, 999);

  return d >= s && d <= e;
}

/**
 * Format a date for display
 */
function formatDate(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
