/**
 * DeterministicResponder.js
 *
 * Bypasses LLM entirely for simple data lookup queries.
 * Returns formatted responses in ~5ms instead of ~3 seconds.
 */

import logger from '../../../utils/logger';

// ============================================================================
// NAME MATCHING UTILITY
// ============================================================================

function fuzzyMatchWorkerName(searchName, workers) {
  const normalize = (str) => str?.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove accents

  const searchNormalized = normalize(searchName);
  if (!searchNormalized) return null;

  // Exact match first
  let match = workers.find(w => normalize(w.full_name) === searchNormalized);
  if (match) return match;

  // Partial match (starts with)
  match = workers.find(w => normalize(w.full_name)?.startsWith(searchNormalized));
  if (match) return match;

  // Contains match
  match = workers.find(w => normalize(w.full_name)?.includes(searchNormalized));
  if (match) return match;

  // First name match
  match = workers.find(w => {
    const firstName = normalize(w.full_name)?.split(' ')[0];
    return firstName === searchNormalized || firstName?.startsWith(searchNormalized);
  });

  return match || null;
}

function findClockedInWorker(searchName, clockedInList) {
  const normalize = (str) => str?.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const searchNormalized = normalize(searchName);
  if (!searchNormalized) return null;

  return clockedInList.find(entry => {
    const workerName = normalize(entry.workers?.full_name);
    if (!workerName) return false;
    return workerName === searchNormalized ||
           workerName.startsWith(searchNormalized) ||
           workerName.includes(searchNormalized) ||
           workerName.split(' ')[0] === searchNormalized;
  }) || null;
}

function formatTime(isoString) {
  if (!isoString) return 'unknown time';
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function calculateHours(clockInTime) {
  if (!clockInTime) return 0;
  const hours = (Date.now() - new Date(clockInTime)) / (1000 * 60 * 60);
  return Math.round(hours * 10) / 10;
}

// ============================================================================
// WORKER STATUS QUERIES (WorkersSchedulingAgent, task: 'track_time')
// ============================================================================

function handleWorkerStatusQuery(userMessage, context) {
  const clockedIn = context.clockedInToday || [];
  const workers = context.workers || [];

  // Pattern: "is [name] working"
  const isWorkingMatch = userMessage.match(/\bis\s+(\w+)\s+(working|clocked|on.?site)/i);
  if (isWorkingMatch) {
    const searchName = isWorkingMatch[1];
    const found = findClockedInWorker(searchName, clockedIn);

    if (found) {
      const name = found.workers?.full_name || searchName;
      const project = found.projects?.name || 'a project';
      const time = formatTime(found.clock_in);
      const hours = calculateHours(found.clock_in);

      return {
        response: `Yes, ${name} is currently working at ${project}. Clocked in at ${time} (${hours}h so far).`,
        action: "none",
        data: {
          type: "deterministic_lookup",
          query_type: "worker_status",
          result: {
            found: true,
            worker_id: found.workers?.id,
            worker_name: name,
            project_name: project,
            clock_in_time: time,
            hours_worked: hours
          }
        }
      };
    }

    // Check if worker exists but not clocked in
    const workerExists = fuzzyMatchWorkerName(searchName, workers);
    if (workerExists) {
      return {
        response: `No, ${workerExists.full_name} is not clocked in today.`,
        action: "none",
        data: {
          type: "deterministic_lookup",
          query_type: "worker_status",
          result: {
            found: false,
            worker_id: workerExists.id,
            worker_name: workerExists.full_name,
            reason: "not_clocked_in"
          }
        }
      };
    }

    return {
      response: `I couldn't find a worker named "${searchName}" in your team.`,
      action: "none",
      data: {
        type: "deterministic_lookup",
        query_type: "worker_status",
        result: { found: false, reason: "worker_not_found" }
      }
    };
  }

  // Pattern: "who clocked in today" / "who worked today" - includes completed shifts
  if (/\bclocked\s+in\s+today\b/i.test(userMessage) ||
      /\b(who|did\s+anyone)\s+(worked?|work)\s+today\b/i.test(userMessage) ||
      /\bworking\s+today\b/i.test(userMessage)) {

    const completedShifts = context.completedShiftsToday || [];
    // Combine currently clocked in + completed shifts for "today" queries
    const allTodayWorkers = [...clockedIn, ...completedShifts];

    if (allTodayWorkers.length === 0) {
      return {
        response: "No one clocked in today.",
        action: "none",
        data: {
          type: "deterministic_lookup",
          query_type: "who_clocked_in_today",
          result: { count: 0, workers: [], completed: [] }
        }
      };
    }

    const currentList = clockedIn.map(entry => {
      const name = entry.workers?.full_name || entry.full_name || 'Unknown';
      const time = formatTime(entry.clock_in);
      const hours = calculateHours(entry.clock_in);
      const role = entry.isSupervisor ? ' (Supervisor)' : '';
      return `${name}${role} - currently working since ${time} (${hours}h so far)`;
    });

    const completedList = completedShifts.map(entry => {
      const name = entry.workers?.full_name || entry.full_name || 'Unknown';
      const inTime = formatTime(entry.clock_in);
      const outTime = formatTime(entry.clock_out);
      const hours = entry.hoursWorked || 0;
      const role = entry.isSupervisor ? ' (Supervisor)' : '';
      return `${name}${role} - worked ${hours}h (${inTime} - ${outTime})`;
    });

    let response = '';
    if (currentList.length > 0) {
      response += `Currently working:\n• ${currentList.join('\n• ')}`;
    }
    if (completedList.length > 0) {
      if (response) response += '\n\n';
      response += `Completed shifts today:\n• ${completedList.join('\n• ')}`;
    }

    return {
      response,
      action: "none",
      data: {
        type: "deterministic_lookup",
        query_type: "who_clocked_in_today",
        result: {
          count: allTodayWorkers.length,
          currently_working: clockedIn.length,
          completed: completedShifts.length,
          workers: allTodayWorkers.map(e => ({
            id: e.workers?.id || e.id,
            name: e.workers?.full_name || e.full_name,
            clock_in: e.clock_in,
            clock_out: e.clock_out,
            project: e.projects?.name,
            isSupervisor: e.isSupervisor
          }))
        }
      }
    };
  }

  // Pattern: "who is working right now" / "anyone currently clocked in" - only active
  if (/\b(who|anyone|anybody)\s+(is\s+)?(working|clocked|on.?site)/i.test(userMessage) ||
      /\bcurrently\s+(working|clocked)/i.test(userMessage)) {

    if (clockedIn.length === 0) {
      return {
        response: "No workers are currently clocked in.",
        action: "none",
        data: {
          type: "deterministic_lookup",
          query_type: "who_is_working",
          result: { count: 0, workers: [] }
        }
      };
    }

    const workerList = clockedIn.map(entry => {
      const name = entry.workers?.full_name || entry.full_name || 'Unknown';
      const time = formatTime(entry.clock_in);
      const hours = calculateHours(entry.clock_in);
      const role = entry.isSupervisor ? ' (Supervisor)' : '';
      return `${name}${role} (since ${time}, ${hours}h)`;
    });

    return {
      response: `Currently working: ${workerList.join(', ')}`,
      action: "none",
      data: {
        type: "deterministic_lookup",
        query_type: "who_is_working",
        result: {
          count: clockedIn.length,
          workers: clockedIn.map(e => ({
            id: e.workers?.id || e.id,
            name: e.workers?.full_name || e.full_name,
            clock_in: e.clock_in,
            project: e.projects?.name,
            isSupervisor: e.isSupervisor
          }))
        }
      }
    };
  }

  // Pattern: "how many workers" (working/clocked in)
  if (/\bhow\s+many\s+(workers?|people|employees?)/i.test(userMessage) &&
      /\b(working|clocked|today|now)\b/i.test(userMessage)) {

    const names = clockedIn.map(e => e.workers?.full_name).filter(Boolean);

    return {
      response: `There are ${clockedIn.length} workers clocked in today${names.length ? ': ' + names.join(', ') : ''}.`,
      action: "none",
      data: {
        type: "deterministic_lookup",
        query_type: "worker_count",
        result: { count: clockedIn.length, names }
      }
    };
  }

  return null;
}

// ============================================================================
// SCHEDULE QUERIES (WorkersSchedulingAgent, task: 'retrieve_schedule_events')
// ============================================================================

function handleScheduleQuery(userMessage, context) {
  const scheduleEvents = context.scheduleEvents || [];
  const workSchedules = context.workSchedules || [];
  const today = context.currentDate;

  // Pattern: "what's the schedule today" / "my calendar today"
  if (/\b(what'?s?|show|get|my)\s+(the\s+)?(schedule|calendar)\b/i.test(userMessage) &&
      /\btoday\b/i.test(userMessage)) {

    const todayEvents = scheduleEvents.filter(e =>
      e.start_datetime?.split('T')[0] === today
    );

    if (todayEvents.length === 0 && workSchedules.length === 0) {
      return {
        response: "You have nothing scheduled for today.",
        action: "none",
        data: {
          type: "deterministic_lookup",
          query_type: "schedule_today",
          result: { events: [], work_schedules: [] }
        }
      };
    }

    const eventList = todayEvents.map(e => {
      const time = e.all_day ? 'All day' : formatTime(e.start_datetime);
      return `${time}: ${e.title}${e.location ? ' @ ' + e.location : ''}`;
    });

    const scheduleList = workSchedules.map(ws =>
      `${ws.workers?.full_name || 'Worker'} → ${ws.projects?.name || 'Project'}`
    );

    let response = '';
    if (eventList.length) response += `Today's events:\n• ${eventList.join('\n• ')}`;
    if (scheduleList.length) {
      if (response) response += '\n\n';
      response += `Work assignments:\n• ${scheduleList.join('\n• ')}`;
    }

    return {
      response,
      action: "none",
      data: {
        type: "deterministic_lookup",
        query_type: "schedule_today",
        result: {
          events: todayEvents,
          work_schedules: workSchedules
        }
      }
    };
  }

  // Pattern: "who is scheduled today"
  if (/\bwho\s+(is\s+)?scheduled\b/i.test(userMessage) && /\btoday\b/i.test(userMessage)) {
    const names = [...new Set(workSchedules.map(ws => ws.workers?.full_name).filter(Boolean))];

    if (names.length === 0) {
      return {
        response: "No workers are scheduled for today.",
        action: "none",
        data: {
          type: "deterministic_lookup",
          query_type: "who_scheduled",
          result: { count: 0, names: [] }
        }
      };
    }

    return {
      response: `Scheduled for today: ${names.join(', ')}`,
      action: "none",
      data: {
        type: "deterministic_lookup",
        query_type: "who_scheduled",
        result: { count: names.length, names }
      }
    };
  }

  return null;
}

// ============================================================================
// WORKER INFO QUERIES (WorkersSchedulingAgent, task: 'query_workers')
// ============================================================================

function handleWorkerInfoQuery(userMessage, context) {
  const workers = context.workers || [];

  // Pattern: "how many workers" (total, not working)
  if (/\bhow\s+many\s+workers\b/i.test(userMessage) &&
      !/\b(working|clocked|today|now)\b/i.test(userMessage)) {

    const names = workers.map(w => w.full_name).filter(Boolean);

    return {
      response: `You have ${workers.length} workers: ${names.join(', ')}`,
      action: "none",
      data: {
        type: "deterministic_lookup",
        query_type: "worker_count_total",
        result: { count: workers.length, names }
      }
    };
  }

  // Pattern: "list workers" / "show workers"
  if (/\b(list|show)\s+(all\s+)?(my\s+)?workers\b/i.test(userMessage)) {
    const workerList = workers.map(w =>
      `${w.full_name} (${w.trade || 'General'})`
    );

    return {
      response: `Your workers:\n• ${workerList.join('\n• ')}`,
      action: "none",
      data: {
        type: "deterministic_lookup",
        query_type: "list_workers",
        result: { count: workers.length, workers }
      }
    };
  }

  return null;
}

// ============================================================================
// FINANCIAL QUERIES (FinancialAgent)
// ============================================================================

function handleFinancialQuery(userMessage, context) {
  const stats = context.stats || {};
  const invoices = context.invoices || [];
  const estimates = context.estimates || [];
  const projects = context.projects || [];

  // Pattern: "how many invoices/estimates/projects"
  const countMatch = userMessage.match(/\bhow\s+many\s+(invoices?|estimates?|projects?)\b/i);
  if (countMatch) {
    const type = countMatch[1].toLowerCase().replace(/s$/, '');
    let count = 0;

    if (type === 'invoice') count = invoices.length;
    else if (type === 'estimate') count = estimates.length;
    else if (type === 'project') count = projects.length;

    return {
      response: `You have ${count} ${type}${count !== 1 ? 's' : ''}.`,
      action: "none",
      data: {
        type: "deterministic_lookup",
        query_type: "count",
        result: { type, count }
      }
    };
  }

  // Pattern: "total revenue/income"
  if (/\b(total|how\s+much)\s+(revenue|income|earned|collected)\b/i.test(userMessage)) {
    const total = stats.totalIncomeCollected || 0;

    return {
      response: `Total income collected: $${total.toLocaleString()}`,
      action: "none",
      data: {
        type: "deterministic_lookup",
        query_type: "total_income",
        result: { amount: total }
      }
    };
  }

  // Pattern: "total profit"
  if (/\b(total\s+)?profit\b/i.test(userMessage)) {
    const profit = stats.totalProfit || 0;
    const income = stats.totalIncomeCollected || 0;
    const expenses = stats.totalExpenses || 0;

    return {
      response: `Total profit: $${profit.toLocaleString()} (Income: $${income.toLocaleString()} - Expenses: $${expenses.toLocaleString()})`,
      action: "none",
      data: {
        type: "deterministic_lookup",
        query_type: "total_profit",
        result: { profit, income, expenses }
      }
    };
  }

  // Pattern: "total expenses"
  if (/\b(total\s+)?expenses?\b/i.test(userMessage)) {
    const total = stats.totalExpenses || 0;

    return {
      response: `Total expenses: $${total.toLocaleString()}`,
      action: "none",
      data: {
        type: "deterministic_lookup",
        query_type: "total_expenses",
        result: { amount: total }
      }
    };
  }

  return null;
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Check if query can be answered deterministically (no LLM needed)
 *
 * @param {string} userMessage - The user's query
 * @param {object} context - The fetched context data
 * @param {string} agentName - The routed agent name
 * @param {string} task - The routed task
 * @returns {object|null} - Response object or null to fall through to LLM
 */
export function checkDeterministicResponse(userMessage, context, agentName, task) {
  const startTime = Date.now();

  // Only handle specific agent/task combinations
  if (agentName === 'WorkersSchedulingAgent') {
    if (task === 'track_time') {
      const result = handleWorkerStatusQuery(userMessage, context);
      if (result) {
        logger.debug(`⚡ [Deterministic] Worker status query answered in ${Date.now() - startTime}ms`);
        return result;
      }
    }
    if (task === 'retrieve_schedule_events') {
      const result = handleScheduleQuery(userMessage, context);
      if (result) {
        logger.debug(`⚡ [Deterministic] Schedule query answered in ${Date.now() - startTime}ms`);
        return result;
      }
    }
    if (task === 'query_workers') {
      const result = handleWorkerInfoQuery(userMessage, context);
      if (result) {
        logger.debug(`⚡ [Deterministic] Worker info query answered in ${Date.now() - startTime}ms`);
        return result;
      }
    }
  }

  if (agentName === 'FinancialAgent') {
    const result = handleFinancialQuery(userMessage, context);
    if (result) {
      logger.debug(`⚡ [Deterministic] Financial query answered in ${Date.now() - startTime}ms`);
      return result;
    }
  }

  // No deterministic response available
  return null;
}
