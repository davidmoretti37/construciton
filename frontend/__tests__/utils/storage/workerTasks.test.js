/**
 * Worker Tasks Storage Tests
 *
 * Validates pure date/validation functions, task CRUD,
 * working day logic, and bulk operations.
 */

jest.mock('../../../src/utils/storage/auth', () => ({
  getCurrentUserId: jest.fn(() => Promise.resolve('user-1')),
}));

jest.mock('../../../src/services/aiService', () => ({
  sendPlanningRequest: jest.fn(),
}));

let mockChainResult = { data: null, error: null };
let mockChainCalls = [];

const createChainBuilder = () => {
  const builder = {
    select: jest.fn((...args) => { mockChainCalls.push(['select', ...args]); return builder; }),
    eq: jest.fn((...args) => { mockChainCalls.push(['eq', ...args]); return builder; }),
    in: jest.fn((...args) => { mockChainCalls.push(['in', ...args]); return builder; }),
    gte: jest.fn((...args) => { mockChainCalls.push(['gte', ...args]); return builder; }),
    lte: jest.fn((...args) => { mockChainCalls.push(['lte', ...args]); return builder; }),
    or: jest.fn((...args) => { mockChainCalls.push(['or', ...args]); return builder; }),
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
  },
}));

import { supabase } from '../../../src/lib/supabase';
import { getCurrentUserId } from '../../../src/utils/storage/auth';
import {
  safeParseDateToString,
  safeParseDateToObject,
  validateWorkingDays,
  isWorkingDay,
  shiftDate,
  createTask,
  completeTask,
  uncompleteTask,
  deleteTask,
  calculateProjectProgressFromTasks,
} from '../../../src/utils/storage/workerTasks';

beforeEach(() => {
  jest.clearAllMocks();
  mockChainCalls = [];
  mockChainResult = { data: null, error: null };
  supabase.from.mockImplementation(() => createChainBuilder());
});

// ============================================================
// safeParseDateToString (pure function)
// ============================================================
describe('safeParseDateToString', () => {
  test('"2025-03-15" → "2025-03-15"', () => {
    expect(safeParseDateToString('2025-03-15')).toBe('2025-03-15');
  });

  test('Date object → "YYYY-MM-DD"', () => {
    const date = new Date(2025, 2, 15, 12, 0, 0); // March 15
    const result = safeParseDateToString(date);
    expect(result).toBe('2025-03-15');
  });

  test('ISO timestamp → "YYYY-MM-DD"', () => {
    expect(safeParseDateToString('2025-03-15T14:30:00.000Z')).toBe('2025-03-15');
  });

  test('invalid → null', () => {
    expect(safeParseDateToString(null)).toBeNull();
    expect(safeParseDateToString(undefined)).toBeNull();
    expect(safeParseDateToString('not-a-date')).toBeNull();
  });

  test('Invalid Date object → null', () => {
    expect(safeParseDateToString(new Date('invalid'))).toBeNull();
  });
});

// ============================================================
// safeParseDateToObject (pure function)
// ============================================================
describe('safeParseDateToObject', () => {
  test('string → Date object', () => {
    const result = safeParseDateToObject('2025-03-15');
    expect(result).toBeInstanceOf(Date);
    expect(result.getFullYear()).toBe(2025);
  });

  test('Date object passes through', () => {
    const date = new Date(2025, 2, 15);
    const result = safeParseDateToObject(date);
    expect(result).toEqual(date);
  });

  test('null → null', () => {
    expect(safeParseDateToObject(null)).toBeNull();
  });
});

// ============================================================
// validateWorkingDays (pure function)
// ============================================================
describe('validateWorkingDays', () => {
  test('[1,2,3,4,5] → valid', () => {
    expect(validateWorkingDays([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4, 5]);
  });

  test('non-array → default Mon-Fri', () => {
    expect(validateWorkingDays(null)).toEqual([1, 2, 3, 4, 5]);
    expect(validateWorkingDays('invalid')).toEqual([1, 2, 3, 4, 5]);
    expect(validateWorkingDays(undefined)).toEqual([1, 2, 3, 4, 5]);
  });

  test('empty array → default Mon-Fri', () => {
    expect(validateWorkingDays([])).toEqual([1, 2, 3, 4, 5]);
  });

  test('out of range values → filtered', () => {
    expect(validateWorkingDays([0, 1, 2, 8, 9])).toEqual([1, 2]);
  });

  test('duplicates → unique sorted', () => {
    expect(validateWorkingDays([3, 1, 3, 2, 1])).toEqual([1, 2, 3]);
  });

  test('includes Saturday/Sunday (6,7)', () => {
    expect(validateWorkingDays([1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

// ============================================================
// isWorkingDay (pure function)
// ============================================================
describe('isWorkingDay', () => {
  test('Monday (day 1) with default Mon-Fri → true', () => {
    // March 10, 2025 is a Monday
    const monday = new Date(2025, 2, 10, 12, 0, 0);
    expect(isWorkingDay(monday, [1, 2, 3, 4, 5])).toBe(true);
  });

  test('Sunday → false with default working days', () => {
    // March 9, 2025 is a Sunday
    const sunday = new Date(2025, 2, 9, 12, 0, 0);
    expect(isWorkingDay(sunday, [1, 2, 3, 4, 5])).toBe(false);
  });

  test('Saturday → false with default working days', () => {
    const saturday = new Date(2025, 2, 8, 12, 0, 0);
    expect(isWorkingDay(saturday, [1, 2, 3, 4, 5])).toBe(false);
  });

  test('non-working date exception → false even if working day', () => {
    const monday = new Date(2025, 2, 10, 12, 0, 0);
    expect(isWorkingDay(monday, [1, 2, 3, 4, 5], ['2025-03-10'])).toBe(false);
  });
});

// ============================================================
// shiftDate (pure function)
// ============================================================
describe('shiftDate', () => {
  test('shift by 2 working days skips weekends', () => {
    // Friday March 14 → skip Sat/Sun → Tuesday March 18
    const result = shiftDate('2025-03-14', 2, [1, 2, 3, 4, 5]);
    expect(result).toBe('2025-03-18');
  });

  test('shift by calendar days when no working days specified', () => {
    const result = shiftDate('2025-03-14', 2, null);
    expect(result).toBe('2025-03-16'); // Sat + Sun included
  });

  test('negative shift goes backward', () => {
    // Monday March 10 - 2 working days → Thursday March 6
    const result = shiftDate('2025-03-10', -2, [1, 2, 3, 4, 5]);
    expect(result).toBe('2025-03-06');
  });

  test('respects non-working dates', () => {
    // Friday March 14 + 1 working day, but Monday March 17 is a holiday
    const result = shiftDate('2025-03-14', 1, [1, 2, 3, 4, 5], ['2025-03-17']);
    expect(result).toBe('2025-03-18'); // Skip weekend + holiday
  });
});

// ============================================================
// createTask
// ============================================================
describe('createTask', () => {
  test('creates with correct fields', async () => {
    const task = { id: 't-1', title: 'Install drywall', status: 'pending', project_id: 'p-1' };
    supabase.from.mockImplementation(() => {
      const builder = createChainBuilder();
      mockChainResult = { data: task, error: null };
      return builder;
    });

    const result = await createTask({
      projectId: 'p-1',
      title: 'Install drywall',
      startDate: '2025-03-15',
      endDate: '2025-03-15',
    });

    expect(supabase.from).toHaveBeenCalledWith('worker_tasks');
    const insertCall = mockChainCalls.find(c => c[0] === 'insert');
    expect(insertCall).toBeTruthy();
    expect(insertCall[1].title).toBe('Install drywall');
    expect(insertCall[1].status).toBe('pending');
    expect(insertCall[1].owner_id).toBe('user-1');
  });

  test('returns null when not authenticated', async () => {
    getCurrentUserId.mockResolvedValueOnce(null);
    const result = await createTask({ title: 'Test' });
    expect(result).toBeNull();
  });
});

// ============================================================
// completeTask
// ============================================================
describe('completeTask', () => {
  test('sets status to completed', async () => {
    mockChainResult = { data: { id: 't-1', status: 'completed' }, error: null };

    const result = await completeTask('t-1', 'w-1');

    expect(supabase.from).toHaveBeenCalledWith('worker_tasks');
    const updateCall = mockChainCalls.find(c => c[0] === 'update');
    expect(updateCall).toBeTruthy();
    expect(updateCall[1].status).toBe('completed');
    expect(updateCall[1].completed_by).toBe('w-1');
  });
});

// ============================================================
// uncompleteTask
// ============================================================
describe('uncompleteTask', () => {
  test('reverts to pending', async () => {
    mockChainResult = { data: { id: 't-1', status: 'pending' }, error: null };

    const result = await uncompleteTask('t-1');

    expect(supabase.from).toHaveBeenCalledWith('worker_tasks');
    const updateCall = mockChainCalls.find(c => c[0] === 'update');
    expect(updateCall).toBeTruthy();
    expect(updateCall[1].status).toBe('pending');
    expect(updateCall[1].completed_at).toBeNull();
    expect(updateCall[1].completed_by).toBeNull();
  });
});

// ============================================================
// deleteTask
// ============================================================
describe('deleteTask', () => {
  test('removes task', async () => {
    // First fetch to get project_id, then delete, then update progress
    let callCount = 0;
    supabase.from.mockImplementation(() => {
      callCount++;
      const builder = createChainBuilder();
      mockChainResult = callCount === 1
        ? { data: { id: 't-1', project_id: 'p-1' }, error: null }
        : { data: null, error: null };
      return builder;
    });

    await deleteTask('t-1');

    expect(supabase.from).toHaveBeenCalledWith('worker_tasks');
    expect(mockChainCalls.find(c => c[0] === 'delete')).toBeTruthy();
  });
});

// ============================================================
// calculateProjectProgressFromTasks
// ============================================================
describe('calculateProjectProgressFromTasks', () => {
  test('5/10 completed → 50%', async () => {
    const tasks = [
      ...Array(5).fill({ status: 'completed' }),
      ...Array(5).fill({ status: 'pending' }),
    ];
    mockChainResult = { data: tasks, error: null };

    const result = await calculateProjectProgressFromTasks('p-1');

    expect(result.progress).toBe(50);
    expect(result.completed).toBe(5);
    expect(result.total).toBe(10);
  });

  test('no tasks → 0%', async () => {
    mockChainResult = { data: [], error: null };

    const result = await calculateProjectProgressFromTasks('p-1');

    expect(result.progress).toBe(0);
  });

  test('all completed → 100%', async () => {
    mockChainResult = { data: [{ status: 'completed' }, { status: 'completed' }], error: null };

    const result = await calculateProjectProgressFromTasks('p-1');

    expect(result.progress).toBe(100);
  });
});
