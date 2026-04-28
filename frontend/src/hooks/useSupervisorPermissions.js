import { useAuth } from '../contexts/AuthContext';

// Single read of supervisor capability flags. For owners every flag returns
// true; for supervisors it reflects the column on profiles; for everyone else
// (worker/client/unauth) it returns false.
//
// Permission columns are defined in src/constants/supervisorPermissions.js
// and stored on profiles + supervisor_invites in Supabase.
export function useSupervisorPermissions() {
  const { profile, isOwner, isSupervisor } = useAuth() || {};

  const can = (key) => {
    if (isOwner) return true;
    if (isSupervisor) return !!profile?.[key];
    return false;
  };

  return {
    canCreateProjects: can('can_create_projects'),
    canCreateEstimates: can('can_create_estimates'),
    canCreateInvoices: can('can_create_invoices'),
    canMessageClients: can('can_message_clients'),
    canPayWorkers: can('can_pay_workers'),
    canManageWorkers: can('can_manage_workers'),
  };
}

export default useSupervisorPermissions;
