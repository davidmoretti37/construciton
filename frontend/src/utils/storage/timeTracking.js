import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from './auth';
import { getLocalTimestamp, getLocalDayBounds, getLocalDateString, getDateRangeBoundsUTC } from '../calculations';
import { responseCache } from '../../services/agents/core/CacheService';

// ============================================================
// Time Tracking Functions
// ============================================================

/**
 * Clock in a worker
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @param {object} location - Optional {latitude, longitude}
 * @returns {Promise<object|null>} Time tracking record
 */
export const clockIn = async (workerId, projectId, location = null) => {
  try {
    // Use local timestamp so the date reflects user's local time
    const localTimestamp = getLocalTimestamp();

    // First, insert the clock-in record
    const { data: insertedData, error: insertError } = await supabase
      .from('time_tracking')
      .insert({
        worker_id: workerId,
        project_id: projectId,
        clock_in: localTimestamp,
        location_lat: location?.latitude,
        location_lng: location?.longitude,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error clocking in:', insertError);
      return null;
    }

    // Then fetch the record with the project join (Supabase can't join on insert)
    const { data, error } = await supabase
      .from('time_tracking')
      .select(`
        *,
        projects:project_id (
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
 * @returns {Promise<{success: boolean, laborCost?: number, hours?: number}>} Result with labor cost details
 */
export const clockOut = async (timeTrackingId, notes = null) => {
  try {
    // Use local timestamp for clock-out
    const clockOutTime = getLocalTimestamp();

    const { data: timeEntry, error: fetchError } = await supabase
      .from('time_tracking')
      .select(`
        *,
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
        costDescription = `${worker.full_name} - ${hoursWorked.toFixed(2)} hours @ $${worker.hourly_rate}/hr`;
        break;

      case 'daily':
        if (hoursWorked < 5) {
          laborCost = (worker.daily_rate || 0) * 0.5;
          costDescription = `${worker.full_name} - Half day (${hoursWorked.toFixed(2)} hours) @ $${worker.daily_rate}/day`;
        } else {
          laborCost = worker.daily_rate || 0;
          costDescription = `${worker.full_name} - Full day (${hoursWorked.toFixed(2)} hours) @ $${worker.daily_rate}/day`;
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
        *,
        projects:project_id (
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
        return null;
      }
      console.error('Error fetching active clock-in:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in getActiveClockIn:', error);
    return null;
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
        *,
        projects:project_id (
          id,
          name,
          location
        )
      `)
      .eq('worker_id', workerId)
      .order('clock_in', { ascending: false });

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
      .select('*')
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
      .select('*')
      .eq('owner_id', user.id)
      .eq('status', 'active');

    if (workersError) throw workersError;

    const { data: todayClockIns, error: clockInsError } = await supabase
      .from('time_tracking')
      .select(`
        *,
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

    return {
      unassignedWorkers,
      projectGroups: Object.values(projectGroups),
      totalWorkers: allWorkers?.length || 0,
      clockedInCount: Object.keys(workerClockIns).length
    };
  } catch (error) {
    console.error('Error getting today\'s workers schedule:', error);
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
        *,
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
      .select('*')
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
      .select('*')
      .eq('id', workerId)
      .single();

    if (workerError || !worker) {
      console.error('Error fetching worker:', workerError);
      return null;
    }

    // Convert date range to proper UTC bounds for accurate timezone-aware queries
    const { startOfRange, endOfRange } = getDateRangeBoundsUTC(fromDate, toDate);

    const { data: timeEntries, error: timeError } = await supabase
      .from('time_tracking')
      .select(`
        *,
        projects (id, name)
      `)
      .eq('worker_id', workerId)
      .not('clock_out', 'is', null)
      .gte('clock_in', startOfRange)
      .lte('clock_in', endOfRange)
      .order('clock_in', { ascending: true });

    if (timeError) {
      console.error('Error fetching time entries:', timeError);
      return null;
    }

    if (!timeEntries || timeEntries.length === 0) {
      return {
        workerId: worker.id,
        workerName: worker.full_name || worker.name || 'Unknown Worker',
        totalAmount: 0,
        totalHours: 0,
        totalDays: 0,
        dateRange: { from: fromDate, to: toDate },
        paymentType: worker.payment_type,
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
      workerName: worker.full_name || worker.name || 'Unknown Worker',
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

function calculateHourlyPayment(entries, hourlyRate) {
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

function calculateDailyPayment(entries, dailyRate) {
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

function calculateWeeklyPayment(entries, weeklySalary, fromDate, toDate) {
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

function calculateProjectBasedPayment(entries, projectRate) {
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
        .select('*')
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

    const { error } = await supabase
      .from('time_tracking')
      .update(updates)
      .eq('id', timeTrackingId);

    return !error;
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
      .select()
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
      .select()
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
      .select()
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
