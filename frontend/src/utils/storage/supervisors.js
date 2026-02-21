/**
 * Supervisor Storage Utilities
 * CRUD operations for supervisor management and invitations
 */

import { supabase } from '../../lib/supabase';

// Get current user ID
const getCurrentUserId = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id;
};

// =====================================================
// SUPERVISOR INVITATION FUNCTIONS
// =====================================================

/**
 * Create a new supervisor invitation
 */
export const createSupervisorInvite = async (inviteData) => {
  const ownerId = await getCurrentUserId();
  if (!ownerId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('supervisor_invites')
    .insert({
      owner_id: ownerId,
      email: inviteData.email.trim().toLowerCase(),
      full_name: inviteData.fullName?.trim() || null,
      phone: inviteData.phone?.trim() || null,
      status: 'pending',
    })
    .select('id, owner_id, email, full_name, phone, status, created_at')
    .single();

  if (error) throw error;
  return data;
};

/**
 * Get pending invitations for the current user (by email)
 * Used by supervisors to see if they have invitations
 */
export const getPendingSupervisorInvites = async (email) => {
  const { data, error } = await supabase
    .from('supervisor_invites')
    .select('id, owner_id, email, full_name, phone, status, payment_type, hourly_rate, daily_rate, weekly_salary, project_rate, created_at')
    .eq('email', email.toLowerCase())
    .eq('status', 'pending');

  if (error) throw error;

  // Fetch owner details for each invite
  const invitesWithOwners = await Promise.all(
    (data || []).map(async (invite) => {
      const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('id, business_name, business_phone')
        .eq('id', invite.owner_id)
        .single();

      return {
        ...invite,
        owner: {
          id: ownerProfile?.id,
          business_name: ownerProfile?.business_name || 'Business Owner',
          business_phone: ownerProfile?.business_phone,
        },
      };
    })
  );

  return invitesWithOwners;
};

/**
 * Accept a supervisor invitation
 */
export const acceptSupervisorInvite = async (inviteId, userId) => {
  const { data, error } = await supabase.rpc('accept_supervisor_invite', {
    p_invite_id: inviteId,
    p_user_id: userId,
  });

  if (error) throw error;
  return data;
};

/**
 * Reject a supervisor invitation
 */
export const rejectSupervisorInvite = async (inviteId, userId) => {
  const { data, error } = await supabase.rpc('reject_supervisor_invite', {
    p_invite_id: inviteId,
    p_user_id: userId,
  });

  if (error) throw error;
  return data;
};

/**
 * Cancel a supervisor invitation (by owner)
 */
export const cancelSupervisorInvite = async (inviteId) => {
  const ownerId = await getCurrentUserId();
  if (!ownerId) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('supervisor_invites')
    .delete()
    .eq('id', inviteId)
    .eq('owner_id', ownerId);

  if (error) throw error;
  return true;
};

// =====================================================
// SUPERVISOR MANAGEMENT FUNCTIONS
// =====================================================

/**
 * Fetch all supervisors for the current owner
 */
export const fetchSupervisors = async () => {
  const ownerId = await getCurrentUserId();
  if (!ownerId) throw new Error('Not authenticated');

  // Try RPC first
  const { data, error } = await supabase.rpc('get_owner_supervisors', {
    p_owner_id: ownerId,
  });

  if (error) {
    console.log('RPC failed, using fallback:', error);
    // Fallback to direct query
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, business_name, business_phone, is_onboarded, created_at')
      .eq('owner_id', ownerId)
      .eq('role', 'supervisor');

    if (profileError) throw profileError;
    return profiles || [];
  }

  return data || [];
};

/**
 * Fetch all pending invitations for the current owner
 */
export const fetchPendingInvites = async () => {
  const ownerId = await getCurrentUserId();
  if (!ownerId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('supervisor_invites')
    .select('id, owner_id, email, full_name, phone, status, created_at')
    .eq('owner_id', ownerId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
};

/**
 * Remove a supervisor (unlink from owner)
 */
export const removeSupervisor = async (supervisorId) => {
  const ownerId = await getCurrentUserId();
  if (!ownerId) throw new Error('Not authenticated');

  // Update the supervisor's profile to remove the owner link
  const { error } = await supabase
    .from('profiles')
    .update({ owner_id: null })
    .eq('id', supervisorId)
    .eq('owner_id', ownerId);

  if (error) throw error;
  return true;
};

// =====================================================
// DASHBOARD STATS FUNCTIONS
// =====================================================

/**
 * Get dashboard stats for owner
 */
export const getOwnerDashboardStats = async () => {
  const ownerId = await getCurrentUserId();
  if (!ownerId) throw new Error('Not authenticated');

  const { data, error } = await supabase.rpc('get_owner_dashboard_stats', {
    p_owner_id: ownerId,
  });

  if (error) {
    console.log('Dashboard stats RPC failed:', error);
    // Return empty stats
    return {
      total_supervisors: 0,
      total_projects: 0,
      active_projects: 0,
      total_workers: 0,
      total_revenue: 0,
      pending_invites: 0,
    };
  }

  return data;
};

// =====================================================
// SUPERVISOR DATA FUNCTIONS (for owner viewing)
// =====================================================

/**
 * Fetch projects for a specific supervisor (called by owner)
 */
export const fetchSupervisorProjects = async (supervisorId) => {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, status, start_date, end_date, contract_amount, expenses, income_collected, location, user_id, assigned_supervisor_id, created_at')
    .eq('user_id', supervisorId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
};

/**
 * Fetch workers for a specific supervisor (called by owner)
 */
export const fetchSupervisorWorkers = async (supervisorId) => {
  const { data, error } = await supabase
    .from('workers')
    .select('id, full_name, trade, phone, email, status, payment_type, hourly_rate, daily_rate, weekly_salary, owner_id, created_at')
    .eq('owner_id', supervisorId)
    .order('full_name', { ascending: true })
    .limit(100);

  if (error) throw error;
  return data || [];
};

export default {
  // Invitations
  createSupervisorInvite,
  getPendingSupervisorInvites,
  acceptSupervisorInvite,
  rejectSupervisorInvite,
  cancelSupervisorInvite,
  // Management
  fetchSupervisors,
  fetchPendingInvites,
  removeSupervisor,
  // Stats
  getOwnerDashboardStats,
  // Data access
  fetchSupervisorProjects,
  fetchSupervisorWorkers,
};
