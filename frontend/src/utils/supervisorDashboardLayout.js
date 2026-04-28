import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'supervisor_dashboard_layout_v1';

// Widget catalog available to supervisors. Subset of the owner's catalog.
// V1: only widgets whose data derives from projects + workers + reports —
// no extra fetches required. Cashflow / payroll / pipeline / AR aging will
// land in a follow-up pass once the supervisor-scoped fetches are wired.
//
// `requires` is a permission key from useSupervisorPermissions. Widgets with
// `requires` only show in the AddWidgetSheet (and survive in the layout) if
// the supervisor has that capability granted.
export const SUPERVISOR_WIDGET_DEFINITIONS = [
  // Always available
  { id: 'clock_in_out',    label: 'Clock In / Out',   description: "Clock in to a project and track today's hours", defaultSize: 'large',  availableSizes: ['large'] },
  { id: 'time_history',    label: 'Recent Time',      description: 'Your most recent clock-in sessions',            defaultSize: 'medium', availableSizes: ['medium', 'large'] },
  { id: 'active_projects', label: 'Active Projects', description: 'Top projects with progress',         defaultSize: 'medium', availableSizes: ['small', 'medium', 'large'] },
  { id: 'workers',         label: 'Workers',          description: 'Workers on your team & on-site now', defaultSize: 'medium', availableSizes: ['small', 'medium', 'large'] },
  { id: 'recent_reports',  label: 'Daily Reports',    description: 'Recent field reports and photos',    defaultSize: 'medium', availableSizes: ['medium', 'large'] },
  { id: 'contract_value',  label: 'Contract Value',   description: 'Top projects and contract totals',   defaultSize: 'medium', availableSizes: ['small', 'medium', 'large'] },
  // Permission-gated (financial visibility — owner controls via can_pay_workers)
  { id: 'pnl',           label: 'P&L Summary',      description: 'Revenue, expenses, and profit',      defaultSize: 'large',  availableSizes: ['large'],            requires: 'canPayWorkers' },
  { id: 'profit_margin', label: 'Profit Margin',    description: 'Current profit margin percentage',   defaultSize: 'small',  availableSizes: ['small', 'medium'], requires: 'canPayWorkers' },
];

// Default starter layout for a supervisor. Permission-gated widgets get
// filtered at runtime if the supervisor doesn't have the capability.
export const SUPERVISOR_DEFAULT_LAYOUT = [
  { id: 'clock_in_out',    size: 'large',  position: 0 },
  { id: 'time_history',    size: 'medium', position: 1 },
  { id: 'active_projects', size: 'medium', position: 2 },
  { id: 'workers',         size: 'medium', position: 3 },
  { id: 'recent_reports',  size: 'medium', position: 4 },
  { id: 'contract_value',  size: 'medium', position: 5 },
];

export async function loadSupervisorLayout() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return SUPERVISOR_DEFAULT_LAYOUT;
    return JSON.parse(raw);
  } catch {
    return SUPERVISOR_DEFAULT_LAYOUT;
  }
}

export async function saveSupervisorLayout(layout) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

export async function resetSupervisorLayout() {
  await saveSupervisorLayout(SUPERVISOR_DEFAULT_LAYOUT);
  return SUPERVISOR_DEFAULT_LAYOUT;
}

// Filter the catalog to widgets the current supervisor can actually use,
// based on their permission flags from `useSupervisorPermissions`.
export function getAvailableSupervisorWidgets(perms) {
  return SUPERVISOR_WIDGET_DEFINITIONS.filter(w => {
    if (!w.requires) return true;
    return !!perms?.[w.requires];
  });
}
