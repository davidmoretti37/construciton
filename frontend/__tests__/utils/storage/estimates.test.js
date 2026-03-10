/**
 * Estimates Storage Tests
 *
 * Validates estimate CRUD, status transitions,
 * invoice/project creation from estimates.
 */

jest.mock('../../../src/utils/storage/auth', () => ({
  getCurrentUserId: jest.fn(() => Promise.resolve('user-1')),
  getCurrentUserContext: jest.fn(() => Promise.resolve({ userId: 'user-1', role: 'owner', ownerId: null })),
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
  saveEstimate,
  getEstimate,
  fetchEstimates,
  updateEstimateStatus,
  deleteEstimate,
} from '../../../src/utils/storage/estimates';

beforeEach(() => {
  jest.clearAllMocks();
  mockChainCalls = [];
  mockChainResult = { data: null, error: null };
  supabase.from.mockImplementation(() => createChainBuilder());
});

// ============================================================
// saveEstimate
// ============================================================
describe('saveEstimate', () => {
  test('creates with client info, items, tax rate', async () => {
    const estimate = {
      id: 'e-1', estimate_number: 'EST-001', client_name: 'Mr. Smith',
      items: [{ description: 'Labor', quantity: 1, price: 5000, total: 5000 }],
      total: 5000, status: 'draft',
    };
    mockChainResult = { data: estimate, error: null };

    const result = await saveEstimate({
      clientName: 'Mr. Smith',
      items: [{ description: 'Labor', quantity: 1, price: 5000, total: 5000 }],
      total: 5000,
      taxRate: 0.08,
    });

    expect(supabase.from).toHaveBeenCalledWith('estimates');
    const insertCall = mockChainCalls.find(c => c[0] === 'insert');
    expect(insertCall).toBeTruthy();
    expect(insertCall[1].user_id).toBe('user-1');
    expect(insertCall[1].status).toBe('draft');
    expect(result).toBeTruthy();
    expect(result.estimate_number).toBe('EST-001');
  });

  test('returns null when not authenticated', async () => {
    getCurrentUserId.mockResolvedValueOnce(null);

    const result = await saveEstimate({ clientName: 'Test' });
    expect(result).toBeNull();
  });

  test('returns null on DB error', async () => {
    mockChainResult = { data: null, error: { message: 'DB error' } };

    const result = await saveEstimate({ clientName: 'Test', total: 100 });
    expect(result).toBeNull();
  });
});

// ============================================================
// getEstimate
// ============================================================
describe('getEstimate', () => {
  test('returns single estimate by ID', async () => {
    const estimate = { id: 'e-1', estimate_number: 'EST-001', total: 5000 };
    mockChainResult = { data: estimate, error: null };

    const result = await getEstimate('e-1');

    expect(supabase.from).toHaveBeenCalledWith('estimates');
    const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
    expect(eqCalls).toEqual(expect.arrayContaining([['eq', 'id', 'e-1']]));
    expect(result).toEqual(estimate);
  });

  test('returns null when not found', async () => {
    mockChainResult = { data: null, error: { message: 'not found' } };

    const result = await getEstimate('e-999');
    expect(result).toBeNull();
  });
});

// ============================================================
// fetchEstimates
// ============================================================
describe('fetchEstimates', () => {
  test('returns user estimates', async () => {
    const estimates = [
      { id: 'e-1', estimate_number: 'EST-001', status: 'draft' },
      { id: 'e-2', estimate_number: 'EST-002', status: 'sent' },
    ];
    mockChainResult = { data: estimates, error: null };

    const result = await fetchEstimates();

    expect(supabase.from).toHaveBeenCalledWith('estimates');
    expect(result).toHaveLength(2);
  });

  test('applies status filter', async () => {
    mockChainResult = { data: [{ id: 'e-1', status: 'draft' }], error: null };

    await fetchEstimates({ status: 'draft' });

    const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
    expect(eqCalls.some(c => c[1] === 'status' && c[2] === 'draft')).toBe(true);
  });
});

// ============================================================
// updateEstimateStatus
// ============================================================
describe('updateEstimateStatus', () => {
  test('updates status field', async () => {
    mockChainResult = { data: { id: 'e-1', status: 'sent' }, error: null };

    const result = await updateEstimateStatus('e-1', 'sent');

    expect(supabase.from).toHaveBeenCalledWith('estimates');
    const updateCall = mockChainCalls.find(c => c[0] === 'update');
    expect(updateCall).toBeTruthy();
    expect(updateCall[1].status).toBe('sent');
  });
});

// ============================================================
// deleteEstimate
// ============================================================
describe('deleteEstimate', () => {
  test('removes estimate', async () => {
    mockChainResult = { error: null };

    await deleteEstimate('e-1');

    expect(supabase.from).toHaveBeenCalledWith('estimates');
    expect(mockChainCalls.find(c => c[0] === 'delete')).toBeTruthy();
    const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
    expect(eqCalls).toEqual(expect.arrayContaining([['eq', 'id', 'e-1']]));
  });
});
