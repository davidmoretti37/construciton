/**
 * Schedule Optimizer - Intelligent Scheduling with Travel Time Awareness
 *
 * This module provides advanced scheduling intelligence by combining:
 * - Time conflict detection
 * - Travel time calculations between locations
 * - Intelligent buffer time suggestions
 * - Optimal time slot recommendations
 */

import {
  findConflictingEvents,
  findAvailableTimeSlots,
  getEventsOnDate,
  formatEventTime
} from './scheduleConflicts';

import {
  calculateTravelTime,
  calculateIntelligentBuffer,
  formatTravelInfo
} from './geocoding';

/**
 * Analyze a proposed event for conflicts and travel issues
 * @param {Array} existingEvents - All existing schedule events
 * @param {object} newEvent - Proposed new event { start_datetime, end_datetime, address, latitude, longitude }
 * @returns {Promise<object>} - { conflicts, travelWarnings, canSchedule, reasons }
 */
export const analyzeScheduleDay = async (existingEvents, newEvent) => {
  const analysis = {
    conflicts: [],
    travelWarnings: [],
    canSchedule: true,
    reasons: []
  };

  // 1. Check for time conflicts
  const timeConflicts = findConflictingEvents(
    existingEvents,
    newEvent.start_datetime,
    newEvent.end_datetime
  );

  if (timeConflicts.length > 0) {
    analysis.conflicts = timeConflicts;
    analysis.canSchedule = false;
    analysis.reasons.push('Time conflict with existing event(s)');
  }

  // 2. Check travel time if locations are provided
  if (newEvent.latitude && newEvent.longitude) {
    const newEventDate = new Date(newEvent.start_datetime);
    const eventsOnSameDay = getEventsOnDate(existingEvents, newEventDate);

    // Find the event immediately before the new event
    const eventsBefore = eventsOnSameDay.filter(event => {
      const eventEnd = event.end_datetime ? new Date(event.end_datetime) : new Date(event.start_datetime);
      return eventEnd <= newEventDate;
    });

    if (eventsBefore.length > 0) {
      // Sort by end time, get the most recent
      eventsBefore.sort((a, b) => {
        const endA = a.end_datetime ? new Date(a.end_datetime) : new Date(a.start_datetime);
        const endB = b.end_datetime ? new Date(b.end_datetime) : new Date(b.start_datetime);
        return endB - endA;
      });

      const previousEvent = eventsBefore[0];

      // Only check travel time if previous event has a location
      if (previousEvent.latitude && previousEvent.longitude) {
        try {
          const previousEventEnd = previousEvent.end_datetime
            ? new Date(previousEvent.end_datetime)
            : new Date(previousEvent.start_datetime);

          const travelData = await calculateTravelTime(
            { latitude: previousEvent.latitude, longitude: previousEvent.longitude },
            { latitude: newEvent.latitude, longitude: newEvent.longitude },
            previousEventEnd // Use end time for traffic estimation
          );

          if (travelData) {
            const travelMinutes = Math.ceil(travelData.duration_seconds / 60);
            const distanceKm = travelData.distance_meters / 1000;
            const bufferMinutes = calculateIntelligentBuffer(distanceKm, newEvent.event_type, travelMinutes);
            const totalMinutesNeeded = travelMinutes + bufferMinutes;

            // Calculate actual gap between events
            const gapMinutes = (newEventDate - previousEventEnd) / (1000 * 60);

            if (gapMinutes < totalMinutesNeeded) {
              analysis.travelWarnings.push({
                previousEvent: previousEvent.title,
                travelTime: travelMinutes,
                bufferTime: bufferMinutes,
                totalNeeded: totalMinutesNeeded,
                actualGap: Math.floor(gapMinutes),
                shortfall: Math.ceil(totalMinutesNeeded - gapMinutes),
                travelInfo: formatTravelInfo(travelData, bufferMinutes)
              });
              analysis.canSchedule = false;
              analysis.reasons.push(`Insufficient travel time from ${previousEvent.title}`);
            }
          }
        } catch (error) {
          console.error('Error calculating travel time:', error);
          // Don't block scheduling if travel calculation fails
        }
      }
    }
  }

  return analysis;
};

/**
 * Suggest optimal times for a new event, considering conflicts and travel
 * @param {Array} existingEvents - All existing events
 * @param {object} newEvent - Proposed event details { duration_minutes, address, latitude, longitude, event_type }
 * @param {Date} targetDate - Date to find slots on
 * @param {number} maxSuggestions - Maximum suggestions to return
 * @returns {Promise<Array>} - Array of suggested times with reasoning
 */
export const suggestOptimalTimes = async (existingEvents, newEvent, targetDate, maxSuggestions = 3) => {
  const eventsOnDate = getEventsOnDate(existingEvents, targetDate);
  const durationMinutes = newEvent.duration_minutes || 60;

  // Find available time slots
  const availableSlots = findAvailableTimeSlots(eventsOnDate, targetDate, durationMinutes, {
    startHour: 8,
    endHour: 18,
    bufferMinutes: 15
  });

  const suggestions = [];

  for (const slot of availableSlots) {
    if (suggestions.length >= maxSuggestions) break;

    const suggestion = {
      start_datetime: slot.start.toISOString(),
      end_datetime: new Date(slot.start.getTime() + durationMinutes * 60 * 1000).toISOString(),
      timeFormatted: slot.start.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }),
      reasoning: [],
      score: 0
    };

    // Score this slot based on various factors
    let score = 100;

    // 1. Prefer morning/mid-day over late afternoon
    const hour = slot.start.getHours();
    if (hour >= 9 && hour <= 12) {
      score += 10;
      suggestion.reasoning.push('Good morning time slot');
    } else if (hour >= 13 && hour <= 15) {
      score += 5;
      suggestion.reasoning.push('Afternoon slot');
    } else if (hour > 16) {
      score -= 5;
      suggestion.reasoning.push('End of day slot');
    }

    // 2. Check travel time if locations provided
    if (newEvent.latitude && newEvent.longitude) {
      const previousEvent = findPreviousEvent(eventsOnDate, slot.start);

      if (previousEvent && previousEvent.latitude && previousEvent.longitude) {
        try {
          const travelData = await calculateTravelTime(
            { latitude: previousEvent.latitude, longitude: previousEvent.longitude },
            { latitude: newEvent.latitude, longitude: newEvent.longitude },
            slot.start
          );

          if (travelData) {
            const travelMinutes = Math.ceil(travelData.duration_seconds / 60);
            const distanceKm = travelData.distance_meters / 1000;
            const bufferMinutes = calculateIntelligentBuffer(distanceKm, newEvent.event_type, travelMinutes);

            // Add travel info to reasoning
            suggestion.reasoning.push(`${travelMinutes + bufferMinutes} min from ${previousEvent.title}`);
            suggestion.travelTime = travelMinutes;
            suggestion.bufferTime = bufferMinutes;

            // Prefer slots with comfortable travel buffers
            const previousEnd = previousEvent.end_datetime
              ? new Date(previousEvent.end_datetime)
              : new Date(previousEvent.start_datetime);
            const actualGap = (slot.start - previousEnd) / (1000 * 60);
            const excess = actualGap - (travelMinutes + bufferMinutes);

            if (excess > 30) {
              score -= 5; // Too much gap is inefficient
              suggestion.reasoning.push('Plenty of buffer time');
            } else if (excess > 10) {
              score += 10; // Good balance
              suggestion.reasoning.push('Comfortable travel buffer');
            } else if (excess > 0) {
              score += 5; // Tight but works
              suggestion.reasoning.push('Tight travel timing');
            }
          }
        } catch (error) {
          console.error('Error calculating travel for suggestion:', error);
        }
      }
    }

    // 3. Prefer larger available windows (more flexibility)
    if (slot.durationMinutes > durationMinutes * 2) {
      score += 5;
      suggestion.reasoning.push('Large time window available');
    }

    suggestion.score = score;
    suggestions.push(suggestion);
  }

  // Sort by score (highest first)
  suggestions.sort((a, b) => b.score - a.score);

  // Format reasoning into readable string
  suggestions.forEach(s => {
    s.reasoningText = s.reasoning.join(', ');
  });

  return suggestions.slice(0, maxSuggestions);
};

/**
 * Find the event immediately before a given time
 * @param {Array} events - Events to search
 * @param {Date} time - Time to find previous event for
 * @returns {object|null} - Previous event or null
 */
const findPreviousEvent = (events, time) => {
  const eventsBefore = events.filter(event => {
    const eventEnd = event.end_datetime ? new Date(event.end_datetime) : new Date(event.start_datetime);
    return eventEnd <= time;
  });

  if (eventsBefore.length === 0) return null;

  // Sort by end time, return most recent
  eventsBefore.sort((a, b) => {
    const endA = a.end_datetime ? new Date(a.end_datetime) : new Date(a.start_datetime);
    const endB = b.end_datetime ? new Date(b.end_datetime) : new Date(b.start_datetime);
    return endB - endA;
  });

  return eventsBefore[0];
};

/**
 * Format scheduling analysis into user-friendly message
 * @param {object} analysis - Analysis from analyzeScheduleDay
 * @param {object} newEvent - The proposed event
 * @returns {string} - Formatted message
 */
export const formatSchedulingMessage = (analysis, newEvent) => {
  let message = '';

  if (analysis.canSchedule) {
    message = '✅ This time slot is available!';
    if (analysis.travelWarnings.length === 0) {
      message += ' No conflicts or travel issues detected.';
    }
    return message;
  }

  // Has issues
  message = '⚠️ Scheduling Issues Detected:\n\n';

  // List conflicts
  if (analysis.conflicts.length > 0) {
    message += '**Time Conflicts:**\n';
    analysis.conflicts.forEach(conflict => {
      const time = formatEventTime(conflict);
      message += `• ${conflict.title} at ${time}\n`;
    });
    message += '\n';
  }

  // List travel warnings
  if (analysis.travelWarnings.length > 0) {
    message += '**Travel Time Issues:**\n';
    analysis.travelWarnings.forEach(warning => {
      message += `• ${warning.travelInfo}\n`;
      message += `  Gap: ${warning.actualGap} min, Need: ${warning.totalNeeded} min (${warning.shortfall} min short)\n`;
    });
  }

  return message;
};

/**
 * Get formatted list of alternative time suggestions
 * @param {Array} suggestions - Suggestions from suggestOptimalTimes
 * @returns {string} - Formatted list
 */
export const formatSuggestions = (suggestions) => {
  if (suggestions.length === 0) {
    return 'No available time slots found. Consider scheduling on a different day.';
  }

  let message = 'Suggested alternative times:\n\n';

  suggestions.forEach((suggestion, index) => {
    message += `${index + 1}. **${suggestion.timeFormatted}**\n`;
    if (suggestion.reasoningText) {
      message += `   ${suggestion.reasoningText}\n`;
    }
    message += '\n';
  });

  return message;
};
