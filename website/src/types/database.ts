/**
 * Database row types for the Owner Cockpit.
 *
 * No tables are created by this codebase — every shape below maps to an
 * existing Supabase table. Tables in {@link UNVERIFIED_TABLES} are not
 * guaranteed to exist in every deployment; readers must wrap queries with
 * `safe()` so missing tables degrade to an empty fallback (see SPEC.md §3).
 *
 * Run `npm run probe:tables` to confirm which unverified tables are present
 * for the active Supabase project before relying on them. Run the helper
 * `scripts/probe-columns.ts` to confirm individual columns are present on
 * tables that exist but ship with a partial schema.
 *
 * --- Probe snapshot (target: dmhpzutqzqerfprstioc.supabase.co) ---
 *
 * Tables present:  projects, project_phases, workers, project_documents,
 *                  daily_reports, invoices, estimates, project_transactions,
 *                  time_tracking, service_visits, approval_events,
 *                  project_assignments, project_clients, clients, signatures,
 *                  contracts, contract_templates, contract_documents.
 * Tables absent:   project_workers (verified-list miss — segment owns the
 *                  fallback), payment_events.
 *
 * Money-workflow column gaps observed in this snapshot. Interfaces below mark
 * these optional so consumers compile against the future shape; runtime reads
 * must still tolerate `undefined`:
 *   - invoices: client_id, issued_at, paid_at, line_items
 *   - estimates: client_id, line_items
 *   - signatures: token, expires_at, signature_png_url
 *     (user_id IS present — required for the realtime channel filter)
 *   - contracts: client_id, title, template_id, document_id, body
 *   - contract_templates: body_markdown
 *   - contract_documents: contract_id, mime_type
 *
 * Cents-vs-dollars convention for invoices/estimates totals could not be
 * determined from probe (tables empty). Treat numeric `total` / `amount_paid`
 * as the unit returned by Supabase — cockpit currency formatting must
 * normalize at the read site once a sample row exists.
 *
 * `line_items` is neither a column nor a join table in this snapshot
 * (`invoice_line_items`, `estimate_line_items`, `line_items` all 404).
 * `DbInvoiceLineItem` describes the eventual jsonb shape; reads must use
 * `safe()` and accept an empty array fallback today.
 */

// --- Verified tables ---------------------------------------------------------

export interface DbProject {
  id: string;
  name: string;
  status: string;
  contract_amount: number;
  income_collected: number;
  expenses: number;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  actual_progress: number | null;
  task_description: string | null;
  user_id: string;
  assigned_supervisor_id: string | null;
  assignment_status: string | null;
  days_remaining: number | null;
  working_days: number | null;
  created_at: string;
}

export interface DbProjectPhase {
  id: string;
  project_id: string;
  name: string;
  order_index: number;
  status: string;
  completion_percentage: number;
  planned_days: number | null;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  tasks: DbPhaseTask[] | null;
}

export interface DbPhaseTask {
  id?: string;
  title: string;
  status?: string;
  assignee_id?: string | null;
  due_date?: string | null;
}

export interface DbProjectWorker {
  project_id: string;
  worker_id: string;
}

export interface DbWorker {
  id: string;
  owner_id: string;
  full_name: string;
  trade: string | null;
  phone: string | null;
}

export interface DbProjectDocument {
  id: string;
  project_id: string;
  file_name: string;
  file_type: string;
  file_url?: string | null;
  visible_to_workers: boolean;
  created_at: string;
}

export interface DbDailyReport {
  id: string;
  project_id: string;
  report_date: string;
  reporter_type: string;
  photos: string[] | null;
  tags: string[] | null;
  workers?: { full_name: string } | null;
}

export interface DbInvoiceLineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount?: number;
}

export interface DbInvoice {
  id: string;
  user_id: string;
  project_id?: string | null;
  client_id?: string | null;
  invoice_number?: string | null;
  total: number;
  amount_paid: number;
  status: string;
  issued_at?: string | null;
  due_date: string | null;
  paid_at?: string | null;
  line_items?: DbInvoiceLineItem[] | null;
  created_at?: string;
}

export interface DbEstimate {
  id: string;
  user_id: string;
  project_id: string | null;
  client_id?: string | null;
  estimate_number: string;
  status: string;
  total: number;
  line_items?: DbInvoiceLineItem[] | null;
  created_at: string;
}

// --- Unverified tables (probe before use) ------------------------------------

export type DbBankAccountProvider = "teller" | "plaid";

export interface DbConnectedBankAccount {
  id: string;
  user_id: string;
  provider: DbBankAccountProvider;
  bank_name: string;
  account_mask: string;
  balance_cents: number;
  currency: string;
  last_synced_at: string | null;
  enrollment_id: string;
  created_at: string;
}

export type DbBankTransactionMatchStatus =
  | "unmatched"
  | "matched"
  | "ignored"
  | "split";

export interface DbBankTransaction {
  id: string;
  user_id: string;
  account_id: string;
  occurred_at: string;
  description: string;
  amount_cents: number;
  match_status: DbBankTransactionMatchStatus;
  match_confidence: number | null;
  matched_project_id: string | null;
  matched_project_transaction_id: string | null;
  created_at: string;
}

export interface DbProjectTransaction {
  id: string;
  project_id: string;
  user_id: string;
  amount: number;
  direction: "in" | "out";
  occurred_at: string;
  description: string | null;
  created_at: string;
}

export interface DbTimeTrackingEntry {
  id: string;
  worker_id: string;
  project_id: string | null;
  clocked_in_at: string;
  clocked_out_at: string | null;
}

export interface DbServiceVisit {
  id: string;
  service_plan_id: string;
  scheduled_for: string;
  status: string;
  location: string | null;
}

export interface DbApprovalEvent {
  id: string;
  user_id: string;
  project_id: string | null;
  kind: string;
  status: string;
  created_at: string;
}

export interface DbProjectAssignment {
  project_id: string;
  worker_id: string;
  role: string | null;
  assigned_at: string;
}

export interface DbProjectClient {
  id: string;
  project_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
}

export interface DbClient {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  created_at?: string;
}

export interface DbPaymentEvent {
  id: string;
  invoice_id: string;
  amount: number;
  kind: "payment" | "refund" | "adjustment";
  occurred_at: string;
  note: string | null;
  created_at: string;
}

export type DbSignatureDocumentType = "invoice" | "estimate" | "contract";
export type DbSignatureStatus = "pending" | "signed" | "declined" | "expired";

export interface DbSignature {
  id: string;
  document_id: string;
  document_type: DbSignatureDocumentType;
  status: DbSignatureStatus;
  signer_email: string;
  signer_name: string | null;
  // token / expires_at / signature_png_url were absent in the probe snapshot —
  // optional until the e-sign migration lands.
  token?: string | null;
  expires_at?: string | null;
  signed_at: string | null;
  signature_png_url?: string | null;
  user_id?: string | null;
  created_at?: string;
}

export interface DbContract {
  id: string;
  user_id: string;
  project_id?: string | null;
  // client_id / title / template_id / document_id / body were absent in the
  // probe snapshot — optional until the contracts migration lands.
  client_id?: string | null;
  title?: string | null;
  status: string;
  template_id?: string | null;
  document_id?: string | null;
  body?: string | null;
  created_at: string;
}

export interface DbContractTemplate {
  id: string;
  user_id: string;
  name: string;
  // body_markdown absent in probe snapshot — optional until migration lands.
  body_markdown?: string | null;
  created_at: string;
}

export interface DbContractDocument {
  id: string;
  // contract_id / mime_type absent in probe snapshot — optional until migration
  // lands. Without contract_id, documents cannot be filtered to a contract;
  // callers must safe()-wrap and degrade to EmptyState.
  contract_id?: string | null;
  file_url: string;
  file_name: string;
  mime_type?: string | null;
  created_at: string;
}

// --- Probe surface -----------------------------------------------------------

/**
 * Tables whose existence varies by Supabase deployment. Every read against
 * these names MUST go through `safe()` with an empty fallback so absence
 * surfaces as EmptyState / `—` instead of a thrown error.
 */
export const UNVERIFIED_TABLES = [
  "project_transactions",
  "time_tracking",
  "service_visits",
  "approval_events",
  "project_assignments",
  "project_clients",
  "clients",
  "payment_events",
  "signatures",
  "contracts",
  "contract_templates",
  "contract_documents",
  "connected_bank_accounts",
  "bank_transactions",
] as const;

export type UnverifiedTable = (typeof UNVERIFIED_TABLES)[number];

/**
 * Tables the cockpit reads/writes that are confirmed present in CONTEXT.
 * Probed alongside the unverified set so the probe report stays a single
 * source of truth across environments.
 */
export const VERIFIED_TABLES = [
  "projects",
  "project_phases",
  "project_workers",
  "workers",
  "project_documents",
  "daily_reports",
  "invoices",
  "estimates",
] as const;

export type VerifiedTable = (typeof VERIFIED_TABLES)[number];

export interface TableProbeResult {
  table: string;
  exists: boolean;
  rowCount: number | null;
  error: string | null;
}
