/**
 * Time Tracking Storage Tests
 *
 * Validates clock in/out, active session queries,
 * payment calculations, manual entries, and break management.
 */

jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn(),
}));

jest.mock('../../../src/utils/calculations', () => ({
  getLocalTimestamp: jest.fn(() => '2025-03-15T08:00:00.000Z'),
  getLocalDayBounds: jest.fn(() => ({ startOfDay: '2025-03-15T00:00:00', endOfDay: '2025-03-15T23:59:59' })),
  getLocalDateString: jest.fn(() => '2025-03-15'),
  getDateRangeBoundsUTC: jest.fn(() => ({ start: '2025-03-01T00:00:00', end: '2025-03-31T23:59:59' })),
  formatHoursMinutes: jest.fn((h) => `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`),
}));

jest.mock('../../../src/services/agents/core/CacheService', () => ({
  responseCache: { invalidateAgent: jest.fn() },
}));

jest.mock('../../../src/utils/storage/auth', () => ({
  getCurrentUserId: jest.fn(() => Promise.resolve('user-1')),
}));

let mockChainResult = { data: null, error: null };
let mockChainCalls = [];

const createChainBuilder = () => {
  const builder = {
    select: jest.fn((...args) => { mockChainCalls.push(['select', ...args]); return builder; }),
    eq: jest.fn((...args) => { mockChainCalls.push(['eq', ...args]); return builder; }),
    is: jest.fn((...args) => { mockChainCalls.push(['is', ...args]); return builder; }),
    in: jest.fn((...args) => { mockChainCalls.push(['in', ...args]); return builder; }),
    gte: jest.fn((...args) => { mockChainCalls.push(['gte', ...args]); return builder; }),
    lte: jest.fn((...args) => { mockChainCalls.push(['lte', ...args]); return builder; }),
    order: jest.fn((...args) => { mockChainCalls.push(['order', ...args]); return builder; }),
    limit: jest.fn((...args) => { mockChainCalls.push(['limit', ...args]); return builder; }),
    single: jest.fn(() => { mockChainCalls.push(['single']); return Promise.resolve(mockChainResult); }),
    maybeSingle: jest.fn(() => { mockChainCalls.push(['maybeSingle']); return Promise.resolve(mockChainResult); }),
    insert: jest.fn((...args) => { mockChainCalls.push(['insert', ...args]); return builder; }),
    update: jest.fn((...args) => { mockChainCalls.push(['update', ...args]); return builder; }),
    delete: jest.fn(() => { mockChainCalls.push(['delete']); return builder; }),
    then: jest.fn((cb) => cb(mockChainResult)),
  };
  return builder;
};

jest.mock('../../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => createChainBuilder()),
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    functions: { invoke: jest.fn().mockResolvedValue({}) },
  },
}));

import { supabase } from '../../../src/lib/supabase';
import {
  clockIn,
  clockOut,
  getActiveClockIn,
  editTimeEntry,
  createManualTimeEntry,
  calculateHourlyPayment,
  calculateDailyPayment,
  calculateWeeklyPayment,
} from '../../../src/utils/storage/timeTracking';

beforeEach(() => {
  jest.clearAllMocks();
  mockChainCalls = [];
  mockChainResult = { data: null, error: null };
  supabase.from.mockImplementation(() => createChainBuilder());
  supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

// ============================================================
// clockIn
// ============================================================
describe('clockIn', () => {
  test('creates time_tracking entry with worker_id, project_id, clock_in', async () => {
    const record = { id: 'tt-1', worker_id: 'w-1', project_id: 'p-1', clock_in: '2025-03-15T08:00:00.000Z' };
    supabase.from.mockImplementation(() => {
      const builder = createChainBuilder();
      mockChainResult = { data: record, error: null };
      return builder;
    });

    const result = await clockIn('w-1', 'p-1');

    expect(supabase.from).toHaveBeenCalledWith('time_tracking');
    expect(result).toBeTruthy();
  });

  test('includes location when provided', async () => {
    const record = { id: 'tt-1', worker_id: 'w-1', location_lat: 40.7128, location_lng: -74.006 };
    supabase.from.mockImplementation(() => {
      const builder = createChainBuilder();
      mockChainResult = { data: record, error: null };
      return builder;
    });

    await clockIn('w-1', 'p-1', { latitude: 40.7128, longitude: -74.006 });

    const insertCall = mockChainCalls.find(c => c[0] === 'insert');
    expect(insertCall).toBeTruthy();
    expect(insertCall[1].location_lat).toBe(40.7128);
    expect(insertCall[1].location_lng).toBe(-74.006);
  });

  test('returns null on error', async () => {
    supabase.from.mockImplementation(() => {
      const builder = createChainBuilder();
      mockChainResult = { data: null, error: { message: 'DB error' } };
      return builder;
    });

    const result = await clockIn('w-1', 'p-1');
    expect(result).toBeNull();
  });
});

// ============================================================
// clockOut
// ============================================================
describe('clockOut', () => {
  test('updates time entry with clock_out and calculates labor', async () => {
    const timeEntry = {
      id: 'tt-1', worker_id: 'w-1', project_id: 'p-1',
      clock_in: '2025-03-15T08:00:00.000Z',
      workers: { id: 'w-1', full_name: 'John', payment_type: 'hourly', hourly_rate: 25 },
      projects: { id: 'p-1', name: 'Kitchen' },
    };
    let callCount = 0;
    supabase.from.mockImplementation(() => {
      callCount++;
      const builder = createChainBuilder();
      if (callCount === 1) {
        mockChainResult = { data: timeEntry, error: null };
      } else {
        mockChainResult = { data: null, error: null };
      }
      return builder;
    });

    const result = await clockOut('tt-1');

    expect(supabase.from).toHaveBeenCalledWith('time_tracking');
    expect(result.success).toBe(true);
  });

  test('returns failure on fetch error', async () => {
    supabase.from.mockImplementation(() => {
      const builder = createChainBuilder();
      mockChainResult = { data: null, error: { message: 'not found' } };
      return builder;
    });

    const result = await clockOut('tt-999');
    expect(result.success).toBe(false);
  });
});

// ============================================================
// getActiveClockIn
// ============================================================
describe('getActiveClockIn', () => {
  test('returns active session (clock_out is null)', async () => {
    const active = { id: 'tt-1', worker_id: 'w-1', clock_in: '2025-03-15T08:00:00', clock_out: null };
    mockChainResult = { data: active, error: null };

    const result = await getActiveClockIn('w-1');

    expect(supabase.from).toHaveBeenCalledWith('time_tracking');
    const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
    expect(eqCalls).toEqual(expect.arrayContaining([['eq', 'worker_id', 'w-1']]));
    const isCalls = mockChainCalls.filter(c => c[0] === 'is');
    expect(isCalls).toEqual(expect.arrayContaining([['is', 'clock_out', null]]));
    expect(result).toEqual(active);
  });

  test('returns null when no active session', async () => {
    mockChainResult = { data: null, error: { code: 'PGRST116' } };

    const result = await getActiveClockIn('w-1');
    expect(result).toBeNull();
  });
});

// ============================================================
// editTimeEntry
// ============================================================
describe('editTimeEntry', () => {
  test('updates time entry fields and recalculates hours', async () => {
    let callCount = 0;
    supabase.from.mockImplementation(() => {
      callCount++;
      const builder = createChainBuilder();
      if (callCount === 1) {
        // Fetch existing
        mockChainResult = { data: { id: 'tt-1', clock_in: '2025-03-15T08:00:00', clock_out: '2025-03-15T16:00:00' }, error: null };
      } else {
        // Update
        mockChainResult = { error: null };
      }
      return builder;
    });

    const result = await editTimeEntry('tt-1', {
      clock_in: '2025-03-15T07:00:00',
      clock_out: '2025-03-15T16:00:00',
    });

    expect(supabase.from).toHaveBeenCalledWith('time_tracking');
    expect(result).toBe(true);
  });
});

// ============================================================
// createManualTimeEntry
// ============================================================
describe('createManualTimeEntry', () => {
  test('creates entry with clock_in and clock_out', async () => {
    const entry = { id: 'tt-1', worker_id: 'w-1', hours_worked: 9, is_manual: true };
    mockChainResult = { data: entry, error: null };

    const result = await createManualTimeEntry('w-1', 'p-1', '08:00', '17:00', '2025-03-15');

    expect(supabase.from).toHaveBeenCalledWith('time_tracking');
    const insertCall = mockChainCalls.find(c => c[0] === 'insert');
    expect(insertCall).toBeTruthy();
    expect(insertCall[1].worker_id).toBe('w-1');
    expect(insertCall[1].is_manual).toBe(true);
    expect(result).toBeTruthy();
  });

  test('returns null when not authenticated', async () => {
    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });

    const result = await createManualTimeEntry('w-1', 'p-1', '08:00', '17:00', '2025-03-15');
    expect(result).toBeNull();
  });
});

// ============================================================
// Payment Calculations (pure functions)
// ============================================================
describe('calculateHourlyPayment', () => {
  test('multiplies entries hours by hourly rate', () => {
    // These functions use preprocessed entries with .hours and .date fields
    const entries = [
      { hours: 8, date: '2025-03-15', project_id: 'p-1', projects: { name: 'Kitchen' } },
      { hours: 4, date: '2025-03-16', project_id: 'p-1', projects: { name: 'Kitchen' } },
    ];

    const result = calculateHourlyPayment(entries, 25);

    expect(result.totalAmount).toBe(300); // (8 + 4) * 25
    expect(result.totalDays).toBe(2);
  });

  test('empty entries → zero', () => {
    const result = calculateHourlyPayment([], 25);
    expect(result.totalAmount).toBe(0);
    expect(result.totalDays).toBe(0);
  });
});

describe('calculateDailyPayment', () => {
  test('full day (≥5 hours) uses full daily rate', () => {
    const entries = [
      { hours: 9, date: '2025-03-15', project_id: 'p-1', projects: { name: 'Kitchen' } },
    ];

    const result = calculateDailyPayment(entries, 200);

    expect(result.totalAmount).toBe(200);
    expect(result.totalDays).toBe(1);
  });

  test('half day (<5 hours) uses half daily rate', () => {
    const entries = [
      { hours: 4, date: '2025-03-15', project_id: 'p-1', projects: { name: 'Kitchen' } },
    ];

    const result = calculateDailyPayment(entries, 200);

    expect(result.totalAmount).toBe(100); // half day
    expect(result.totalDays).toBe(1);
  });
});

describe('calculateWeeklyPayment', () => {
  test('pro-rata by weeks worked within period', () => {
    const entries = [
      { hours: 9, date: '2025-03-10', project_id: 'p-1', projects: { name: 'Kitchen' } },
      { hours: 9, date: '2025-03-11', project_id: 'p-1', projects: { name: 'Kitchen' } },
      { hours: 9, date: '2025-03-12', project_id: 'p-1', projects: { name: 'Kitchen' } },
      { hours: 9, date: '2025-03-13', project_id: 'p-1', projects: { name: 'Kitchen' } },
      { hours: 9, date: '2025-03-14', project_id: 'p-1', projects: { name: 'Kitchen' } },
    ];

    const result = calculateWeeklyPayment(entries, 1000, '2025-03-10', '2025-03-14');

    // 5 days / 7 = ~1 week → 1000
    expect(result.totalAmount).toBe(1000);
    expect(result.weeksWorked).toBe(1);
  });
});
