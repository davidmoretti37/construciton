/**
 * Tool handler barrel — re-exports executeTool + TOOL_HANDLERS map
 * from per-domain handler files in ./handlers/.
 *
 * This file used to be a single 8389-line monolith. Split 2026-04-29
 * into per-domain modules so future work is easier to navigate.
 * Function bodies are unchanged; the 8 import sites
 *   (server.js, agentService.js, routes/portalOwner.js,
 *    subAgents/runner.js, plus 4 test files)
 * still consume `{ executeTool, TOOL_HANDLERS, computeDiff }` from
 * `./tools/handlers` exactly as before.
 *
 * SECURITY AUDIT (2026-02-17): All tool handlers verified to filter
 * by user_id. Service-role key bypasses RLS — every query manually
 * enforces ownership. (Re-verified at split: file moves only.)
 */

const { logger } = require('./handlers/_shared');
const { userSafeError } = require('../userSafeError');

const importHandlers = require('./importHandlers');

const projects = require('./handlers/projects');
const estimates = require('./handlers/estimates');
const invoices = require('./handlers/invoices');
const workers = require('./handlers/workers');
const expenses = require('./handlers/expenses');
const financial = require('./handlers/financial');
const service = require('./handlers/service');
const dailyReports = require('./handlers/dailyReports');
const documents = require('./handlers/documents');
const briefings = require('./handlers/briefings');
const searchTools = require('./handlers/search');
const subs = require('./handlers/subs');
const changeOrders = require('./handlers/changeOrders');
const pinnedFacts = require('./handlers/pinnedFacts');
// SMS handlers exist but are not registered in TOOL_HANDLERS — disabled at
// the product level. Keep this require so re-enabling is one line below.
// eslint-disable-next-line no-unused-vars
const sms = require('./handlers/sms');

const { computeDiff } = searchTools;

const TOOL_HANDLERS = {
  // Bulk-import (QBO + Monday + CSV)
  ...importHandlers,

  // Projects
  search_projects: projects.search_projects,
  get_project_details: projects.get_project_details,
  delete_project: projects.delete_project,
  update_project: projects.update_project,
  get_project_financials: projects.get_project_financials,
  get_project_health: projects.get_project_health,
  get_project_summary: projects.get_project_summary,
  add_project_checklist: projects.add_project_checklist,
  create_project_phase: projects.create_project_phase,
  update_phase_budget: projects.update_phase_budget,
  update_phase_progress: projects.update_phase_progress,

  // Estimates
  search_estimates: estimates.search_estimates,
  get_estimate_details: estimates.get_estimate_details,
  update_estimate: estimates.update_estimate,
  suggest_pricing: estimates.suggest_pricing,
  convert_estimate_to_invoice: estimates.convert_estimate_to_invoice,

  // Invoices + draws + project billing
  search_invoices: invoices.search_invoices,
  get_invoice_details: invoices.get_invoice_details,
  update_invoice: invoices.update_invoice,
  void_invoice: invoices.void_invoice,
  create_draw_schedule: invoices.create_draw_schedule,
  generate_draw_invoice: invoices.generate_draw_invoice,
  get_draw_schedule: invoices.get_draw_schedule,
  get_ready_draws: invoices.get_ready_draws,
  get_project_billing: invoices.get_project_billing,

  // Change orders
  create_change_order: changeOrders.create_change_order,
  list_change_orders: changeOrders.list_change_orders,
  get_change_order: changeOrders.get_change_order,
  update_change_order: changeOrders.update_change_order,
  send_change_order: changeOrders.send_change_order,
  delete_change_order: changeOrders.delete_change_order,
  pin_fact: pinnedFacts.pin_fact,
  unpin_fact: pinnedFacts.unpin_fact,

  // Workers + supervisors + scheduling + clock
  get_workers: workers.get_workers,
  get_worker_details: workers.get_worker_details,
  get_schedule_events: workers.get_schedule_events,
  get_time_records: workers.get_time_records,
  get_worker_metrics: workers.get_worker_metrics,
  assign_worker: workers.assign_worker,
  assign_supervisor: workers.assign_supervisor,
  unassign_worker: workers.unassign_worker,
  unassign_supervisor: workers.unassign_supervisor,
  create_work_schedule: workers.create_work_schedule,
  create_worker_task: workers.create_worker_task,
  clock_in_worker: workers.clock_in_worker,
  clock_out_worker: workers.clock_out_worker,

  // Expenses + ledger
  get_transactions: expenses.get_transactions,
  record_expense: expenses.record_expense,
  delete_expense: expenses.delete_expense,
  update_expense: expenses.update_expense,

  // Financial reports + bank
  get_financial_overview: financial.get_financial_overview,
  get_bank_transactions: financial.get_bank_transactions,
  assign_bank_transaction: financial.assign_bank_transaction,
  get_reconciliation_summary: financial.get_reconciliation_summary,
  get_ar_aging: financial.get_ar_aging,
  get_tax_summary: financial.get_tax_summary,
  get_payroll_summary: financial.get_payroll_summary,
  get_cash_flow: financial.get_cash_flow,
  get_profit_loss: financial.get_profit_loss,
  get_recurring_expenses: financial.get_recurring_expenses,

  // Service plans + visits + routes + checklist setup
  update_service_pricing: service.update_service_pricing,
  get_service_plans: service.get_service_plans,
  get_daily_route: service.get_daily_route,
  complete_visit: service.complete_visit,
  get_billing_summary: service.get_billing_summary,
  create_service_visit: service.create_service_visit,
  update_service_plan: service.update_service_plan,
  add_service_location: service.add_service_location,
  update_service_location: service.update_service_location,
  assign_worker_to_plan: service.assign_worker_to_plan,
  calculate_service_plan_revenue: service.calculate_service_plan_revenue,
  get_service_plan_details: service.get_service_plan_details,
  get_service_plan_summary: service.get_service_plan_summary,
  delete_service_plan: service.delete_service_plan,
  get_service_plan_documents: service.get_service_plan_documents,
  upload_service_plan_document: service.upload_service_plan_document,
  setup_daily_checklist: service.setup_daily_checklist,

  // Daily reports + photos + checklist reports
  create_daily_report: dailyReports.create_daily_report,
  get_daily_reports: dailyReports.get_daily_reports,
  get_photos: dailyReports.get_photos,
  get_daily_checklist_report: dailyReports.get_daily_checklist_report,
  get_daily_checklist_summary: dailyReports.get_daily_checklist_summary,

  // Documents + signatures + share
  share_document: documents.share_document,
  get_project_documents: documents.get_project_documents,
  get_business_contracts: documents.get_business_contracts,
  upload_project_document: documents.upload_project_document,
  update_project_document: documents.update_project_document,
  delete_project_document: documents.delete_project_document,
  request_signature: documents.request_signature,
  check_signature_status: documents.check_signature_status,
  cancel_signature_request: documents.cancel_signature_request,

  // Briefings + settings + health
  get_business_settings: briefings.get_business_settings,
  get_client_health: briefings.get_client_health,
  get_business_briefing: briefings.get_business_briefing,
  get_daily_briefing: briefings.get_daily_briefing,

  // Intelligent + audit + summary report
  global_search: searchTools.global_search,
  query_event_history: searchTools.query_event_history,
  get_entity_history: searchTools.get_entity_history,
  who_changed: searchTools.who_changed,
  recent_activity: searchTools.recent_activity,
  generate_summary_report: searchTools.generate_summary_report,

  // Subs / engagements / compliance / bidding
  list_subs: subs.list_subs,
  get_sub: subs.get_sub,
  get_sub_compliance: subs.get_sub_compliance,
  list_engagements: subs.list_engagements,
  get_engagement: subs.get_engagement,
  list_expiring_compliance: subs.list_expiring_compliance,
  list_open_bids: subs.list_open_bids,
  list_recent_invoices: subs.list_recent_invoices,
  add_sub_to_project: subs.add_sub_to_project,
  record_compliance_doc: subs.record_compliance_doc,
  record_payment: subs.record_payment,
  request_compliance_doc_from_sub: subs.request_compliance_doc_from_sub,
  request_msa_signature: subs.request_msa_signature,
  send_bid_invitation: subs.send_bid_invitation,
  // Polish
  get_bid_request: subs.get_bid_request,
  accept_bid: subs.accept_bid,
  decline_bid: subs.decline_bid,
  verify_compliance_doc: subs.verify_compliance_doc,
  // v1.5
  create_sub_task: subs.create_sub_task,
  add_project_document: subs.add_project_document,

  // SMS tools — disabled at the product level. Re-enable by uncommenting:
  // list_unread_sms: sms.list_unread_sms,
  // read_sms_thread: sms.read_sms_thread,
  // send_sms: sms.send_sms,
};

/**
 * Execute a tool call and return the result.
 */
async function executeTool(toolName, args, userId) {
  // First check the static (compile-time) handlers map.
  let handler = TOOL_HANDLERS[toolName];

  // P12: fall through to runtime-registered handlers (MCP integrations
  // register theirs via tools/registry.register() at request start).
  // The registry's runtime handler closure already knows how to route
  // to the right adapter + user credential.
  if (!handler) {
    try {
      const registry = require('./registry');
      const runtime = registry.getRuntimeHandler && registry.getRuntimeHandler(toolName);
      if (runtime) handler = runtime;
    } catch (_) { /* ignore; falls to userSafeError below */ }
  }

  if (!handler) {
    logger.error(`Unknown tool: ${toolName}`);
    return userSafeError(null, 'That action isn\'t available right now.');
  }

  try {
    const startTime = Date.now();
    const result = await handler(userId, args);
    const duration = Date.now() - startTime;
    logger.info(`🔧 Tool ${toolName} executed in ${duration}ms`);
    return result;
  } catch (error) {
    return userSafeError(error, 'Something went wrong with that action.', { context: toolName });
  }
}

module.exports = { executeTool, TOOL_HANDLERS, computeDiff };
