/**
 * Tool Router - Reduces cognitive load by filtering tools based on user intent
 *
 * Categorizes user queries and returns only relevant tools (8-12 instead of 34)
 * This helps the LLM make better tool selection decisions and respond faster.
 */

const logger = require('../utils/logger');

/**
 * Categorizes user intent based on keywords and patterns
 * @param {string} userMessage - The user's message
 * @returns {string} Intent category
 */
function categorizeIntent(userMessage) {
  const msg = userMessage.toLowerCase();

  // Financial queries (invoices, payments, expenses)
  if (msg.match(/invoice|payment|bill|paid|due|owe|collect|deposit|expense|income|financial|profit|loss/i)) {
    return 'financial';
  }

  // Project queries (projects, phases, progress)
  if (msg.match(/project|phase|progress|complete|status|behind|over.*budget|timeline|milestone/i)) {
    return 'project';
  }

  // Worker/schedule queries (workers, time tracking, assignments)
  if (msg.match(/worker|employee|crew|team|schedule|assign|clock|time|shift|attendance|timesheet/i)) {
    return 'worker';
  }

  // Estimate queries (quotes, proposals, pricing)
  if (msg.match(/estimate|quote|proposal|pricing|price|bid|cost/i)) {
    return 'estimate';
  }

  // Photo/report queries (CHECK THIS BEFORE "briefing" because "daily report for today" should be reports, not briefing)
  if (msg.match(/photo|picture|image|daily report|work report|site report|documentation|progress pic/i)) {
    return 'reports';
  }

  // Daily briefing / overview
  if (msg.match(/morning|briefing|today|tomorrow|this week|update|overview|happening|summary|rundown/i)) {
    return 'briefing';
  }

  // Search queries (find, lookup, show)
  if (msg.match(/find|search|show|list|get|lookup|where|locate/i)) {
    return 'search';
  }

  // Settings queries
  if (msg.match(/setting|business info|profit margin|service catalog|pricing catalog|configure/i)) {
    return 'settings';
  }

  // Default: general (broader tool set for unclear queries)
  return 'general';
}

/**
 * Returns relevant tools based on intent category
 * @param {string} intent - Intent category
 * @param {Array} allTools - All available tool definitions
 * @returns {Array} Filtered tool definitions
 */
function selectTools(intent, allTools) {
  // Define tool groups for each intent
  const toolGroups = {
    // Financial operations (invoices, payments, expenses)
    financial: [
      'search_invoices',
      'get_invoice_details',
      'update_invoice',
      'void_invoice',
      'convert_estimate_to_invoice',
      'record_expense',
      'get_financial_overview',
      'get_transactions',
      'get_project_financials'
    ],

    // Project management (projects, phases, tasks)
    project: [
      'search_projects',
      'get_project_details',
      'get_project_summary',
      'get_project_financials',
      'update_phase_progress',
      'delete_project',
      'create_worker_task',
      'assign_worker',
      'global_search'
    ],

    // Worker management (workers, schedules, assignments)
    worker: [
      'get_workers',
      'get_worker_details',
      'assign_worker',
      'create_work_schedule',
      'get_schedule_events',
      'get_time_records',
      'search_projects', // Often need project context for assignments
    ],

    // Estimate operations (quotes, pricing, proposals)
    estimate: [
      'search_estimates',
      'get_estimate_details',
      'update_estimate',
      'suggest_pricing',
      'share_document',
      'get_business_settings',
      'search_projects', // Estimates often link to projects
      'convert_estimate_to_invoice'
    ],

    // Daily briefing (morning updates, overviews)
    briefing: [
      'get_daily_briefing',
      'get_schedule_events',
      'search_projects',
      'search_invoices',
      'get_workers',
      'get_time_records',
      'get_financial_overview'
    ],

    // Search operations (find anything)
    search: [
      'global_search',
      'search_projects',
      'search_estimates',
      'search_invoices',
      'get_workers',
      'get_daily_briefing'
    ],

    // Reports and photos (daily reports, progress documentation)
    reports: [
      'get_daily_reports',
      'get_photos',
      'generate_summary_report',
      'search_projects',
      'get_project_details'
    ],

    // Settings and configuration
    settings: [
      'get_business_settings',
      'update_service_pricing'
    ],

    // General queries (unclear intent - use broader tool set)
    general: [
      // Intelligent high-level tools
      'global_search',
      'get_daily_briefing',
      'get_project_summary',
      'suggest_pricing',
      'assign_worker',
      'share_document',

      // Core search tools
      'search_projects',
      'search_estimates',
      'search_invoices',
      'get_workers',

      // Common detail getters
      'get_project_details',
      'get_estimate_details',
      'get_invoice_details',
      'get_worker_details',
      'get_time_records',

      // Common mutations
      'record_expense',
      'update_phase_progress',
      'create_worker_task'
    ]
  };

  const selectedToolNames = toolGroups[intent] || toolGroups.general;

  // Filter to only include tools that exist in the full tool set
  const filteredTools = allTools.filter(tool =>
    selectedToolNames.includes(tool.function.name)
  );

  return filteredTools;
}

/**
 * Main routing function - analyzes query and returns relevant tools
 * @param {string} userMessage - User's message
 * @param {Array} allTools - All available tool definitions
 * @returns {Object} { intent, tools, toolCount }
 */
function routeTools(userMessage, allTools) {
  const intent = categorizeIntent(userMessage);
  const relevantTools = selectTools(intent, allTools);

  logger.info(`🎯 Tool Router: intent="${intent}", tools=${relevantTools.length}/${allTools.length}`);

  return {
    intent,
    tools: relevantTools,
    toolCount: relevantTools.length
  };
}

module.exports = {
  routeTools,
  categorizeIntent,
  selectTools
};
