export const SITE = {
  name: 'Sylk',
  domain: 'sylkapp.ai',
  tagline: 'Run Your Business Smarter',
  description:
    'The AI-powered platform that helps service businesses create estimates, manage projects, and grow revenue.',
  url: 'https://sylkapp.ai',
  privacyUrl: 'https://construciton-production.up.railway.app/privacy',
  termsUrl: 'https://construciton-production.up.railway.app/terms',
} as const;

export const NAV_LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
] as const;

export const STATS = [
  { label: 'Service Professionals', value: 500, suffix: '+' },
  { label: 'AI Tools', value: 60, suffix: '+' },
  { label: 'App Rating', value: 4.9, suffix: '', decimals: 1 },
  { label: 'Months to Build', value: 5, suffix: '' },
] as const;

export const INDUSTRIES = [
  'General Contracting',
  'Remodeling',
  'Roofing',
  'HVAC',
  'Plumbing',
  'Electrical',
  'Landscaping',
  'Painting',
  'Fiber Optic',
  'Cleaning',
  'Pool Service',
  'Flooring',
] as const;

export const TEAM_FEATURES = [
  {
    role: 'Owner',
    color: 'blue',
    description: 'Full business visibility',
    capabilities: [
      'Create projects, estimates, and invoices',
      'View all financials and bank reconciliation',
      'Manage workers, supervisors, and pricing',
      'See every daily report and time entry',
    ],
  },
  {
    role: 'Supervisor',
    color: 'violet',
    description: 'Site-level management',
    capabilities: [
      'Manage assigned projects and workers',
      'Submit supervisor-level daily reports',
      'Clock in/out with GPS verification',
      'Assign and track tasks on their sites',
    ],
  },
  {
    role: 'Worker',
    color: 'emerald',
    description: 'Simple, focused workflow',
    capabilities: [
      'Clock in/out with one tap',
      'Submit daily reports with photos',
      'View assigned tasks and schedule',
      'Track their own hours and expenses',
    ],
  },
] as const;

export const TESTIMONIALS = [
  {
    quote:
      "This app saved me 10+ hours every week on estimates alone. I used to spend 3 hours on each quote — now it's 5 minutes.",
    author: 'Mike Rodriguez',
    role: 'General Contractor, Austin TX',
    rating: 5,
    metric: '10+ hrs saved/week',
  },
  {
    quote:
      'Finally, an app that understands construction workflows. My team actually uses it!',
    author: 'Sarah Thompson',
    role: 'Remodeling Specialist, Denver',
    rating: 5,
    metric: '3x team adoption',
  },
  {
    quote:
      "The AI estimates are surprisingly accurate. It's like having a senior estimator on staff 24/7.",
    author: 'Carlos Martinez',
    role: 'Roofing Contractor, Miami',
    rating: 5,
    metric: '24/7 AI estimator',
  },
] as const;

import type {
  BankTransactionMatchStatus,
  ContractStatus,
  EstimateStatus,
  InvoiceStatus,
  MoneyTabConfig,
  ProjectStatus,
  ProjectTabConfig,
  StatusBadgeVariant,
} from "@/types";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PROJECT_STATUS_VARIANT: Record<ProjectStatus, StatusBadgeVariant> = {
  planning: "info",
  active: "success",
  on_hold: "warning",
  completed: "neutral",
  cancelled: "danger",
};

export const PROJECT_TABS: readonly ProjectTabConfig[] = [
  { key: "overview", label: "Overview" },
  { key: "schedule", label: "Schedule" },
  { key: "team", label: "Team" },
  { key: "documents", label: "Documents" },
  { key: "financials", label: "Financials" },
  { key: "photos", label: "Photos" },
  { key: "messages", label: "Messages" },
  { key: "activity", label: "Activity" },
] as const;

export const SEARCH_DEBOUNCE_MS = 250;

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  partial: "Partial",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

export const INVOICE_STATUS_VARIANT: Record<InvoiceStatus, StatusBadgeVariant> = {
  draft: "neutral",
  sent: "info",
  viewed: "info",
  partial: "warning",
  paid: "success",
  overdue: "danger",
  void: "neutral",
};

export const ESTIMATE_STATUS_LABEL: Record<EstimateStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  converted: "Converted",
};

export const ESTIMATE_STATUS_VARIANT: Record<EstimateStatus, StatusBadgeVariant> = {
  draft: "neutral",
  sent: "info",
  viewed: "info",
  accepted: "success",
  declined: "danger",
  expired: "warning",
  converted: "accent",
};

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  signed: "Signed",
  declined: "Declined",
  expired: "Expired",
  void: "Void",
};

export const CONTRACT_STATUS_VARIANT: Record<ContractStatus, StatusBadgeVariant> = {
  draft: "neutral",
  sent: "info",
  signed: "success",
  declined: "danger",
  expired: "warning",
  void: "neutral",
};

// Append-only — DO NOT reorder. Active-tab highlighting in MoneyShell relies
// on insertion order matching what was shipped in earlier segments.
export const MONEY_TABS: readonly MoneyTabConfig[] = [
  { key: "invoices", label: "Invoices", href: "/app/money/invoices" },
  { key: "estimates", label: "Estimates", href: "/app/money/estimates" },
  { key: "contracts", label: "Contracts", href: "/app/money/contracts" },
  { key: "recurring", label: "Recurring", href: "/app/money/recurring" },
  { key: "bank", label: "Bank", href: "/app/money/bank" },
  { key: "reconciliation", label: "Reconciliation", href: "/app/money/reconciliation" },
] as const;

export const ESIGN_DEFAULT_EXPIRY_DAYS = 14;

// Match confidence thresholds drive MatchPill tinting (SPEC.md §5).
export const MATCH_CONFIDENCE_HIGH = 0.85;
export const MATCH_CONFIDENCE_MID = 0.5;

export const MATCH_STATUS_LABEL: Record<BankTransactionMatchStatus, string> = {
  unmatched: "Unmatched",
  matched: "Matched",
  ignored: "Ignored",
  split: "Split",
};

export const MATCH_STATUS_VARIANT: Record<BankTransactionMatchStatus, StatusBadgeVariant> = {
  unmatched: "neutral",
  matched: "success",
  ignored: "danger",
  split: "info",
};

// Default page size for /api/teller/transactions (SPEC.md §4).
export const RECONCILIATION_PAGE_SIZE = 50;

// Bulk-action ceiling — keeps a single Idempotency-Key request under the
// Railway proxy body limit and avoids long-running server transactions.
export const RECONCILIATION_BULK_LIMIT = 100;

// Subscription redirect target — referenced by SubscriptionGate's early-return.
export const SUBSCRIPTION_PATH = "/app/settings/subscription";

export const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 49,
    description: 'Solo operators',
    benefits: [
      '3 active projects',
      'AI estimates (20/mo)',
      'Invoice creation & tracking',
      'Time clock for your crew',
      'Email support',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 79,
    description: 'Growing teams',
    isBest: true,
    benefits: [
      '10 active projects',
      'Unlimited AI estimates',
      'Team management (all roles)',
      'Financial tracking & reports',
      'Bank account connection',
      'Priority support',
    ],
  },
  {
    id: 'business',
    name: 'Business',
    price: 149,
    description: 'Large companies',
    benefits: [
      'Unlimited projects',
      'Unlimited AI estimates',
      'Unlimited team members',
      'Advanced analytics & reports',
      'AR aging & payroll tracking',
      'Phone support',
    ],
  },
] as const;

