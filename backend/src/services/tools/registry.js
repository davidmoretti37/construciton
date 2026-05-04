/**
 * Foreman tool registry — single source of truth for tool metadata.
 *
 * Every tool has:
 *   - category       — one of CATEGORIES (or `mcp_<provider>` for MCP)
 *   - risk_level     — read | write_safe | write_destructive | external_write
 *   - requires_approval — boolean; the approval gate consults this
 *   - model_tier_required — haiku | sonnet | any
 *   - tags           — free-form descriptors (e.g. 'mutation', 'cascade', 'crosscutting')
 *
 * The metadata lives in a single object so MCP tools can register
 * dynamically without touching the existing `definitions.js` array.
 *
 * **Routing behavior in Phase 1 is unchanged.** `routeByMetadata()` still
 * delegates to the legacy `toolRouter` so that the 10 baseline test
 * prompts produce the exact same tool selection as before. Categories
 * are used by:
 *   - `getToolsByCategory()` — feature flag and admin tooling
 *   - approval gate         — to decide whether to gate
 *   - future hierarchical routing (later phase)
 */

const { CATEGORIES, RISK_LEVELS, MODEL_TIERS, isValidCategory, VALID_RISK_LEVELS, VALID_MODEL_TIERS } = require('./categories');

// ─────────────────────────────────────────────────────────────────
// 1) Tool metadata for every existing Foreman tool.
// ─────────────────────────────────────────────────────────────────
//
// Conventions:
//  - read tools         → no approval, haiku-tier
//  - write_safe tools   → no approval, haiku-tier (planner can promote)
//  - write_destructive  → approval = true (will route through approvalGate)
//  - external_write     → approval = true (network out to a third party)
//
// Adding a new tool: append a row below. Adding a new MCP server: just
// register at runtime via `register({ name, definition, metadata })`.
//
const TOOL_METADATA = Object.freeze({
  // ───── Projects ─────
  search_projects:           { category: CATEGORIES.PROJECTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['crosscutting'] },
  get_project_details:       { category: CATEGORIES.PROJECTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  get_project_summary:       { category: CATEGORIES.PROJECTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  get_project_health:        { category: CATEGORIES.PROJECTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['analytics'] },
  get_project_financials:    { category: CATEGORIES.PROJECTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial'] },
  update_project:            { category: CATEGORIES.PROJECTS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  delete_project:            { category: CATEGORIES.PROJECTS, risk_level: RISK_LEVELS.WRITE_DESTRUCTIVE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'cascade'] },
  create_project_phase:      { category: CATEGORIES.PROJECTS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  update_phase_progress:     { category: CATEGORIES.PROJECTS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  update_phase_budget:       { category: CATEGORIES.PROJECTS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  add_project_checklist:     { category: CATEGORIES.PROJECTS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  generate_summary_report:   { category: CATEGORIES.PROJECTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['analytics'] },

  // ───── Estimates ─────
  search_estimates:          { category: CATEGORIES.ESTIMATES, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  get_estimate_details:      { category: CATEGORIES.ESTIMATES, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  update_estimate:           { category: CATEGORIES.ESTIMATES, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  suggest_pricing:           { category: CATEGORIES.ESTIMATES, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['analytics'] },
  convert_estimate_to_invoice: { category: CATEGORIES.ESTIMATES, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'crosscutting'] },

  // ───── Invoices ─────
  search_invoices:           { category: CATEGORIES.INVOICES, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  get_invoice_details:       { category: CATEGORIES.INVOICES, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  update_invoice:            { category: CATEGORIES.INVOICES, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  void_invoice:              { category: CATEGORIES.INVOICES, risk_level: RISK_LEVELS.WRITE_DESTRUCTIVE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },

  // ───── Change orders ─────
  create_change_order:       { category: CATEGORIES.CHANGE_ORDERS, risk_level: RISK_LEVELS.WRITE_SAFE,        requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'financial'] },
  list_change_orders:        { category: CATEGORIES.CHANGE_ORDERS, risk_level: RISK_LEVELS.READ,              requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  get_change_order:          { category: CATEGORIES.CHANGE_ORDERS, risk_level: RISK_LEVELS.READ,              requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  update_change_order:       { category: CATEGORIES.CHANGE_ORDERS, risk_level: RISK_LEVELS.WRITE_SAFE,        requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'financial'] },
  send_change_order:         { category: CATEGORIES.CHANGE_ORDERS, risk_level: RISK_LEVELS.EXTERNAL_WRITE,    requires_approval: true,  model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'external', 'email'] },
  delete_change_order:       { category: CATEGORIES.CHANGE_ORDERS, risk_level: RISK_LEVELS.WRITE_DESTRUCTIVE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'financial'] },

  // ───── Onboarding imports (QBO / Monday / CSV) ─────
  qbo_onboarding_summary:    { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.READ,        requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['onboarding', 'qbo'] },
  import_qbo_clients:        { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.WRITE_SAFE,  requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'onboarding', 'qbo'] },
  import_qbo_subcontractors: { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.WRITE_SAFE,  requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'onboarding', 'qbo'] },
  import_qbo_employees:      { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.WRITE_SAFE,  requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'onboarding', 'qbo'] },
  import_qbo_service_catalog:{ category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.WRITE_SAFE,  requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'onboarding', 'qbo'] },
  import_qbo_projects:       { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.WRITE_SAFE,  requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'onboarding', 'qbo'] },
  import_qbo_invoice_history:{ category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.WRITE_SAFE,  requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'onboarding', 'qbo'] },
  import_qbo_expense_history:{ category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.WRITE_SAFE,  requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'onboarding', 'qbo'] },
  preview_monday_board:      { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.READ,        requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['onboarding', 'monday'] },
  import_monday_projects:    { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.WRITE_SAFE,  requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'onboarding', 'monday'] },
  csv_preview:               { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.READ,        requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['onboarding', 'csv'] },
  csv_import:                { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.WRITE_SAFE,  requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'onboarding', 'csv'] },
  // Mirror to QBO (external_write — leaves a record in the customer's accounting system; needs approval)
  mirror_client_to_qbo:      { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.EXTERNAL_WRITE, requires_approval: true,  model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'qbo', 'mirror'] },
  mirror_invoice_to_qbo:     { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.EXTERNAL_WRITE, requires_approval: true,  model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'qbo', 'mirror', 'financial'] },
  mirror_expense_to_qbo:     { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.EXTERNAL_WRITE, requires_approval: true,  model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'qbo', 'mirror', 'financial'] },
  mirror_estimate_to_qbo:    { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.EXTERNAL_WRITE, requires_approval: true,  model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'qbo', 'mirror', 'financial'] },
  list_import_conflicts:     { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.READ,           requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['onboarding', 'merge'] },
  resolve_import_conflict:   { category: CATEGORIES.IMPORTS, risk_level: RISK_LEVELS.WRITE_SAFE,     requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'merge'] },

  // ───── Draws (progress billing) ─────
  create_draw_schedule:      { category: CATEGORIES.DRAWS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'financial'] },
  generate_draw_invoice:     { category: CATEGORIES.DRAWS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'financial', 'crosscutting'] },
  get_draw_schedule:         { category: CATEGORIES.DRAWS, risk_level: RISK_LEVELS.READ,        requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial'] },
  get_ready_draws:           { category: CATEGORIES.DRAWS, risk_level: RISK_LEVELS.READ,        requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial', 'briefing'] },
  get_project_billing:       { category: CATEGORIES.DRAWS, risk_level: RISK_LEVELS.READ,        requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial', 'briefing'] },

  // ───── Expenses (transactional) ─────
  record_expense:            { category: CATEGORIES.EXPENSES, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  update_expense:            { category: CATEGORIES.EXPENSES, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  delete_expense:            { category: CATEGORIES.EXPENSES, risk_level: RISK_LEVELS.WRITE_DESTRUCTIVE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },

  // ───── Transactions / overviews ─────
  get_transactions:          { category: CATEGORIES.TRANSACTIONS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial'] },
  get_financial_overview:    { category: CATEGORIES.TRANSACTIONS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial', 'analytics'] },

  // ───── Financial reports ─────
  get_ar_aging:              { category: CATEGORIES.FINANCIAL_REPORTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial', 'analytics'] },
  get_tax_summary:           { category: CATEGORIES.FINANCIAL_REPORTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial', 'analytics'] },
  get_payroll_summary:       { category: CATEGORIES.FINANCIAL_REPORTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial', 'analytics'] },
  get_cash_flow:             { category: CATEGORIES.FINANCIAL_REPORTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial', 'analytics'] },
  get_recurring_expenses:    { category: CATEGORIES.FINANCIAL_REPORTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial'] },
  get_profit_loss:           { category: CATEGORIES.FINANCIAL_REPORTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial', 'analytics'] },
  get_business_briefing:     { category: CATEGORIES.BRIEFING, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['analytics', 'crosscutting'] },
  get_client_health:         { category: CATEGORIES.FINANCIAL_REPORTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['analytics'] },

  // ───── Bank ─────
  get_bank_transactions:     { category: CATEGORIES.BANK, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial'] },
  assign_bank_transaction:   { category: CATEGORIES.BANK, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'financial'] },
  get_reconciliation_summary:{ category: CATEGORIES.BANK, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial', 'analytics'] },

  // ───── Workers / scheduling ─────
  get_workers:               { category: CATEGORIES.WORKERS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  get_worker_details:        { category: CATEGORIES.WORKERS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  get_worker_metrics:        { category: CATEGORIES.WORKERS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['analytics'] },
  assign_worker:             { category: CATEGORIES.WORKERS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  unassign_worker:           { category: CATEGORIES.WORKERS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  assign_supervisor:         { category: CATEGORIES.WORKERS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  unassign_supervisor:       { category: CATEGORIES.WORKERS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  assign_worker_to_plan:     { category: CATEGORIES.WORKERS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'crosscutting'] },
  get_time_records:          { category: CATEGORIES.WORKERS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  create_work_schedule:      { category: CATEGORIES.SCHEDULING, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  create_worker_task:        { category: CATEGORIES.SCHEDULING, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  get_schedule_events:       { category: CATEGORIES.SCHEDULING, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  clock_in_worker:           { category: CATEGORIES.WORKERS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  clock_out_worker:          { category: CATEGORIES.WORKERS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },

  // ───── Service plans / routes / visits ─────
  get_service_plans:         { category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  get_service_plan_details:  { category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  get_service_plan_summary:  { category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  get_service_plan_documents:{ category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  update_service_plan:       { category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  delete_service_plan:       { category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.WRITE_DESTRUCTIVE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'cascade'] },
  create_service_visit:      { category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  complete_visit:            { category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  get_billing_summary:       { category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial'] },
  get_daily_route:           { category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  add_service_location:      { category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  update_service_location:   { category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  calculate_service_plan_revenue: { category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['financial', 'analytics'] },
  update_service_pricing:    { category: CATEGORIES.SETTINGS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  upload_service_plan_document: { category: CATEGORIES.SERVICE_PLANS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },

  // ───── Documents / signatures ─────
  get_project_documents:     { category: CATEGORIES.DOCUMENTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  upload_project_document:   { category: CATEGORIES.DOCUMENTS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  update_project_document:   { category: CATEGORIES.DOCUMENTS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  delete_project_document:   { category: CATEGORIES.DOCUMENTS, risk_level: RISK_LEVELS.WRITE_DESTRUCTIVE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  get_business_contracts:    { category: CATEGORIES.DOCUMENTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  request_signature:         { category: CATEGORIES.DOCUMENTS, risk_level: RISK_LEVELS.EXTERNAL_WRITE, requires_approval: true, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'external'] },
  check_signature_status:    { category: CATEGORIES.DOCUMENTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  cancel_signature_request:  { category: CATEGORIES.DOCUMENTS, risk_level: RISK_LEVELS.WRITE_DESTRUCTIVE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  share_document:            { category: CATEGORIES.DOCUMENTS, risk_level: RISK_LEVELS.EXTERNAL_WRITE, requires_approval: true, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'external', 'communication'] },

  // ───── Reports / photos / checklists ─────
  get_daily_reports:         { category: CATEGORIES.REPORTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  create_daily_report:       { category: CATEGORIES.REPORTS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  get_photos:                { category: CATEGORIES.REPORTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  setup_daily_checklist:     { category: CATEGORIES.REPORTS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation'] },
  get_daily_checklist_report:{ category: CATEGORIES.REPORTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  get_daily_checklist_summary:{ category: CATEGORIES.REPORTS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['analytics'] },

  // ───── SMS ───── disabled at the product level for now; restore
  // alongside the matching entries in definitions.js + handlers.js.
  // send_sms:        { category: CATEGORIES.SMS, risk_level: RISK_LEVELS.EXTERNAL_WRITE, requires_approval: true, model_tier_required: MODEL_TIERS.ANY, tags: ['mutation', 'external', 'communication'] },
  // read_sms_thread: { category: CATEGORIES.SMS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },
  // list_unread_sms: { category: CATEGORIES.SMS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },

  // ───── Settings ─────
  get_business_settings:     { category: CATEGORIES.SETTINGS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: [] },

  // ───── Search / audit / cross-cutting ─────
  global_search:             { category: CATEGORIES.SEARCH, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['crosscutting'] },
  query_event_history:       { category: CATEGORIES.SEARCH, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['audit'] },
  get_entity_history:        { category: CATEGORIES.SEARCH, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['audit'] },
  recent_activity:           { category: CATEGORIES.SEARCH, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['audit'] },
  who_changed:               { category: CATEGORIES.SEARCH, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['audit'] },

  // ───── Briefing ─────
  get_daily_briefing:        { category: CATEGORIES.BRIEFING, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['analytics', 'crosscutting'] },

  // ───── Memory ─────
  // The memory tool is added at runtime in agentService; metadata is here so
  // the registry knows about it.
  memory:                    { category: CATEGORIES.MEMORY, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['system'] },
  pin_fact:                  { category: CATEGORIES.MEMORY, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['system', 'state'] },
  unpin_fact:                { category: CATEGORIES.MEMORY, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['system', 'state'] },

  // ───── Sub-agent dispatch (P5) ─────
  // dispatch_subagent is itself a tool — the orchestrator calls it to
  // delegate to a specialist. The specialist's own tool calls are gated
  // separately by the runner's risk_level allow list.
  dispatch_subagent:         { category: CATEGORIES.MEMORY, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.SONNET, tags: ['system', 'orchestration'] },

  // ───── Skills (P6) ─────
  // invoke_skill is the orchestration tool that runs a named recipe.
  // Gates are applied to the underlying sub-agent's calls, not here.
  invoke_skill:              { category: CATEGORIES.MEMORY, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['system', 'orchestration', 'skill'] },

  // ───── Subcontractors ─────
  list_subs:                       { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['subs'] },
  get_sub:                         { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['subs'] },
  get_sub_compliance:              { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['subs', 'compliance'] },
  list_engagements:                { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['subs'] },
  get_engagement:                  { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['subs'] },
  list_expiring_compliance:        { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['subs', 'compliance', 'briefing'] },
  list_open_bids:                  { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['subs', 'bidding'] },
  list_recent_invoices:            { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['subs', 'financial'] },

  add_sub_to_project:              { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.HAIKU, tags: ['subs', 'mutation'] },
  record_compliance_doc:           { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.HAIKU, tags: ['subs', 'compliance', 'mutation'] },
  record_payment:                  { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.HAIKU, tags: ['subs', 'financial', 'mutation'] },

  request_compliance_doc_from_sub: { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.EXTERNAL_WRITE, requires_approval: true, model_tier_required: MODEL_TIERS.HAIKU, tags: ['subs', 'communication', 'external'] },
  request_msa_signature:           { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.EXTERNAL_WRITE, requires_approval: true, model_tier_required: MODEL_TIERS.HAIKU, tags: ['subs', 'communication', 'external', 'esign'] },
  send_bid_invitation:             { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.EXTERNAL_WRITE, requires_approval: true, model_tier_required: MODEL_TIERS.HAIKU, tags: ['subs', 'communication', 'external', 'bidding'] },
  get_bid_request:                 { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['subs', 'bidding'] },
  accept_bid:                      { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.EXTERNAL_WRITE, requires_approval: true, model_tier_required: MODEL_TIERS.ANY, tags: ['subs', 'bidding', 'mutation', 'external'] },
  decline_bid:                     { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['subs', 'bidding', 'mutation'] },
  verify_compliance_doc:           { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['subs', 'compliance', 'mutation'] },
  create_sub_task:                 { category: CATEGORIES.SUBS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['subs', 'mutation', 'tasks'] },
  add_project_document:            { category: CATEGORIES.PROJECTS, risk_level: RISK_LEVELS.WRITE_SAFE, requires_approval: false, model_tier_required: MODEL_TIERS.ANY, tags: ['projects', 'mutation', 'documents'] },
});

// ─────────────────────────────────────────────────────────────────
// 2) Runtime registry — backs `register()` for MCP / late-bound tools.
// ─────────────────────────────────────────────────────────────────
const _runtimeMetadata = new Map(); // name → metadata
const _runtimeDefinitions = new Map(); // name → tool definition (for MCP)
const _runtimeHandlers = new Map(); // name → async handler (for MCP)

/**
 * Register an MCP / runtime tool. Idempotent.
 * @param {Object} args
 * @param {string} args.name
 * @param {Object} args.definition  OpenAI-style tool definition
 * @param {Function} args.handler   async (userId, args) => result
 * @param {Object} args.metadata    { category, risk_level, requires_approval, model_tier_required, tags }
 */
function register({ name, definition, handler, metadata }) {
  if (!name) throw new Error('register: name required');
  if (!metadata) throw new Error(`register(${name}): metadata required`);
  validateMetadata(name, metadata);
  _runtimeMetadata.set(name, Object.freeze({ ...metadata }));
  if (definition) _runtimeDefinitions.set(name, definition);
  if (handler) _runtimeHandlers.set(name, handler);
}

function validateMetadata(name, m) {
  if (!isValidCategory(m.category)) {
    throw new Error(`register(${name}): invalid category "${m.category}"`);
  }
  if (!VALID_RISK_LEVELS.has(m.risk_level)) {
    throw new Error(`register(${name}): invalid risk_level "${m.risk_level}"`);
  }
  if (typeof m.requires_approval !== 'boolean') {
    throw new Error(`register(${name}): requires_approval must be boolean`);
  }
  if (!VALID_MODEL_TIERS.has(m.model_tier_required)) {
    throw new Error(`register(${name}): invalid model_tier_required "${m.model_tier_required}"`);
  }
}

// ─────────────────────────────────────────────────────────────────
// 3) Lookup API
// ─────────────────────────────────────────────────────────────────

/** Returns metadata for a tool name, or null. Checks runtime first then static. */
function getMetadata(name) {
  if (_runtimeMetadata.has(name)) return _runtimeMetadata.get(name);
  return TOOL_METADATA[name] || null;
}

/** Convenience: does this tool need approval? */
function requiresApproval(name) {
  const m = getMetadata(name);
  return !!(m && m.requires_approval);
}

/** Convenience: is this tool destructive (irreversible inside our system)? */
function isDestructive(name) {
  const m = getMetadata(name);
  return !!(m && m.risk_level === RISK_LEVELS.WRITE_DESTRUCTIVE);
}

/** Convenience: is this tool an external write (network out to a third party)? */
function isExternalWrite(name) {
  const m = getMetadata(name);
  return !!(m && m.risk_level === RISK_LEVELS.EXTERNAL_WRITE);
}

/** Convenience: is this tool read-only? */
function isReadOnly(name) {
  const m = getMetadata(name);
  return !!(m && m.risk_level === RISK_LEVELS.READ);
}

/** All registered names (static + runtime). */
function listAll() {
  return Array.from(new Set([
    ...Object.keys(TOOL_METADATA),
    ..._runtimeMetadata.keys(),
  ]));
}

/** Tools matching a category (or array of categories). Returns array of names. */
function getToolsByCategory(categoryOrArray) {
  const cats = Array.isArray(categoryOrArray) ? categoryOrArray : [categoryOrArray];
  const out = [];
  for (const name of listAll()) {
    const m = getMetadata(name);
    if (m && cats.includes(m.category)) out.push(name);
  }
  return out;
}

/** Tools matching any of the given tags. Returns array of names. */
function getToolsByTag(tag) {
  const out = [];
  for (const name of listAll()) {
    const m = getMetadata(name);
    if (m && Array.isArray(m.tags) && m.tags.includes(tag)) out.push(name);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// 4) Routing — Phase 1 wraps the legacy router for behavior parity.
// ─────────────────────────────────────────────────────────────────
//
// `routeByMetadata(userMessage, allTools, hints)` exists so callers can
// migrate to a single API. Today it delegates to `toolRouter.routeToolsAsync`
// which scores intent via Ollama+regex against `TOOL_GROUPS` (a flat
// hand-curated list per intent). A later phase will replace that with
// pure metadata-driven category routing once we confirm the category
// taxonomy maps cleanly to real traffic.
//
async function routeByMetadata(userMessage, allTools, hints = {}) {
  // Lazy require to avoid circular deps: agentService requires this module,
  // and toolRouter requires logger which is fine — but be defensive.
  const { routeToolsAsync } = require('../toolRouter');
  return routeToolsAsync(userMessage, allTools, hints);
}

// ─────────────────────────────────────────────────────────────────
// 5) Diagnostics for tests + readiness probe
// ─────────────────────────────────────────────────────────────────

/** Returns a summary suitable for logs / readiness checks. */
function summary() {
  const all = listAll();
  const byCategory = {};
  const byRiskLevel = {};
  for (const name of all) {
    const m = getMetadata(name);
    if (!m) continue;
    byCategory[m.category] = (byCategory[m.category] || 0) + 1;
    byRiskLevel[m.risk_level] = (byRiskLevel[m.risk_level] || 0) + 1;
  }
  return {
    total: all.length,
    static: Object.keys(TOOL_METADATA).length,
    runtime: _runtimeMetadata.size,
    byCategory,
    byRiskLevel,
  };
}

/** Returns a runtime-registered handler closure (or undefined). Used by
 *  executeTool() so MCP-registered tools dispatch through the same path
 *  as built-in tools. */
function getRuntimeHandler(name) {
  return _runtimeHandlers.get(name);
}

module.exports = {
  // Metadata
  TOOL_METADATA,
  getMetadata,
  requiresApproval,
  isDestructive,
  isExternalWrite,
  isReadOnly,

  // Registration (for MCP + tests)
  register,
  validateMetadata,
  getRuntimeHandler,

  // Lookups
  listAll,
  getToolsByCategory,
  getToolsByTag,

  // Routing
  routeByMetadata,

  // Diagnostics
  summary,
};
