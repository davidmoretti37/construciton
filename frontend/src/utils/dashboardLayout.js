import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'owner_dashboard_layout_v1';

export const WIDGET_DEFINITIONS = [
  { id: 'pnl',              label: 'P&L Summary',      description: 'Revenue, expenses, and profit',          defaultSize: 'large',  availableSizes: ['large'] },
  { id: 'cashflow',         label: 'Cash Flow',         description: '3-month cash in vs out chart',           defaultSize: 'large',  availableSizes: ['large'] },
  { id: 'alerts',           label: 'Needs Attention',   description: 'Alerts and items needing action',        defaultSize: 'medium', availableSizes: ['medium'] },
  { id: 'active_projects',  label: 'Active Projects',   description: 'Number of currently active projects',    defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  { id: 'workers',          label: 'Workers',           description: 'Total workers on your account',          defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  { id: 'supervisors',      label: 'Supervisors',       description: 'Total supervisors on your account',      defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  { id: 'transactions',     label: 'Transactions',      description: 'Total recorded transactions',            defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  // Lightweight stat widgets (use existing data)
  { id: 'overdue_invoices',    label: 'Overdue Invoices',     description: 'Unpaid invoices needing attention',     defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  { id: 'profit_margin',       label: 'Profit Margin',        description: 'Current profit margin percentage',      defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  { id: 'contract_value',      label: 'Contract Value',       description: 'Total value of all contracts',           defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  { id: 'pending_invites',     label: 'Pending Invites',      description: 'Supervisor invites awaiting response',   defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  { id: 'forgotten_clockouts', label: 'Forgotten Clock-outs', description: 'Team members still clocked in',          defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  { id: 'unmatched_txns',      label: 'Unmatched Txns',       description: 'Bank transactions needing review',       defaultSize: 'small',  availableSizes: ['small', 'medium'] },
  // Rich mini-card widgets (require additional data fetching)
  { id: 'ar_aging',        label: 'AR Aging',        description: 'Receivables by age bucket',          defaultSize: 'medium', availableSizes: ['medium', 'large'] },
  { id: 'payroll',          label: 'Payroll',          description: "This week's labor costs",             defaultSize: 'medium', availableSizes: ['small', 'medium'] },
  { id: 'recent_reports',   label: 'Daily Reports',    description: 'Recent field reports and photos',     defaultSize: 'medium', availableSizes: ['medium'] },
  { id: 'pipeline',         label: 'Pipeline',         description: 'Estimates and invoices by status',    defaultSize: 'medium', availableSizes: ['medium', 'large'] },
];

export const DEFAULT_LAYOUT = [
  { id: 'pnl',               size: 'large',  position: 0 },
  { id: 'alerts',            size: 'medium', position: 1 },
  { id: 'overdue_invoices',  size: 'small',  position: 2 },
  { id: 'profit_margin',     size: 'small',  position: 3 },
  { id: 'active_projects',   size: 'small',  position: 4 },
  { id: 'workers',           size: 'small',  position: 5 },
  { id: 'supervisors',       size: 'small',  position: 6 },
  { id: 'transactions',      size: 'small',  position: 7 },
  { id: 'cashflow',          size: 'large',  position: 8 },
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
