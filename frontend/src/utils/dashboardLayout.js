import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'owner_dashboard_layout_v1';

export const WIDGET_DEFINITIONS = [
  { id: 'pnl',              label: 'P&L Summary',      description: 'Revenue, expenses, and profit',          defaultSize: 'large',  availableSizes: ['large'] },
  { id: 'cashflow',         label: 'Cash Flow',         description: '3-month cash in vs out chart',           defaultSize: 'large',  availableSizes: ['large'] },
  { id: 'alerts',           label: 'Needs Attention',   description: 'Alerts and items needing action',        defaultSize: 'medium', availableSizes: ['medium'] },
  { id: 'active_projects',  label: 'Active Projects',   description: 'Top projects with progress at a glance',  defaultSize: 'medium', availableSizes: ['small', 'medium', 'large'] },
  { id: 'workers',          label: 'Workers',           description: 'Workers on your team & on-site now',     defaultSize: 'medium', availableSizes: ['small', 'medium', 'large'] },
  { id: 'supervisors',      label: 'Supervisors',       description: 'Total supervisors on your account',      defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  { id: 'transactions',     label: 'Transactions',      description: 'Total recorded transactions',            defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  // Lightweight stat widgets (use existing data)
  { id: 'overdue_invoices',    label: 'Overdue Invoices',     description: 'Unpaid invoices needing attention',     defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  { id: 'profit_margin',       label: 'Profit Margin',        description: 'Current profit margin percentage',      defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  { id: 'contract_value',      label: 'Contract Value',       description: 'Top projects and contract totals',        defaultSize: 'medium', availableSizes: ['small', 'medium', 'large'] },
  { id: 'pending_invites',     label: 'Pending Invites',      description: 'Supervisor invites awaiting response',   defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  { id: 'forgotten_clockouts', label: 'Forgotten Clock-outs', description: 'Team members still clocked in',          defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  // (unmatched_txns removed — duplicate of `transactions` which already
  // shows matched/unmatched breakdown inline. Was causing a doubled
  // surface area on the owner home.)
  // Rich mini-card widgets (require additional data fetching)
  { id: 'ar_aging',        label: 'AR Aging',        description: 'Receivables by age bucket',          defaultSize: 'medium', availableSizes: ['medium', 'large'] },
  { id: 'payroll',          label: 'Payroll',          description: "This week's labor costs",             defaultSize: 'medium', availableSizes: ['small', 'medium'] },
  { id: 'recent_reports',   label: 'Daily Reports',    description: 'Recent field reports and photos',     defaultSize: 'medium', availableSizes: ['medium'] },
  { id: 'pipeline',         label: 'Pipeline',         description: 'Estimates and invoices by status',    defaultSize: 'medium', availableSizes: ['medium', 'large'] },
];

// Default widget set. `active_projects` removed — it surfaced "N active /
// M total" with no clear meaning; project status lives in the Projects tab.
// Owners can still re-add it manually via the dashboard editor.
export const DEFAULT_LAYOUT = [
  { id: 'pnl',               size: 'large',  position: 0 },
  { id: 'alerts',            size: 'medium', position: 1 },
  { id: 'overdue_invoices',  size: 'small',  position: 2 },
  { id: 'profit_margin',     size: 'small',  position: 3 },
  { id: 'workers',           size: 'small',  position: 4 },
  { id: 'supervisors',       size: 'small',  position: 5 },
  { id: 'transactions',      size: 'small',  position: 6 },
  { id: 'cashflow',          size: 'large',  position: 7 },
];

export async function loadLayout() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    return JSON.parse(raw);
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export async function saveLayout(layout) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

export async function resetLayout() {
  await saveLayout(DEFAULT_LAYOUT);
  return DEFAULT_LAYOUT;
}
