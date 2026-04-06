import { supabase } from '../../lib/supabase';
import { cacheData, getCachedData, clearCache } from '../../services/offlineCache';
import logger from '../logger';
import { getCurrentUserId, getCurrentUserContext } from './auth';
import { API_URL as BACKEND_URL } from '../../config/api';

// ============================================================
// Worker Management Functions
// ============================================================

/**
 * Create a new worker
 * @param {object} workerData - Worker data object
 * @returns {Promise<object|null>} Created worker or null
 */
export const createWorker = async (workerData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    const { data, error } = await supabase
      .from('workers')
      .insert({
        owner_id: userId,
        full_name: workerData.fullName || workerData.full_name,
        phone: workerData.phone,
        email: workerData.email,
        trade: workerData.trade,
        hourly_rate: workerData.hourlyRate || workerData.hourly_rate || 0,
        payment_type: workerData.paymentType || workerData.payment_type || 'hourly',
        daily_rate: workerData.dailyRate || workerData.daily_rate || 0,
        weekly_salary: workerData.weeklySalary || workerData.weekly_salary || 0,
        project_rate: workerData.projectRate || workerData.project_rate || 0,
        status: workerData.status || 'pending',
        is_onboarded: false,
      })
      .select('id, full_name, trade, phone, email, hourly_rate, payment_type, daily_rate, weekly_salary, project_rate, status, user_id, owner_id, is_onboarded, created_at, updated_at')
      .single();

    if (error) {
      console.error('Error creating worker:', error);
      return null;
    }

    clearCache('workers');
    clearCache('workers_owner');
    return data;
  } catch (error) {
    console.error('Error in createWorker:', error);
    return null;
  }
};

/**
 * Update worker information
 * @param {string} workerId - Worker ID
 * @param {object} updates - Fields to update
 * @returns {Promise<boolean>} Success status
 */
export const updateWorker = async (workerId, updates) => {
  try {
    // Build update object with only provided fields
    const updateData = {};
    if (updates.fullName !== undefined || updates.full_name !== undefined) {
      updateData.full_name = updates.fullName || updates.full_name;
    }
    if (updates.phone !== undefined) updateData.phone = updates.phone;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.trade !== undefined) updateData.trade = updates.trade;
    if (updates.hourlyRate !== undefined || updates.hourly_rate !== undefined) {
      updateData.hourly_rate = updates.hourlyRate ?? updates.hourly_rate;
    }
    if (updates.paymentType !== undefined || updates.payment_type !== undefined) {
      updateData.payment_type = updates.paymentType || updates.payment_type;
    }
    if (updates.dailyRate !== undefined || updates.daily_rate !== undefined) {
      updateData.daily_rate = updates.dailyRate ?? updates.daily_rate;
    }
    if (updates.weeklySalary !== undefined || updates.weekly_salary !== undefined) {
      updateData.weekly_salary = updates.weeklySalary ?? updates.weekly_salary;
    }
    if (updates.projectRate !== undefined || updates.project_rate !== undefined) {
      updateData.project_rate = updates.projectRate ?? updates.project_rate;
    }
    if (updates.status !== undefined) updateData.status = updates.status;

    const { data, error } = await supabase
      .from('workers')
      .update(updateData)
      .eq('id', workerId)
      .select('id')
      .single();

    if (error) {
      console.error('Error updating worker:', error);
      return false;
    }

    if (!data) {
      console.error('Worker update: no rows affected (RLS may be blocking)');
      return false;
    }

    clearCache('workers');
    clearCache('workers_owner');
    return true;
  } catch (error) {
    console.error('Error in updateWorker:', error);
    return false;
  }
};

/**
 * Get all workers for the current user
 * For supervisors: includes their owner's workers too (bidirectional visibility)
 * @returns {Promise<array>} Array of workers
 */
export const fetchWorkers = async () => {
  try {
    const context = await getCurrentUserContext();
    if (!context?.userId) return [];

    // Build list of owner_ids to fetch workers from
    // For supervisors: include their owner's workers too
    const ownerIds = [context.userId];
    if (context.ownerId) {
      ownerIds.push(context.ownerId);
    }

    const { data, error } = await supabase
      .from('workers')
      .select('id, full_name, trade, phone, email, hourly_rate, payment_type, daily_rate, weekly_salary, project_rate, status, user_id, owner_id, is_onboarded, created_at, updated_at')
      .in('owner_id', ownerIds)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error fetching workers:', error);
      const cached = getCachedData('workers', true);
      if (cached) return cached;
      return [];
    }

    const result = data || [];
    cacheData('workers', result);
    return result;
  } catch (error) {
    console.error('Error in fetchWorkers:', error);
    const cached = getCachedData('workers', true);
    if (cached) return cached;
    return [];
  }
};

/**
 * Get average worker rate across all active workers
 * Used for estimating labor costs on estimates
 * @returns {Promise<object>} { daily, hourly, count }
 */
export const getAverageWorkerRate = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { daily: 0, hourly: 0, count: 0 };

    const { data: workers, error } = await supabase
      .from('workers')
      .select('hourly_rate, daily_rate, payment_type')
      .eq('owner_id', userId)
      .eq('status', 'active');

    if (error || !workers || workers.length === 0) {
      return { daily: 0, hourly: 0, count: 0 };
    }

    const avgHourly = workers.reduce((sum, w) => sum + (parseFloat(w.hourly_rate) || 0), 0) / workers.length;
    const avgDaily = workers.reduce((sum, w) => {
      const daily = parseFloat(w.daily_rate) || 0;
      const hourly = parseFloat(w.hourly_rate) || 0;
      return sum + (daily > 0 ? daily : hourly * 8);
    }, 0) / workers.length;

    return {
      daily: Math.round(avgDaily * 100) / 100,
      hourly: Math.round(avgHourly * 100) / 100,
      count: workers.length
    };
  } catch (error) {
    console.error('Error in getAverageWorkerRate:', error);
    return { daily: 0, hourly: 0, count: 0 };
  }
};

/**
 * Get worker by ID
 * @param {string} workerId - Worker ID
 * @returns {Promise<object|null>} Worker data
 */
export const getWorker = async (workerId) => {
  try {
    const { data, error } = await supabase
      .from('workers')
      .select('id, full_name, trade, phone, email, hourly_rate, payment_type, daily_rate, weekly_salary, project_rate, status, user_id, owner_id, is_onboarded, created_at, updated_at')
      .eq('id', workerId)
      .single();

    if (error) {
      console.error('Error fetching worker:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getWorker:', error);
    return null;
  }
};

/**
 * Delete a worker
 * @param {string} workerId - Worker ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteWorker = async (workerId) => {
  try {
    const { error } = await supabase
      .from('workers')
      .delete()
      .eq('id', workerId);

    if (error) {
      console.error('Error deleting worker:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteWorker:', error);
    return false;
  }
};

// ============================================================
// Worker Assignment Functions
// ============================================================

/**
 * Assign worker to a project
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @returns {Promise<boolean>} Success status
 */
export const assignWorkerToProject = async (workerId, projectId) => {
  try {
    const { error } = await supabase
      .from('project_assignments')
      .insert({
        worker_id: workerId,
        project_id: projectId,
      });

    if (error) {
      console.error('Error assigning worker to project:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in assignWorkerToProject:', error);
    return false;
  }
};

/**
 * Assign worker to a specific phase
 * @param {string} workerId - Worker ID
 * @param {string} phaseId - Phase ID
 * @param {object} options - Additional options (notes, assignedBy)
 * @returns {Promise<boolean>} Success status
 */
export const assignWorkerToPhase = async (workerId, phaseId, options = {}) => {
  try {
    const userId = await getCurrentUserId();

    const { error } = await supabase
      .from('phase_assignments')
      .insert({
        worker_id: workerId,
        phase_id: phaseId,
        notes: options.notes,
        assigned_by: options.assignedBy || userId,
      });

    if (error) {
      console.error('Error assigning worker to phase:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in assignWorkerToPhase:', error);
    return false;
  }
};

/**
 * Remove worker from a project
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @returns {Promise<boolean>} Success status
 */
export const removeWorkerFromProject = async (workerId, projectId) => {
  try {
    const { error } = await supabase
      .from('project_assignments')
      .delete()
      .eq('worker_id', workerId)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error removing worker from project:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in removeWorkerFromProject:', error);
    return false;
  }
};

/**
 * Remove worker from a phase
 * @param {string} workerId - Worker ID
 * @param {string} phaseId - Phase ID
 * @returns {Promise<boolean>} Success status
 */
export const removeWorkerFromPhase = async (workerId, phaseId) => {
  try {
    const { error } = await supabase
      .from('phase_assignments')
      .delete()
      .eq('worker_id', workerId)
      .eq('phase_id', phaseId);

    if (error) {
      console.error('Error removing worker from phase:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in removeWorkerFromPhase:', error);
    return false;
  }
};

/**
 * Get all workers assigned to a project
 * @param {string} projectId - Project ID
 * @returns {Promise<array>} Array of workers
 */
export const getProjectWorkers = async (projectId) => {
  try {
    const { data, error } = await supabase
      .from('project_assignments')
      .select(`
        id, worker_id, project_id,
        workers:worker_id (
          id,
          full_name,
          phone,
          email,
          trade,
          hourly_rate,
          status
        )
      `)
      .eq('project_id', projectId);

    if (error) {
      console.error('Error fetching project workers:', error);
      return [];
    }

    return data?.map(assignment => assignment.workers) || [];
  } catch (error) {
    console.error('Error in getProjectWorkers:', error);
    return [];
  }
};

// ═══ SERVICE PLAN WORKER ASSIGNMENTS ═══

export const assignWorkerToServicePlan = async (workerId, servicePlanId) => {
  try {
    const { error } = await supabase
      .from('project_assignments')
      .insert({ worker_id: workerId, service_plan_id: servicePlanId });
    if (error) { console.error('Error assigning worker to service plan:', error); return false; }

    // Check how many workers are now assigned to this plan
    const { data: allAssignments } = await supabase
      .from('project_assignments')
      .select('worker_id')
      .eq('service_plan_id', servicePlanId)
      .not('worker_id', 'is', null);

    const workerCount = (allAssignments || []).length;

    if (workerCount === 1) {
      // Only one worker — auto-assign them to all locations + all future visits
      const today = new Date().toISOString().split('T')[0];

      // Set as default worker on all locations
      supabase
        .from('service_locations')
        .update({ default_worker_id: workerId })
        .eq('service_plan_id', servicePlanId)
        .eq('is_active', true)
        .then(() => {})
        .catch(() => {});

      // Assign to all future unassigned visits
      supabase
        .from('service_visits')
        .update({ assigned_worker_id: workerId })
        .eq('service_plan_id', servicePlanId)
        .is('assigned_worker_id', null)
        .gte('scheduled_date', today)
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .then(() => console.log('[Workers] Auto-assigned sole worker to all visits'))
        .catch(() => {});
    }
    // If multiple workers: owner must set per-location via "Set Default Worker"

    return true;
  } catch (error) { console.error('Error in assignWorkerToServicePlan:', error); return false; }
};

export const removeWorkerFromServicePlan = async (workerId, servicePlanId) => {
  try {
    const { error } = await supabase
      .from('project_assignments')
      .delete()
      .eq('worker_id', workerId)
      .eq('service_plan_id', servicePlanId);
    if (error) { console.error('Error removing worker from service plan:', error); return false; }
    return true;
  } catch (error) { console.error('Error in removeWorkerFromServicePlan:', error); return false; }
};

export const getServicePlanWorkers = async (servicePlanId) => {
  try {
    const { data, error } = await supabase
      .from('project_assignments')
      .select(`
        id, worker_id, service_plan_id,
        workers:worker_id (id, full_name, phone, email, trade, hourly_rate, status)
      `)
      .eq('service_plan_id', servicePlanId);
    if (error) { console.error('Error fetching service plan workers:', error); return []; }
    return data?.map(a => a.workers) || [];
  } catch (error) { console.error('Error in getServicePlanWorkers:', error); return []; }
};

/**
 * Get assignment counts for all workers
 * Returns a map of worker_id to count of project assignments
 * @returns {Promise<Object>} Map of { worker_id: count }
 */
export const getWorkerAssignmentCounts = async () => {
  try {
    const { data, error } = await supabase
      .from('project_assignments')
      .select('worker_id');

    if (error) {
      logger.error('Error fetching assignment counts:', error);
      return {};
    }

    const counts = {};
    data?.forEach(assignment => {
      const workerId = assignment.worker_id;
      counts[workerId] = (counts[workerId] || 0) + 1;
    });

    return counts;
  } catch (error) {
    logger.error('Error in getWorkerAssignmentCounts:', error);
    return {};
  }
};

/**
 * Get all workers assigned to a specific phase
 * @param {string} phaseId - Phase ID
 * @returns {Promise<array>} Array of workers with assignment details
 */
export const getPhaseWorkers = async (phaseId) => {
  try {
    const { data, error } = await supabase
      .from('phase_assignments')
      .select(`
        id, worker_id, phase_id, notes, assigned_at,
        workers:worker_id (
          id,
          full_name,
          phone,
          email,
          trade,
          hourly_rate,
          status
        )
      `)
      .eq('phase_id', phaseId);

    if (error) {
      if (error.code === '42P01') {
        return [];
      }
      logger.error('Error fetching phase workers:', error);
      return [];
    }

    return data?.map(assignment => ({
      ...assignment.workers,
      assignmentId: assignment.id,
      assignmentNotes: assignment.notes,
      assignedAt: assignment.assigned_at,
    })) || [];
  } catch (error) {
    logger.error('Error in getPhaseWorkers:', error);
    return [];
  }
};

/**
 * Get all assignments for a worker
 * @param {string} workerId - Worker ID
 * @returns {Promise<object>} Object with projects and phases arrays
 */
export const getWorkerAssignments = async (workerId) => {
  try {
    const { data: projectData, error: projectError } = await supabase
      .from('project_assignments')
      .select(`
        id, worker_id, project_id,
        projects:project_id (
          id,
          name,
          location,
          start_date,
          end_date,
          status,
          contract_amount
        )
      `)
      .eq('worker_id', workerId);

    if (projectError) {
      console.error('Error fetching project assignments:', projectError);
    }

    let phaseData = null;
    const { data: phaseResult, error: phaseError } = await supabase
      .from('phase_assignments')
      .select(`
        id, worker_id, phase_id, notes, assigned_at,
        project_phases:phase_id (
          id,
          name,
          start_date,
          end_date,
          status,
          completion_percentage,
          budget,
          project_id,
          projects:project_id (
            id,
            name
          )
        )
      `)
      .eq('worker_id', workerId);

    if (phaseError) {
      if (phaseError.code !== 'PGRST205' && phaseError.code !== '42P01') {
        console.error('Error fetching phase assignments:', phaseError);
      }
      phaseData = [];
    } else {
      phaseData = phaseResult;
    }

    // Also fetch service plan assignments
    let servicePlans = [];
    try {
      const { data: spData } = await supabase
        .from('project_assignments')
        .select(`
          id, worker_id, service_plan_id,
          service_plans:service_plan_id (
            id, name, service_type, status, billing_cycle,
            price_per_visit, monthly_rate, address, client_name
          )
        `)
        .eq('worker_id', workerId)
        .not('service_plan_id', 'is', null);
      servicePlans = (spData || []).map(a => a.service_plans).filter(Boolean);
    } catch (e) {
      // service_plans join may fail if table doesn't exist yet
    }

    return {
      projects: projectData?.map(a => a.projects).filter(Boolean) || [],
      servicePlans,
      phases: phaseData?.map(a => ({
        ...a.project_phases,
        assignmentNotes: a.notes,
        assignedAt: a.assigned_at,
      })).filter(Boolean) || [],
    };
  } catch (error) {
    console.error('Error in getWorkerAssignments:', error);
    return { projects: [], phases: [] };
  }
};

// ============================================================
// Worker Invite Functions
// ============================================================

/**
 * Get pending invites for a worker email
 * @param {string} workerEmail - Worker's email address
 * @returns {Promise<array>} Array of pending invites
 */
export const getPendingInvites = async (workerEmail) => {
  try {
    const { data: workers, error: workersError } = await supabase
      .from('workers')
      .select('id, full_name, trade, phone, email, hourly_rate, payment_type, daily_rate, weekly_salary, project_rate, status, user_id, owner_id, is_onboarded, created_at, updated_at')
      .eq('email', workerEmail)
      .eq('status', 'pending')
      .is('user_id', null);

    if (workersError) {
      console.error('Error getting pending invites:', workersError);
      return [];
    }

    if (!workers || workers.length === 0) {
      return [];
    }

    const invitesWithOwners = await Promise.all(
      workers.map(async (worker) => {
        // Try profiles first, fall back to auth metadata
        let ownerName = null;
        let companyName = null;

        try {
          const { data: owner } = await supabase
            .from('profiles')
            .select('id, full_name, business_name')
            .eq('id', worker.owner_id)
            .single();
          if (owner) {
            ownerName = owner.business_name || owner.full_name || null;
            companyName = owner.business_name || null;
          }
        } catch (e) {
          // RLS may block this query for worker users
        }

        return {
          ...worker,
          owner: {
            id: worker.owner_id,
            full_name: ownerName || 'Your Employer',
            company_name: companyName,
          },
        };
      })
    );

    return invitesWithOwners;
  } catch (error) {
    console.error('Error in getPendingInvites:', error);
    return [];
  }
};

/**
 * Accept a worker invite
 * @param {string} workerId - Worker record ID
 * @param {string} userId - Authenticated user's ID
 * @returns {Promise<boolean>} Success status
 */
export const acceptInvite = async (workerId, userId) => {
  try {
    const { data, error } = await supabase.rpc('accept_worker_invite', {
      p_worker_id: workerId,
      p_user_id: userId
    });

    if (error) {
      console.error('Error accepting invite:', error);
      return false;
    }

    if (!data || !data.success) {
      console.error('acceptInvite - Failed:', data?.error || 'Unknown error');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in acceptInvite:', error);
    return false;
  }
};

/**
 * Reject a worker invite
 * @param {string} workerId - Worker record ID
 * @returns {Promise<boolean>} Success status
 */
export const rejectInvite = async (workerId) => {
  try {
    const { error } = await supabase
      .from('workers')
      .update({
        status: 'rejected'
      })
      .eq('id', workerId)
      .eq('status', 'pending')
      .is('user_id', null);

    if (error) {
      console.error('Error rejecting invite:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in rejectInvite:', error);
    return false;
  }
};

// ============================================================
// Subcontractor Quote Functions
// ============================================================

/**
 * Save a new subcontractor quote
 * @param {object} quoteData - Quote data object
 * @returns {Promise<{success: boolean, id?: string, error?: string}>}
 */
export const saveSubcontractorQuote = async (quoteData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'No user logged in' };
    }

    const { data, error } = await supabase
      .from('subcontractor_quotes')
      .insert({
        user_id: userId,
        trade_id: quoteData.tradeId,
        subcontractor_name: quoteData.subcontractorName,
        contact_phone: quoteData.contactPhone || null,
        contact_email: quoteData.contactEmail || null,
        is_preferred: quoteData.isPreferred || false,
        document_url: quoteData.documentUrl || null,
        services: quoteData.services || [],
        notes: quoteData.notes || null,
      })
      .select('id, user_id, trade_id, subcontractor_name, contact_phone, contact_email, is_preferred, document_url, services, notes, created_at, updated_at')
      .single();

    if (error) {
      console.error('Error saving subcontractor quote:', error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data.id };
  } catch (error) {
    console.error('Error in saveSubcontractorQuote:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get all subcontractor quotes for the current user
 * @returns {Promise<Array>} Array of quote objects
 */
export const getAllSubcontractorQuotes = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return [];
    }

    const { data, error } = await supabase
      .from('subcontractor_quotes')
      .select('id, user_id, trade_id, subcontractor_name, contact_phone, contact_email, is_preferred, document_url, services, notes, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      // Silently handle missing table (migration not yet applied)
      if (error.code === 'PGRST205' || error.code === '42P01') {
        return [];
      }
      console.error('Error fetching subcontractor quotes:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getAllSubcontractorQuotes:', error);
    return [];
  }
};

/**
 * Get subcontractor quotes for a specific trade
 * @param {string} tradeId - Trade ID (e.g., 'drywall', 'electrical')
 * @returns {Promise<Array>} Array of quote objects for the specified trade
 */
export const getSubcontractorQuotesByTrade = async (tradeId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return [];
    }

    const { data, error } = await supabase
      .from('subcontractor_quotes')
      .select('id, user_id, trade_id, subcontractor_name, contact_phone, contact_email, is_preferred, document_url, services, notes, created_at, updated_at')
      .eq('user_id', userId)
      .eq('trade_id', tradeId)
      .order('is_preferred', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      // Silently handle missing table (migration not yet applied)
      if (error.code === 'PGRST205' || error.code === '42P01') {
        return [];
      }
      console.error('Error fetching subcontractor quotes by trade:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getSubcontractorQuotesByTrade:', error);
    return [];
  }
};

/**
 * Get all subcontractor quotes organized by trade
 * @returns {Promise<object>} Object with trade IDs as keys and arrays of quotes as values
 */
export const getSubcontractorQuotesGroupedByTrade = async () => {
  try {
    const quotes = await getAllSubcontractorQuotes();

    const grouped = {};
    quotes.forEach(quote => {
      if (!grouped[quote.trade_id]) {
        grouped[quote.trade_id] = [];
      }
      grouped[quote.trade_id].push(quote);
    });

    return grouped;
  } catch (error) {
    console.error('Error in getSubcontractorQuotesGroupedByTrade:', error);
    return {};
  }
};

/**
 * Update a subcontractor quote
 * @param {string} quoteId - Quote ID to update
 * @param {object} updates - Fields to update
 * @returns {Promise<boolean>} Success status
 */
export const updateSubcontractorQuote = async (quoteId, updates) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return false;
    }

    const { error } = await supabase
      .from('subcontractor_quotes')
      .update(updates)
      .eq('id', quoteId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error updating subcontractor quote:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateSubcontractorQuote:', error);
    return false;
  }
};

/**
 * Toggle the preferred status of a subcontractor quote
 * @param {string} quoteId - Quote ID to toggle
 * @param {boolean} makePreferred - New preferred status
 * @param {boolean} unsetOthers - If true, unset other preferred quotes for the same trade
 * @returns {Promise<boolean>} Success status
 */
export const togglePreferredStatus = async (quoteId, makePreferred, unsetOthers = true) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return false;
    }

    if (makePreferred && unsetOthers) {
      const { data: quote } = await supabase
        .from('subcontractor_quotes')
        .select('trade_id')
        .eq('id', quoteId)
        .eq('user_id', userId)
        .single();

      if (quote) {
        await supabase
          .from('subcontractor_quotes')
          .update({ is_preferred: false })
          .eq('user_id', userId)
          .eq('trade_id', quote.trade_id)
          .eq('is_preferred', true)
          .neq('id', quoteId);
      }
    }

    const { error } = await supabase
      .from('subcontractor_quotes')
      .update({ is_preferred: makePreferred })
      .eq('id', quoteId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error toggling preferred status:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in togglePreferredStatus:', error);
    return false;
  }
};

/**
 * Delete a subcontractor quote
 * @param {string} quoteId - Quote ID to delete
 * @returns {Promise<boolean>} Success status
 */
export const deleteSubcontractorQuote = async (quoteId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return false;
    }

    const { error } = await supabase
      .from('subcontractor_quotes')
      .delete()
      .eq('id', quoteId)
      .eq('user_id', userId);

    if (error) {
      console.error('Error deleting subcontractor quote:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteSubcontractorQuote:', error);
    return false;
  }
};

/**
 * Get the preferred subcontractor quote for a specific trade
 * @param {string} tradeId - Trade ID
 * @returns {Promise<object|null>} Preferred quote object or null
 */
export const getPreferredQuoteForTrade = async (tradeId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return null;
    }

    const { data, error } = await supabase
      .from('subcontractor_quotes')
      .select('id, user_id, trade_id, subcontractor_name, contact_phone, contact_email, is_preferred, document_url, services, notes, created_at, updated_at')
      .eq('user_id', userId)
      .eq('trade_id', tradeId)
      .eq('is_preferred', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error fetching preferred quote:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getPreferredQuoteForTrade:', error);
    return null;
  }
};

// ============================================================
// Owner Mode Functions (for Boss Portal AI Chat)
// ============================================================

/**
 * Get all supervisors under an owner
 * @param {string} ownerId - The owner's user ID
 * @returns {Promise<Array<{id: string, business_name: string}>>} Array of supervisor objects
 */
export const getSupervisorsForOwner = async (ownerId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, business_name, business_phone')
      .eq('owner_id', ownerId)
      .eq('role', 'supervisor');

    if (error) {
      logger.error('Error fetching supervisors for owner:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    logger.error('Error in getSupervisorsForOwner:', error);
    return [];
  }
};

/**
 * Update a supervisor's profile
 * @param {string} supervisorId - Supervisor's user ID
 * @param {object} updates - Fields to update (business_name, business_phone, payment_type, rates, etc.)
 * @returns {Promise<boolean>} Success status
 */
export const updateSupervisorProfile = async (supervisorId, updates) => {
  try {
    // Try backend API first (bypasses RLS for cross-user edits)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        const response = await fetch(`${BACKEND_URL}/api/supervisors/${supervisorId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(updates),
        });
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const result = await response.json();
          if (response.ok && result.success) return true;
        }
      }
    } catch (e) {
      console.log('Backend API unavailable for supervisor update:', e.message);
    }

    // Fallback: direct Supabase update (only works if user owns the row)
    const updateData = {};
    if (updates.business_name !== undefined) updateData.business_name = updates.business_name;
    if (updates.business_phone !== undefined) updateData.business_phone = updates.business_phone;
    if (updates.payment_type !== undefined) updateData.payment_type = updates.payment_type;
    if (updates.hourly_rate !== undefined) updateData.hourly_rate = updates.hourly_rate;
    if (updates.daily_rate !== undefined) updateData.daily_rate = updates.daily_rate;
    if (updates.weekly_salary !== undefined) updateData.weekly_salary = updates.weekly_salary;
    if (updates.project_rate !== undefined) updateData.project_rate = updates.project_rate;

    const { data, error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', supervisorId)
      .select();

    if (error) {
      logger.error('Error updating supervisor profile:', error);
      return false;
    }
    if (!data || data.length === 0) return false;
    return true;
  } catch (error) {
    logger.error('Error in updateSupervisorProfile:', error);
    return false;
  }
};

/**
 * Remove a supervisor (unlink from owner)
 * @param {string} supervisorId - Supervisor's user ID
 * @returns {Promise<boolean>} Success status
 */
export const removeSupervisor = async (supervisorId) => {
  try {
    // Try backend API first (bypasses RLS)
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (token) {
        const response = await fetch(`${BACKEND_URL}/api/supervisors/${supervisorId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const result = await response.json();
          if (response.ok && result.success) return true;
        }
      }
    } catch (e) {
      console.log('Backend API unavailable for supervisor removal:', e.message);
    }

    // Fallback: direct Supabase
    const { data, error } = await supabase
      .from('profiles')
      .update({ owner_id: null })
      .eq('id', supervisorId)
      .select();

    if (error) {
      logger.error('Error removing supervisor:', error);
      return false;
    }
    if (!data || data.length === 0) return false;
    return true;
  } catch (error) {
    logger.error('Error in removeSupervisor:', error);
    return false;
  }
};

/**
 * Get owner info for a supervisor
 * Used by supervisor's AI chat to know who their owner is
 * @param {string} ownerId - The owner's user ID
 * @returns {Promise<{id: string, name: string, business_name: string} | null>}
 */
export const getOwnerInfoForSupervisor = async (ownerId) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, business_name')
      .eq('id', ownerId)
      .single();

    if (error) {
      logger.error('Error fetching owner info for supervisor:', error);
      return null;
    }

    return {
      id: data.id,
      name: data.business_name || 'Your Owner',
      business_name: data.business_name || null
    };
  } catch (error) {
    logger.error('Error in getOwnerInfoForSupervisor:', error);
    return null;
  }
};

/**
 * Get all workers across all supervisors under this owner
 * Used by owner's AI chat to see company-wide worker data
 * Includes supervisor_name for attribution
 * @returns {Promise<array>} Workers with supervisor info
 */
export const fetchWorkersForOwner = async () => {
  try {
    const context = await getCurrentUserContext();
    if (!context) return [];

    // If not owner, fall back to regular fetchWorkers
    if (!context.isOwner) {
      return fetchWorkers();
    }

    // Get all supervisors under this owner
    const supervisors = await getSupervisorsForOwner(context.userId);
    const supervisorIds = supervisors.map(s => s.id);
    const supervisorNames = Object.fromEntries(
      supervisors.map(s => [s.id, s.business_name || 'Supervisor'])
    );

    // Include owner's own workers too
    const allIds = [context.userId, ...supervisorIds];

    const { data, error } = await supabase
      .from('workers')
      .select('id, full_name, trade, phone, email, hourly_rate, payment_type, daily_rate, weekly_salary, project_rate, status, user_id, owner_id, is_onboarded, created_at, updated_at')
      .in('owner_id', allIds)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.error('Error fetching workers for owner:', error);
      const cached = getCachedData('workers_owner', true);
      if (cached) return cached;
      return [];
    }

    // Add supervisor name to each worker for attribution
    const result = (data || []).map(w => ({
      ...w,
      supervisor_name: w.owner_id === context.userId
        ? 'You (Owner)'
        : (supervisorNames[w.owner_id] || 'Unknown Supervisor'),
      supervisor_id: w.owner_id,
    }));
    cacheData('workers_owner', result);
    return result;
  } catch (error) {
    logger.error('Error in fetchWorkersForOwner:', error);
    const cached = getCachedData('workers_owner', true);
    if (cached) return cached;
    return [];
  }
};

/**
 * Get all clocked-in workers today across all supervisors (for owner)
 * @returns {Promise<array>} Clocked-in workers with supervisor attribution
 */
export const getClockedInWorkersTodayForOwner = async () => {
  try {
    const context = await getCurrentUserContext();
    if (!context?.isOwner) {
      // Fall back to regular function
      const { getClockedInWorkersToday } = require('./index');
      return getClockedInWorkersToday();
    }

    // Get all supervisors under this owner
    const supervisors = await getSupervisorsForOwner(context.userId);
    const supervisorIds = supervisors.map(s => s.id);
    const supervisorNames = Object.fromEntries(
      supervisors.map(s => [s.id, s.business_name || 'Supervisor'])
    );

    const allIds = [context.userId, ...supervisorIds];

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data, error } = await supabase
      .from('time_tracking')
      .select(`
        id, worker_id, project_id, service_plan_id, clock_in, clock_out,
        workers!inner (
          id,
          full_name,
          trade,
          owner_id
        ),
        projects:project_id (id, name),
        service_plans:service_plan_id (id, name)
      `)
      .gte('clock_in', today.toISOString())
      .lt('clock_in', tomorrow.toISOString())
      .is('clock_out', null)
      .in('workers.owner_id', allIds);

    if (error) {
      logger.error('Error fetching clocked-in workers for owner:', error);
      return [];
    }

    return (data || []).map(entry => ({
      ...entry,
      worker_name: entry.workers?.full_name,
      supervisor_name: entry.workers?.owner_id === context.userId
        ? 'You (Owner)'
        : (supervisorNames[entry.workers?.owner_id] || 'Unknown'),
      supervisor_id: entry.workers?.owner_id,
    }));
  } catch (error) {
    logger.error('Error in getClockedInWorkersTodayForOwner:', error);
    return [];
  }
};

/**
 * Get full company hierarchy for owner
 * Returns owner info, supervisors with their worker/project counts
 * Used by AI context for hierarchy-aware responses
 * @returns {Promise<object|null>} Company hierarchy object or null if not owner
 */
export const getCompanyHierarchy = async () => {
  try {
    const context = await getCurrentUserContext();
    if (!context?.isOwner) return null;

    // Get owner's profile info
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('id, business_name, business_phone, email')
      .eq('id', context.userId)
      .single();

    // Get all supervisors under this owner
    const supervisors = await getSupervisorsForOwner(context.userId);

    // Get counts for each supervisor in parallel
    const supervisorStats = await Promise.all(
      supervisors.map(async (sup) => {
        // Get worker count
        const { count: workerCount } = await supabase
          .from('workers')
          .select('*', { count: 'exact', head: true })
          .eq('owner_id', sup.id);

        // Get project counts (owned + assigned)
        const { data: projects } = await supabase
          .from('projects')
          .select('id, status')
          .or(`user_id.eq.${sup.id},assigned_supervisor_id.eq.${sup.id}`);

        const projectCount = projects?.length || 0;
        const activeProjectCount = (projects || []).filter(
          p => ['active', 'on-track', 'behind', 'over-budget'].includes(p.status)
        ).length;

        return {
          id: sup.id,
          name: sup.business_name || 'Supervisor',
          email: sup.email,
          phone: sup.business_phone,
          workerCount: workerCount || 0,
          projectCount: projectCount,
          activeProjectCount: activeProjectCount,
        };
      })
    );

    // Get owner's direct worker count
    const { count: ownerWorkerCount } = await supabase
      .from('workers')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', context.userId);

    // Get owner's direct project count
    const { data: ownerProjects } = await supabase
      .from('projects')
      .select('id, status, assigned_supervisor_id')
      .eq('user_id', context.userId);

    const ownerDirectProjects = (ownerProjects || []).filter(p => !p.assigned_supervisor_id);
    const ownerAssignedProjects = (ownerProjects || []).filter(p => p.assigned_supervisor_id);

    // Calculate totals
    const totalSupervisorWorkers = supervisorStats.reduce((sum, s) => sum + s.workerCount, 0);
    const totalSupervisorProjects = supervisorStats.reduce((sum, s) => sum + s.projectCount, 0);

    return {
      owner: {
        id: context.userId,
        name: ownerProfile?.business_name || 'Owner',
        email: ownerProfile?.email,
        phone: ownerProfile?.business_phone,
        directWorkerCount: ownerWorkerCount || 0,
        directProjectCount: ownerDirectProjects.length,
        assignedProjectCount: ownerAssignedProjects.length,
      },
      supervisors: supervisorStats,
      totals: {
        supervisorCount: supervisorStats.length,
        totalWorkers: totalSupervisorWorkers + (ownerWorkerCount || 0),
        totalProjects: totalSupervisorProjects + ownerDirectProjects.length,
        workersBySupervisors: totalSupervisorWorkers,
        projectsBySupervisors: totalSupervisorProjects,
      },
    };
  } catch (error) {
    logger.error('Error in getCompanyHierarchy:', error);
    return null;
  }
};
