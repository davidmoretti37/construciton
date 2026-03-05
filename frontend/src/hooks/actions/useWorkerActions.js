import { useCallback } from 'react';
import { Alert } from 'react-native';
import logger from '../../utils/logger';
import { formatHoursMinutes } from '../../utils/calculations';
import {
  fetchWorkers,
  createWorker,
  updateWorker,
  deleteWorker,
  clockIn,
  clockOut,
  getActiveClockIn,
  getTodaysWorkersSchedule,
  editTimeEntry,
  createManualTimeEntry,
  deleteTimeEntry,
  setWorkerAvailability,
  setWorkerPTO,
  removeWorkerAvailability,
  createCrew,
  getCrew,
  updateCrew,
  deleteCrew,
  createShiftTemplate,
  applyShiftTemplate,
  deleteShiftTemplate,
  startWorkerBreak,
  endWorkerBreak,
  swapWorkerShifts,
  calculateWorkerPaymentForPeriod,
} from '../../utils/storage';

// Helper: Find worker by name (case-insensitive, partial match)
const findWorkerByName = (workers, searchName) => {
  if (!searchName || !workers) return null;
  const search = searchName.toLowerCase().trim();

  // Exact match first
  let match = workers.find(w =>
    w.full_name?.toLowerCase() === search
  );

  // Partial match (contains)
  if (!match) {
    match = workers.find(w =>
      w.full_name?.toLowerCase().includes(search)
    );
  }

  return match;
};

// Helper: Resolve partial UUID to full UUID
const resolveWorkerId = (workers, id) => {
  if (!id || !workers) return null;
  // Full UUID (36 chars)
  if (id.length === 36) return id;
  // Partial UUID - find by prefix
  const match = workers.find(w => w.id?.startsWith(id));
  return match?.id || null;
};

// Helper: Calculate date range based on period
const getDateRange = (period) => {
  const now = new Date();
  const formatDate = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  switch (period) {
    case 'this_week': {
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      monday.setHours(0, 0, 0, 0);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: formatDate(monday), to: formatDate(sunday) };
    }
    case 'last_week': {
      const dayOfWeek = now.getDay();
      const lastMonday = new Date(now);
      lastMonday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7);
      const lastSunday = new Date(lastMonday);
      lastSunday.setDate(lastMonday.getDate() + 6);
      return { from: formatDate(lastMonday), to: formatDate(lastSunday) };
    }
    case 'this_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: formatDate(firstDay), to: formatDate(lastDay) };
    }
    case 'last_month': {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: formatDate(firstDay), to: formatDate(lastDay) };
    }
    default:
      return { from: formatDate(now), to: formatDate(now) };
  }
};

/**
 * Hook for all worker-related actions
 * @param {Object} options
 * @param {Function} options.addMessage - Function to add a message to chat
 * @param {Function} options.setMessages - Function to update messages state
 */
export default function useWorkerActions({ addMessage, setMessages }) {

  const handleCreateWorker = useCallback(async (data) => {
    try {
      const worker = await createWorker(data);
      if (worker) {
        // Don't add message - agent response already confirms
        return worker;
      } else {
        Alert.alert('Error', 'Failed to create worker.');
        return null;
      }
    } catch (error) {
      logger.error('Error creating worker:', error);
      Alert.alert('Error', 'Failed to create worker.');
      return null;
    }
  }, []);

  const handleUpdateWorker = useCallback(async (data) => {
    try {
      const { workerId, id, workerName, ...updates } = data;
      let workerIdToUpdate = workerId || id;

      // Resolve partial ID if needed
      if (workerIdToUpdate && workerIdToUpdate.length < 36) {
        const workers = await fetchWorkers();
        const match = workers.find(w => w.id?.startsWith(workerIdToUpdate));
        if (match) {
          workerIdToUpdate = match.id;
        }
      }

      // If status is "deleted", actually delete the worker
      if (updates.status === 'deleted') {
        const success = await deleteWorker(workerIdToUpdate);
        if (success) {
          // Don't add message - agent response already confirms
          return true;
        } else {
          Alert.alert('Error', 'Failed to delete worker.');
          return false;
        }
      }

      const success = await updateWorker(workerIdToUpdate, updates);
      if (success) {
        // Don't add message - agent response already confirms
        return true;
      } else {
        Alert.alert('Error', 'Failed to update worker.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating worker:', error);
      Alert.alert('Error', 'Failed to update worker.');
      return false;
    }
  }, []);

  const handleDeleteWorker = useCallback(async (data) => {
    try {
      const { id, workerId, workerName } = data;
      const workerIdToDelete = id || workerId;

      // Resolve partial ID if needed
      let fullWorkerId = workerIdToDelete;
      if (workerIdToDelete && workerIdToDelete.length < 36) {
        const workers = await fetchWorkers();
        const match = workers.find(w => w.id?.startsWith(workerIdToDelete));
        if (match) {
          fullWorkerId = match.id;
        }
      }

      const success = await deleteWorker(fullWorkerId);
      if (success) {
        // Don't add message - agent response already confirms
        return true;
      } else {
        Alert.alert('Error', 'Failed to delete worker.');
        return false;
      }
    } catch (error) {
      logger.error('Error deleting worker:', error);
      Alert.alert('Error', 'Failed to delete worker.');
      return false;
    }
  }, []);

  const handleDeleteAllWorkers = useCallback(async (data, options = {}) => {
    try {
      const { confirmed = false } = data || {};
      const { skipConfirmation = false } = options;

      // Fetch all workers
      const workers = await fetchWorkers();
      if (!workers || workers.length === 0) {
        addMessage('You have no workers to delete.');
        return { success: true, count: 0 };
      }

      const workerCount = workers.length;

      // If confirmed from AI or skipConfirmation, delete all
      if (confirmed || skipConfirmation) {
        let deletedCount = 0;
        for (const worker of workers) {
          const success = await deleteWorker(worker.id);
          if (success) deletedCount++;
        }

        const confirmationMessage = {
          id: Date.now().toString(),
          text: `✅ Successfully deleted ${deletedCount} worker${deletedCount !== 1 ? 's' : ''}.`,
          isUser: false,
          timestamp: new Date(),
          visualElements: [],
          actions: [],
        };
        setMessages(prev => [...prev, confirmationMessage]);
        return { success: true, count: deletedCount };
      }

      // Otherwise show confirmation dialog
      return new Promise((resolve) => {
        Alert.alert(
          'Delete All Workers',
          `Are you sure you want to delete ALL ${workerCount} workers? This action cannot be undone and will remove all time tracking history.`,
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => resolve({ success: false, count: 0 })
            },
            {
              text: `Delete All ${workerCount}`,
              style: 'destructive',
              onPress: async () => {
                let deletedCount = 0;
                for (const worker of workers) {
                  const success = await deleteWorker(worker.id);
                  if (success) deletedCount++;
                }
                Alert.alert('Success', `Deleted ${deletedCount} workers`);
                const confirmationMessage = {
                  id: Date.now().toString(),
                  text: `✅ Successfully deleted ${deletedCount} worker${deletedCount !== 1 ? 's' : ''}.`,
                  isUser: false,
                  timestamp: new Date(),
                  visualElements: [],
                  actions: [],
                };
                setMessages(prev => [...prev, confirmationMessage]);
                resolve({ success: true, count: deletedCount });
              }
            }
          ]
        );
      });
    } catch (error) {
      logger.error('Error deleting all workers:', error);
      Alert.alert('Error', 'Failed to delete workers. Please try again.');
      return { success: false, count: 0 };
    }
  }, [addMessage, setMessages]);

  const handleGetWorkerPayment = useCallback(async (action) => {
    try {
      const actionData = action.data || action;
      const period = actionData.period || 'this_week';

      // Support workerName, workerNames, workerId, workerIds, or allWorkers
      let workerIds = [];
      const workers = await fetchWorkers();

      if (actionData.allWorkers) {
        // Get all active workers
        const activeWorkers = workers.filter(w => w.status === 'active' || !w.status);
        workerIds = activeWorkers.map(w => w.id);
        logger.debug('📅 Fetching payments for all workers:', activeWorkers.length);
      } else if (actionData.workerName || actionData.workerNames) {
        // Name-based resolution (preferred)
        const names = actionData.workerNames || [actionData.workerName];
        for (const name of names) {
          const match = findWorkerByName(workers, name);
          if (match) {
            workerIds.push(match.id);
          } else {
            logger.warn(`Worker not found: ${name}`);
          }
        }
      } else if (actionData.workerIds && Array.isArray(actionData.workerIds)) {
        // Array of IDs (may be partial)
        for (const id of actionData.workerIds) {
          const resolved = resolveWorkerId(workers, id);
          if (resolved) workerIds.push(resolved);
        }
      } else if (actionData.workerId) {
        // Single ID (may be partial)
        const resolved = resolveWorkerId(workers, actionData.workerId);
        if (resolved) workerIds.push(resolved);
      }

      if (workerIds.length === 0) {
        addMessage(`I couldn't find any workers. Please check and try again.`);
        return null;
      }

      const { from, to } = getDateRange(period);

      // Calculate payment for each worker
      const workerPayments = await Promise.all(
        workerIds.map(async (workerId) => {
          const paymentData = await calculateWorkerPaymentForPeriod(workerId, from, to);
          return paymentData;
        })
      );

      // Filter out workers with no payment data
      const validPayments = workerPayments.filter(p => p !== null);

      if (validPayments.length === 0) {
        addMessage('No workers found for this period.');
        return null;
      }

      // Check if any worker has hours recorded
      const hasAnyHours = validPayments.some(p => p.totalAmount > 0);
      if (!hasAnyHours) {
        addMessage('No work hours recorded for any workers in this period. Amount owed: $0.00');
        return null;
      }

      // Create SEPARATE payment cards for each worker
      const newMessages = [];

      validPayments.forEach((paymentData, index) => {
        if (!paymentData || paymentData.totalAmount === 0) return;

        const workerData = {
          workerId: paymentData.workerId,
          workerName: paymentData.workerName,
          paymentType: paymentData.paymentType,
          rate: paymentData.rate ? paymentData.rate[paymentData.paymentType] : 0,
          totalAmount: paymentData.totalAmount,
          totalHours: paymentData.totalHours,
          totalDays: paymentData.totalDays,
          byDate: paymentData.byDate,
          byProject: paymentData.byProject,
        };

        const messageId = `${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;
        newMessages.push({
          id: messageId,
          text: '',
          isUser: false,
          timestamp: new Date(),
          visualElements: [
            {
              type: 'worker-payment-card',
              data: {
                workers: [workerData],
                period: period,
                totalAmount: workerData.totalAmount,
                totalHours: workerData.totalHours,
                totalDays: workerData.totalDays,
              }
            }
          ],
          actions: [],
        });
      });

      // Add all messages
      setMessages((prev) => [...prev, ...newMessages]);
      return validPayments;

    } catch (error) {
      logger.error('Error getting worker payment:', error);
      Alert.alert('Error', 'Failed to calculate worker payment.');
      return null;
    }
  }, [addMessage, setMessages]);

  const handleClockInWorker = useCallback(async (data) => {
    try {
      const workerId = data.workerId || data.worker_id;
      const workerName = data.workerName || data.worker_name || 'Worker';
      const projectId = data.projectId || data.project_id;
      const projectName = data.projectName || data.project_name || 'project';
      const { location, clock_in_time } = data;
      const record = await clockIn(workerId, projectId, location, clock_in_time);
      if (record) {
        const time = new Date(record.clock_in).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit'
        });
        addMessage(`✅ Clocked in ${workerName} at ${projectName} (${time})`);
        return record;
      } else {
        Alert.alert('Error', 'Failed to clock in worker.');
        return null;
      }
    } catch (error) {
      logger.error('Error clocking in worker:', error);
      Alert.alert('Error', 'Failed to clock in worker.');
      return null;
    }
  }, [addMessage]);

  const handleClockOutWorker = useCallback(async (data) => {
    try {
      const workerId = data.workerId || data.worker_id;
      const workerName = data.workerName || data.worker_name || 'Worker';
      const { clock_out_time } = data;

      // Get active clock-in for this worker
      const activeRecord = await getActiveClockIn(workerId);
      if (!activeRecord) {
        Alert.alert('Error', `${workerName} is not currently clocked in.`);
        return null;
      }

      const result = await clockOut(activeRecord.id, data.notes, clock_out_time);
      if (result?.success) {
        // Calculate hours worked
        const clockInTime = new Date(activeRecord.clock_in);
        const clockOutTime = clock_out_time ? new Date(clock_out_time) : new Date();
        const hoursWorked = (clockOutTime - clockInTime) / (1000 * 60 * 60);
        addMessage(`✅ Clocked out ${workerName} (${formatHoursMinutes(hoursWorked)} worked)`);
        return { hoursWorked };
      } else {
        Alert.alert('Error', 'Failed to clock out worker.');
        return null;
      }
    } catch (error) {
      logger.error('Error clocking out worker:', error);
      Alert.alert('Error', 'Failed to clock out worker.');
      return null;
    }
  }, [addMessage]);

  const handleBulkClockIn = useCallback(async (data) => {
    try {
      const { worker_ids, project_id, location } = data;
      let successCount = 0;
      let failedWorkers = [];

      for (const workerId of worker_ids) {
        try {
          const record = await clockIn(workerId, project_id, location);
          if (record) successCount++;
          else failedWorkers.push(workerId);
        } catch (err) {
          failedWorkers.push(workerId);
        }
      }

      if (successCount > 0) {
        addMessage(`✅ Clocked in ${successCount} worker${successCount > 1 ? 's' : ''} at ${location || 'project site'}`);
      }
      if (failedWorkers.length > 0) {
        logger.warn('Failed to clock in some workers:', failedWorkers);
      }
      return { successCount, failedWorkers };
    } catch (error) {
      logger.error('Error in bulk clock in:', error);
      Alert.alert('Error', 'Failed to clock in workers.');
      return null;
    }
  }, [addMessage]);

  const handleBulkClockOut = useCallback(async (data) => {
    try {
      const { worker_ids, project_id } = data;
      let successCount = 0;
      let totalHours = 0;

      // If project_id provided, get all active workers at that project
      let workersToClockOut = worker_ids || [];

      if (project_id && !worker_ids) {
        const schedule = await getTodaysWorkersSchedule();
        workersToClockOut = schedule
          .filter(s => s.project_id === project_id && s.clock_in && !s.clock_out)
          .map(s => s.worker_id);
      }

      for (const workerId of workersToClockOut) {
        try {
          const activeRecord = await getActiveClockIn(workerId);
          if (activeRecord) {
            const success = await clockOut(activeRecord.id);
            if (success) {
              successCount++;
              const clockInTime = new Date(activeRecord.clock_in);
              const clockOutTime = new Date();
              totalHours += (clockOutTime - clockInTime) / (1000 * 60 * 60);
            }
          }
        } catch (err) {
          logger.warn('Failed to clock out worker:', workerId);
        }
      }

      if (successCount > 0) {
        addMessage(`✅ Clocked out ${successCount} worker${successCount > 1 ? 's' : ''} (${formatHoursMinutes(totalHours)} total)`);
      } else {
        addMessage('No workers were clocked in to clock out.');
      }
      return { successCount, totalHours };
    } catch (error) {
      logger.error('Error in bulk clock out:', error);
      Alert.alert('Error', 'Failed to clock out workers.');
      return null;
    }
  }, [addMessage]);

  const handleEditTimeEntry = useCallback(async (data) => {
    try {
      const { time_tracking_id, field, value } = data;
      const success = await editTimeEntry(time_tracking_id, { [field]: value });
      if (success) {
        addMessage(`✅ Updated time entry`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to update time entry.');
        return false;
      }
    } catch (error) {
      logger.error('Error editing time entry:', error);
      Alert.alert('Error', 'Failed to update time entry.');
      return false;
    }
  }, [addMessage]);

  const handleCreateTimeEntry = useCallback(async (data) => {
    try {
      const { worker_id, project_id, clock_in_time, clock_out_time, date } = data;
      const entry = await createManualTimeEntry(worker_id, project_id, clock_in_time, clock_out_time, date);
      if (entry) {
        const hours = entry.hours_worked || 0;
        addMessage(`✅ Added time entry: ${formatHoursMinutes(hours)}`);
        return entry;
      } else {
        Alert.alert('Error', 'Failed to create time entry.');
        return null;
      }
    } catch (error) {
      logger.error('Error creating time entry:', error);
      Alert.alert('Error', 'Failed to create time entry.');
      return null;
    }
  }, [addMessage]);

  const handleDeleteTimeEntry = useCallback(async (data) => {
    try {
      const { time_tracking_id } = data;
      const success = await deleteTimeEntry(time_tracking_id);
      if (success) {
        addMessage(`✅ Deleted time entry`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to delete time entry.');
        return false;
      }
    } catch (error) {
      logger.error('Error deleting time entry:', error);
      Alert.alert('Error', 'Failed to delete time entry.');
      return false;
    }
  }, [addMessage]);

  const handleSetWorkerAvailability = useCallback(async (data) => {
    try {
      const { worker_id, date, date_range, status, reason, time_range } = data;
      const result = await setWorkerAvailability({
        worker_id,
        date: date || date_range?.start,
        end_date: date_range?.end,
        status,
        reason,
        time_range
      });
      if (result) {
        addMessage(`✅ Marked worker as ${status}${date ? ` on ${date}` : ''}`);
        return result;
      } else {
        Alert.alert('Error', 'Failed to set worker availability.');
        return null;
      }
    } catch (error) {
      logger.error('Error setting worker availability:', error);
      Alert.alert('Error', 'Failed to set worker availability.');
      return null;
    }
  }, [addMessage]);

  const handleSetWorkerPTO = useCallback(async (data) => {
    try {
      const { worker_id, start_date, end_date, reason } = data;
      const result = await setWorkerPTO(worker_id, start_date, end_date, reason);
      if (result) {
        addMessage(`✅ Set PTO: ${start_date} to ${end_date}`);
        return result;
      } else {
        Alert.alert('Error', 'Failed to set worker PTO.');
        return null;
      }
    } catch (error) {
      logger.error('Error setting worker PTO:', error);
      Alert.alert('Error', 'Failed to set worker PTO.');
      return null;
    }
  }, [addMessage]);

  const handleRemoveWorkerAvailability = useCallback(async (data) => {
    try {
      const { availability_id } = data;
      const success = await removeWorkerAvailability(availability_id);
      if (success) {
        addMessage(`✅ Removed time off`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to remove availability.');
        return false;
      }
    } catch (error) {
      logger.error('Error removing availability:', error);
      Alert.alert('Error', 'Failed to remove availability.');
      return false;
    }
  }, [addMessage]);

  const handleCreateCrew = useCallback(async (data) => {
    try {
      const { name, worker_ids, default_project_id } = data;
      const crew = await createCrew({ name, worker_ids, default_project_id });
      if (crew) {
        addMessage(`✅ Created '${name}' crew with ${worker_ids.length} worker${worker_ids.length > 1 ? 's' : ''}`);
        return crew;
      } else {
        Alert.alert('Error', 'Failed to create crew.');
        return null;
      }
    } catch (error) {
      logger.error('Error creating crew:', error);
      Alert.alert('Error', 'Failed to create crew.');
      return null;
    }
  }, [addMessage]);

  const handleUpdateCrew = useCallback(async (data) => {
    try {
      const { crew_id, add_worker_ids, remove_worker_ids, name } = data;
      const success = await updateCrew(crew_id, { add_worker_ids, remove_worker_ids, name });
      if (success) {
        addMessage(`✅ Updated crew`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to update crew.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating crew:', error);
      Alert.alert('Error', 'Failed to update crew.');
      return false;
    }
  }, [addMessage]);

  const handleDeleteCrew = useCallback(async (data) => {
    try {
      const { crew_id } = data;
      const success = await deleteCrew(crew_id);
      if (success) {
        addMessage(`✅ Deleted crew`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to delete crew.');
        return false;
      }
    } catch (error) {
      logger.error('Error deleting crew:', error);
      Alert.alert('Error', 'Failed to delete crew.');
      return false;
    }
  }, [addMessage]);

  const handleCreateShiftTemplate = useCallback(async (data) => {
    try {
      const { name, start_time, end_time, break_duration, days } = data;
      const template = await createShiftTemplate({ name, start_time, end_time, break_duration, days });
      if (template) {
        addMessage(`✅ Created '${name}' shift template`);
        return template;
      } else {
        Alert.alert('Error', 'Failed to create shift template.');
        return null;
      }
    } catch (error) {
      logger.error('Error creating shift template:', error);
      Alert.alert('Error', 'Failed to create shift template.');
      return null;
    }
  }, [addMessage]);

  const handleApplyShiftTemplate = useCallback(async (data) => {
    try {
      const { template_id, worker_id, project_id, start_date, end_date } = data;
      const result = await applyShiftTemplate(template_id, worker_id, project_id, start_date, end_date);
      if (result) {
        addMessage(`✅ Applied shift template to worker`);
        return result;
      } else {
        Alert.alert('Error', 'Failed to apply shift template.');
        return null;
      }
    } catch (error) {
      logger.error('Error applying shift template:', error);
      Alert.alert('Error', 'Failed to apply shift template.');
      return null;
    }
  }, [addMessage]);

  const handleDeleteShiftTemplate = useCallback(async (data) => {
    try {
      const { template_id } = data;
      const success = await deleteShiftTemplate(template_id);
      if (success) {
        addMessage(`✅ Deleted shift template`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to delete shift template.');
        return false;
      }
    } catch (error) {
      logger.error('Error deleting shift template:', error);
      Alert.alert('Error', 'Failed to delete shift template.');
      return false;
    }
  }, [addMessage]);

  const handleStartBreak = useCallback(async (data) => {
    try {
      const { worker_id, break_type } = data;
      const result = await startWorkerBreak(worker_id, break_type);
      if (result) {
        const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        addMessage(`✅ Started ${break_type} break at ${time}`);
        return result;
      } else {
        Alert.alert('Error', 'Failed to start break.');
        return null;
      }
    } catch (error) {
      logger.error('Error starting break:', error);
      Alert.alert('Error', 'Failed to start break.');
      return null;
    }
  }, [addMessage]);

  const handleEndBreak = useCallback(async (data) => {
    try {
      const { worker_id } = data;
      const result = await endWorkerBreak(worker_id);
      if (result) {
        const duration = result.duration_minutes || 0;
        addMessage(`✅ Break ended (${duration} min)`);
        return result;
      } else {
        Alert.alert('Error', 'Failed to end break.');
        return null;
      }
    } catch (error) {
      logger.error('Error ending break:', error);
      Alert.alert('Error', 'Failed to end break.');
      return null;
    }
  }, [addMessage]);

  const handleSwapShifts = useCallback(async (data) => {
    try {
      const { shift_1_id, shift_2_id } = data;
      const success = await swapWorkerShifts(shift_1_id, shift_2_id);
      if (success) {
        addMessage(`✅ Swapped shifts successfully`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to swap shifts.');
        return false;
      }
    } catch (error) {
      logger.error('Error swapping shifts:', error);
      Alert.alert('Error', 'Failed to swap shifts.');
      return false;
    }
  }, [addMessage]);

  return {
    // Core worker operations
    handleCreateWorker,
    handleUpdateWorker,
    handleDeleteWorker,
    handleDeleteAllWorkers,
    handleGetWorkerPayment,

    // Clock in/out
    handleClockInWorker,
    handleClockOutWorker,
    handleBulkClockIn,
    handleBulkClockOut,

    // Time entries
    handleEditTimeEntry,
    handleCreateTimeEntry,
    handleDeleteTimeEntry,

    // Availability & PTO
    handleSetWorkerAvailability,
    handleSetWorkerPTO,
    handleRemoveWorkerAvailability,

    // Crew management
    handleCreateCrew,
    handleUpdateCrew,
    handleDeleteCrew,

    // Shift templates
    handleCreateShiftTemplate,
    handleApplyShiftTemplate,
    handleDeleteShiftTemplate,

    // Breaks
    handleStartBreak,
    handleEndBreak,

    // Shift swapping
    handleSwapShifts,
  };
}

// Export helpers for use in other files if needed
export { findWorkerByName, resolveWorkerId, getDateRange };
