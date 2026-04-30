import { supabase } from '../../lib/supabase';
import { getCurrentUserId, getCurrentUserContext } from './auth';
import { getSupervisorsForOwner } from './workers';

// ============================================================
// Estimate Management Functions
// ============================================================

/**
 * Save a new estimate to Supabase
 * @param {object} estimateData - Estimate data object
 * @returns {Promise<object|null>} Saved estimate or null if error
 */
export const saveEstimate = async (estimateData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    // Support both snake_case and camelCase for project_id
    const projectId = estimateData.projectId || estimateData.project_id || null;

    const { data, error } = await supabase
      .from('estimates')
      .insert({
        user_id: userId,
        project_id: projectId,
        client_name: estimateData.client?.name || estimateData.client || estimateData.clientName || 'Unnamed Client',
        client_phone: estimateData.client?.phone || estimateData.clientPhone || null,
        client_email: estimateData.client?.email || estimateData.clientEmail || null,
        client_address: estimateData.client?.address || estimateData.clientAddress || null,
        project_name: estimateData.projectName || null,
        items: estimateData.lineItems || estimateData.items || [],
        phases: estimateData.phases || [],
        schedule: estimateData.schedule || {},
        scope: estimateData.scope || {},
        subtotal: Math.max(0, parseFloat(estimateData.subtotal) || 0),
        tax_rate: Math.max(0, Math.min(100, parseFloat(estimateData.taxRate) || 0)),
        tax_amount: Math.max(0, parseFloat(estimateData.taxAmount) || 0),
        total: Math.max(0, parseFloat(estimateData.total) || 0),
        valid_until: estimateData.validUntil || null,
        payment_terms: estimateData.paymentTerms || 'Net 30',
        notes: estimateData.notes || '',
        labor_estimate: estimateData.laborEstimate || estimateData.labor_estimate || {},
        status: 'draft'
      })
      .select('id, estimate_number, project_id, project_name, client_name, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, total, status, valid_until, notes, payment_terms, phases, schedule, scope, labor_estimate, created_at, updated_at, user_id')
      .single();

    if (error) {
      // Handle duplicate estimate number — retry once
      if (error.code === '23505' && error.message?.includes('estimate_number')) {
        const { data: retryData, error: retryError } = await supabase
          .from('estimates')
          .insert({
            user_id: userId,
            project_id: projectId,
            client_name: estimateData.client?.name || estimateData.client || estimateData.clientName || 'Unnamed Client',
            client_phone: estimateData.client?.phone || estimateData.clientPhone || null,
            client_email: estimateData.client?.email || estimateData.clientEmail || null,
            client_address: estimateData.client?.address || estimateData.clientAddress || null,
            project_name: estimateData.projectName || null,
            items: estimateData.lineItems || estimateData.items || [],
            phases: estimateData.phases || [],
            schedule: estimateData.schedule || {},
            scope: estimateData.scope || {},
            subtotal: estimateData.subtotal || 0,
            tax_rate: estimateData.taxRate || 0,
            tax_amount: estimateData.taxAmount || 0,
            total: estimateData.total || 0,
            valid_until: estimateData.validUntil || null,
            payment_terms: estimateData.paymentTerms || 'Net 30',
            notes: estimateData.notes || '',
            labor_estimate: estimateData.laborEstimate || estimateData.labor_estimate || {},
            status: 'draft'
          })
          .select('id, estimate_number, project_id, project_name, client_name, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, total, status, valid_until, notes, payment_terms, phases, schedule, scope, labor_estimate, created_at, updated_at, user_id')
          .single();

        if (retryError) {
          console.error('Error saving estimate on retry:', retryError);
          return null;
        }
        // Use retryData for the rest of the function
        return retryData;
      }
      console.error('Error saving estimate:', error);
      return null;
    }

    // If estimate has projectId, update the project with estimate data
    if (estimateData.projectId && data) {
      const mergeMode = estimateData.mergeWithProject === true;
      const overrideMode = estimateData.overrideProject === true || !mergeMode;

      try {
        let existingProject = null;
        if (mergeMode) {
          const { data: proj } = await supabase
            .from('projects')
            .select('id, budget, contract_amount, base_contract, task_description')
            .eq('id', estimateData.projectId)
            .single();
          existingProject = proj;
        }

        const updateData = {};

        if (mergeMode && existingProject) {
          const newTotal = (existingProject.budget || 0) + (estimateData.total || 0);
          updateData.budget = newTotal;
          updateData.contract_amount = newTotal;
          updateData.base_contract = newTotal;
        } else {
          updateData.budget = estimateData.total;
          updateData.contract_amount = estimateData.total;
          updateData.base_contract = estimateData.total;
        }

        if (estimateData.schedule && estimateData.schedule.startDate) {
          updateData.start_date = estimateData.schedule.startDate;
        }

        if (estimateData.schedule && estimateData.schedule.estimatedEndDate) {
          updateData.end_date = estimateData.schedule.estimatedEndDate;
        }

        if (estimateData.scope && estimateData.scope.description) {
          if (mergeMode && existingProject && existingProject.task_description) {
            updateData.task_description = existingProject.task_description + '\n\n' + estimateData.scope.description;
          } else {
            updateData.task_description = estimateData.scope.description;
          }
        }

        const { error: projectError } = await supabase
          .from('projects')
          .update(updateData)
          .eq('id', estimateData.projectId);

        if (projectError) {
          console.error('Error updating project with estimate data:', projectError);
        }

        // Save phases if provided
        if (estimateData.phases && Array.isArray(estimateData.phases) && estimateData.phases.length > 0) {
          if (estimateData.schedule?.phaseSchedule && Array.isArray(estimateData.schedule.phaseSchedule)) {
            estimateData.phases = estimateData.phases.map((phase, index) => {
              const phaseSchedule = estimateData.schedule.phaseSchedule.find(
                ps => ps.phaseName === phase.name ||
                      ps.phaseName === `${phase.name} Phase` ||
                      ps.phaseName?.toLowerCase() === phase.name?.toLowerCase()
              ) || estimateData.schedule.phaseSchedule[index];

              if (phaseSchedule) {
                return {
                  ...phase,
                  startDate: phaseSchedule.startDate || phase.startDate,
                  endDate: phaseSchedule.endDate || phase.endDate
                };
              }
              return phase;
            });
          }

          if (estimateData.lineItems && Array.isArray(estimateData.lineItems) && estimateData.lineItems.length > 0) {
            const totalPhaseBudget = estimateData.phases.reduce((sum, p) => sum + (p.budget || 0), 0);

            if (totalPhaseBudget > 0) {
              estimateData.phases = estimateData.phases.map(phase => {
                const phaseServices = [];
                estimateData.lineItems.forEach(item => {
                  const itemTotal = item.total || 0;
                  if (itemTotal <= (phase.budget || 0) * 1.5) {
                    phaseServices.push(item);
                  }
                });

                return {
                  ...phase,
                  services: phaseServices.length > 0 ? phaseServices : []
                };
              });
            } else {
              if (estimateData.phases.length > 0) {
                estimateData.phases[0].services = estimateData.lineItems;
              }
            }
          }

          if (mergeMode) {
            const { data: existingPhases } = await supabase
              .from('project_phases')
              .select('id, name, order_index, planned_days, start_date, end_date, completion_percentage, status, tasks, budget, services')
              .eq('project_id', estimateData.projectId)
              .order('order_index');

            const startIndex = existingPhases?.length || 0;
            const phasesToAdd = estimateData.phases.map((phase, idx) => ({
              ...phase,
              order_index: startIndex + idx
            }));

            const phasesToInsert = phasesToAdd.map((phase) => ({
              project_id: estimateData.projectId,
              name: phase.name,
              order_index: phase.order_index,
              planned_days: phase.plannedDays || phase.defaultDays || 5,
              start_date: phase.startDate || null,
              end_date: phase.endDate || null,
              completion_percentage: phase.completionPercentage || 0,
              status: phase.status || 'not_started',
              time_extensions: phase.timeExtensions || [],
              tasks: phase.tasks || [],
              budget: phase.budget || 0,
              services: phase.services || [],
            }));

            const { error: insertError } = await supabase
              .from('project_phases')
              .insert(phasesToInsert);

            if (insertError) {
              console.error('Failed to merge phases:', insertError);
            }
          } else {
            const { saveProjectPhases } = await import('./projectPhases');
            await saveProjectPhases(estimateData.projectId, estimateData.phases);
          }
        }
      } catch (projectUpdateError) {
        console.error('Exception in project update:', projectUpdateError);
      }
    }

    // Record pricing to history for AI learning (non-blocking)
    try {
      const { recordEstimatePricing } = require('../../services/pricingIntelligence');
      const lineItems = estimateData.lineItems || estimateData.items || [];
      if (lineItems.length > 0) {
        recordEstimatePricing({
          id: data.id,
          items: lineItems,
          project_name: estimateData.projectName,
        }).catch(() => {});
      }
    } catch (pricingError) {
      // Don't fail estimate save if pricing history fails
    }

    return data;
  } catch (error) {
    console.error('Error in saveEstimate:', error);
    return null;
  }
};

/**
 * Update an existing estimate with new data
 * @param {object} estimateData - Updated estimate data (must include id or estimateId)
 * @returns {Promise<object|null>} Updated estimate or null
 */
export const updateEstimate = async (estimateData) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    const estimateId = estimateData.id || estimateData.estimateId;
    if (!estimateId) {
      console.error('No estimate ID provided');
      return null;
    }

    const { data, error } = await supabase
      .from('estimates')
      .update({
        project_id: estimateData.projectId || null,
        client_name: estimateData.client?.name || estimateData.client || estimateData.clientName || 'Unnamed Client',
        client_phone: estimateData.client?.phone || estimateData.clientPhone || null,
        client_email: estimateData.client?.email || estimateData.clientEmail || null,
        client_address: estimateData.client?.address || estimateData.clientAddress || null,
        project_name: estimateData.projectName || null,
        items: estimateData.lineItems || estimateData.items || [],
        phases: estimateData.phases || [],
        schedule: estimateData.schedule || {},
        scope: estimateData.scope || {},
        subtotal: estimateData.subtotal || 0,
        tax_rate: estimateData.taxRate || 0,
        tax_amount: estimateData.taxAmount || 0,
        total: estimateData.total || 0,
        valid_until: estimateData.validUntil || null,
        payment_terms: estimateData.paymentTerms || 'Net 30',
        notes: estimateData.notes || '',
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq('id', estimateId)
      .select('id, estimate_number, project_id, project_name, client_name, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, total, status, valid_until, notes, payment_terms, phases, schedule, scope, labor_estimate, created_at, updated_at, user_id')
      .single();

    if (error) {
      console.error('Error updating estimate:', error);
      return null;
    }

    // If estimate has projectId, update the project with the new estimate data
    if (estimateData.projectId && data) {
      try {
        const updateData = {
          budget: estimateData.total,
          contract_amount: estimateData.total,
          base_contract: estimateData.total,
        };

        if (estimateData.schedule && estimateData.schedule.startDate) {
          updateData.start_date = estimateData.schedule.startDate;
        }

        if (estimateData.schedule && estimateData.schedule.estimatedEndDate) {
          updateData.end_date = estimateData.schedule.estimatedEndDate;
        }

        if (estimateData.scope && estimateData.scope.description) {
          updateData.task_description = estimateData.scope.description;
        }

        const { error: projectError } = await supabase
          .from('projects')
          .update(updateData)
          .eq('id', estimateData.projectId);

        if (projectError) {
          console.error('Error updating project with estimate data:', projectError);
        }

        // Save phases to project_phases table if they exist
        if (estimateData.phases && Array.isArray(estimateData.phases) && estimateData.phases.length > 0) {
          const { saveProjectPhases } = await import('./projectPhases');
          await saveProjectPhases(estimateData.projectId, estimateData.phases);
        }
      } catch (projectUpdateError) {
        console.error('Exception in project update:', projectUpdateError);
      }
    }

    return data;
  } catch (error) {
    console.error('Error in updateEstimate:', error);
    return null;
  }
};

/**
 * Fetch all estimates for current user
 * @param {object} filters - Optional filters (status, dateRange, etc.)
 * @returns {Promise<array>} Array of estimates
 */
export const fetchEstimates = async (filters = {}) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return [];
    }

    // No `.eq('user_id', userId)` filter — RLS handles owner access (user_id
     // = auth.uid()) AND the new supervisor-read policy (linked project's
     // assigned_supervisor_id). Filtering by user_id here would block
     // supervisors from seeing estimates the owner created on their projects.
    let query = supabase
      .from('estimates')
      .select('id, estimate_number, project_id, project_name, client_name, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, total, status, valid_until, notes, payment_terms, phases, schedule, scope, labor_estimate, created_at, updated_at, user_id')
      .order('created_at', { ascending: false })
      .limit(50);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.clientName) {
      query = query.ilike('client_name', `%${filters.clientName}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching estimates:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchEstimates:', error);
    return [];
  }
};

/**
 * Fetch all estimates across all supervisors under this owner
 * Used by owner's AI chat to see company-wide estimate data
 * @param {object} filters - Optional filters (status, clientName)
 * @returns {Promise<array>} Estimates with supervisor info
 */
export const fetchEstimatesForOwner = async (filters = {}) => {
  try {
    const context = await getCurrentUserContext();
    if (!context) return [];

    // If not owner, fall back to regular fetchEstimates
    if (!context.isOwner) {
      return fetchEstimates(filters);
    }

    // Get all supervisors under this owner
    const supervisors = await getSupervisorsForOwner(context.userId);
    const supervisorIds = supervisors.map(s => s.id);
    const supervisorNames = Object.fromEntries(
      supervisors.map(s => [s.id, s.business_name || 'Supervisor'])
    );

    // Include owner's own estimates too
    const allIds = [context.userId, ...supervisorIds];

    let query = supabase
      .from('estimates')
      .select('id, estimate_number, project_id, project_name, client_name, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, total, status, valid_until, notes, payment_terms, phases, schedule, scope, labor_estimate, created_at, updated_at, user_id')
      .in('user_id', allIds)
      .order('created_at', { ascending: false })
      .limit(50);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.clientName) {
      query = query.ilike('client_name', `%${filters.clientName}%`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching estimates for owner:', error);
      return [];
    }

    // Add supervisor attribution
    return (data || []).map(estimate => ({
      ...estimate,
      supervisor_name: estimate.user_id === context.userId
        ? 'You (Owner)'
        : (supervisorNames[estimate.user_id] || 'Unknown Supervisor'),
      supervisor_id: estimate.user_id,
    }));
  } catch (error) {
    console.error('Error in fetchEstimatesForOwner:', error);
    return [];
  }
};

/**
 * Get a single estimate by ID
 * @param {string} estimateId - Estimate ID
 * @returns {Promise<object|null>} Estimate or null
 */
export const getEstimate = async (estimateId) => {
  try {
    const { data, error } = await supabase
      .from('estimates')
      .select('id, estimate_number, project_id, project_name, client_name, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, total, status, valid_until, notes, payment_terms, phases, schedule, scope, labor_estimate, created_at, updated_at, user_id')
      .eq('id', estimateId)
      .single();

    if (error) {
      console.error('Error fetching estimate:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getEstimate:', error);
    return null;
  }
};

/**
 * Get estimate by project name
 * @param {string} projectName - Project name to search for
 * @returns {Promise<object|null>} Estimate object or null
 */
export const getEstimateByProjectName = async (projectName) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    const { data, error } = await supabase
      .from('estimates')
      .select('id, estimate_number, project_id, project_name, client_name, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, total, status, valid_until, notes, payment_terms, phases, schedule, scope, labor_estimate, created_at, updated_at, user_id')
      .eq('user_id', userId)
      .ilike('project_name', `%${projectName}%`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching estimate by project name:', error);
      return null;
    }

    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error('Error in getEstimateByProjectName:', error);
    return null;
  }
};

/**
 * Fetch all estimates linked to a project
 * @param {string} projectId - Project ID
 * @returns {Promise<array>} Array of estimates for this project
 */
export const fetchEstimatesByProjectId = async (projectId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return [];
    }

    // Don't filter by user_id here — RLS policies grant access to both the
    // owner (user_id = auth.uid()) and the assigned supervisor (via the
    // projects table's assigned_supervisor_id). Adding `.eq('user_id', userId)`
    // would block supervisors from seeing estimates the owner created on
    // their assigned projects.
    const { data, error } = await supabase
      .from('estimates')
      .select('id, client_name, project_name, status, total, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching estimates for project:', error);
      return [];
    }

    return data.map(est => ({
      id: est.id,
      clientName: est.client_name,
      projectName: est.project_name,
      status: est.status || 'draft',
      total: est.total || 0,
      createdAt: est.created_at
    }));
  } catch (error) {
    console.error('Error in fetchEstimatesByProjectId:', error);
    return [];
  }
};

/**
 * Update estimate status
 * @param {string} estimateId - Estimate ID
 * @param {string} status - New status ('draft', 'sent', 'accepted', 'rejected')
 * @returns {Promise<boolean>} Success status
 */
export const updateEstimateStatus = async (estimateId, status) => {
  try {
    const updateData = { status };

    if (status === 'sent') {
      updateData.sent_date = new Date().toISOString();
    } else if (status === 'accepted') {
      updateData.accepted_date = new Date().toISOString();
    } else if (status === 'rejected') {
      updateData.rejected_date = new Date().toISOString();
    }

    const { error } = await supabase
      .from('estimates')
      .update(updateData)
      .eq('id', estimateId);

    if (error) {
      console.error('Error updating estimate status:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateEstimateStatus:', error);
    return false;
  }
};

/**
 * Delete an estimate
 * @param {string} estimateId - Estimate ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteEstimate = async (estimateId) => {
  try {
    const { error } = await supabase
      .from('estimates')
      .delete()
      .eq('id', estimateId);

    if (error) {
      console.error('Error deleting estimate:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteEstimate:', error);
    return false;
  }
};

/**
 * Create invoice from an estimate
 * @param {string} estimateId - Estimate ID to convert
 * @returns {Promise<object|null>} Created invoice or null
 */
export const createInvoiceFromEstimate = async (estimateId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    // Guard against duplicates — if any invoice already references this
    // estimate_id, return that one instead of creating a second. The user
    // tapping "Bill it all now" twice (or rapid double-tap) was creating
    // multiple invoices off the same estimate.
    const { data: existingInv } = await supabase
      .from('invoices')
      .select('id, invoice_number, estimate_id, project_name, client_name, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, total, amount_paid, status, due_date, payment_terms, notes, created_at, updated_at, user_id')
      .eq('user_id', userId)
      .eq('estimate_id', estimateId)
      .maybeSingle();
    if (existingInv) {
      // Return the existing invoice — caller's flow ("Invoice Created"
      // alert) is still appropriate; the estimate IS billed.
      return existingInv;
    }

    const { data: estimate, error: fetchError } = await supabase
      .from('estimates')
      .select('id, project_id, client_name, client_phone, client_email, client_address, project_name, items, subtotal, tax_rate, tax_amount, total, payment_terms, notes')
      .eq('id', estimateId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !estimate) {
      console.error('Error fetching estimate:', fetchError);
      return null;
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const { data: invoice, error: createError } = await supabase
      .from('invoices')
      .insert({
        user_id: userId,
        estimate_id: estimateId,
        project_id: estimate.project_id || null,
        client_name: estimate.client_name,
        client_phone: estimate.client_phone,
        client_email: estimate.client_email,
        client_address: estimate.client_address,
        project_name: estimate.project_name,
        items: estimate.items,
        subtotal: estimate.subtotal,
        tax_rate: estimate.tax_rate,
        tax_amount: estimate.tax_amount,
        total: estimate.total,
        due_date: dueDate.toISOString().split('T')[0],
        payment_terms: estimate.payment_terms,
        notes: estimate.notes,
        status: 'unpaid'
      })
      .select('id, invoice_number, estimate_id, project_name, client_name, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, total, amount_paid, status, due_date, payment_terms, notes, created_at, updated_at, user_id')
      .single();

    if (createError) {
      console.error('Error creating invoice:', createError);
      return null;
    }

    await updateEstimateStatus(estimateId, 'accepted');

    return invoice;
  } catch (error) {
    console.error('Error in createInvoiceFromEstimate:', error);
    return null;
  }
};

/**
 * Add an estimate to an existing project
 * @param {string} projectId - Project ID
 * @param {string} estimateId - Estimate ID to add
 * @param {string} mergeMode - 'merge' to combine or 'separate' to keep independent
 * @returns {Promise<object|null>} Updated project or null
 */
export const addEstimateToProject = async (projectId, estimateId, mergeMode = 'separate') => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    // Fetch the project
    const { getProject } = await import('./projects');
    const project = await getProject(projectId);
    if (!project) {
      console.error('Project not found:', projectId);
      return null;
    }

    // Fetch the estimate
    const estimate = await getEstimate(estimateId);
    if (!estimate) {
      console.error('Estimate not found:', estimateId);
      return null;
    }

    if (mergeMode === 'merge') {
      return await mergeEstimateIntoProject(project, estimate, userId);
    } else {
      return await addEstimateAsSeparateScope(project, estimate, userId);
    }
  } catch (error) {
    console.error('Error adding estimate to project:', error);
    return null;
  }
};

/**
 * Merge estimate into existing project phases (combine work)
 */
const mergeEstimateIntoProject = async (project, estimate, userId) => {
  const { fetchProjectPhases, saveProjectPhases } = await import('./projectPhases');
  const { getProject } = await import('./projects');

  const existingPhases = await fetchProjectPhases(project.id);
  const estimatePhases = estimate.phases || [];

  const mergedPhases = {};

  existingPhases.forEach(phase => {
    mergedPhases[phase.name] = {
      ...phase,
      tasks: [...(phase.tasks || [])],
      budget: phase.budget
    };
  });

  estimatePhases.forEach(estimatePhase => {
    const phaseName = estimatePhase.name;

    if (mergedPhases[phaseName]) {
      const existingPhase = mergedPhases[phaseName];

      (estimatePhase.tasks || []).forEach(newTask => {
        const isDuplicate = existingPhase.tasks.some(
          existingTask => existingTask.description?.toLowerCase() === newTask.description?.toLowerCase()
        );

        if (!isDuplicate) {
          existingPhase.tasks.push({
            ...newTask,
            order: existingPhase.tasks.length + 1
          });
        }
      });

      existingPhase.budget = (existingPhase.budget || 0) + (estimatePhase.budget || 0);
    } else {
      mergedPhases[phaseName] = {
        ...estimatePhase,
        tasks: [...(estimatePhase.tasks || [])]
      };
    }
  });

  const finalPhases = Object.values(mergedPhases);

  await saveProjectPhases(project.id, finalPhases, project.schedule);

  const estimateTotal = estimate.subtotal || estimate.total || 0;
  const newBaseContract = (project.baseContract || project.budget || 0) + estimateTotal;

  const { error } = await supabase
    .from('projects')
    .update({
      base_contract: newBaseContract,
      budget: newBaseContract
    })
    .eq('id', project.id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating project budget:', error);
    throw error;
  }

  return await getProject(project.id);
};

/**
 * Add estimate as separate scope within project (track independently)
 */
const addEstimateAsSeparateScope = async (project, estimate, userId) => {
  const { fetchProjectPhases, saveProjectPhases } = await import('./projectPhases');
  const { getProject } = await import('./projects');

  const existingPhases = await fetchProjectPhases(project.id);
  const estimatePhases = estimate.phases || [];

  const scopeId = `estimate-${estimate.id}`;
  const scopeName = estimate.project_name || `Estimate ${estimate.estimate_number}`;

  const newScopePhases = estimatePhases.map(phase => ({
    ...phase,
    scope_id: scopeId,
    scope_name: scopeName
  }));

  const allPhases = [...existingPhases, ...newScopePhases];

  await saveProjectPhases(project.id, allPhases, project.schedule);

  const currentExtras = project.extras || [];
  const newExtra = {
    id: scopeId,
    name: scopeName,
    amount: estimate.subtotal || estimate.total || 0,
    estimateId: estimate.id,
    addedAt: new Date().toISOString()
  };

  const updatedExtras = [...currentExtras, newExtra];

  const { error } = await supabase
    .from('projects')
    .update({
      extras: updatedExtras
    })
    .eq('id', project.id)
    .eq('user_id', userId);

  if (error) {
    console.error('Error updating project extras:', error);
    throw error;
  }

  return await getProject(project.id);
};

/**
 * Create a new project from an accepted estimate
 * @param {string} estimateId - The estimate ID to convert
 * @returns {Promise<object|null>} Created project or null
 */
export const createProjectFromEstimate = async (estimateId) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.error('No user logged in');
      return null;
    }

    const estimate = await getEstimate(estimateId);
    if (!estimate) {
      console.error('Estimate not found');
      return null;
    }

    const { saveProject } = await import('./projects');

    const projectData = {
      name: estimate.project_name || estimate.client_name || 'Unnamed Project',
      client: estimate.client_name,
      client_phone: estimate.client_phone,
      client_email: estimate.client_email,
      location: estimate.client_address,
      base_contract: estimate.total || 0,
      contract_amount: estimate.total || 0,
      income_collected: 0,
      expenses: 0,
      phases: estimate.phases || [],
      schedule: estimate.schedule || {},
      scope: estimate.scope || {},
      lineItems: estimate.items || [],
      status: 'active',
      taskDescription: estimate.scope?.description || '',
      estimate_id: estimate.id,
    };

    const createdProject = await saveProject(projectData);

    if (!createdProject) {
      console.error('Failed to create project from estimate');
      return null;
    }

    const { error: updateError } = await supabase
      .from('estimates')
      .update({
        status: 'accepted',
        accepted_date: new Date().toISOString(),
        project_id: createdProject.id,
      })
      .eq('id', estimateId);

    if (updateError) {
      console.error('Error updating estimate status:', updateError);
    }

    return createdProject;
  } catch (error) {
    console.error('Error creating project from estimate:', error);
    return null;
  }
};
