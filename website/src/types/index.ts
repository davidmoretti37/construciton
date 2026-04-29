export type UserRole = "owner" | "supervisor" | "worker" | "client";

export interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  business_name?: string;
  role: UserRole;
  owner_id?: string;
  created_at: string;
}

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "unpaid";

export interface SubscriptionState {
  status: SubscriptionStatus;
  plan: "starter" | "pro" | "business" | null;
  trialEndsAt?: string;
  currentPeriodEnd?: string;
}

export interface CanCreateProjectResponse {
  allowed: boolean;
  reason?: string;
}

export interface PresignUploadResponse {
  uploadUrl: string;
  fileKey: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ToastVariant = "info" | "success" | "warning" | "error";

export type DensityMode = "compact" | "comfortable";

export type SortDirection = "asc" | "desc";

export interface SortState<K extends string = string> {
  key: K;
  direction: SortDirection;
}

export type ProjectStatus =
  | "planning"
  | "active"
  | "on_hold"
  | "completed"
  | "cancelled";

export type StatusBadgeVariant =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

export type StatCardColor = "gray" | "green" | "red" | "blue" | "amber";

export interface ProjectTabConfig {
  key: ProjectTabKey;
  label: string;
}

export type ProjectTabKey =
  | "overview"
  | "schedule"
  | "team"
  | "documents"
  | "financials"
  | "photos"
  | "messages"
  | "activity";

export interface BreadcrumbSegment {
  label: string;
  href?: string;
}

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "partial"
  | "paid"
  | "overdue"
  | "void";

export type EstimateStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired"
  | "converted";

export type ContractStatus =
  | "draft"
  | "sent"
  | "signed"
  | "declined"
  | "expired"
  | "void";

export type MoneyDocumentType = "invoice" | "estimate" | "contract";

export type MoneyTabKey =
  | "invoices"
  | "estimates"
  | "contracts"
  | "recurring"
  | "bank"
  | "reconciliation";

export interface MoneyTabConfig {
  key: MoneyTabKey;
  label: string;
  href: string;
}

// --- Money II: Bank, Reconciliation, Subscription ---------------------------

export type BankAccountProvider = "teller" | "plaid";

export type BankTransactionMatchStatus =
  | "unmatched"
  | "matched"
  | "ignored"
  | "split";

export interface BankAccount {
  id: string;
  provider: BankAccountProvider;
  bankName: string;
  accountMask: string;
  balanceCents: number;
  currency: string;
  lastSyncedAt: string | null;
  enrollmentId: string;
}

export interface BankTransaction {
  id: string;
  accountId: string;
  occurredAt: string;
  description: string;
  amountCents: number;
  matchStatus: BankTransactionMatchStatus;
  matchConfidence: number | null;
  matchedProjectId: string | null;
  matchedProjectTransactionId: string | null;
}

export interface BankTransactionListResponse {
  data: BankTransaction[];
  nextCursor: string | null;
}

export interface BankTransactionFilters {
  accountId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  matchStatus?: BankTransactionMatchStatus | null;
  cursor?: string | null;
  limit?: number;
}

export interface ReconciliationSummary {
  unmatchedCount: number;
  unmatchedTotalCents: number;
  matchedTodayCount: number;
  lastSyncedAt: string | null;
}

export interface MatchSuggestion {
  projectId: string;
  projectName: string;
  projectTransactionId?: string | null;
  confidence: number;
  reason?: string | null;
}

export interface TransactionSplitInput {
  projectId: string;
  amountCents: number;
  description: string;
}

export interface BulkUpdateResponse {
  updated: number;
}

export interface TellerConnectSession {
  applicationId: string;
  environment: "sandbox" | "development" | "production";
  products: string[];
  userToken?: string | null;
}

export interface SubscriptionInfo {
  plan: "starter" | "pro" | "business" | null;
  status: SubscriptionStatus | null;
  nextBillAt: string | null;
  amountCents: number | null;
  currency: string | null;
  hasConnectAccount: boolean;
  payoutsEnabled: boolean;
}

export interface PortalSessionResponse {
  url: string;
}

export interface ConnectAccountResponse {
  accountId: string;
}

export interface ConnectOnboardingLinkResponse {
  url: string;
}
