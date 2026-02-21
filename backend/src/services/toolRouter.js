/**
 * Tool Router - Reduces cognitive load by filtering tools based on user intent
 *
 * Uses score-based routing to handle compound queries (e.g., "project expenses").
 * When a query matches two domains, tools from both are merged.
 * This helps the LLM make better tool selection decisions and respond faster.
 */

const logger = require('../utils/logger');

// Intent patterns — each keyword scores 1 point for its intent
const INTENT_PATTERNS = {
  financial: [/invoice/g, /payment/g, /bill/g, /paid/g, /due/g, /owe/g, /collect/g, /deposit/g, /expense/g, /spent/g, /income/g, /financial/g, /profit/g, /loss/g],
  project: [/project/g, /phase/g, /progress/g, /complete/g, /status/g, /behind/g, /over.*budget/g, /timeline/g, /milestone/g, /checklist/g, /task list/g],
  worker: [/worker/g, /employee/g, /crew/g, /team\b/g, /schedule/g, /assign/g, /clock/g, /shift/g, /attendance/g, /timesheet/g],
  estimate: [/estimate/g, /quote/g, /proposal/g, /bid/g, /cost/g],
  briefing: [/morning/g, /briefing/g, /today/g, /tomorrow/g, /this week/g, /overview/g, /summary/g, /rundown/g],
  search: [/\bfind\b/g, /\bsearch\b/g, /\blookup\b/g, /\blocate\b/g],
  reports: [/photo/g, /picture/g, /image/g, /\breport\b/g, /daily/g, /documentation/g, /progress pic/g],
  settings: [/setting/g, /business info/g, /profit margin/g, /service catalog/g, /pricing catalog/g, /configure/g],
};

// Tool groups for each intent
const TOOL_GROUPS = {
  financial: [
    'search_invoices', 'get_invoice_details', 'update_invoice', 'void_invoice',
    'convert_estimate_to_invoice', 'record_expense', 'get_financial_overview',
    'get_transactions', 'get_project_financials'
  ],
  project: [
    'search_projects', 'get_project_details', 'get_project_summary',
    'get_project_financials', 'update_phase_progress', 'delete_project',
    'update_project', 'create_worker_task', 'assign_worker', 'global_search',
    'add_project_checklist', 'create_project_phase'
  ],
  worker: [
    'get_workers', 'get_worker_details', 'assign_worker',
    'create_work_schedule', 'get_schedule_events', 'get_time_records',
    'search_projects'
  ],
  estimate: [
    'search_estimates', 'get_estimate_details', 'update_estimate',
    'suggest_pricing', 'share_document', 'get_business_settings',
    'search_projects', 'convert_estimate_to_invoice'
  ],
  briefing: [
    'get_daily_briefing', 'get_schedule_events', 'get_daily_reports',
    'get_photos', 'search_projects', 'search_invoices', 'get_workers',
    'get_time_records', 'get_financial_overview'
  ],
  search: [
    'global_search', 'search_projects', 'search_estimates',
    'search_invoices', 'get_workers', 'get_daily_briefing'
  ],
  reports: [
    'get_daily_reports', 'get_photos', 'generate_summary_report',
    'search_projects', 'get_project_details'
  ],
  settings: [
    'get_business_settings', 'update_service_pricing'
  ],
  general: [
    'global_search', 'get_daily_briefing', 'get_project_summary',
    'suggest_pricing', 'assign_worker', 'share_document',
    'search_projects', 'search_estimates', 'search_invoices', 'get_workers',
    'get_project_details', 'get_estimate_details', 'get_invoice_details',
    'get_worker_details', 'get_time_records',
    'record_expense', 'update_phase_progress', 'create_worker_task',
    'add_project_checklist', 'create_project_phase'
  ]
};

/**
 * Categorizes user intent using score-based matching.
 * Returns a single intent or compound { primary, secondary } for multi-domain queries.
 *
 * @param {string} userMessage - The user's message
 * @returns {string|Object} Intent string or { primary, secondary }
 */
function categorizeIntent(userMessage) {
  const msg = userMessage.toLowerCase();
  const scores = {};

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    let score = 0;
    for (const pattern of patterns) {
      // Reset lastIndex since we reuse /g patterns
      pattern.lastIndex = 0;
      const matches = msg.match(pattern);
      if (matches) score += matches.length;
    }
    if (score > 0) scores[intent] = score;
  }

  const intents = Object.keys(scores);

  if (intents.length === 0) return 'general';
  if (intents.length === 1) return intents[0];

  // Multiple intents matched — return top 2 by score
  intents.sort((a, b) => scores[b] - scores[a]);
  return { primary: intents[0], secondary: intents[1] };
}

/**
 * Returns relevant tools based on intent category.
 * For compound intents, merges tool sets from both domains (deduplicated).
 *
 * @param {string|Object} intent - Intent string or { primary, secondary }
 * @param {Array} allTools - All available tool definitions
 * @returns {Array} Filtered tool definitions
 */
function selectTools(intent, allTools) {
  let selectedToolNames;

  if (typeof intent === 'object' && intent.primary) {
    // Compound intent — merge both tool groups
    const primaryTools = TOOL_GROUPS[intent.primary] || [];
    const secondaryTools = TOOL_GROUPS[intent.secondary] || [];
    selectedToolNames = [...new Set([...primaryTools, ...secondaryTools])];
  } else {
    selectedToolNames = TOOL_GROUPS[intent] || TOOL_GROUPS.general;
  }

  return allTools.filter(tool =>
    selectedToolNames.includes(tool.function.name)
  );
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

  const intentLabel = typeof intent === 'object'
    ? `${intent.primary}+${intent.secondary}`
    : intent;

  logger.info(`🎯 Tool Router: intent="${intentLabel}", tools=${relevantTools.length}/${allTools.length}`);

  return {
    intent: intentLabel,
    tools: relevantTools,
    toolCount: relevantTools.length
  };
}

module.exports = {
  routeTools,
  categorizeIntent,
  selectTools
};
