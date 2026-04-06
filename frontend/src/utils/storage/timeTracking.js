import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from './auth';
import { getLocalTimestamp, getLocalDayBounds, getLocalDateString, getDateRangeBoundsUTC, formatHoursMinutes } from '../calculations';
import { responseCache } from '../../services/agents/core/CacheService';
import { cacheData, getCachedData } from '../../services/offlineCache';

// ============================================================
// Time Tracking Functions
// ============================================================

/**
 * Clock in a worker
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @param {object} location - Optional {latitude, longitude}
 * @param {string} customTime - Optional ISO timestamp or time string (e.g., "07:00", "2026-01-29T07:00:00")
 * @returns {Promise<object|null>} Time tracking record
 */
export const clockIn = async (workerId, projectId, location = null, customTime = null, servicePlanId = null) => {
  try {
    // Use custom time if provided, otherwise use current local timestamp
    let localTimestamp;
    if (customTime) {
      // If it's just a time (HH:MM), combine with today's date
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(customTime)) {
        const today = new Date();
        const [hours, minutes] = customTime.split(':').map(Number);
        today.setHours(hours, minutes, 0, 0);
        localTimestamp = today.toISOString();
      } else {
        // Assume it's already an ISO timestamp or parseable date
        localTimestamp = new Date(customTime).toISOString();
      }
    } else {
      localTimestamp = getLocalTimestamp();
    }

    // First, insert the clock-in record
    const insertPayload = {
      worker_id: workerId,
      clock_in: localTimestamp,
      location_lat: location?.latitude,
      location_lng: location?.longitude,
    };
    if (servicePlanId) {
      insertPayload.service_plan_id = servicePlanId;
    } else {
      insertPayload.project_id = projectId;
    }
    const { data: insertedData, error: insertError } = await supabase
      .from('time_tracking')
      .insert(insertPayload)
      .select('id, worker_id, project_id, clock_in, clock_out, notes, location_lat, location_lng, created_at')
      .single();

    if (insertError) {
      console.error('Error clocking in:', insertError);
      return null;
    }

    // Then fetch the record with the project/service_plan join (Supabase can't join on insert)
    const { data, error } = await supabase
      .from('time_tracking')
      .select(`
        id, worker_id, project_id, service_plan_id, clock_in, clock_out, notes, location_lat, location_lng, created_at,
        projects:project_id (
          id,
          name
        ),
        service_plans:service_plan_id (
          id,
          name
        )
      `)
      .eq('id', insertedData.id)
      .single();

    if (error) {
      console.error('Error fetching clock-in with project:', error);
      // Invalidate cache even on partial success
      responseCache.invalidateAgent('WorkersSchedulingAgent');
      // Return the basic data if join fails
      return insertedData;
    }

    // Invalidate cache since worker status changed
    responseCache.invalidateAgent('WorkersSchedulingAgent');
    console.log('Clock-in successful:', data);

    // Notify owner (and supervisor) about clock-in
    try {
      const { data: workerInfo } = await supabase.from('workers')
        .select('owner_id, full_name').eq('id', workerId).single();
      if (workerInfo?.owner_id) {
        const projectName = data?.projects?.name || '';
        supabase.functions.invoke('send-push-notification', {
          body: {
            userId: workerInfo.owner_id,
            title: 'Worker Clocked In',
            body: `${workerInfo.full_name} clocked in${projectName ? ` on ${projectName}` : ''}`,
            type: 'worker_update',
            data: { screen: 'Workers' },
            workerId,
          },
        });
        // Also notify assigned supervisor if different from owner
        if (projectId) {
          const { data: proj } = await supabase.from('projects')
            .select('assigned_supervisor_id').eq('id', projectId).single();
          if (proj?.assigned_supervisor_id && proj.assigned_supervisor_id !== workerInfo.owner_id) {
            supabase.functions.invoke('send-push-notification', {
              body: {
                userId: proj.assigned_supervisor_id,
                title: 'Worker Clocked In',
                body: `${workerInfo.full_name} clocked in${projectName ? ` on ${projectName}` : ''}`,
                type: 'worker_update',
                data: { screen: 'Workers' },
                workerId,
              },
            });
          }
        }
      }
    } catch (e) { /* fire and forget */ }

    return data;
  } catch (error) {
    console.error('Error in clockIn:', error);
    return null;
  }
};

/**
 * Clock out a worker and automatically calculate/record labor costs
 * @param {string} timeTrackingId - Time tracking record ID
 * @param {string} notes - Optional notes
 * @param {string} customTime - Optional ISO timestamp or time string (e.g., "17:00", "2026-01-29T17:00:00")
 * @returns {Promise<{success: boolean, laborCost?: number, hours?: number}>} Result with labor cost details
 */
export const clockOut = async (timeTrackingId, notes = null, customTime = null) => {
  try {
    // Use custom time if provided, otherwise use current local timestamp
    let clockOutTime;
    if (customTime) {
      // If it's just a time (HH:MM), combine with today's date
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(customTime)) {
        const today = new Date();
        const [hours, minutes] = customTime.split(':').map(Number);
        today.setHours(hours, minutes, 0, 0);
        clockOutTime = today.toISOString();
      } else {
        // Assume it's already an ISO timestamp or parseable date
        clockOutTime = new Date(customTime).toISOString();
      }
    } else {
      clockOutTime = getLocalTimestamp();
    }

    const { data: timeEntry, error: fetchError } = await supabase
      .from('time_tracking')
      .select(`
        id, worker_id, project_id, clock_in, clock_out, notes,
        workers!inner (
          id,
          full_name,
          payment_type,
          hourly_rate,
          daily_rate,
          weekly_salary,
          project_rate
        ),
        projects!inner (
          id,
          name
        )
      `)
      .eq('id', timeTrackingId)
      .single();

    if (fetchError || !timeEntry) {
      console.error('Error fetching time entry:', fetchError);
      return { success: false };
    }

    const { error: updateError } = await supabase
      .from('time_tracking')
      .update({
        clock_out: clockOutTime,
        notes: notes,
      })
      .eq('id', timeTrackingId);

    if (updateError) {
      console.error('Error clocking out:', updateError);
      return { success: false };
    }

    const clockInTime = new Date(timeEntry.clock_in);
    const clockOutDate = new Date(clockOutTime);
    const hoursWorked = (clockOutDate - clockInTime) / (1000 * 60 * 60);

    const worker = timeEntry.workers;
    let laborCost = 0;
    let costDescription = '';

    switch (worker.payment_type) {
      case 'hourly':
        laborCost = hoursWorked * (worker.hourly_rate || 0);
        costDescription = `${worker.full_name} - ${formatHoursMinutes(hoursWorked)} @ $${worker.hourly_rate}/hr`;
        break;

      case 'daily':
        if (hoursWorked < 5) {
          laborCost = (worker.daily_rate || 0) * 0.5;
          costDescription = `${worker.full_name} - Half day (${formatHoursMinutes(hoursWorked)}) @ $${worker.daily_rate}/day`;
        } else {
          laborCost = worker.daily_rate || 0;
          costDescription = `${worker.full_name} - Full day (${formatHoursMinutes(hoursWorked)}) @ $${worker.daily_rate}/day`;
        }
        break;

      case 'weekly':
      case 'project_based':
        return { success: true, hours: hoursWorked, laborCost: 0 };

      default:
        return { success: true, hours: hoursWorked, laborCost: 0 };
    }

    if (laborCost > 0) {
      const { error: transactionError } = await supabase
        .from('project_transactions')
        .insert({
          project_id: timeEntry.project_id,
          type: 'expense',
          category: 'labor',
          description: costDescription,
          amount: laborCost,
          date: getLocalDateString(), // Use local date
          worker_id: worker.id,
          time_tracking_id: timeTrackingId,
          is_auto_generated: true,
          notes: notes
        });

      if (transactionError) {
        console.error('Error creating labor cost transaction:', transactionError);
        // Invalidate cache even if transaction failed (worker is still clocked out)
        responseCache.invalidateAgent('WorkersSchedulingAgent');
        return { success: true, hours: hoursWorked, laborCost: 0 };
      }
    }

    // Invalidate cache since worker status changed
    responseCache.invalidateAgent('WorkersSchedulingAgent');

    // Notify owner (and supervisor) about clock-out
    try {
      const { data: workerInfo } = await supabase.from('workers')
        .select('owner_id, full_name').eq('id', timeEntry.worker_id).single();
      if (workerInfo?.owner_id) {
        const projectName = timeEntry.projects?.name || '';
        supabase.functions.invoke('send-push-notification', {
          body: {
            userId: workerInfo.owner_id,
            title: 'Worker Clocked Out',
            body: `${workerInfo.full_name} clocked out${projectName ? ` from ${projectName}` : ''} (${formatHoursMinutes(hoursWorked)})`,
            type: 'worker_update',
            data: { screen: 'Workers' },
            workerId: timeEntry.worker_id,
          },
        });
        if (timeEntry.project_id) {
          const { data: proj } = await supabase.from('projects')
            .select('assigned_supervisor_id').eq('id', timeEntry.project_id).single();
          if (proj?.assigned_supervisor_id && proj.assigned_supervisor_id !== workerInfo.owner_id) {
            supabase.functions.invoke('send-push-notification', {
              body: {
                userId: proj.assigned_supervisor_id,
                title: 'Worker Clocked Out',
                body: `${workerInfo.full_name} clocked out${projectName ? ` from ${projectName}` : ''} (${formatHoursMinutes(hoursWorked)})`,
                type: 'worker_update',
                data: { screen: 'Workers' },
                workerId: timeEntry.worker_id,
              },
            });
          }
        }
      }
    } catch (e) { /* fire and forget */ }

    return { success: true, hours: hoursWorked, laborCost };
  } catch (error) {
    console.error('Error in clockOut:', error);
    return { success: false };
  }
};

/**
 * Get current active time tracking session for a worker
 * @param {string} workerId - Worker ID
 * @returns {Promise<object|null>} Active time tracking record
 */
export const getActiveClockIn = async (workerId) => {
  try {
    const { data, error } = await supabase
      .from('time_tracking')
      .select(`
        id, worker_id, project_id, service_plan_id, clock_in, clock_out, break_start, break_end, breaks, notes, location_lat, location_lng,
        projects:project_id (
          id,
          name
        ),
        service_plans:service_plan_id (
          id,
          name
        )
      `)
      .eq('worker_id', workerId)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        cacheData(`clockin_${workerId}`, null);
        return null;
      }
      console.error('Error fetching active clock-in:', error);
      return getCachedData(`clockin_${workerId}`, true);
    }

    cacheData(`clockin_${workerId}`, data);
    return data;
  } catch (error) {
    console.error('Error in getActiveClockIn:', error);
    return getCachedData(`clockin_${workerId}`, true);
  }
};

/**
 * Get all workers currently clocked in TODAY
 * @returns {Promise<array>} Array of today's active clock-ins with worker and project info
 */
export const getClockedInWorkersToday = async () => {
  try {
    // Use local day bounds for accurate "today" filtering
    const { startOfDay, endOfDay } = getLocalDayBounds();

    const { data, error } = await supabase
      .from('time_tracking')
      .select(`
        id,
        worker_id,
        project_id,
        clock_in,
        clock_out,
        workers:worker_id (
          id,
          full_name,
          trade,
          payment_type,
          daily_rate,
          hourly_rate
        ),
        projects:project_id (
          id,
          name
        )
      `)
      .gte('clock_in', startOfDay)
      .lte('clock_in', endOfDay)
      .is('clock_out', null)
      .order('clock_in', { ascending: false });

    if (error) {
      console.error('Error fetching clocked-in workers today:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getClockedInWorkersToday:', error);
    return [];
  }
};

/**
 * Get stale clock-ins (workers who clocked in before today but never clocked out)
 * @returns {Promise<array>} Array of stale clock-in records
 */
export const getStaleClockIns = async () => {
  try {
    // Use local day bounds - stale means before today's start
    const { startOfDay } = getLocalDayBounds();

    const { data, error } = await supabase
      .from('time_tracking')
      .select(`
        id,
        worker_id,
        project_id,
        clock_in,
        workers:worker_id (
          id,
          full_name
        ),
        projects:project_id (
          id,
          name
        )
      `)
      .lt('clock_in', startOfDay)
      .is('clock_out', null)
      .order('clock_in', { ascending: false });

    if (error) {
      console.error('Error fetching stale clock-ins:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getStaleClockIns:', error);
    return [];
  }
};

/**
 * Get completed shifts for today (workers who clocked in AND out today)
 * @returns {Promise<array>} Array of completed shifts with worker and project info
 */
export const getCompletedShiftsToday = async () => {
  try {
    // Use local day bounds for accurate "today" filtering
    const { startOfDay, endOfDay } = getLocalDayBounds();
    const todayDateString = getLocalDateString();

    // Get all completed time entries for today
    const { data: timeEntries, error: timeError } = await supabase
      .from('time_tracking')
      .select(`
        id,
        worker_id,
        project_id,
        clock_in,
        clock_out,
        workers:worker_id (
          id,
          full_name,
          trade,
          payment_type,
          daily_rate,
          hourly_rate
        ),
        projects:project_id (
          id,
          name
        )
      `)
      .gte('clock_in', startOfDay)
      .lte('clock_in', endOfDay)
      .not('clock_out', 'is', null)
      .order('clock_out', { ascending: false });

    if (timeError) {
      console.error('Error fetching completed shifts today:', timeError);
      return [];
    }

    if (!timeEntries || timeEntries.length === 0) {
      return [];
    }

    // Get daily reports for today to check which workers submitted reports
    const workerIds = [...new Set(timeEntries.map(e => e.worker_id))];
    const { data: dailyReports, error: reportsError } = await supabase
      .from('daily_reports')
      .select('id, worker_id, project_id, photos, notes, tags')
      .in('worker_id', workerIds)
      .eq('report_date', todayDateString);

    if (reportsError) {
      console.error('Error fetching daily reports:', reportsError);
    }

    // Create a map of worker_id+project_id to daily report
    const reportMap = {};
    (dailyReports || []).forEach(report => {
      const key = `${report.worker_id}_${report.project_id}`;
      reportMap[key] = report;
    });

    // Enrich time entries with hours worked and daily report info
    const enrichedEntries = timeEntries.map(entry => {
      const clockIn = new Date(entry.clock_in);
      const clockOut = new Date(entry.clock_out);
      const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60);

      const reportKey = `${entry.worker_id}_${entry.project_id}`;
      const dailyReport = reportMap[reportKey] || null;

      return {
        ...entry,
        hoursWorked: parseFloat(hoursWorked.toFixed(2)),
        dailyReport: dailyReport ? {
          id: dailyReport.id,
          hasPhotos: (dailyReport.photos || []).length > 0,
          photoCount: (dailyReport.photos || []).length,
          hasNotes: !!dailyReport.notes,
          tags: dailyReport.tags || [],
        } : null,
      };
    });

    return enrichedEntries;
  } catch (error) {
    console.error('Error in getCompletedShiftsToday:', error);
    return [];
  }
};

/**
 * Get worker timesheet for a date range
 * @param {string} workerId - Worker ID
 * @param {object} dateRange - {startDate, endDate} in ISO format
 * @returns {Promise<array>} Array of time tracking records
 */
export const getWorkerTimesheet = async (workerId, dateRange = null) => {
  try {
    let query = supabase
      .from('time_tracking')
      .select(`
        id, worker_id, project_id, clock_in, clock_out, break_start, break_end, notes, created_at,
        projects:project_id (
          id,
          name,
          location
        )
      `)
      .eq('worker_id', workerId)
      .order('clock_in', { ascending: false })
      .limit(50);

    if (dateRange) {
      if (dateRange.startDate) {
        query = query.gte('clock_in', dateRange.startDate);
      }
      if (dateRange.endDate) {
        query = query.lte('clock_in', dateRange.endDate);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching timesheet:', error);
      return [];
    }

    return data?.map(entry => {
      let hours = 0;
      if (entry.clock_in && entry.clock_out) {
        const clockIn = new Date(entry.clock_in);
        const clockOut = new Date(entry.clock_out);
        hours = (clockOut - clockIn) / (1000 * 60 * 60);

        if (entry.break_start && entry.break_end) {
          const breakStart = new Date(entry.break_start);
          const breakEnd = new Date(entry.break_end);
          const breakHours = (breakEnd - breakStart) / (1000 * 60 * 60);
          hours -= breakHours;
        }
      }

      return {
        ...entry,
        hours: parseFloat(hours.toFixed(2)),
      };
    }) || [];
  } catch (error) {
    console.error('Error in getWorkerTimesheet:', error);
    return [];
  }
};

/**
 * Get worker time stats for a project
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @returns {Promise<object>} Time stats {totalHours, entries}
 */
export const getWorkerProjectHours = async (workerId, projectId) => {
  try {
    const { data, error } = await supabase
      .from('time_tracking')
      .select('id, worker_id, project_id, clock_in, clock_out, break_start, break_end, status, notes, created_at')
      .eq('worker_id', workerId)
      .eq('project_id', projectId)
      .not('clock_out', 'is', null);

    if (error) {
      console.error('Error fetching project hours:', error);
      return { totalHours: 0, entries: [] };
    }

    let totalHours = 0;
    const entries = data?.map(entry => {
      const clockIn = new Date(entry.clock_in);
      const clockOut = new Date(entry.clock_out);
      let hours = (clockOut - clockIn) / (1000 * 60 * 60);

      if (entry.break_start && entry.break_end) {
        const breakStart = new Date(entry.break_start);
        const breakEnd = new Date(entry.break_end);
        hours -= (breakEnd - breakStart) / (1000 * 60 * 60);
      }

      totalHours += hours;

      return {
        ...entry,
        hours: parseFloat(hours.toFixed(2)),
      };
    }) || [];

    return {
      totalHours: parseFloat(totalHours.toFixed(2)),
      entries,
    };
  } catch (error) {
    console.error('Error in getWorkerProjectHours:', error);
    return { totalHours: 0, entries: [] };
  }
};

/**
 * Get all workers with today's clock-in records grouped by project
 * @returns {Promise<object>} Object with unassigned workers and workers grouped by project
 */
export const getTodaysWorkersSchedule = async () => {
  try {
    // Use local day bounds for accurate "today" filtering
    const { startOfDay, endOfDay } = getLocalDayBounds();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data: allWorkers, error: workersError } = await supabase
      .from('workers')
      .select('id, full_name, trade, payment_type, daily_rate, hourly_rate, status')
      .eq('owner_id', user.id)
      .eq('status', 'active');

    if (workersError) throw workersError;

    const { data: todayClockIns, error: clockInsError } = await supabase
      .from('time_tracking')
      .select(`
        id,
        worker_id,
        project_id,
        clock_in,
        clock_out,
        projects:project_id (
          id,
          name
        )
      `)
      .gte('clock_in', startOfDay)
      .lte('clock_in', endOfDay)
      .order('clock_in', { ascending: false });

    if (clockInsError) throw clockInsError;

    const workerClockIns = {};
    todayClockIns?.forEach(clockIn => {
      if (!workerClockIns[clockIn.worker_id]) {
        workerClockIns[clockIn.worker_id] = [];
      }
      workerClockIns[clockIn.worker_id].push(clockIn);
    });

    const unassignedWorkers = [];
    const projectGroups = {};

    allWorkers?.forEach(worker => {
      const clockIns = workerClockIns[worker.id];

      if (!clockIns || clockIns.length === 0) {
        unassignedWorkers.push(worker);
      } else {
        const latestClockIn = clockIns[0];
        const isActive = !latestClockIn.clock_out;

        if (isActive) {
          const workerWithClockIn = {
            ...worker,
            latestClockIn,
            isActive,
            clockInTime: latestClockIn.clock_in,
            hoursWorked: (new Date() - new Date(latestClockIn.clock_in)) / (1000 * 60 * 60)
          };

          const projectId = latestClockIn.project_id;
          const projectName = latestClockIn.projects?.name || 'Unknown Project';

          if (!projectGroups[projectId]) {
            projectGroups[projectId] = {
              projectId,
              projectName,
              workers: []
            };
          }

          projectGroups[projectId].workers.push(workerWithClockIn);
        } else {
          unassignedWorkers.push(worker);
        }
      }
    });

    const result = {
      unassignedWorkers,
      projectGroups: Object.values(projectGroups),
      totalWorkers: allWorkers?.length || 0,
      clockedInCount: Object.keys(workerClockIns).length
    };
    cacheData('todays_schedule', result);
    return result;
  } catch (error) {
    console.error('Error getting today\'s workers schedule:', error);
    const cached = getCachedData('todays_schedule', true);
    if (cached) return cached;
    return {
      unassignedWorkers: [],
      projectGroups: [],
      totalWorkers: 0,
      clockedInCount: 0
    };
  }
};

/**
 * Get worker clock-in history
 * @param {string} workerId - Worker ID
 * @param {number} limit - Number of records to return (default 30)
 * @returns {Promise<array>} Array of clock-in records
 */
export const getWorkerClockInHistory = async (workerId, limit = 30) => {
  try {
    const { data, error } = await supabase
      .from('time_tracking')
      .select(`
        id, worker_id, project_id, clock_in, clock_out, notes, created_at,
        location_lat, location_lng,
        projects:project_id (
          id,
          name
        )
      `)
      .eq('worker_id', workerId)
      .order('clock_in', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const historyWithHours = data?.map(entry => ({
      ...entry,
      hoursWorked: entry.clock_out
        ? (new Date(entry.clock_out) - new Date(entry.clock_in)) / (1000 * 60 * 60)
        : null
    })) || [];

    return historyWithHours;
  } catch (error) {
    console.error('Error getting worker clock-in history:', error);
    return [];
  }
};

/**
 * Get worker stats for current week and month
 * @param {string} workerId - Worker ID
 * @returns {Promise<object>} Stats object with week/month hours
 */
export const getWorkerStats = async (workerId) => {
  try {
    const now = new Date();

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const { data, error } = await supabase
      .from('time_tracking')
      .select('id, worker_id, project_id, clock_in, clock_out')
      .eq('worker_id', workerId)
      .not('clock_out', 'is', null)
      .gte('clock_in', startOfMonth.toISOString());

    if (error) throw error;

    let weekHours = 0;
    let monthHours = 0;
    const projectHours = {};

    data?.forEach(entry => {
      const hours = (new Date(entry.clock_out) - new Date(entry.clock_in)) / (1000 * 60 * 60);
      const clockInDate = new Date(entry.clock_in);

      if (clockInDate >= startOfWeek) {
        weekHours += hours;
      }
      monthHours += hours;

      const projectId = entry.project_id;
      if (!projectHours[projectId]) {
        projectHours[projectId] = 0;
      }
      projectHours[projectId] += hours;
    });

    let mostWorkedProject = null;
    let maxHours = 0;
    Object.entries(projectHours).forEach(([projectId, hours]) => {
      if (hours > maxHours) {
        maxHours = hours;
        mostWorkedProject = projectId;
      }
    });

    return {
      weekHours: Math.round(weekHours * 100) / 100,
      monthHours: Math.round(monthHours * 100) / 100,
      mostWorkedProjectId: mostWorkedProject,
      mostWorkedProjectHours: Math.round(maxHours * 100) / 100
    };
  } catch (error) {
    console.error('Error getting worker stats:', error);
    return {
      weekHours: 0,
      monthHours: 0,
      mostWorkedProjectId: null,
      mostWorkedProjectHours: 0
    };
  }
};

// ============================================================
// Payment Calculation Functions
// ============================================================

/**
 * Calculate payment for a worker based on their payment type for a given period
 * @param {string} workerId - Worker ID
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @returns {Promise<object>} Payment breakdown with project details
 */
export const calculateWorkerPaymentForPeriod = async (workerId, fromDate, toDate) => {
  try {
    const { data: worker, error: workerError } = await supabase
      .from('workers')
      .select('id, full_name, payment_type, hourly_rate, daily_rate, weekly_salary, project_rate')
      .eq('id', workerId)
      .single();

    if (workerError || !worker) {
      console.error('Error fetching worker:', workerError);
      return null;
    }

    // Convert date range to proper UTC bounds for accurate timezone-aware queries
    const { startOfRange, endOfRange } = getDateRangeBoundsUTC(fromDate, toDate);

    // Fetch sessions that OVERLAP the date range (not just those starting in it).
    // A session overlaps if: clock_in < endOfRange AND (clock_out >= startOfRange OR clock_out IS NULL)
    const { data: timeEntries, error: timeError } = await supabase
      .from('time_tracking')
      .select(`
        id, worker_id, project_id, clock_in, clock_out, notes,
        projects (id, name)
      `)
      .eq('worker_id', workerId)
      .lt('clock_in', endOfRange)
      .or(`clock_out.gte.${startOfRange},clock_out.is.null`)
      .order('clock_in', { ascending: true })
      .limit(200);

    if (timeError) {
      console.error('Error fetching time entries:', timeError);
      return null;
    }

    if (!timeEntries || timeEntries.length === 0) {
      return {
        workerId: worker.id,
        workerName: worker.full_name || 'Unknown Worker',
        totalAmount: 0,
        totalHours: 0,
        totalDays: 0,
        dateRange: { from: fromDate, to: toDate },
        paymentType: worker.payment_type,
        byProject: [],
        byDate: []
      };
    }

    // Clamp clock_in/clock_out to the date range so we only count hours within the period
    const rangeStart = new Date(startOfRange);
    const rangeEnd = new Date(endOfRange);
    const now = new Date();

    const entriesWithHours = timeEntries.map(entry => {
      const rawClockIn = new Date(entry.clock_in);
      const rawClockOut = entry.clock_out ? new Date(entry.clock_out) : now;
      // Clamp to range boundaries
      const effectiveIn = rawClockIn < rangeStart ? rangeStart : rawClockIn;
      const effectiveOut = rawClockOut > rangeEnd ? rangeEnd : rawClockOut;
      const hours = Math.max(0, (effectiveOut - effectiveIn) / (1000 * 60 * 60));
      const date = effectiveIn.toISOString().split('T')[0];

      return {
        ...entry,
        hours,
        date
      };
    });

    let paymentBreakdown;

    switch (worker.payment_type) {
      case 'hourly':
        paymentBreakdown = calculateHourlyPayment(entriesWithHours, worker.hourly_rate);
        break;
      case 'daily':
        paymentBreakdown = calculateDailyPayment(entriesWithHours, worker.daily_rate);
        break;
      case 'weekly':
        paymentBreakdown = calculateWeeklyPayment(entriesWithHours, worker.weekly_salary, fromDate, toDate);
        break;
      case 'project_based':
        paymentBreakdown = calculateProjectBasedPayment(entriesWithHours, worker.project_rate);
        break;
      default:
        paymentBreakdown = { totalAmount: 0, byProject: [], byDate: [] };
    }

    return {
      ...paymentBreakdown,
      workerId: worker.id,
      workerName: worker.full_name || 'Unknown Worker',
      totalHours: entriesWithHours.reduce((sum, e) => sum + e.hours, 0),
      dateRange: { from: fromDate, to: toDate },
      paymentType: worker.payment_type,
      rate: {
        hourly: worker.hourly_rate,
        daily: worker.daily_rate,
        weekly: worker.weekly_salary,
        project: worker.project_rate
      }
    };
  } catch (error) {
    console.error('Error calculating worker payment:', error);
    return null;
  }
};

// Exported for testing - pure calculation functions
export function calculateHourlyPayment(entries, hourlyRate) {
  const byProject = {};
  const byDate = {};

  entries.forEach(entry => {
    const amount = entry.hours * (hourlyRate || 0);
    const projectId = entry.project_id;
    const projectName = entry.projects?.name || 'Unknown Project';
    const date = entry.date;

    if (!byProject[projectId]) {
      byProject[projectId] = {
        projectId,
        projectName,
        hours: 0,
        amount: 0,
        sessions: []
      };
    }
    byProject[projectId].hours += entry.hours;
    byProject[projectId].amount += amount;
    byProject[projectId].sessions.push({ ...entry, amount });

    if (!byDate[date]) {
      byDate[date] = {
        date,
        hours: 0,
        amount: 0,
        projects: []
      };
    }
    byDate[date].hours += entry.hours;
    byDate[date].amount += amount;
    byDate[date].projects.push({ projectName, hours: entry.hours, amount });
  });

  const totalAmount = Object.values(byProject).reduce((sum, p) => sum + p.amount, 0);

  return {
    totalAmount,
    totalDays: Object.keys(byDate).length,
    byProject: Object.values(byProject),
    byDate: Object.values(byDate)
  };
}

export function calculateDailyPayment(entries, dailyRate) {
  const byProject = {};
  const byDate = {};

  const entriesByDate = entries.reduce((acc, entry) => {
    if (!acc[entry.date]) {
      acc[entry.date] = [];
    }
    acc[entry.date].push(entry);
    return acc;
  }, {});

  Object.entries(entriesByDate).forEach(([date, dayEntries]) => {
    const totalHoursForDay = dayEntries.reduce((sum, e) => sum + e.hours, 0);

    let dayAmount;
    let dayType;
    if (totalHoursForDay >= 5) {
      dayAmount = dailyRate || 0;
      dayType = 'full';
    } else {
      dayAmount = (dailyRate || 0) * 0.5;
      dayType = 'half';
    }

    dayEntries.forEach(entry => {
      const projectId = entry.project_id;
      const projectName = entry.projects?.name || 'Unknown Project';
      const proportion = entry.hours / totalHoursForDay;
      const amount = dayAmount * proportion;

      if (!byProject[projectId]) {
        byProject[projectId] = {
          projectId,
          projectName,
          days: 0,
          hours: 0,
          amount: 0,
          sessions: []
        };
      }
      byProject[projectId].hours += entry.hours;
      byProject[projectId].amount += amount;
      byProject[projectId].sessions.push({ ...entry, amount, dayType });
    });

    byDate[date] = {
      date,
      hours: totalHoursForDay,
      dayType,
      amount: dayAmount,
      projects: dayEntries.map(e => ({
        projectName: e.projects?.name || 'Unknown Project',
        hours: e.hours,
        amount: dayAmount * (e.hours / totalHoursForDay)
      }))
    };
  });

  Object.values(byProject).forEach(project => {
    const uniqueDates = [...new Set(project.sessions.map(s => s.date))];
    project.days = uniqueDates.length;
  });

  const totalAmount = Object.values(byProject).reduce((sum, p) => sum + p.amount, 0);

  return {
    totalAmount,
    totalDays: Object.keys(byDate).length,
    byProject: Object.values(byProject),
    byDate: Object.values(byDate)
  };
}

export function calculateWeeklyPayment(entries, weeklySalary, fromDate, toDate) {
  const start = new Date(fromDate);
  const end = new Date(toDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const weeksWorked = Math.ceil(diffDays / 7);

  const totalAmount = (weeklySalary || 0) * weeksWorked;

  const byProject = {};
  entries.forEach(entry => {
    const projectId = entry.project_id;
    const projectName = entry.projects?.name || 'Unknown Project';

    if (!byProject[projectId]) {
      byProject[projectId] = {
        projectId,
        projectName,
        hours: 0,
        sessions: []
      };
    }
    byProject[projectId].hours += entry.hours;
    byProject[projectId].sessions.push(entry);
  });

  return {
    totalAmount,
    totalDays: [...new Set(entries.map(e => e.date))].length,
    weeksWorked,
    byProject: Object.values(byProject),
    byDate: []
  };
}

export function calculateProjectBasedPayment(entries, projectRate) {
  const byProject = {};

  entries.forEach(entry => {
    const projectId = entry.project_id;
    const projectName = entry.projects?.name || 'Unknown Project';

    if (!byProject[projectId]) {
      byProject[projectId] = {
        projectId,
        projectName,
        hours: 0,
        sessions: []
      };
    }
    byProject[projectId].hours += entry.hours;
    byProject[projectId].sessions.push(entry);
  });

  return {
    totalAmount: 0,
    totalDays: [...new Set(entries.map(e => e.date))].length,
    byProject: Object.values(byProject),
    byDate: [],
    note: 'Project-based workers are paid per completed project milestone'
  };
}

// ============================================================
// Time Entry Management Functions
// ============================================================

/**
 * Edit a time entry
 * @param {string} timeTrackingId - Time tracking record ID
 * @param {object} updates - Fields to update
 * @returns {Promise<boolean>} Success status
 */
export const editTimeEntry = async (timeTrackingId, updates) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    if (updates.clock_in || updates.clock_out) {
      const { data: existing } = await supabase
        .from('time_tracking')
        .select('id, clock_in, clock_out')
        .eq('id', timeTrackingId)
        .single();

      if (existing) {
        const clockIn = new Date(updates.clock_in || existing.clock_in);
        const clockOut = new Date(updates.clock_out || existing.clock_out);
        if (clockOut > clockIn) {
          updates.hours_worked = (clockOut - clockIn) / (1000 * 60 * 60);
        }
      }
    }

    const { data, error } = await supabase
      .from('time_tracking')
      .update(updates)
      .eq('id', timeTrackingId)
      .select();

    if (error) return false;
    // RLS may silently block the update (0 rows affected, no error)
    if (!data || data.length === 0) return false;
    return true;
  } catch (error) {
    console.error('Error in editTimeEntry:', error);
    return false;
  }
};

/**
 * Create a manual time entry (for missed clock-ins)
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @param {string} clockInTime - Clock in time (HH:MM)
 * @param {string} clockOutTime - Clock out time (HH:MM)
 * @param {string} date - Date (YYYY-MM-DD)
 * @returns {Promise<object|null>} Created entry
 */
export const createManualTimeEntry = async (workerId, projectId, clockInTime, clockOutTime, date) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const clockIn = new Date(`${date}T${clockInTime}:00`);
    const clockOut = new Date(`${date}T${clockOutTime}:00`);
    const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60);

    const { data, error } = await supabase
      .from('time_tracking')
      .insert({
        worker_id: workerId,
        project_id: projectId,
        clock_in: clockIn.toISOString(),
        clock_out: clockOut.toISOString(),
        hours_worked: hoursWorked,
        is_manual: true
      })
      .select('id, worker_id, project_id, clock_in, clock_out, hours_worked, is_manual, created_at')
      .single();

    if (error) {
      console.error('Error creating manual time entry:', error);
      return null;
    }

    return { ...data, hours_worked: hoursWorked };
  } catch (error) {
    console.error('Error in createManualTimeEntry:', error);
    return null;
  }
};

/**
 * Delete a time entry
 * @param {string} timeTrackingId - Time tracking record ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteTimeEntry = async (timeTrackingId) => {
  try {
    const { error } = await supabase
      .from('time_tracking')
      .delete()
      .eq('id', timeTrackingId);

    return !error;
  } catch (error) {
    console.error('Error in deleteTimeEntry:', error);
    return false;
  }
};

// ============================================================
// Break Management Functions
// ============================================================

/**
 * Start a worker's break
 * @param {string} workerId - Worker ID
 * @param {string} breakType - Type of break ('lunch', 'short', etc.)
 * @returns {Promise<object|null>} Updated time tracking record
 */
export const startWorkerBreak = async (workerId, breakType = 'lunch') => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const activeRecord = await getActiveClockIn(workerId);
    if (!activeRecord) {
      console.error('Worker not clocked in');
      return null;
    }

    const now = getLocalTimestamp();
    let updateData = {};

    if (activeRecord.breaks !== undefined) {
      const breaks = activeRecord.breaks || [];
      breaks.push({
        id: `break_${Date.now()}`,
        type: breakType,
        start_time: now,
        end_time: null
      });
      updateData = { breaks };
    } else {
      updateData = { break_start: now };
    }

    const { data, error } = await supabase
      .from('time_tracking')
      .update(updateData)
      .eq('id', activeRecord.id)
      .select('id, worker_id, project_id, clock_in, clock_out, break_start, break_end, breaks, notes')
      .single();

    if (error) {
      console.error('Error starting break:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in startWorkerBreak:', error);
    return null;
  }
};

/**
 * End a worker's current break
 * @param {string} workerId - Worker ID
 * @returns {Promise<object|null>} Updated record with duration
 */
export const endWorkerBreak = async (workerId) => {
  try {
    const activeRecord = await getActiveClockIn(workerId);
    if (!activeRecord) return null;

    const endTime = getLocalTimestamp();
    let updateData = {};
    let durationMinutes = 0;

    if (activeRecord.breaks !== undefined) {
      const breaks = activeRecord.breaks || [];
      const activeBreak = breaks.find(b => !b.end_time);

      if (!activeBreak) {
        console.error('No active break found');
        return null;
      }

      activeBreak.end_time = endTime;
      activeBreak.duration_minutes = Math.round(
        (new Date(endTime) - new Date(activeBreak.start_time)) / (1000 * 60)
      );
      durationMinutes = activeBreak.duration_minutes;
      updateData = { breaks };
    } else {
      if (!activeRecord.break_start || activeRecord.break_end) {
        console.error('No active break found');
        return null;
      }

      durationMinutes = Math.round(
        (new Date(endTime) - new Date(activeRecord.break_start)) / (1000 * 60)
      );
      updateData = { break_end: endTime };
    }

    const { data, error } = await supabase
      .from('time_tracking')
      .update(updateData)
      .eq('id', activeRecord.id)
      .select('id, worker_id, project_id, clock_in, clock_out, break_start, break_end, breaks, notes')
      .single();

    if (error) {
      console.error('Error ending break:', error);
      return null;
    }

    return { ...data, duration_minutes: durationMinutes };
  } catch (error) {
    console.error('Error in endWorkerBreak:', error);
    return null;
  }
};

// ============================================================
// Edit Supervisor Time Entry
// ============================================================

/**
 * Edit a supervisor time entry
 * @param {string} timeTrackingId - Supervisor time tracking record ID
 * @param {object} updates - Fields to update (clock_in, clock_out, notes)
 * @returns {Promise<boolean>} Success status
 */
export const editSupervisorTimeEntry = async (timeTrackingId, updates) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    if (updates.clock_in || updates.clock_out) {
      const { data: existing } = await supabase
        .from('supervisor_time_tracking')
        .select('id, clock_in, clock_out')
        .eq('id', timeTrackingId)
        .single();

      if (existing && (updates.clock_out || existing.clock_out)) {
        const clockIn = new Date(updates.clock_in || existing.clock_in);
        const clockOut = new Date(updates.clock_out || existing.clock_out);
        if (clockOut <= clockIn) {
          console.error('Clock out must be after clock in');
          return false;
        }
      }
    }

    const { data, error } = await supabase
      .from('supervisor_time_tracking')
      .update(updates)
      .eq('id', timeTrackingId)
      .select();

    if (error) return false;
    // RLS may silently block the update (0 rows affected, no error)
    if (!data || data.length === 0) return false;
    return true;
  } catch (error) {
    console.error('Error in editSupervisorTimeEntry:', error);
    return false;
  }
};

// ============================================================
// Owner/Supervisor Remote Clock Out Functions
// ============================================================

/**
 * Owner or supervisor remotely clocks out a worker
 * @param {string} workerId - Worker ID
 * @param {string} notes - Optional notes
 * @returns {Promise<{success: boolean, hours?: number}>}
 */
export const remoteClockOutWorker = async (workerId, notes = null) => {
  try {
    const activeSession = await getActiveClockIn(workerId);
    if (!activeSession) {
      return { success: false, error: 'Worker is not clocked in' };
    }

    const result = await clockOut(activeSession.id, notes || 'Clocked out by manager');
    return result;
  } catch (error) {
    console.error('Error in remoteClockOutWorker:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Owner remotely clocks out a supervisor
 * @param {string} supervisorId - Supervisor's user ID
 * @param {string} notes - Optional notes
 * @returns {Promise<{success: boolean, hours?: number}>}
 */
export const remoteClockOutSupervisor = async (supervisorId, notes = null) => {
  try {
    const activeSession = await getActiveSupervisorClockIn(supervisorId);
    if (!activeSession) {
      return { success: false, error: 'Supervisor is not clocked in' };
    }

    const result = await supervisorClockOut(activeSession.id, notes || 'Clocked out by owner');
    return result;
  } catch (error) {
    console.error('Error in remoteClockOutSupervisor:', error);
    return { success: false, error: error.message };
  }
};

// ============================================================
// Forgotten Clock-Out Detection & Notifications
// ============================================================

/**
 * Check for workers and supervisors who have been clocked in longer than threshold
 * @param {number} thresholdHours - Hours after which a clock-in is considered forgotten (default: 10)
 * @returns {Promise<{workers: array, supervisors: array}>} Forgotten sessions
 */
export const checkForgottenClockOuts = async (thresholdHours = 10) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { workers: [], supervisors: [] };

    const thresholdTime = new Date();
    thresholdTime.setHours(thresholdTime.getHours() - thresholdHours);
    const thresholdISO = thresholdTime.toISOString();

    // Check workers
    const { data: workerSessions } = await supabase
      .from('time_tracking')
      .select(`
        id, worker_id, project_id, clock_in, notes,
        workers!inner (id, full_name, owner_id),
        projects!inner (id, name)
      `)
      .is('clock_out', null)
      .lt('clock_in', thresholdISO)
      .limit(50);

    // Filter to only workers owned by the current user
    const ownedWorkerSessions = (workerSessions || []).filter(
      s => s.workers?.owner_id === user.id
    );

    // Check supervisors
    const { data: supSessions } = await supabase
      .from('supervisor_time_tracking')
      .select(`
        id, supervisor_id, project_id, clock_in, notes,
        projects:project_id (id, name)
      `)
      .is('clock_out', null)
      .lt('clock_in', thresholdISO)
      .limit(50);

    // Get supervisor profiles to check ownership
    let ownedSupSessions = [];
    if (supSessions && supSessions.length > 0) {
      const supIds = [...new Set(supSessions.map(s => s.supervisor_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, owner_id, full_name, business_name')
        .in('id', supIds);

      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p; });

      ownedSupSessions = supSessions
        .filter(s => profileMap[s.supervisor_id]?.owner_id === user.id)
        .map(s => ({
          ...s,
          supervisor_name: profileMap[s.supervisor_id]?.business_name ||
                          profileMap[s.supervisor_id]?.full_name ||
                          'Supervisor',
        }));
    }

    return {
      workers: ownedWorkerSessions.map(s => ({
        ...s,
        worker_name: s.workers?.full_name || 'Worker',
        project_name: s.projects?.name || 'Unknown Project',
        hoursElapsed: ((new Date() - new Date(s.clock_in)) / (1000 * 60 * 60)).toFixed(1),
      })),
      supervisors: ownedSupSessions.map(s => ({
        ...s,
        project_name: s.projects?.name || 'Unknown Project',
        hoursElapsed: ((new Date() - new Date(s.clock_in)) / (1000 * 60 * 60)).toFixed(1),
      })),
    };
  } catch (error) {
    console.error('Error in checkForgottenClockOuts:', error);
    return { workers: [], supervisors: [] };
  }
};

/**
 * Send push notifications for forgotten clock-outs to the owner
 * Should be called periodically (e.g., when owner opens app, or on a schedule)
 * @param {number} thresholdHours - Hours threshold (default: 10)
 * @returns {Promise<number>} Number of notifications sent
 */
export const sendForgottenClockOutNotifications = async (thresholdHours = 10) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 0;

    const forgotten = await checkForgottenClockOuts(thresholdHours);
    let notifCount = 0;

    for (const worker of forgotten.workers) {
      await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: user.id,
          title: 'Forgotten Clock-Out',
          body: `${worker.worker_name} has been clocked in for ${worker.hoursElapsed}h on ${worker.project_name}. Did they forget to clock out?`,
          type: 'worker_update',
          data: { screen: 'Workers' },
          workerId: worker.worker_id,
        },
      });
      notifCount++;
    }

    for (const sup of forgotten.supervisors) {
      await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: user.id,
          title: 'Forgotten Clock-Out',
          body: `${sup.supervisor_name} has been clocked in for ${sup.hoursElapsed}h on ${sup.project_name}. Did they forget to clock out?`,
          type: 'worker_update',
          data: { screen: 'Workers' },
        },
      });
      notifCount++;
    }

    return notifCount;
  } catch (error) {
    console.error('Error in sendForgottenClockOutNotifications:', error);
    return 0;
  }
};

// ============================================================
// Supervisor Time Tracking Functions
// ============================================================

/**
 * Clock in a supervisor
 * @param {string} supervisorId - Supervisor's user ID
 * @param {string} projectId - Project ID
 * @param {object} location - Optional {latitude, longitude}
 * @returns {Promise<object|null>} Time tracking record
 */
export const supervisorClockIn = async (supervisorId, projectId, location = null) => {
  try {
    const localTimestamp = getLocalTimestamp();

    const { data, error } = await supabase
      .from('supervisor_time_tracking')
      .insert({
        supervisor_id: supervisorId,
        project_id: projectId,
        clock_in: localTimestamp,
        location_lat: location?.latitude,
        location_lng: location?.longitude,
      })
      .select(`
        id, supervisor_id, project_id, clock_in, clock_out, notes, location_lat, location_lng, created_at,
        projects:project_id (id, name)
      `)
      .single();

    if (error) {
      console.error('Error clocking in supervisor:', error);
      return null;
    }

    console.log('Supervisor clock-in successful:', data);

    // Notify owner about supervisor clock-in
    try {
      const { data: supProfile } = await supabase.from('profiles')
        .select('owner_id, full_name').eq('id', supervisorId).single();
      if (supProfile?.owner_id) {
        const projectName = data?.projects?.name || '';
        supabase.functions.invoke('send-push-notification', {
          body: {
            userId: supProfile.owner_id,
            title: 'Supervisor Clocked In',
            body: `${supProfile.full_name || 'Supervisor'} clocked in${projectName ? ` on ${projectName}` : ''}`,
            type: 'worker_update',
            data: { screen: 'Home' },
          },
        });
      }
    } catch (e) { /* fire and forget */ }

    return data;
  } catch (error) {
    console.error('Error in supervisorClockIn:', error);
    return null;
  }
};

/**
 * Clock out a supervisor and calculate labor costs
 * @param {string} timeTrackingId - Time tracking record ID
 * @param {string} notes - Optional notes
 * @returns {Promise<{success: boolean, hours?: number, laborCost?: number}>}
 */
export const supervisorClockOut = async (timeTrackingId, notes = null) => {
  try {
    const clockOutTime = getLocalTimestamp();

    // Get the time tracking record
    const { data: record, error: fetchError } = await supabase
      .from('supervisor_time_tracking')
      .select('id, supervisor_id, project_id, clock_in, clock_out, notes, projects:project_id (id, name)')
      .eq('id', timeTrackingId)
      .single();

    if (fetchError || !record) {
      console.error('Error fetching supervisor time record:', fetchError);
      return { success: false, error: 'Record not found' };
    }

    // Calculate hours worked
    const clockIn = new Date(record.clock_in);
    const clockOut = new Date(clockOutTime);
    const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60);

    // Update the record
    const { error: updateError } = await supabase
      .from('supervisor_time_tracking')
      .update({ clock_out: clockOutTime, notes })
      .eq('id', timeTrackingId);

    if (updateError) {
      console.error('Error updating supervisor clock-out:', updateError);
      return { success: false, error: updateError.message };
    }

    // Get supervisor's payment info
    const { data: profile } = await supabase
      .from('profiles')
      .select('payment_type, hourly_rate, daily_rate, weekly_salary, project_rate')
      .eq('id', record.supervisor_id)
      .single();

    // Calculate labor cost based on payment type
    let laborCost = 0;
    if (profile) {
      switch (profile.payment_type) {
        case 'hourly':
          laborCost = hoursWorked * (profile.hourly_rate || 0);
          break;
        case 'daily':
          // Full day if >= 5 hours, half day otherwise
          laborCost = hoursWorked >= 5 ? profile.daily_rate : (profile.daily_rate || 0) * 0.5;
          break;
        case 'weekly':
        case 'project_based':
          // No automatic calculation for weekly/project-based
          break;
      }

      // Create labor cost transaction if applicable
      if (laborCost > 0) {
        await supabase.from('project_transactions').insert({
          project_id: record.project_id,
          type: 'expense',
          category: 'labor',
          amount: laborCost,
          description: `Supervisor labor - ${formatHoursMinutes(hoursWorked)}`,
          date: clockOutTime,
          is_auto_generated: true,
        });
      }
    }

    console.log('Supervisor clock-out successful:', { hours: hoursWorked, laborCost });

    // Notify owner about supervisor clock-out
    try {
      const { data: supProfile } = await supabase.from('profiles')
        .select('owner_id, full_name').eq('id', record.supervisor_id).single();
      if (supProfile?.owner_id) {
        const projectName = record.projects?.name || '';
        supabase.functions.invoke('send-push-notification', {
          body: {
            userId: supProfile.owner_id,
            title: 'Supervisor Clocked Out',
            body: `${supProfile.full_name || 'Supervisor'} clocked out${projectName ? ` from ${projectName}` : ''} (${formatHoursMinutes(hoursWorked)})`,
            type: 'worker_update',
            data: { screen: 'Home' },
          },
        });
      }
    } catch (e) { /* fire and forget */ }

    return { success: true, hours: hoursWorked, laborCost };
  } catch (error) {
    console.error('Error in supervisorClockOut:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Get supervisor's active clock-in session
 * @param {string} supervisorId - Supervisor's user ID
 * @returns {Promise<object|null>} Active session or null
 */
export const getActiveSupervisorClockIn = async (supervisorId) => {
  try {
    const { data, error } = await supabase
      .from('supervisor_time_tracking')
      .select(`
        id, supervisor_id, project_id, clock_in, clock_out, notes, location_lat, location_lng,
        projects:project_id (id, name)
      `)
      .eq('supervisor_id', supervisorId)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error getting active supervisor clock-in:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getActiveSupervisorClockIn:', error);
    return null;
  }
};

/**
 * Get all supervisors currently clocked in TODAY
 * @returns {Promise<array>} Array of today's active supervisor clock-ins
 */
export const getClockedInSupervisorsToday = async () => {
  try {
    // Use local day bounds for accurate "today" filtering
    const { startOfDay, endOfDay } = getLocalDayBounds();

    const { data, error } = await supabase
      .from('supervisor_time_tracking')
      .select(`
        id,
        supervisor_id,
        project_id,
        clock_in,
        clock_out,
        projects:project_id (
          id,
          name
        )
      `)
      .gte('clock_in', startOfDay)
      .lte('clock_in', endOfDay)
      .is('clock_out', null)
      .order('clock_in', { ascending: false });

    if (error) {
      console.error('Error fetching clocked-in supervisors today:', error);
      return [];
    }

    // Get supervisor profiles to add names
    if (data && data.length > 0) {
      const supervisorIds = [...new Set(data.map(d => d.supervisor_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, business_name, email, payment_type, hourly_rate, daily_rate, weekly_salary')
        .in('id', supervisorIds);

      const profileMap = {};
      (profiles || []).forEach(p => {
        profileMap[p.id] = p;
      });

      return data.map(entry => ({
        ...entry,
        supervisor: profileMap[entry.supervisor_id] || null,
        supervisor_name: profileMap[entry.supervisor_id]?.business_name ||
                        profileMap[entry.supervisor_id]?.email?.split('@')[0] ||
                        'Supervisor',
        isSupervisor: true, // Flag to identify supervisor entries
      }));
    }

    return data || [];
  } catch (error) {
    console.error('Error in getClockedInSupervisorsToday:', error);
    return [];
  }
};

/**
 * Get completed supervisor shifts for today (supervisors who clocked in AND out today)
 * @returns {Promise<array>} Array of completed supervisor shifts
 */
export const getCompletedSupervisorShiftsToday = async () => {
  try {
    // Use local day bounds for accurate "today" filtering
    const { startOfDay, endOfDay } = getLocalDayBounds();

    const { data, error } = await supabase
      .from('supervisor_time_tracking')
      .select(`
        id,
        supervisor_id,
        project_id,
        clock_in,
        clock_out,
        projects:project_id (
          id,
          name
        )
      `)
      .gte('clock_in', startOfDay)
      .lte('clock_in', endOfDay)
      .not('clock_out', 'is', null)
      .order('clock_in', { ascending: false });

    if (error) {
      console.error('Error fetching completed supervisor shifts today:', error);
      return [];
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Get supervisor profiles to add names and payment info
    const supervisorIds = [...new Set(data.map(d => d.supervisor_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, business_name, email, payment_type, hourly_rate, daily_rate, weekly_salary')
      .in('id', supervisorIds);

    const profileMap = {};
    (profiles || []).forEach(p => {
      profileMap[p.id] = p;
    });

    // Calculate hours and enrich entries
    return data.map(entry => {
      const clockIn = new Date(entry.clock_in);
      const clockOut = new Date(entry.clock_out);
      const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60);
      const supervisor = profileMap[entry.supervisor_id];

      return {
        ...entry,
        hoursWorked: parseFloat(hoursWorked.toFixed(2)),
        supervisor: supervisor || null,
        supervisor_name: supervisor?.business_name ||
                        supervisor?.email?.split('@')[0] ||
                        'Supervisor',
        // Add worker-like fields for consistency in AI context
        workers: {
          id: entry.supervisor_id,
          full_name: supervisor?.business_name ||
                    supervisor?.email?.split('@')[0] ||
                    'Supervisor',
          trade: 'Supervisor',
          payment_type: supervisor?.payment_type,
          hourly_rate: supervisor?.hourly_rate,
          daily_rate: supervisor?.daily_rate,
        },
        worker_id: entry.supervisor_id, // For compatibility
        isSupervisor: true, // Flag to identify supervisor entries
      };
    });
  } catch (error) {
    console.error('Error in getCompletedSupervisorShiftsToday:', error);
    return [];
  }
};

/**
 * Get supervisor's time tracking history
 * @param {string} supervisorId - Supervisor's user ID
 * @param {object} dateRange - Optional { startDate, endDate }
 * @returns {Promise<array>} Array of time tracking records
 */
export const getSupervisorTimesheet = async (supervisorId, dateRange = null) => {
  try {
    let query = supabase
      .from('supervisor_time_tracking')
      .select(`
        id, supervisor_id, project_id, clock_in, clock_out, notes, created_at,
        projects:project_id (id, name)
      `)
      .eq('supervisor_id', supervisorId)
      .order('clock_in', { ascending: false });

    if (dateRange?.startDate && dateRange?.endDate) {
      const { startOfRange, endOfRange } = getDateRangeBoundsUTC(dateRange.startDate, dateRange.endDate);
      query = query.gte('clock_in', startOfRange).lte('clock_in', endOfRange);
    }

    query = query.limit(50);

    const { data, error } = await query;

    if (error) {
      console.error('Error getting supervisor timesheet:', error);
      return [];
    }

    // Calculate hours for each entry
    return (data || []).map(entry => {
      let hours = 0;
      if (entry.clock_in && entry.clock_out) {
        const clockIn = new Date(entry.clock_in);
        const clockOut = new Date(entry.clock_out);
        hours = (clockOut - clockIn) / (1000 * 60 * 60);
      }
      return { ...entry, hours };
    });
  } catch (error) {
    console.error('Error in getSupervisorTimesheet:', error);
    return [];
  }
};

/**
 * Calculate payment for a supervisor based on their payment type for a given period
 * @param {string} supervisorId - Supervisor ID (profile ID)
 * @param {object} supervisor - Supervisor profile with payment info
 * @param {string} fromDate - Start date (YYYY-MM-DD)
 * @param {string} toDate - End date (YYYY-MM-DD)
 * @returns {Promise<object>} Payment breakdown with project details
 */
export const calculateSupervisorPaymentForPeriod = async (supervisorId, supervisor, fromDate, toDate) => {
  try {
    // Convert date range to proper UTC bounds for accurate timezone-aware queries
    const { startOfRange, endOfRange } = getDateRangeBoundsUTC(fromDate, toDate);

    const { data: timeEntries, error: timeError } = await supabase
      .from('supervisor_time_tracking')
      .select(`
        id, supervisor_id, project_id, clock_in, clock_out, notes,
        projects:project_id (id, name)
      `)
      .eq('supervisor_id', supervisorId)
      .not('clock_out', 'is', null)
      .gte('clock_in', startOfRange)
      .lte('clock_in', endOfRange)
      .order('clock_in', { ascending: true })
      .limit(200);

    if (timeError) {
      console.error('Error fetching supervisor time entries:', timeError);
      return null;
    }

    if (!timeEntries || timeEntries.length === 0) {
      return {
        supervisorId,
        supervisorName: supervisor?.business_name || 'Supervisor',
        totalAmount: 0,
        totalHours: 0,
        totalDays: 0,
        dateRange: { from: fromDate, to: toDate },
        paymentType: supervisor?.payment_type,
        byProject: [],
        byDate: []
      };
    }

    const entriesWithHours = timeEntries.map(entry => {
      const clockIn = new Date(entry.clock_in);
      const clockOut = new Date(entry.clock_out);
      const hours = (clockOut - clockIn) / (1000 * 60 * 60);
      const date = clockIn.toISOString().split('T')[0];

      return {
        ...entry,
        hours,
        date
      };
    });

    let paymentBreakdown;

    switch (supervisor?.payment_type) {
      case 'hourly':
        paymentBreakdown = calculateHourlyPayment(entriesWithHours, supervisor.hourly_rate);
        break;
      case 'daily':
        paymentBreakdown = calculateDailyPayment(entriesWithHours, supervisor.daily_rate);
        break;
      case 'weekly':
        paymentBreakdown = calculateWeeklyPayment(entriesWithHours, supervisor.weekly_salary, fromDate, toDate);
        break;
      case 'project_based':
        paymentBreakdown = calculateProjectBasedPayment(entriesWithHours, supervisor.project_rate);
        break;
      default:
        paymentBreakdown = { totalAmount: 0, byProject: [], byDate: [] };
    }

    return {
      ...paymentBreakdown,
      supervisorId,
      supervisorName: supervisor?.business_name || 'Supervisor',
      totalHours: entriesWithHours.reduce((sum, e) => sum + e.hours, 0),
      dateRange: { from: fromDate, to: toDate },
      paymentType: supervisor?.payment_type,
      rate: {
        hourly: supervisor?.hourly_rate,
        daily: supervisor?.daily_rate,
        weekly: supervisor?.weekly_salary,
        project: supervisor?.project_rate
      }
    };
  } catch (error) {
    console.error('Error calculating supervisor payment:', error);
    return null;
  }
};
