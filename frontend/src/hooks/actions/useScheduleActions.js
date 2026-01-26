import { useCallback } from 'react';
import { Alert } from 'react-native';
import logger from '../../utils/logger';
import {
  createScheduleEvent,
  updateScheduleEvent,
  deleteScheduleEvent,
  fetchScheduleEvents,
  createWorkSchedule,
  updateWorkSchedule,
  createRecurringEvent,
  updateRecurringEvent,
  deleteRecurringEvent,
  getCrew,
  createTask,
  updateTask,
  completeTask,
  deleteTask,
  getCurrentUserId,
} from '../../utils/storage';
import { validateDateTime, correctEventDates } from '../../utils/dateValidation';

/**
 * Hook for all schedule-related actions
 * @param {Object} options
 * @param {Function} options.addMessage - Function to add a message to chat
 */
export default function useScheduleActions({ addMessage }) {

  const handleCreateScheduleEvent = useCallback(async (data) => {
    try {
      // Validate datetime format
      if (data.start_datetime) {
        const validation = validateDateTime(data.start_datetime);
        if (!validation.valid) {
          logger.error('Invalid start datetime:', data.start_datetime, validation.error);
          addMessage(`❌ Invalid date format. Please try again.`);
          return null;
        }
      }

      // If AI provided a date_reference (like "next Tuesday"), verify and correct if needed
      let correctedData = data;
      if (data.date_reference) {
        correctedData = correctEventDates(data);
      }

      const event = await createScheduleEvent(correctedData);
      if (event) {
        // Success! Event created
        logger.debug('✅ Schedule event created:', event.id);
        return event;
      } else {
        addMessage('❌ Sorry, I couldn\'t create that event. Please try again.');
        return null;
      }
    } catch (error) {
      logger.error('Error creating schedule event:', error);
      addMessage(`❌ Error creating event: ${error.message || 'Unknown error'}`);
      return null;
    }
  }, [addMessage]);

  const handleUpdateScheduleEvent = useCallback(async (data) => {
    try {
      // Support 'id', 'eventId', and 'event_id' field names
      const { id, eventId, event_id, eventTitle, ...updates } = data;
      const actualEventId = eventId || event_id || id;

      if (!actualEventId) {
        logger.error('No event ID provided in update data:', data);
        Alert.alert('Error', 'Cannot update event: No event ID provided.');
        return false;
      }

      const success = await updateScheduleEvent(actualEventId, updates);
      if (success) {
        addMessage(`✅ Updated event: ${eventTitle || 'schedule event'}`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to update schedule event.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating schedule event:', error);
      Alert.alert('Error', 'Failed to update schedule event.');
      return false;
    }
  }, [addMessage]);

  const handleDeleteScheduleEvent = useCallback(async (data) => {
    try {
      // Support 'id', 'eventId', and 'event_id' field names
      const { id, eventId, event_id, eventTitle } = data;
      const actualEventId = eventId || event_id || id;

      if (!actualEventId) {
        logger.error('No event ID provided in delete data:', data);
        Alert.alert('Error', 'Cannot delete event: No event ID provided.');
        return false;
      }

      const success = await deleteScheduleEvent(actualEventId);
      if (success) {
        addMessage(`✅ Cancelled: ${eventTitle || 'schedule event'}`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to delete schedule event.');
        return false;
      }
    } catch (error) {
      logger.error('Error deleting schedule event:', error);
      Alert.alert('Error', 'Failed to delete schedule event.');
      return false;
    }
  }, [addMessage]);

  const handleRetrieveScheduleEvents = useCallback(async (data) => {
    try {
      const { date, startDate, endDate } = data;

      // Determine date range
      const start = startDate || date;
      const end = endDate || date;
      const isRange = start !== end;

      // Fetch events for the date range
      const startWithTime = `${start}T00:00:00`;
      const endWithTime = `${end}T23:59:59`;
      const events = await fetchScheduleEvents(startWithTime, endWithTime);

      // Filter events to ensure they actually fall within the requested date range
      const filteredEvents = events?.filter(e => {
        if (!e.start_datetime) return false;
        const eventDate = e.start_datetime.split('T')[0];
        return eventDate >= start && eventDate <= end;
      }) || [];

      // Build message text
      let messageText;
      if (filteredEvents.length > 0) {
        const eventList = filteredEvents.map(e => {
          // Parse the event's actual date from start_datetime
          // The datetime is stored in UTC, so we need to convert to local
          const eventDateTime = new Date(e.start_datetime);

          // Format time
          const time = e.all_day ? 'All day' : eventDateTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
          });

          // Show full address if available, fallback to location
          const locationDisplay = e.address || e.formatted_address || e.location;

          // For date ranges, include the event's actual date
          if (isRange) {
            const dateStr = eventDateTime.toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            });
            return `• ${dateStr} at ${time}: ${e.title}${locationDisplay ? ` @ ${locationDisplay}` : ''}`;
          } else {
            return `• ${time}: ${e.title}${locationDisplay ? ` @ ${locationDisplay}` : ''}`;
          }
        }).join('\n');

        // Header based on single date vs range
        let headerText;
        if (isRange) {
          const startDateObj = new Date(start + 'T00:00:00');
          const endDateObj = new Date(end + 'T00:00:00');
          const startStr = startDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const endStr = endDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          headerText = `Here's your schedule for ${startStr} - ${endStr}`;
        } else {
          const [year, month, day] = start.split('-').map(Number);
          const localDate = new Date(year, month - 1, day);
          headerText = `Here's your schedule for ${localDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          })}`;
        }

        messageText = `${headerText}:\n\n${eventList}\n\nYou have ${filteredEvents.length} event${filteredEvents.length === 1 ? '' : 's'} scheduled.`;
      } else {
        // Empty schedule message
        if (isRange) {
          const startDateObj = new Date(start + 'T00:00:00');
          const endDateObj = new Date(end + 'T00:00:00');
          const startStr = startDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const endStr = endDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          messageText = `You have no events scheduled for ${startStr} - ${endStr}.`;
        } else {
          const [year, month, day] = start.split('-').map(Number);
          const localDate = new Date(year, month - 1, day);
          messageText = `You have no events scheduled for ${localDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
          })}.`;
        }
      }

      addMessage(messageText);
      return filteredEvents;
    } catch (error) {
      logger.error('Error retrieving schedule events:', error);
      addMessage('Sorry, I encountered an error while retrieving your schedule.');
      return null;
    }
  }, [addMessage]);

  const handleCreateWorkSchedule = useCallback(async (data) => {
    try {
      const { workerName, projectName, phaseName, ...scheduleData } = data;

      const schedule = await createWorkSchedule(scheduleData);
      if (schedule) {
        const dateRange = `${scheduleData.start_date}${scheduleData.end_date ? ` to ${scheduleData.end_date}` : ' (ongoing)'}`;
        const timeRange = scheduleData.start_time && scheduleData.end_time
          ? ` (${scheduleData.start_time} - ${scheduleData.end_time})`
          : '';
        addMessage(`✅ Assigned ${workerName} to ${projectName}${phaseName ? ` (${phaseName})` : ''} from ${dateRange}${timeRange}`);
        return schedule;
      } else {
        Alert.alert('Error', 'Failed to create work schedule.');
        return null;
      }
    } catch (error) {
      logger.error('Error creating work schedule:', error);
      Alert.alert('Error', 'Failed to create work schedule.');
      return null;
    }
  }, [addMessage]);

  const handleUpdateWorkSchedule = useCallback(async (data) => {
    try {
      const { scheduleId, workerName, ...updates } = data;
      const success = await updateWorkSchedule(scheduleId, updates);
      if (success) {
        addMessage(`✅ Updated schedule for ${workerName}`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to update work schedule.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating work schedule:', error);
      Alert.alert('Error', 'Failed to update work schedule.');
      return false;
    }
  }, [addMessage]);

  const handleBulkCreateWorkSchedule = useCallback(async (data) => {
    try {
      const { worker_ids, crew_id, project_id, phase_id, start_date, end_date, start_time, end_time } = data;

      let workersToSchedule = worker_ids || [];

      // If crew_id provided, get crew members
      if (crew_id && !worker_ids) {
        const crew = await getCrew(crew_id);
        if (crew) workersToSchedule = crew.worker_ids;
      }

      let successCount = 0;
      for (const workerId of workersToSchedule) {
        try {
          const schedule = await createWorkSchedule({
            worker_id: workerId,
            project_id,
            phase_id,
            start_date,
            end_date,
            start_time,
            end_time
          });
          if (schedule) successCount++;
        } catch (err) {
          logger.warn('Failed to schedule worker:', workerId);
        }
      }

      if (successCount > 0) {
        const dateRange = end_date ? `${start_date} to ${end_date}` : start_date;
        addMessage(`✅ Assigned ${successCount} worker${successCount > 1 ? 's' : ''} to project (${dateRange})`);
      }
      return { successCount };
    } catch (error) {
      logger.error('Error in bulk schedule:', error);
      Alert.alert('Error', 'Failed to create work schedules.');
      return null;
    }
  }, [addMessage]);

  const handleCreateRecurringEvent = useCallback(async (data) => {
    try {
      const { title, event_type, start_time, end_time, location, recurrence } = data;
      const result = await createRecurringEvent({
        title,
        event_type,
        start_time,
        end_time,
        location,
        recurrence
      });
      if (result) {
        const freq = recurrence.frequency;
        addMessage(`✅ Created recurring ${event_type}: ${title} (${freq})`);
        return result;
      } else {
        Alert.alert('Error', 'Failed to create recurring event.');
        return null;
      }
    } catch (error) {
      logger.error('Error creating recurring event:', error);
      Alert.alert('Error', 'Failed to create recurring event.');
      return null;
    }
  }, [addMessage]);

  const handleUpdateRecurringEvent = useCallback(async (data) => {
    try {
      const { recurring_id, updates } = data;
      const success = await updateRecurringEvent(recurring_id, updates);
      if (success) {
        addMessage(`✅ Updated recurring event`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to update recurring event.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating recurring event:', error);
      Alert.alert('Error', 'Failed to update recurring event.');
      return false;
    }
  }, [addMessage]);

  const handleDeleteRecurringEvent = useCallback(async (data) => {
    try {
      const { recurring_id, scope } = data;
      const success = await deleteRecurringEvent(recurring_id, scope);
      if (success) {
        const scopeMsg = scope === 'all' ? 'all instances' : scope === 'future' ? 'future instances' : 'this instance';
        addMessage(`✅ Deleted ${scopeMsg} of recurring event`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to delete recurring event.');
        return false;
      }
    } catch (error) {
      logger.error('Error deleting recurring event:', error);
      Alert.alert('Error', 'Failed to delete recurring event.');
      return false;
    }
  }, [addMessage]);

  // Worker Task handlers
  const handleCreateWorkerTask = useCallback(async (data) => {
    try {
      const { title, description, project_id, start_date, end_date, status } = data;
      const userId = await getCurrentUserId();

      if (!userId) {
        Alert.alert('Error', 'User not authenticated');
        return null;
      }

      const taskData = {
        owner_id: userId,
        project_id,
        title,
        description: description || null,
        start_date,
        end_date: end_date || start_date,
        status: status || 'pending',
      };

      const task = await createTask(taskData);
      if (task) {
        logger.debug('✅ Worker task created:', task.id);
        return task;
      } else {
        addMessage('❌ Sorry, I couldn\'t create that task. Please try again.');
        return null;
      }
    } catch (error) {
      logger.error('Error creating worker task:', error);
      addMessage(`❌ Error creating task: ${error.message || 'Unknown error'}`);
      return null;
    }
  }, [addMessage]);

  const handleUpdateWorkerTask = useCallback(async (data) => {
    try {
      const { id, ...updates } = data;

      if (!id) {
        Alert.alert('Error', 'No task ID provided');
        return false;
      }

      const success = await updateTask(id, updates);
      if (success) {
        addMessage(`✅ Task updated`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to update task.');
        return false;
      }
    } catch (error) {
      logger.error('Error updating worker task:', error);
      Alert.alert('Error', 'Failed to update task.');
      return false;
    }
  }, [addMessage]);

  const handleCompleteWorkerTask = useCallback(async (data) => {
    try {
      const { id } = data;

      if (!id) {
        Alert.alert('Error', 'No task ID provided');
        return false;
      }

      const success = await completeTask(id);
      if (success) {
        return true;
      } else {
        Alert.alert('Error', 'Failed to complete task.');
        return false;
      }
    } catch (error) {
      logger.error('Error completing worker task:', error);
      Alert.alert('Error', 'Failed to complete task.');
      return false;
    }
  }, [addMessage]);

  const handleDeleteWorkerTask = useCallback(async (data) => {
    try {
      const { id } = data;

      if (!id) {
        Alert.alert('Error', 'No task ID provided');
        return false;
      }

      const success = await deleteTask(id);
      if (success) {
        addMessage(`✅ Task removed`);
        return true;
      } else {
        Alert.alert('Error', 'Failed to delete task.');
        return false;
      }
    } catch (error) {
      logger.error('Error deleting worker task:', error);
      Alert.alert('Error', 'Failed to delete task.');
      return false;
    }
  }, [addMessage]);

  return {
    // Schedule events
    handleCreateScheduleEvent,
    handleUpdateScheduleEvent,
    handleDeleteScheduleEvent,
    handleRetrieveScheduleEvents,

    // Work schedules
    handleCreateWorkSchedule,
    handleUpdateWorkSchedule,
    handleBulkCreateWorkSchedule,

    // Recurring events
    handleCreateRecurringEvent,
    handleUpdateRecurringEvent,
    handleDeleteRecurringEvent,

    // Worker tasks
    handleCreateWorkerTask,
    handleUpdateWorkerTask,
    handleCompleteWorkerTask,
    handleDeleteWorkerTask,
  };
}
