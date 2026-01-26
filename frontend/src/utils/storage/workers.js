import { supabase } from '../../lib/supabase';
import logger from '../logger';
import { getCurrentUserId } from './auth';

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
      .select()
      .single();

    if (error) {
      console.error('Error creating worker:', error);
      return null;
    }

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
    const { error } = await supabase
      .from('workers')
      .update({
        full_name: updates.fullName || updates.full_name,
        phone: updates.phone,
        email: updates.email,
        trade: updates.trade,
        hourly_rate: updates.hourlyRate || updates.hourly_rate,
        payment_type: updates.paymentType || updates.payment_type,
        daily_rate: updates.dailyRate || updates.daily_rate,
        weekly_salary: updates.weeklySalary || updates.weekly_salary,
        project_rate: updates.projectRate || updates.project_rate,
        status: updates.status,
      })
      .eq('id', workerId);

    if (error) {
      console.error('Error updating worker:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateWorker:', error);
    return false;
  }
};

/**
 * Get all workers for the current owner
 * @returns {Promise<array>} Array of workers
 */
export const fetchWorkers = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('workers')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching workers:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchWorkers:', error);
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
      .select('*')
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
        *,
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
        *,
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
        *,
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
        *,
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

    return {
      projects: projectData?.map(a => a.projects) || [],
      phases: phaseData?.map(a => ({
        ...a.project_phases,
        assignmentNotes: a.notes,
        assignedAt: a.assigned_at,
      })) || [],
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
      .select('*')
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
        const { data: owner } = await supabase
          .from('profiles')
          .select('id, business_name')
          .eq('id', worker.owner_id)
          .single();

        return {
          ...worker,
          owner: owner ? {
            id: owner.id,
            full_name: owner.business_name || 'Business Owner',
            company_name: owner.business_name
          } : null
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
      .select()
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
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

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
      .select('*')
      .eq('user_id', userId)
      .eq('trade_id', tradeId)
      .order('is_preferred', { ascending: false })
      .order('created_at', { ascending: false });

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
      .select('*')
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
