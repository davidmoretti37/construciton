/**
 * Date Validation Utilities
 * Validates and corrects AI-generated dates for schedule events
 */

/**
 * Validate and parse a datetime string
 * @param {string} datetimeStr - DateTime in YYYY-MM-DDTHH:mm:ss format
 * @returns {{ valid: boolean, date: Date|null, error: string|null }}
 */
export const validateDateTime = (datetimeStr) => {
  if (!datetimeStr) return { valid: false, date: null, error: 'No datetime provided' };

  // Parse YYYY-MM-DDTHH:mm:ss format (with optional time)
  const match = datetimeStr.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return { valid: false, date: null, error: 'Invalid datetime format' };

  const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
  const date = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );

  // Validate the date is real (e.g., Feb 30 would fail this check)
  if (date.getMonth() !== parseInt(month) - 1 || date.getDate() !== parseInt(day)) {
    return { valid: false, date: null, error: 'Invalid date (day does not exist)' };
  }

  // Validate time components
  if (parseInt(hour) > 23 || parseInt(minute) > 59 || parseInt(second) > 59) {
    return { valid: false, date: null, error: 'Invalid time' };
  }

  return { valid: true, date, error: null };
};

/**
 * Calculate the next occurrence of a weekday from a given date
 * @param {Date} fromDate - Starting date
 * @param {string} targetDayName - Weekday name (e.g., "monday", "tuesday")
 * @returns {Date|null} - The next occurrence of that weekday
 */
export const getNextWeekday = (fromDate, targetDayName) => {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDay = dayNames.indexOf(targetDayName.toLowerCase());
  if (targetDay === -1) return null;

  const currentDay = fromDate.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7; // If today or already passed, go to next week

  const result = new Date(fromDate);
  result.setDate(result.getDate() + daysUntil);
  return result;
};

/**
 * Format a Date object to YYYY-MM-DDTHH:mm:ss string
 * @param {Date} date - Date to format
 * @returns {string} - Formatted datetime string
 */
const formatDateTime = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};

/**
 * Verify that an AI-calculated date matches the intended weekday reference
 * If mismatch, calculates and returns the correct date
 *
 * @param {string} aiDateStr - The datetime string from AI
 * @param {string} weekdayReference - The original reference (e.g., "next Tuesday", "this Monday")
 * @returns {{ matches: boolean, correctedDate: string|null, dayMismatch: { expected: string, actual: string }|null }}
 */
export const verifyWeekdayDate = (aiDateStr, weekdayReference) => {
  if (!weekdayReference) return { matches: true, correctedDate: null, dayMismatch: null };

  const { valid, date: aiDate } = validateDateTime(aiDateStr);
  if (!valid) return { matches: false, correctedDate: null, dayMismatch: null };

  // Extract weekday from reference like "next Tuesday", "this Monday", or just "Tuesday"
  const weekdayMatch = weekdayReference.match(/(next|this)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i);
  if (!weekdayMatch) return { matches: true, correctedDate: null, dayMismatch: null };

  const targetDayName = weekdayMatch[2].toLowerCase();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const targetDayNum = dayNames.indexOf(targetDayName);
  const aiDayNum = aiDate.getDay();

  // Check if AI date falls on the correct day of week
  if (aiDayNum === targetDayNum) {
    return { matches: true, correctedDate: null, dayMismatch: null };
  }

  // AI got it wrong - calculate the correct date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const correctDate = getNextWeekday(today, targetDayName);

  if (!correctDate) {
    return { matches: false, correctedDate: null, dayMismatch: null };
  }

  // Preserve the time from AI's date
  correctDate.setHours(aiDate.getHours(), aiDate.getMinutes(), aiDate.getSeconds());

  return {
    matches: false,
    correctedDate: formatDateTime(correctDate),
    dayMismatch: {
      expected: dayNames[targetDayNum],
      actual: dayNames[aiDayNum]
    }
  };
};

/**
 * Correct both start and end datetimes if the date reference doesn't match
 * @param {object} eventData - Event data with start_datetime, end_datetime, date_reference
 * @returns {object} - Event data with corrected dates
 */
export const correctEventDates = (eventData) => {
  if (!eventData.date_reference) return eventData;

  const corrected = { ...eventData };

  // Check and correct start_datetime
  const startVerification = verifyWeekdayDate(eventData.start_datetime, eventData.date_reference);
  if (!startVerification.matches && startVerification.correctedDate) {
    corrected.start_datetime = startVerification.correctedDate;
  }

  // Check and correct end_datetime if present
  if (eventData.end_datetime) {
    const endVerification = verifyWeekdayDate(eventData.end_datetime, eventData.date_reference);
    if (!endVerification.matches && endVerification.correctedDate) {
      corrected.end_datetime = endVerification.correctedDate;
    }
  }

  return corrected;
};
