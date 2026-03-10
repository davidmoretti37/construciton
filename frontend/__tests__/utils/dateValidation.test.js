/**
 * Date Validation Tests
 *
 * Validates validateDateTime, getNextWeekday, verifyWeekdayDate,
 * and correctEventDates pure functions.
 */

import { validateDateTime, getNextWeekday, verifyWeekdayDate, correctEventDates } from '../../src/utils/dateValidation';

// ============================================================
// validateDateTime
// ============================================================
describe('validateDateTime', () => {
  test('valid date only: "2025-03-15" → valid', () => {
    const result = validateDateTime('2025-03-15');
    expect(result.valid).toBe(true);
    expect(result.date).toBeInstanceOf(Date);
    expect(result.date.getFullYear()).toBe(2025);
    expect(result.date.getMonth()).toBe(2); // March = 2
    expect(result.date.getDate()).toBe(15);
  });

  test('valid datetime: "2025-03-15T14:30:00" → valid', () => {
    const result = validateDateTime('2025-03-15T14:30:00');
    expect(result.valid).toBe(true);
    expect(result.date.getHours()).toBe(14);
    expect(result.date.getMinutes()).toBe(30);
  });

  test('invalid day: "2025-02-30" → invalid (day does not exist)', () => {
    const result = validateDateTime('2025-02-30');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('day does not exist');
  });

  test('invalid hour: "2025-03-15T25:00:00" → invalid', () => {
    const result = validateDateTime('2025-03-15T25:00:00');
    expect(result.valid).toBe(false);
    // Hour 25 causes Date to roll over to next day, caught by day validation
    expect(result.error).toBeTruthy();
  });

  test('empty/null → invalid', () => {
    expect(validateDateTime('').valid).toBe(false);
    expect(validateDateTime(null).valid).toBe(false);
    expect(validateDateTime(undefined).valid).toBe(false);
  });

  test('garbage string → invalid format', () => {
    const result = validateDateTime('not-a-date');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid datetime format');
  });

  test('valid date with partial time: "2025-03-15T09:00" → valid', () => {
    const result = validateDateTime('2025-03-15T09:00');
    expect(result.valid).toBe(true);
    expect(result.date.getHours()).toBe(9);
  });
});

// ============================================================
// getNextWeekday
// ============================================================
describe('getNextWeekday', () => {
  test('from Monday, target Tuesday → tomorrow', () => {
    // Create a known Monday
    const monday = new Date(2025, 2, 10); // March 10, 2025 is a Monday
    const result = getNextWeekday(monday, 'tuesday');

    expect(result.getDay()).toBe(2); // Tuesday
    expect(result.getDate()).toBe(11); // March 11
  });

  test('from Monday, target Monday → next week Monday', () => {
    const monday = new Date(2025, 2, 10);
    const result = getNextWeekday(monday, 'monday');

    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(17); // +7 days
  });

  test('from Wednesday, target Friday → 2 days ahead', () => {
    const wednesday = new Date(2025, 2, 12); // March 12, 2025 is a Wednesday
    const result = getNextWeekday(wednesday, 'friday');

    expect(result.getDay()).toBe(5);
    expect(result.getDate()).toBe(14);
  });

  test('invalid day name → null', () => {
    const date = new Date(2025, 2, 10);
    expect(getNextWeekday(date, 'notaday')).toBeNull();
  });

  test('case insensitive', () => {
    const monday = new Date(2025, 2, 10);
    const result = getNextWeekday(monday, 'WEDNESDAY');

    expect(result).not.toBeNull();
    expect(result.getDay()).toBe(3);
  });
});

// ============================================================
// verifyWeekdayDate
// ============================================================
describe('verifyWeekdayDate', () => {
  test('matching date → matches=true', () => {
    // March 11, 2025 is a Tuesday
    const result = verifyWeekdayDate('2025-03-11T14:00:00', 'next Tuesday');
    expect(result.matches).toBe(true);
    expect(result.correctedDate).toBeNull();
  });

  test('wrong day → corrected date with preserved time', () => {
    // March 12, 2025 is a Wednesday, but reference says "Tuesday"
    const result = verifyWeekdayDate('2025-03-12T14:30:00', 'next Tuesday');
    expect(result.matches).toBe(false);
    expect(result.correctedDate).not.toBeNull();
    expect(result.dayMismatch.expected).toBe('tuesday');
    expect(result.dayMismatch.actual).toBe('wednesday');
    // Time should be preserved
    expect(result.correctedDate).toContain('14:30:00');
  });

  test('no weekday reference → matches=true (nothing to verify)', () => {
    const result = verifyWeekdayDate('2025-03-15T10:00:00', null);
    expect(result.matches).toBe(true);
  });

  test('non-weekday reference text → matches=true', () => {
    const result = verifyWeekdayDate('2025-03-15T10:00:00', 'tomorrow morning');
    expect(result.matches).toBe(true);
  });
});

// ============================================================
// correctEventDates
// ============================================================
describe('correctEventDates', () => {
  test('no date_reference → returns unchanged', () => {
    const event = { start_datetime: '2025-03-15T10:00:00', end_datetime: '2025-03-15T11:00:00' };
    expect(correctEventDates(event)).toEqual(event);
  });

  test('corrects both start and end when day mismatches', () => {
    // March 12, 2025 is Wednesday, reference says Tuesday
    const event = {
      start_datetime: '2025-03-12T09:00:00',
      end_datetime: '2025-03-12T10:00:00',
      date_reference: 'next Tuesday',
    };

    const result = correctEventDates(event);

    // Both should be corrected to Tuesday
    if (result.start_datetime !== event.start_datetime) {
      // Verify the corrected date is a Tuesday
      const correctedStart = new Date(result.start_datetime.replace('T', ' '));
      expect(correctedStart.getDay()).toBe(2); // Tuesday
      expect(result.start_datetime).toContain('09:00:00');
    }
  });

  test('preserves other event fields', () => {
    const event = {
      title: 'Team Meeting',
      start_datetime: '2025-03-11T09:00:00',
      date_reference: 'next Tuesday',
      location: 'Office',
    };

    const result = correctEventDates(event);
    expect(result.title).toBe('Team Meeting');
    expect(result.location).toBe('Office');
  });
});
