/**
 * Schedule Conflict Detection Utility
 *
 * Provides intelligent conflict detection and time slot suggestions
 * for the scheduling system. Prevents double-booking and helps find
 * optimal meeting times.
 */

/**
 * Check if two time ranges overlap
 * @param {Date} start1 - Start of first range
 * @param {Date} end1 - End of first range
 * @param {Date} start2 - Start of second range
 * @param {Date} end2 - End of second range
 * @returns {boolean} - True if ranges overlap
 */
export const doTimeRangesOverlap = (start1, end1, start2, end2) => {
  // Ranges overlap if: start1 < end2 AND start2 < end1
  return start1 < end2 && start2 < end1;
};

/**
 * Find all events that conflict with a proposed new event
 * @param {Array} existingEvents - Array of existing schedule events
 * @param {string} newStartDatetime - ISO datetime string for new event start
 * @param {string} newEndDatetime - ISO datetime string for new event end (optional)
 * @param {string} excludeEventId - Event ID to exclude from conflict check (for updates)
 * @returns {Array} - Array of conflicting events
 */
export const findConflictingEvents = (existingEvents, newStartDatetime, newEndDatetime, excludeEventId = null) => {
  if (!existingEvents || existingEvents.length === 0) {
    return [];
  }

  const newStart = new Date(newStartDatetime);
  const newEnd = newEndDatetime ? new Date(newEndDatetime) : new Date(newStart.getTime() + 60 * 60 * 1000); // Default 1 hour

  return existingEvents.filter(event => {
    // Skip the event being updated
    if (event.id === excludeEventId) {
      return false;
    }

    // Get event times
    const eventStart = new Date(event.start_datetime);
    let eventEnd;

    // Handle all-day events (treat as full day)
    if (event.all_day) {
      eventEnd = new Date(eventStart);
      eventEnd.setHours(23, 59, 59, 999);
    } else {
      eventEnd = event.end_datetime ? new Date(event.end_datetime) : new Date(eventStart.getTime() + 60 * 60 * 1000);
    }

    // Check for overlap
    return doTimeRangesOverlap(newStart, newEnd, eventStart, eventEnd);
  });
};

/**
 * Format conflict warning message for user
 * @param {Array} conflicts - Array of conflicting events
 * @returns {string} - User-friendly conflict message
 */
export const formatConflictWarning = (conflicts) => {
  if (!conflicts || conflicts.length === 0) {
    return '';
  }

  if (conflicts.length === 1) {
    const event = conflicts[0];
    const time = formatEventTime(event);
    return `⚠️ Conflict: You already have "${event.title}" scheduled at ${time}.`;
  }

  // Multiple conflicts
  const conflictList = conflicts.map(event => {
    const time = formatEventTime(event);
    return `• ${event.title} at ${time}`;
  }).join('\n');

  return `⚠️ Multiple Conflicts:\n${conflictList}`;
};

/**
 * Format event time for display
 * @param {object} event - Event object
 * @returns {string} - Formatted time string
 */
export const formatEventTime = (event) => {
  if (event.all_day) {
    return 'all day';
  }

  const start = new Date(event.start_datetime);
  const timeStr = start.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (event.end_datetime) {
    const end = new Date(event.end_datetime);
    const endStr = end.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `${timeStr} - ${endStr}`;
  }

  return timeStr;
};

/**
 * Find available time slots on a given day
 * @param {Array} events - Existing events on the day
 * @param {Date} date - Date to find slots on
 * @param {number} durationMinutes - Duration needed (default 60)
 * @param {object} options - { startHour: 8, endHour: 18, bufferMinutes: 15 }
 * @returns {Array} - Array of available time slots { start, end, durationMinutes }
 */
export const findAvailableTimeSlots = (events, date, durationMinutes = 60, options = {}) => {
  const {
    startHour = 8,   // Business hours start at 8am
    endHour = 18,    // Business hours end at 6pm
    bufferMinutes = 15 // Buffer between events
  } = options;

  // Create day boundaries
  const dayStart = new Date(date);
  dayStart.setHours(startHour, 0, 0, 0);

  const dayEnd = new Date(date);
  dayEnd.setHours(endHour, 0, 0, 0);

  // Sort events by start time
  const sortedEvents = [...events].sort((a, b) => {
    return new Date(a.start_datetime) - new Date(b.start_datetime);
  });

  // Find gaps between events
  const availableSlots = [];
  let currentTime = dayStart;

  for (const event of sortedEvents) {
    const eventStart = new Date(event.start_datetime);
    let eventEnd;

    if (event.all_day) {
      // All-day event blocks the entire day
      return [];
    }

    eventEnd = event.end_datetime ? new Date(event.end_datetime) : new Date(eventStart.getTime() + 60 * 60 * 1000);

    // Check if there's a gap before this event
    const gapMinutes = (eventStart - currentTime) / (1000 * 60) - bufferMinutes;

    if (gapMinutes >= durationMinutes) {
      availableSlots.push({
        start: new Date(currentTime),
        end: new Date(eventStart.getTime() - bufferMinutes * 60 * 1000),
        durationMinutes: gapMinutes
      });
    }

    // Move current time to end of this event + buffer
    currentTime = new Date(eventEnd.getTime() + bufferMinutes * 60 * 1000);
  }

  // Check if there's time at the end of the day
  const remainingMinutes = (dayEnd - currentTime) / (1000 * 60);
  if (remainingMinutes >= durationMinutes) {
    availableSlots.push({
      start: new Date(currentTime),
      end: dayEnd,
      durationMinutes: remainingMinutes
    });
  }

  return availableSlots;
};

/**
 * Suggest alternative times for a conflicted event
 * @param {Array} events - Existing events on the day
 * @param {Date} date - Date to find alternatives on
 * @param {number} durationMinutes - Duration needed
 * @param {number} maxSuggestions - Maximum number of suggestions (default 3)
 * @returns {Array} - Array of suggested times { time, reasoning }
 */
export const suggestAlternativeTimes = (events, date, durationMinutes = 60, maxSuggestions = 3) => {
  const availableSlots = findAvailableTimeSlots(events, date, durationMinutes);

  if (availableSlots.length === 0) {
    return [{
      time: null,
      reasoning: "No available time slots found on this day. Consider scheduling on a different day."
    }];
  }

  const suggestions = [];

  for (let i = 0; i < Math.min(maxSuggestions, availableSlots.length); i++) {
    const slot = availableSlots[i];
    const timeStr = slot.start.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    let reasoning = `Available slot`;

    // Add context about the slot
    if (i === 0 && slot.start.getHours() < 10) {
      reasoning = "Early morning slot - good for starting the day";
    } else if (slot.durationMinutes > durationMinutes * 2) {
      reasoning = "Large time window - plenty of flexibility";
    } else if (i === availableSlots.length - 1) {
      reasoning = "End of day slot";
    }

    suggestions.push({
      time: slot.start.toISOString(),
      timeFormatted: timeStr,
      reasoning: reasoning,
      available_duration_minutes: slot.durationMinutes
    });
  }

  return suggestions;
};

/**
 * Check if events are back-to-back (end of one is start of next)
 * @param {object} event1 - First event
 * @param {object} event2 - Second event
 * @param {number} bufferMinutes - Acceptable buffer (default 0)
 * @returns {boolean} - True if events are back-to-back
 */
export const areEventsBackToBack = (event1, event2, bufferMinutes = 0) => {
  const end1 = event1.end_datetime ? new Date(event1.end_datetime) : new Date(new Date(event1.start_datetime).getTime() + 60 * 60 * 1000);
  const start2 = new Date(event2.start_datetime);

  const gapMinutes = (start2 - end1) / (1000 * 60);
  return gapMinutes >= -5 && gapMinutes <= bufferMinutes;
};

/**
 * Get events on a specific date
 * @param {Array} events - All events
 * @param {Date} date - Date to filter by
 * @returns {Array} - Events on the specified date
 */
export const getEventsOnDate = (events, date) => {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);

  return events.filter(event => {
    const eventDate = new Date(event.start_datetime);
    return eventDate >= targetDate && eventDate < nextDay;
  });
};
