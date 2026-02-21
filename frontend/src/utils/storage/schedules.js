import { supabase } from '../../lib/supabase';

// ============================================================
// Schedule Events Functions (Personal Calendar)
// ============================================================

/**
 * Create a new schedule event
 * @param {object} eventData - Event details
 * @returns {Promise<object|null>} - Created event or null
 */
export const createScheduleEvent = async (eventData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return null;
    }

    const ensureUTC = (datetimeStr) => {
      if (!datetimeStr) return null;
      if (datetimeStr.endsWith('Z')) {
        return datetimeStr;
      }

      // Parse datetime components manually to avoid timezone ambiguity
      // Expected format: "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DD"
      const match = datetimeStr.match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
      if (!match) {
        return new Date(datetimeStr).toISOString();
      }

      const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;

      // Create date in LOCAL timezone, then convert to ISO (UTC)
      const localDate = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      );

      return localDate.toISOString();
    };

    let geocodedData = null;
    const address = eventData.address || null;

    if (address && address.trim() !== '') {
      const { geocodeAddress, isAddressSpecific } = require('../geocoding');

      if (isAddressSpecific(address)) {
        geocodedData = await geocodeAddress(address);
      }
    }

    const insertData = {
      owner_id: user.id,
      worker_id: eventData.worker_id || eventData.workerId || null,
      title: eventData.title,
      description: eventData.description || null,
      event_type: eventData.event_type || eventData.eventType || 'other',
      location: eventData.location || null,
      address: address,
      formatted_address: geocodedData?.formatted_address || null,
      latitude: geocodedData?.latitude || null,
      longitude: geocodedData?.longitude || null,
      place_id: geocodedData?.place_id || null,
      start_datetime: ensureUTC(eventData.start_datetime || eventData.startDatetime),
      end_datetime: ensureUTC(eventData.end_datetime || eventData.endDatetime),
      all_day: eventData.all_day !== undefined ? eventData.all_day : (eventData.allDay || false),
      recurring: eventData.recurring || false,
      recurring_pattern: eventData.recurring_pattern || eventData.recurringPattern || null,
      color: eventData.color || '#3B82F6',
      estimated_travel_time_minutes: null,
    };

    const { data, error } = await supabase
      .from('schedule_events')
      .insert(insertData)
      .select('id, owner_id, worker_id, title, description, event_type, location, address, formatted_address, latitude, longitude, place_id, start_datetime, end_datetime, all_day, recurring, recurring_pattern, recurring_id, color, estimated_travel_time_minutes, created_at')
      .single();

    if (error) {
      console.error('Error creating schedule event:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception in createScheduleEvent:', error);
    return null;
  }
};

/**
 * Delete a schedule event
 * @param {string} eventId - Event ID to delete
 * @returns {Promise<boolean>} - Success status
 */
export const deleteScheduleEvent = async (eventId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from('schedule_events')
      .delete()
      .eq('id', eventId)
      .eq('owner_id', user.id);

    if (error) {
      console.error('Error deleting schedule event:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteScheduleEvent:', error);
    return false;
  }
};

/**
 * Fetch schedule events for a date range
 * @param {string} startDate - Start date (ISO string)
 * @param {string} endDate - End date (ISO string)
 * @param {string} eventType - Optional filter by event type
 * @returns {Promise<array>} - Array of schedule events
 */
export const fetchScheduleEvents = async (startDate, endDate, eventType = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // Convert local datetime strings to UTC ISO format for proper comparison
    // Events are stored with UTC timestamps (Z suffix), so query must use UTC too
    const startUTC = new Date(startDate).toISOString();
    const endUTC = new Date(endDate).toISOString();

    let query = supabase
      .from('schedule_events')
      .select('id, owner_id, worker_id, title, description, event_type, location, address, formatted_address, latitude, longitude, place_id, start_datetime, end_datetime, all_day, recurring, recurring_pattern, recurring_id, color, estimated_travel_time_minutes, created_at')
      .eq('owner_id', user.id)
      .lte('start_datetime', endUTC)
      .or(`start_datetime.gte.${startUTC},end_datetime.gte.${startUTC},end_datetime.is.null`)
      .order('start_datetime', { ascending: true })
      .limit(50);

    if (eventType) {
      query = query.eq('event_type', eventType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching schedule events:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchScheduleEvents:', error);
    return [];
  }
};

/**
 * Update an existing schedule event
 * @param {string} eventId - Event ID
 * @param {object} updates - Fields to update
 * @returns {Promise<boolean>} - Success status
 */
export const updateScheduleEvent = async (eventId, updates) => {
  try {
    const { error } = await supabase
      .from('schedule_events')
      .update(updates)
      .eq('id', eventId);

    if (error) {
      console.error('Error updating schedule event:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateScheduleEvent:', error);
    return false;
  }
};

/**
 * Fetch projects for a specific date
 * @param {string} date - Date to check (YYYY-MM-DD)
 * @returns {Promise<array>} - Array of projects with phases
 */
export const fetchActiveProjectsForDate = async (date) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('projects')
      .select(`
        id, name, status, start_date, end_date, location, user_id,
        project_phases (
          id,
          name,
          status,
          start_date,
          end_date,
          order_index
        )
      `)
      .eq('user_id', user.id)
      .lte('start_date', date)
      .or(`end_date.gte.${date},end_date.is.null`)
      .order('start_date', { ascending: true })
      .limit(50);

    if (error) {
      console.error('Error fetching active projects:', error);
      return [];
    }

    return (data || []).map(project => ({
      ...project,
      startDate: project.start_date,
      endDate: project.end_date,
      phases: project.project_phases || []
    }));
  } catch (error) {
    console.error('Error in fetchActiveProjectsForDate:', error);
    return [];
  }
};

// ============================================================
// Work Schedules Functions
// ============================================================

/**
 * Fetch work schedules for a date range
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<array>} - Array of work schedules
 */
export const fetchWorkSchedules = async (startDate, endDate) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('worker_schedules')
      .select(`
        id, worker_id, project_id, phase_id, start_date, end_date, start_time, end_time, recurring, recurring_days, notes, created_by, created_at,
        workers (
          id,
          full_name,
          trade,
          payment_type
        ),
        projects (
          id,
          name,
          status
        ),
        project_phases (
          id,
          name,
          status
        )
      `)
      .eq('created_by', user.id)
      .lte('start_date', endDate)
      .or(`end_date.gte.${startDate},end_date.is.null`)
      .order('start_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(50);

    if (error) {
      console.error('Error fetching work schedules:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in fetchWorkSchedules:', error);
    return [];
  }
};

/**
 * Create a new work schedule for a worker
 * @param {object} scheduleData - Schedule data
 * @returns {Promise<object|null>} - Created schedule or null
 */
export const createWorkSchedule = async (scheduleData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return null;
    }

    const { data, error } = await supabase
      .from('worker_schedules')
      .insert({
        worker_id: scheduleData.worker_id || scheduleData.workerId,
        project_id: scheduleData.project_id || scheduleData.projectId,
        phase_id: scheduleData.phase_id || scheduleData.phaseId,
        start_date: scheduleData.start_date || scheduleData.startDate,
        end_date: scheduleData.end_date || scheduleData.endDate,
        start_time: scheduleData.start_time || scheduleData.startTime,
        end_time: scheduleData.end_time || scheduleData.endTime,
        recurring: scheduleData.recurring || false,
        recurring_days: scheduleData.recurring_days || scheduleData.recurringDays,
        notes: scheduleData.notes,
        created_by: user.id,
      })
      .select('id, worker_id, project_id, phase_id, start_date, end_date, start_time, end_time, recurring, recurring_days, notes, created_by, created_at')
      .single();

    if (error) {
      console.error('Error creating work schedule:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createWorkSchedule:', error);
    return null;
  }
};

/**
 * Update an existing work schedule
 * @param {string} scheduleId - Schedule ID
 * @param {object} updates - Fields to update
 * @returns {Promise<boolean>} - Success status
 */
export const updateWorkSchedule = async (scheduleId, updates) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return false;
    }

    const dbUpdates = {};
    const fieldMap = {
      workerId: 'worker_id',
      projectId: 'project_id',
      phaseId: 'phase_id',
      startDate: 'start_date',
      endDate: 'end_date',
      startTime: 'start_time',
      endTime: 'end_time',
      recurring: 'recurring',
      recurringDays: 'recurring_days',
      notes: 'notes',
    };

    Object.keys(updates).forEach(key => {
      const dbKey = fieldMap[key] || key;
      dbUpdates[dbKey] = updates[key];
    });

    const { error } = await supabase
      .from('worker_schedules')
      .update(dbUpdates)
      .eq('id', scheduleId);

    if (error) {
      console.error('Error updating work schedule:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateWorkSchedule:', error);
    return false;
  }
};

/**
 * Delete a work schedule
 * @param {string} scheduleId - Schedule ID
 * @returns {Promise<boolean>} - Success status
 */
export const deleteWorkSchedule = async (scheduleId) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return false;
    }

    const { error } = await supabase
      .from('worker_schedules')
      .delete()
      .eq('id', scheduleId);

    if (error) {
      console.error('Error deleting work schedule:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteWorkSchedule:', error);
    return false;
  }
};

// ============================================================
// Settings & Configuration Functions
// ============================================================

/**
 * Update phase template (stored in profiles.phases_template)
 * @param {object} template - Phase template object
 * @returns {Promise<boolean>} - Success status
 */
export const updatePhaseTemplate = async (template) => {
  try {
    const { getUserProfile } = await import('./userProfile');
    const profile = await getUserProfile();

    const { error } = await supabase
      .from('profiles')
      .update({ phases_template: template })
      .eq('id', profile.id);

    if (error) {
      console.error('Error updating phase template:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updatePhaseTemplate:', error);
    return false;
  }
};

/**
 * Add a service to a trade's pricing catalog
 * @param {string} tradeId - Trade ID
 * @param {string} serviceId - Unique service ID
 * @param {object} service - Service object {label, price, unit}
 * @returns {Promise<boolean>} - Success status
 */
export const addServiceToTrade = async (tradeId, serviceId, service) => {
  try {
    const { getUserProfile, updateTradePricing } = await import('./userProfile');
    const profile = await getUserProfile();

    const tradePricing = profile.pricing[tradeId] || {};
    tradePricing[serviceId] = service;

    return await updateTradePricing(tradeId, tradePricing);
  } catch (error) {
    console.error('Error in addServiceToTrade:', error);
    return false;
  }
};

/**
 * Remove a service from a trade's pricing catalog
 * @param {string} tradeId - Trade ID
 * @param {string} serviceId - Service ID to remove
 * @returns {Promise<boolean>} - Success status
 */
export const removeServiceFromTrade = async (tradeId, serviceId) => {
  try {
    const { getUserProfile, updateTradePricing } = await import('./userProfile');
    const profile = await getUserProfile();

    const tradePricing = profile.pricing[tradeId] || {};
    delete tradePricing[serviceId];

    return await updateTradePricing(tradeId, tradePricing);
  } catch (error) {
    console.error('Error in removeServiceFromTrade:', error);
    return false;
  }
};

/**
 * Update a specific service's pricing
 * @param {string} tradeId - Trade ID
 * @param {string} serviceId - Service ID
 * @param {number} price - New price
 * @param {string} unit - Optional new unit
 * @returns {Promise<boolean>} - Success status
 */
export const updateServicePricing = async (tradeId, serviceId, price, unit = null) => {
  try {
    const { getUserProfile, updateTradePricing } = await import('./userProfile');
    const profile = await getUserProfile();

    const tradePricing = profile.pricing[tradeId] || {};

    if (!tradePricing[serviceId]) {
      console.error('Service not found');
      return false;
    }

    tradePricing[serviceId].price = price;
    if (unit) {
      tradePricing[serviceId].unit = unit;
    }

    return await updateTradePricing(tradeId, tradePricing);
  } catch (error) {
    console.error('Error in updateServicePricing:', error);
    return false;
  }
};

// ============================================================
// Recurring Events
// ============================================================

/**
 * Helper to get event color by type
 */
const getEventColor = (eventType) => {
  const colors = {
    meeting: '#3B82F6',
    appointment: '#F59E0B',
    site_visit: '#22C55E',
    pto: '#EF4444',
    other: '#6B7280'
  };
  return colors[eventType] || colors.other;
};

/**
 * Create a recurring event (generates multiple instances)
 * @param {object} eventData - Event data with recurrence pattern
 * @returns {Promise<object|null>} - Created recurring event
 */
export const createRecurringEvent = async (eventData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { title, event_type, start_time, end_time, location, recurrence } = eventData;
    const { frequency, days, end_date, occurrences } = recurrence;

    const recurringId = `recurring_${Date.now()}`;

    const instances = [];
    const today = new Date();
    let currentDate = new Date(today);
    let count = 0;
    const maxOccurrences = occurrences || 52;
    const endDateTime = end_date ? new Date(end_date) : new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);

    while (currentDate <= endDateTime && count < maxOccurrences) {
      const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

      let shouldCreate = false;
      if (frequency === 'daily') {
        shouldCreate = true;
      } else if (frequency === 'weekly' && days?.includes(dayName)) {
        shouldCreate = true;
      } else if (frequency === 'biweekly' && days?.includes(dayName) && count % 2 === 0) {
        shouldCreate = true;
      } else if (frequency === 'monthly' && currentDate.getDate() === today.getDate()) {
        shouldCreate = true;
      }

      if (shouldCreate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        instances.push({
          owner_id: user.id,
          title,
          event_type: event_type || 'meeting',
          start_datetime: `${dateStr}T${start_time}:00`,
          end_datetime: `${dateStr}T${end_time}:00`,
          location,
          all_day: false,
          recurring: true,
          recurring_id: recurringId,
          color: getEventColor(event_type)
        });
        count++;
      }

      if (frequency === 'daily') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (frequency === 'weekly' || frequency === 'biweekly') {
        currentDate.setDate(currentDate.getDate() + 1);
      } else if (frequency === 'monthly') {
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    if (instances.length > 0) {
      const { data, error } = await supabase
        .from('schedule_events')
        .insert(instances)
        .select('id, owner_id, title, event_type, start_datetime, end_datetime, location, all_day, recurring, recurring_id, color, created_at');

      if (error) {
        console.error('Error creating recurring events:', error);
        return null;
      }

      return { recurring_id: recurringId, instances: data, count: instances.length };
    }

    return null;
  } catch (error) {
    console.error('Error in createRecurringEvent:', error);
    return null;
  }
};

/**
 * Update a recurring event (all or future instances)
 * @param {string} recurringId - Recurring event ID
 * @param {object} updates - Updates to apply
 * @returns {Promise<boolean>} - Success status
 */
export const updateRecurringEvent = async (recurringId, updates) => {
  try {
    const { error } = await supabase
      .from('schedule_events')
      .update(updates)
      .eq('recurring_id', recurringId);

    return !error;
  } catch (error) {
    console.error('Error in updateRecurringEvent:', error);
    return false;
  }
};

/**
 * Delete recurring event instances
 * @param {string} recurringId - Recurring event ID
 * @param {string} scope - "all", "future", or "single"
 * @param {string} instanceId - For single deletion
 * @returns {Promise<boolean>} - Success status
 */
export const deleteRecurringEvent = async (recurringId, scope = 'all', instanceId = null) => {
  try {
    if (scope === 'single' && instanceId) {
      const { error } = await supabase
        .from('schedule_events')
        .delete()
        .eq('id', instanceId);
      return !error;
    }

    if (scope === 'future') {
      const today = new Date().toISOString();
      const { error } = await supabase
        .from('schedule_events')
        .delete()
        .eq('recurring_id', recurringId)
        .gte('start_datetime', today);
      return !error;
    }

    const { error } = await supabase
      .from('schedule_events')
      .delete()
      .eq('recurring_id', recurringId);

    return !error;
  } catch (error) {
    console.error('Error in deleteRecurringEvent:', error);
    return false;
  }
};

// ============================================================
// Worker Availability & PTO
// ============================================================

/**
 * Set worker availability/unavailability
 * @param {object} data - Availability data
 * @returns {Promise<object|null>} - Created record
 */
export const setWorkerAvailability = async (data) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { worker_id, date, end_date, status, reason, time_range } = data;

    const { data: result, error } = await supabase
      .from('worker_availability')
      .insert({
        user_id: user.id,
        worker_id,
        start_date: date,
        end_date: end_date || date,
        status,
        reason,
        time_range: time_range ? JSON.stringify(time_range) : null
      })
      .select('id, user_id, worker_id, start_date, end_date, status, reason, time_range')
      .single();

    if (error) {
      console.error('Error setting worker availability:', error);
      return null;
    }

    return result;
  } catch (error) {
    console.error('Error in setWorkerAvailability:', error);
    return null;
  }
};

/**
 * Set worker PTO (vacation/time off)
 * @param {string} workerId - Worker ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @param {string} reason - Reason for PTO
 * @returns {Promise<object|null>} - Created PTO record
 */
export const setWorkerPTO = async (workerId, startDate, endDate, reason = 'vacation') => {
  return setWorkerAvailability({
    worker_id: workerId,
    date: startDate,
    end_date: endDate,
    status: 'pto',
    reason
  });
};

/**
 * Remove worker availability record
 * @param {string} availabilityId - Availability record ID
 * @returns {Promise<boolean>} - Success status
 */
export const removeWorkerAvailability = async (availabilityId) => {
  try {
    const { error } = await supabase
      .from('worker_availability')
      .delete()
      .eq('id', availabilityId);

    return !error;
  } catch (error) {
    console.error('Error in removeWorkerAvailability:', error);
    return false;
  }
};

/**
 * Get worker availability for date range
 * @param {string} workerId - Worker ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<array>} - Availability records
 */
export const getWorkerAvailability = async (workerId, startDate, endDate) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('worker_availability')
      .select('id, user_id, worker_id, start_date, end_date, status, reason, time_range')
      .eq('worker_id', workerId)
      .gte('start_date', startDate)
      .lte('end_date', endDate);

    if (error) {
      console.error('Error fetching worker availability:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getWorkerAvailability:', error);
    return [];
  }
};

// ============================================================
// Crew Management
// ============================================================

/**
 * Create a worker crew/team
 * @param {object} crewData - Crew data
 * @returns {Promise<object|null>} - Created crew
 */
export const createCrew = async (crewData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { name, worker_ids, default_project_id } = crewData;

    const { data, error } = await supabase
      .from('worker_crews')
      .insert({
        user_id: user.id,
        name,
        worker_ids,
        default_project_id
      })
      .select('id, user_id, name, worker_ids, default_project_id, created_at')
      .single();

    if (error) {
      console.error('Error creating crew:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createCrew:', error);
    return null;
  }
};

/**
 * Get a crew by ID
 * @param {string} crewId - Crew ID
 * @returns {Promise<object|null>} - Crew data
 */
export const getCrew = async (crewId) => {
  try {
    const { data, error } = await supabase
      .from('worker_crews')
      .select('id, user_id, name, worker_ids, default_project_id, created_at')
      .eq('id', crewId)
      .single();

    if (error) return null;
    return data;
  } catch (error) {
    console.error('Error in getCrew:', error);
    return null;
  }
};

/**
 * Update a crew
 * @param {string} crewId - Crew ID
 * @param {object} updates - Updates (add_worker_ids, remove_worker_ids, name)
 * @returns {Promise<boolean>} - Success status
 */
export const updateCrew = async (crewId, updates) => {
  try {
    const crew = await getCrew(crewId);
    if (!crew) return false;

    let newWorkerIds = [...(crew.worker_ids || [])];

    if (updates.add_worker_ids) {
      newWorkerIds = [...new Set([...newWorkerIds, ...updates.add_worker_ids])];
    }

    if (updates.remove_worker_ids) {
      newWorkerIds = newWorkerIds.filter(id => !updates.remove_worker_ids.includes(id));
    }

    const updateData = { worker_ids: newWorkerIds };
    if (updates.name) updateData.name = updates.name;

    const { error } = await supabase
      .from('worker_crews')
      .update(updateData)
      .eq('id', crewId);

    return !error;
  } catch (error) {
    console.error('Error in updateCrew:', error);
    return false;
  }
};

/**
 * Delete a crew
 * @param {string} crewId - Crew ID
 * @returns {Promise<boolean>} - Success status
 */
export const deleteCrew = async (crewId) => {
  try {
    const { error } = await supabase
      .from('worker_crews')
      .delete()
      .eq('id', crewId);

    return !error;
  } catch (error) {
    console.error('Error in deleteCrew:', error);
    return false;
  }
};

/**
 * Get all crews for user
 * @returns {Promise<array>} - Crews
 */
export const fetchCrews = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('worker_crews')
      .select('id, user_id, name, worker_ids, default_project_id, created_at')
      .eq('user_id', user.id)
      .limit(50);

    if (error) return [];
    return data || [];
  } catch (error) {
    console.error('Error in fetchCrews:', error);
    return [];
  }
};

// ============================================================
// Shift Templates
// ============================================================

/**
 * Create a shift template
 * @param {object} templateData - Template data
 * @returns {Promise<object|null>} - Created template
 */
export const createShiftTemplate = async (templateData) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { name, start_time, end_time, break_duration, days } = templateData;

    const { data, error } = await supabase
      .from('shift_templates')
      .insert({
        user_id: user.id,
        name,
        start_time,
        end_time,
        break_duration: break_duration || 0,
        days: days || ['mon', 'tue', 'wed', 'thu', 'fri']
      })
      .select('id, user_id, name, start_time, end_time, break_duration, days, created_at')
      .single();

    if (error) {
      console.error('Error creating shift template:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error in createShiftTemplate:', error);
    return null;
  }
};

/**
 * Apply a shift template to create work schedules
 * @param {string} templateId - Template ID
 * @param {string} workerId - Worker ID
 * @param {string} projectId - Project ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<array|null>} - Created schedules
 */
export const applyShiftTemplate = async (templateId, workerId, projectId, startDate, endDate) => {
  try {
    const { data: template, error: templateError } = await supabase
      .from('shift_templates')
      .select('id, name, start_time, end_time, break_duration, days')
      .eq('id', templateId)
      .single();

    if (templateError || !template) return null;

    const dayMap = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const scheduleDays = (template.days || []).map(d => dayMap[d.toLowerCase()]);

    const schedules = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      if (scheduleDays.includes(current.getDay())) {
        const dateStr = current.toISOString().split('T')[0];
        schedules.push({
          worker_id: workerId,
          project_id: projectId,
          start_date: dateStr,
          end_date: dateStr,
          start_time: template.start_time,
          end_time: template.end_time
        });
      }
      current.setDate(current.getDate() + 1);
    }

    const results = [];
    for (const schedule of schedules) {
      const created = await createWorkSchedule(schedule);
      if (created) results.push(created);
    }

    return results;
  } catch (error) {
    console.error('Error in applyShiftTemplate:', error);
    return null;
  }
};

/**
 * Delete a shift template
 * @param {string} templateId - Template ID
 * @returns {Promise<boolean>} - Success status
 */
export const deleteShiftTemplate = async (templateId) => {
  try {
    const { error } = await supabase
      .from('shift_templates')
      .delete()
      .eq('id', templateId);

    return !error;
  } catch (error) {
    console.error('Error in deleteShiftTemplate:', error);
    return false;
  }
};

/**
 * Get all shift templates
 * @returns {Promise<array>} - Templates
 */
export const fetchShiftTemplates = async () => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('shift_templates')
      .select('id, user_id, name, start_time, end_time, break_duration, days, created_at')
      .eq('user_id', user.id)
      .limit(50);

    if (error) return [];
    return data || [];
  } catch (error) {
    console.error('Error in fetchShiftTemplates:', error);
    return [];
  }
};

// ============================================================
// Shift Swapping
// ============================================================

/**
 * Swap shifts between two work schedules
 * @param {string} shift1Id - First shift ID
 * @param {string} shift2Id - Second shift ID
 * @returns {Promise<boolean>} - Success status
 */
export const swapWorkerShifts = async (shift1Id, shift2Id) => {
  try {
    const { data: shift1 } = await supabase
      .from('worker_schedules')
      .select('id, worker_id')
      .eq('id', shift1Id)
      .single();

    const { data: shift2 } = await supabase
      .from('worker_schedules')
      .select('id, worker_id')
      .eq('id', shift2Id)
      .single();

    if (!shift1 || !shift2) return false;

    const { error: error1 } = await supabase
      .from('worker_schedules')
      .update({ worker_id: shift2.worker_id })
      .eq('id', shift1Id);

    const { error: error2 } = await supabase
      .from('worker_schedules')
      .update({ worker_id: shift1.worker_id })
      .eq('id', shift2Id);

    return !error1 && !error2;
  } catch (error) {
    console.error('Error in swapWorkerShifts:', error);
    return false;
  }
};

/**
 * Find available workers to cover a shift
 * @param {string} projectId - Project ID
 * @param {string} date - Date
 * @param {string} trade - Optional trade filter
 * @returns {Promise<array>} - Available workers
 */
export const findReplacementWorkers = async (projectId, date, trade = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    let query = supabase
      .from('workers')
      .select('id, full_name, trade, phone, email, status, payment_type, hourly_rate, daily_rate, weekly_salary, owner_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(50);

    if (trade) {
      query = query.ilike('trade', `%${trade}%`);
    }

    const { data: workers, error } = await query;
    if (error || !workers) return [];

    const { data: schedules } = await supabase
      .from('worker_schedules')
      .select('worker_id')
      .eq('start_date', date);

    const busyWorkerIds = new Set((schedules || []).map(s => s.worker_id));

    const { data: unavailable } = await supabase
      .from('worker_availability')
      .select('worker_id')
      .lte('start_date', date)
      .gte('end_date', date);

    const unavailableWorkerIds = new Set((unavailable || []).map(u => u.worker_id));

    return workers.filter(w =>
      !busyWorkerIds.has(w.id) && !unavailableWorkerIds.has(w.id)
    );
  } catch (error) {
    console.error('Error in findReplacementWorkers:', error);
    return [];
  }
};
