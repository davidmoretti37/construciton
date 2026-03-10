/**
 * Projects Storage Tests
 *
 * Validates calculateTimeBasedCompletion, transformProjectFromDB,
 * saveProject, deleteProject, and working days management.
 */

jest.mock('../../../src/utils/storage/auth', () => ({
  getCurrentUserId: jest.fn(() => Promise.resolve('user-1')),
  getCurrentUserContext: jest.fn(() => Promise.resolve({
    userId: 'user-1', role: 'owner', ownerId: null,
  })),
}));

jest.mock('../../../src/utils/storage/workerTasks', () => ({
  validateWorkingDays: jest.fn((days) => days || [1, 2, 3, 4, 5]),
}));

jest.mock('../../../src/services/subscriptionService', () => ({
  __esModule: true,
  default: { getProjectLimit: jest.fn(() => Promise.resolve(100)), getProjectCount: jest.fn(() => Promise.resolve(5)) },
}));

jest.mock('../../../src/utils/storage/workers', () => ({
  getSupervisorsForOwner: jest.fn(() => Promise.resolve([])),
}));

let mockChainResult = { data: null, error: null };
let mockChainCalls = [];

const createChainBuilder = () => {
  const builder = {
    select: jest.fn((...args) => { mockChainCalls.push(['select', ...args]); return builder; }),
    eq: jest.fn((...args) => { mockChainCalls.push(['eq', ...args]); return builder; }),
    or: jest.fn((...args) => { mockChainCalls.push(['or', ...args]); return builder; }),
    in: jest.fn((...args) => { mockChainCalls.push(['in', ...args]); return builder; }),
    order: jest.fn((...args) => { mockChainCalls.push(['order', ...args]); return builder; }),
    limit: jest.fn((...args) => { mockChainCalls.push(['limit', ...args]); return Promise.resolve(mockChainResult); }),
    single: jest.fn(() => { mockChainCalls.push(['single']); return Promise.resolve(mockChainResult); }),
    maybeSingle: jest.fn(() => { mockChainCalls.push(['maybeSingle']); return Promise.resolve(mockChainResult); }),
    insert: jest.fn((...args) => { mockChainCalls.push(['insert', ...args]); return builder; }),
    upsert: jest.fn((...args) => { mockChainCalls.push(['upsert', ...args]); return builder; }),
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
import {
  calculateTimeBasedCompletion,
  transformProjectFromDB,
  saveProject,
  deleteProject,
  updateProjectWorkingDays,
  addNonWorkingDate,
  removeNonWorkingDate,
} from '../../../src/utils/storage/projects';

beforeEach(() => {
  jest.clearAllMocks();
  mockChainCalls = [];
  mockChainResult = { data: null, error: null };
  supabase.from.mockImplementation(() => createChainBuilder());
});

// ============================================================
// calculateTimeBasedCompletion (pure function)
// ============================================================
describe('calculateTimeBasedCompletion', () => {
  test('halfway through → ~50%', () => {
    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 50);
    const end = new Date(today);
    end.setDate(end.getDate() + 50);

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const result = calculateTimeBasedCompletion(startStr, endStr);
    expect(result).toBeGreaterThanOrEqual(45);
    expect(result).toBeLessThanOrEqual(55);
  });

  test('past end → 100%', () => {
    const result = calculateTimeBasedCompletion('2024-01-01', '2024-06-01');
    expect(result).toBe(100);
  });

  test('before start → 0%', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 2);
    const futureEnd = new Date(future);
    futureEnd.setMonth(futureEnd.getMonth() + 6);

    const result = calculateTimeBasedCompletion(
      future.toISOString().split('T')[0],
      futureEnd.toISOString().split('T')[0]
    );
    expect(result).toBe(0);
  });

  test('null dates → 0%', () => {
    expect(calculateTimeBasedCompletion(null, null)).toBe(0);
    expect(calculateTimeBasedCompletion('2025-01-01', null)).toBe(0);
  });
});

// ============================================================
// transformProjectFromDB
// ============================================================
describe('transformProjectFromDB', () => {
  test('maps DB fields to app format', () => {
    const dbProject = {
      id: 'p-1',
      name: 'Kitchen Remodel',
      client: 'Mr. Smith',
      client_phone: '555-1234',
      client_email: 'smith@test.com',
      contract_amount: '50000',
      budget: '50000',
      base_contract: '45000',
      income_collected: '20000',
      expenses: '15000',
      extras: [],
      status: 'active',
      days_remaining: '30',
      start_date: '2025-03-01',
      end_date: '2025-06-01',
      working_days: [1, 2, 3, 4, 5],
      non_working_dates: [],
      actual_progress: 42,
      user_id: 'user-1',
      assigned_supervisor_id: null,
      created_at: '2025-03-01',
      updated_at: '2025-03-10',
    };

    const result = transformProjectFromDB(dbProject);

    expect(result.id).toBe('p-1');
    expect(result.name).toBe('Kitchen Remodel');
    expect(result.client).toBe('Mr. Smith');
    expect(result.contractAmount).toBe(50000);
    expect(result.baseContract).toBe(45000);
    expect(result.incomeCollected).toBe(20000);
    expect(result.expenses).toBe(15000);
    expect(result.profit).toBe(5000); // 20000 - 15000
    expect(result.percentComplete).toBe(42);
    expect(result.status).toBe('on-track');
    expect(result.daysRemaining).toBe(30);
    expect(result.workingDays).toEqual([1, 2, 3, 4, 5]);
  });

  test('over-budget status detection', () => {
    const dbProject = {
      id: 'p-1', name: 'Test', status: 'active',
      contract_amount: '50000', budget: '50000',
      expenses: '55000', income_collected: '30000',
      extras: [], days_remaining: '10',
    };

    const result = transformProjectFromDB(dbProject);
    expect(result.status).toBe('over-budget');
  });

  test('behind schedule status detection', () => {
    const dbProject = {
      id: 'p-1', name: 'Test', status: 'active',
      contract_amount: '50000', budget: '50000',
      expenses: '20000', income_collected: '30000',
      extras: [], days_remaining: '-5',
    };

    const result = transformProjectFromDB(dbProject);
    expect(result.status).toBe('behind');
  });

  test('completed status preserved', () => {
    const dbProject = {
      id: 'p-1', name: 'Test', status: 'completed',
      contract_amount: '50000', budget: '50000',
      expenses: '55000', income_collected: '50000',
      extras: [],
    };

    const result = transformProjectFromDB(dbProject);
    expect(result.status).toBe('completed');
  });
});

// ============================================================
// saveProject
// ============================================================
describe('saveProject', () => {
  test('creates with correct fields', async () => {
    const saved = { id: 'p-1', name: 'Kitchen Remodel' };
    mockChainResult = { data: saved, error: null };

    const result = await saveProject({
      projectName: 'Kitchen Remodel',
      clientPhone: '555-1234',
      location: '123 Main St',
      budget: 50000,
    });

    expect(supabase.from).toHaveBeenCalledWith('projects');
    const insertCall = mockChainCalls.find(c => c[0] === 'insert') || mockChainCalls.find(c => c[0] === 'upsert');
    expect(insertCall).toBeTruthy();
  });

  test('returns null when not authenticated', async () => {
    const { getCurrentUserId } = require('../../../src/utils/storage/auth');
    getCurrentUserId.mockResolvedValueOnce(null);

    const result = await saveProject({ name: 'Test' });
    expect(result).toBeNull();
  });
});

// ============================================================
// deleteProject
// ============================================================
describe('deleteProject', () => {
  test('deletes project by ID', async () => {
    mockChainResult = { error: null };

    await deleteProject('p-1');

    expect(supabase.from).toHaveBeenCalledWith('projects');
    expect(mockChainCalls.find(c => c[0] === 'delete')).toBeTruthy();
  });
});

// ============================================================
// Working Days Management
// ============================================================
describe('updateProjectWorkingDays', () => {
  test('updates working days for project', async () => {
    mockChainResult = { data: { id: 'p-1', working_days: [1, 2, 3, 4, 5, 6] }, error: null };

    const result = await updateProjectWorkingDays('p-1', [1, 2, 3, 4, 5, 6]);

    expect(supabase.from).toHaveBeenCalledWith('projects');
    const updateCall = mockChainCalls.find(c => c[0] === 'update');
    expect(updateCall).toBeTruthy();
  });
});

describe('addNonWorkingDate', () => {
  test('adds date to non_working_dates array', async () => {
    // First fetch current project
    let callCount = 0;
    supabase.from.mockImplementation(() => {
      callCount++;
      const builder = createChainBuilder();
      if (callCount === 1) {
        mockChainResult = { data: { id: 'p-1', non_working_dates: ['2025-12-25'] }, error: null };
      } else {
        mockChainResult = { data: { id: 'p-1', non_working_dates: ['2025-12-25', '2025-01-01'] }, error: null };
      }
      return builder;
    });

    const result = await addNonWorkingDate('p-1', '2025-01-01');

    expect(supabase.from).toHaveBeenCalledWith('projects');
  });
});

describe('removeNonWorkingDate', () => {
  test('removes date from non_working_dates array', async () => {
    let callCount = 0;
    supabase.from.mockImplementation(() => {
      callCount++;
      const builder = createChainBuilder();
      if (callCount === 1) {
        mockChainResult = { data: { id: 'p-1', non_working_dates: ['2025-12-25', '2025-01-01'] }, error: null };
      } else {
        mockChainResult = { data: { id: 'p-1', non_working_dates: ['2025-12-25'] }, error: null };
      }
      return builder;
    });

    const result = await removeNonWorkingDate('p-1', '2025-01-01');

    expect(supabase.from).toHaveBeenCalledWith('projects');
  });
});
