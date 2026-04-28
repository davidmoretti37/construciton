// Single source of truth for supervisor capability toggles.
// Column names match supervisor_invites + profiles in Supabase.

export const SUPERVISOR_PERMISSIONS = [
  {
    key: 'can_create_projects',
    label: 'Create projects',
    description: 'Set up new jobs without owner approval.',
    icon: 'briefcase-outline',
  },
  {
    key: 'can_create_estimates',
    label: 'Create estimates',
    description: 'Build, edit, and send estimates to clients.',
    icon: 'document-text-outline',
  },
  {
    key: 'can_create_invoices',
    label: 'Create invoices',
    description: 'Generate invoices and convert estimates.',
    icon: 'cash-outline',
  },
  {
    key: 'can_message_clients',
    label: 'Message clients',
    description: 'Use the client portal and send documents externally.',
    icon: 'chatbubbles-outline',
  },
  {
    key: 'can_pay_workers',
    label: 'Pay workers',
    description: 'View payment history and record payments to workers.',
    icon: 'wallet-outline',
  },
  {
    key: 'can_manage_workers',
    label: 'Manage workers',
    description: 'Add, edit, and remove workers from the team.',
    icon: 'people-outline',
  },
];

export const DEFAULT_SUPERVISOR_PERMISSIONS = SUPERVISOR_PERMISSIONS.reduce(
  (acc, p) => ({ ...acc, [p.key]: false }),
  {}
);
