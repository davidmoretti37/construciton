/**
 * Tool Router - Reduces cognitive load by filtering tools based on user intent
 *
 * Uses score-based routing to handle compound queries (e.g., "project expenses").
 * When a query matches two domains, tools from both are merged.
 * This helps the LLM make better tool selection decisions and respond faster.
 */

const logger = require('../utils/logger');

// Intent patterns — each keyword scores 1 point for its intent.
// change_order patterns are weighted heavily (3pt each) so a CO query wins
// over the broader project/financial intents that share keywords like "phase"
// or dollar amounts. Without this the LLM gets project/financial tools and
// decomposes "add a change order" into create_project_phase + record_expense,
// which is structurally wrong (a CO is its own first-class entity).
const INTENT_PATTERNS = {
  change_order: [
    /change\s*orders?/g, /\bcos?\b/g, /scope\s*change/g, /extra\s*work/g,
    /\bchange\s*order/g,
  ],
  financial: [/invoice/g, /payment/g, /bill/g, /paid/g, /due/g, /owe/g, /collect/g, /deposit/g, /expense/g, /spent/g, /income/g, /financial/g, /profit/g, /loss/g, /receipt/g, /charge/g, /aging/g, /receivable/g, /overdue/g, /tax/g, /deduction/g, /1099/g, /payroll/g, /cash flow/g, /recurring/g],
  // Project intent: keep keywords UNAMBIGUOUS — words that only project-based
  // businesses use. Don't add generic room/space words like "bathroom" or
  // "kitchen" — service businesses (cleaning, pest, HVAC) talk about those
  // rooms too and shouldn't be misrouted away from service-plan tools.
  project: [/project/g, /phase/g, /progress/g, /complete/g, /status/g, /behind/g, /over.*budget/g, /timeline/g, /milestone/g, /checklist/g, /task list/g, /remodel/g, /renovation/g, /\bjob\b/g, /\bgig\b/g, /\bcreate\b.*\b(project|job|remodel|renovation)/g, /\bstart\b.*\b(project|job|remodel|renovation)/g, /\bnew\b.*\b(project|job|remodel)/g],
  worker: [/worker/g, /employee/g, /crew/g, /team\b/g, /schedule/g, /assign/g, /clock/g, /shift/g, /attendance/g, /timesheet/g],
  estimate: [/estimate/g, /quote/g, /proposal/g, /bid/g, /cost/g],
  briefing: [/morning/g, /briefing/g, /today/g, /tomorrow/g, /this week/g, /overview/g, /summary/g, /rundown/g],
  search: [/\bfind\b/g, /\bsearch\b/g, /\blookup\b/g, /\blocate\b/g],
  reports: [/photo/g, /picture/g, /image/g, /\breport\b/g, /daily/g, /documentation/g, /progress pic/g],
  settings: [/setting/g, /business info/g, /profit margin/g, /service catalog/g, /pricing catalog/g, /configure/g],
  bank: [/bank/g, /card/g, /reconcil/g, /unmatched/g, /statement/g, /teller/g, /csv/g, /bank transaction/g, /card transaction/g],
  document: [/document/g, /\bfile\b/g, /upload/g, /\bpdf\b/g, /blueprint/g, /permit/g, /attachment/g, /scope of work/g],
  service_plan: [/service plan/g, /service route/g, /daily route/g, /today.s route/g, /visit/g, /pest/g, /cleaning/g, /lawn/g, /pool/g, /hvac/g, /scheduled visit/g, /unbilled/g, /service location/g],
};

// Tool groups for each intent.
// change_order: TIGHTLY scoped — only the CO entity tools + the lookup tools
// needed to populate the preview card (project + phases). Crucially does NOT
// include create_project_phase, record_expense, update_phase_progress, or
// update_project. The CO entity owns contract bump + schedule extension +
// phase placement atomically on client approval; decomposing it is a bug.
const TOOL_GROUPS = {
  change_order: [
    'create_change_order', 'list_change_orders', 'get_change_order',
    'update_change_order', 'send_change_order', 'delete_change_order',
    'search_projects', 'get_project_details',
  ],
  financial: [
    'search_invoices', 'get_invoice_details', 'update_invoice', 'void_invoice',
    'convert_estimate_to_invoice', 'record_expense', 'get_financial_overview',
    'get_transactions', 'get_project_financials',
    'get_bank_transactions', 'assign_bank_transaction', 'get_reconciliation_summary',
    'get_ar_aging', 'get_tax_summary', 'get_payroll_summary', 'get_cash_flow', 'get_recurring_expenses'
  ],
  project: [
    'search_projects', 'get_project_details', 'get_project_summary',
    'get_project_financials', 'update_phase_progress', 'delete_project',
    'update_project', 'create_worker_task', 'assign_worker', 'assign_supervisor',
    'unassign_worker', 'unassign_supervisor', 'global_search',
    'add_project_checklist', 'create_project_phase',
    'get_project_documents', 'upload_project_document', 'update_project_document', 'delete_project_document',
    'setup_daily_checklist', 'get_daily_checklist_report', 'get_daily_checklist_summary'
  ],
  worker: [
    'get_workers', 'get_worker_details', 'assign_worker', 'unassign_worker',
    'create_work_schedule', 'get_schedule_events', 'get_time_records',
    'clock_in_worker', 'clock_out_worker',
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
    'get_time_records', 'get_financial_overview',
    'get_cash_flow', 'get_ar_aging'
  ],
  search: [
    'global_search', 'query_event_history', 'search_projects', 'search_estimates',
    'search_invoices', 'get_workers', 'get_daily_briefing'
  ],
  reports: [
    'get_daily_reports', 'get_photos', 'generate_summary_report',
    'search_projects', 'get_project_details',
    'get_daily_checklist_report', 'get_daily_checklist_summary'
  ],
  settings: [
    'get_business_settings', 'update_service_pricing'
  ],
  bank: [
    'get_bank_transactions', 'assign_bank_transaction', 'get_reconciliation_summary',
    'search_projects', 'get_transactions', 'get_financial_overview'
  ],
  document: [
    'get_project_documents', 'upload_project_document', 'update_project_document',
    'delete_project_document', 'search_projects', 'get_project_details'
  ],
  service_plan: [
    'get_service_plans', 'get_service_plan_details', 'get_service_plan_summary',
    'get_daily_route', 'complete_visit', 'get_billing_summary', 'create_service_visit',
    'update_service_plan', 'delete_service_plan',
    'add_service_location', 'update_service_location',
    'assign_worker_to_plan', 'calculate_service_plan_revenue',
    'get_service_plan_documents', 'upload_service_plan_document',
    'record_expense', 'get_workers',
    'setup_daily_checklist', 'get_daily_checklist_report', 'get_daily_checklist_summary'
  ],
  general: [
    'global_search', 'query_event_history', 'get_daily_briefing', 'get_project_summary',
    'suggest_pricing', 'assign_worker', 'assign_supervisor',
    'unassign_worker', 'unassign_supervisor', 'share_document',
    'search_projects', 'search_estimates', 'search_invoices', 'get_workers',
    'get_project_details', 'get_estimate_details', 'get_invoice_details',
    'get_worker_details', 'get_time_records',
    'record_expense', 'update_phase_progress', 'create_worker_task',
    'add_project_checklist', 'create_project_phase',
    'create_change_order', 'list_change_orders', 'get_change_order', 'delete_change_order',
    'get_bank_transactions', 'assign_bank_transaction', 'get_reconciliation_summary',
    'get_ar_aging', 'get_tax_summary', 'get_payroll_summary', 'get_cash_flow', 'get_recurring_expenses',
    'get_project_documents', 'upload_project_document', 'update_project_document', 'delete_project_document',
    'clock_in_worker', 'clock_out_worker',
    'get_service_plans', 'get_service_plan_details', 'get_service_plan_summary',
    'get_daily_route', 'complete_visit', 'get_billing_summary', 'create_service_visit',
    'update_service_plan', 'delete_service_plan',
    'add_service_location', 'update_service_location',
    'assign_worker_to_plan', 'calculate_service_plan_revenue',
    'get_service_plan_documents', 'upload_service_plan_document',
    'setup_daily_checklist', 'get_daily_checklist_report', 'get_daily_checklist_summary'
  ]
};

/**
 * Categorizes user intent using score-based matching.
 * Returns a single intent or compound { primary, secondary } for multi-domain queries.
 *
 * @param {string} userMessage - The user's message
 * @returns {string|Object} Intent string or { primary, secondary }
 */
// Per-intent weight multiplier. change_order is heavily boosted because its
// triggers ("change order", "CO", "scope change") are unambiguous — when they
// appear, the answer is always the CO entity, regardless of how many other
// keywords (phase, $X, etc.) the message also carries.
const INTENT_WEIGHTS = {
  change_order: 5,
};

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
    if (score > 0) scores[intent] = score * (INTENT_WEIGHTS[intent] || 1);
  }

  const intents = Object.keys(scores);

  if (intents.length === 0) return 'general';
  if (intents.length === 1) return intents[0];

  // change_order is exclusive — never compound it with another intent.
  // Mixing in project/financial tools is exactly what caused the
  // record_expense + create_project_phase decomposition bug.
  if (scores.change_order && scores.change_order >= 5) {
    return 'change_order';
  }

  // Multiple intents matched — return top 2 by score
  intents.sort((a, b) => scores[b] - scores[a]);
  return { primary: intents[0], secondary: intents[1] };
}

// Tools that are always useful as "connective tissue" regardless of
// intent. The legacy Foreman flow doesn't need these (its tool-router
// stays narrow for accuracy), but the PEV planner uses a wider surface
// so compound requests like "create CO + assign worker + email client"
// can be planned in a single shot instead of halting on the first
// out-of-group tool. Executor still validates against the registry, so
// risk is unchanged.
const PEV_ALWAYS_AVAILABLE = [
  'search_projects', 'get_project_details', 'get_project_summary',
  'search_estimates', 'get_estimate_details',
  'search_invoices', 'get_invoice_details',
  'get_workers', 'get_worker_details',
  'list_change_orders', 'get_change_order',
  'global_search', 'query_event_history',
];

/**
 * Returns relevant tools based on intent category.
 * For compound intents, merges tool sets from both domains (deduplicated).
 *
 * @param {string|Object} intent - Intent string or { primary, secondary }
 * @param {Array} allTools - All available tool definitions
 * @param {Object} [opts]
 *   opts.forPev — when true, returns a wider tool surface that includes
 *     PEV_ALWAYS_AVAILABLE so the planner can compose cross-cutting plans.
 *     Default false (preserves existing tight Foreman routing).
 * @returns {Array} Filtered tool definitions
 */
function selectTools(intent, allTools, opts = {}) {
  let selectedToolNames;

  if (typeof intent === 'object' && intent.primary) {
    // Compound intent — merge both tool groups
    const primaryTools = TOOL_GROUPS[intent.primary] || [];
    const secondaryTools = TOOL_GROUPS[intent.secondary] || [];
    selectedToolNames = [...new Set([...primaryTools, ...secondaryTools])];
  } else {
    selectedToolNames = TOOL_GROUPS[intent] || TOOL_GROUPS.general;
  }

  // For the PEV planner, merge in always-available connective-tissue tools
  // so cross-cutting plans don't halt because a search/lookup tool wasn't
  // in the intent's group. The executor still enforces the registry at
  // call time, so this only widens the planner's view, not what runs.
  if (opts.forPev) {
    selectedToolNames = [...new Set([...selectedToolNames, ...PEV_ALWAYS_AVAILABLE])];
  }

  return allTools.filter(tool =>
    selectedToolNames.includes(tool.function.name)
  );
}

/**
 * Main routing function - analyzes query and returns relevant tools.
 * Conversation-state hints take precedence over keyword detection so that
 * follow-up turns (e.g. "update the rate to $200") stay in the right bucket.
 *
 * @param {string} userMessage - User's message
 * @param {Array} allTools - All available tool definitions
 * @param {Object} [hints] - Optional conversation state hints
 * @param {boolean} [hints.hasDraftProject] - True if there's an active project draft
 * @param {boolean} [hints.hasDraftServicePlan] - True if there's an active service plan draft
 * @returns {Object} { intent, tools, toolCount }
 */
function routeTools(userMessage, allTools, hints = {}) {
  let intent = categorizeIntent(userMessage);

  // State-aware override: if a draft is active and the user message is ambiguous
  // (general intent), force the bucket that matches the active draft.
  if (intent === 'general') {
    if (hints.hasDraftServicePlan && !hints.hasDraftProject) {
      intent = 'service_plan';
    } else if (hints.hasDraftProject && !hints.hasDraftServicePlan) {
      intent = 'project';
    }
  }

  const relevantTools = selectTools(intent, allTools);
  return {
    intent: typeof intent === 'object' ? `${intent.primary}+${intent.secondary}` : intent,
    tools: relevantTools,
    toolCount: relevantTools.length,
  };
}

/**
 * Async routing path: prefers a local LLM intent classifier (Ollama on the
 * Mac Mini or any reachable host) for nuanced classification, falls back
 * to the regex-based routeTools if Ollama isn't reachable / times out.
 * Free at inference time when the local model is up; same fidelity as
 * the regex router when it's not.
 */
async function routeToolsAsync(userMessage, allTools, hints = {}) {
  // Race regex (instant) and Ollama (capped timeout). Ollama wins if it
  // returns in time AND its intent isn't "general" (general isn't actually
  // a useful classification — defer to the regex router which scores).
  const { classifyIntent } = require('./localRouter');
  let localIntent = null;
  try {
    localIntent = await classifyIntent(userMessage, hints);
  } catch (e) {
    // localRouter already logs; never let it break the request
    localIntent = null;
  }

  if (localIntent && localIntent !== 'general' && TOOL_GROUPS[localIntent]) {
    const tools = selectTools(localIntent, allTools);
    const pevTools = selectTools(localIntent, allTools, { forPev: true });
    logger.info(`🎯 Tool Router (local): intent="${localIntent}", tools=${tools.length}/${allTools.length} (pev=${pevTools.length})`);
    return { intent: localIntent, tools, pevTools, toolCount: tools.length };
  }

  const regexResult = routeTools(userMessage, allTools, hints);
  // Augment with the PEV-wide tool set so the planner sees connective-tissue tools.
  const pevTools = selectTools(regexResult.intent, allTools, { forPev: true });
  logger.info(`🎯 Tool Router (regex): intent="${regexResult.intent}", tools=${regexResult.toolCount}/${allTools.length} (pev=${pevTools.length})`);
  return { ...regexResult, pevTools };
}

module.exports = {
  routeTools,
  routeToolsAsync,
  categorizeIntent,
  selectTools,
};
