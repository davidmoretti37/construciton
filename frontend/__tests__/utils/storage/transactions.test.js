/**
 * Transactions Storage Tests
 *
 * Validates addProjectTransaction, getProjectTransactions,
 * getProjectTransactionSummary, syncProjectTotalsFromTransactions,
 * and auth requirements.
 */

jest.mock('../../../src/utils/storage/auth', () => ({
  getCurrentUserId: jest.fn(() => Promise.resolve('user-1')),
}));

let mockChainResult = { data: null, error: null };
let mockChainCalls = [];

const createChainBuilder = () => {
  const builder = {
    select: jest.fn((...args) => { mockChainCalls.push(['select', ...args]); return builder; }),
    eq: jest.fn((...args) => { mockChainCalls.push(['eq', ...args]); return builder; }),
    in: jest.fn((...args) => { mockChainCalls.push(['in', ...args]); return builder; }),
    order: jest.fn((...args) => { mockChainCalls.push(['order', ...args]); return builder; }),
    limit: jest.fn((...args) => { mockChainCalls.push(['limit', ...args]); return builder; }),
    single: jest.fn(() => { mockChainCalls.push(['single']); return Promise.resolve(mockChainResult); }),
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
    auth: { getUser: jest.fn() },
  },
}));

import { supabase } from '../../../src/lib/supabase';
import { getCurrentUserId } from '../../../src/utils/storage/auth';
import {
  addProjectTransaction,
  getProjectTransactions,
  getProjectTransactionSummary,
  deleteTransaction,
  syncProjectTotalsFromTransactions,
} from '../../../src/utils/storage/transactions';

beforeEach(() => {
  jest.clearAllMocks();
  mockChainCalls = [];
  mockChainResult = { data: null, error: null };
  supabase.from.mockImplementation(() => createChainBuilder());
});

describe('addProjectTransaction', () => {
  test('inserts with correct fields', async () => {
    const created = { id: 'tx-1', project_id: 'p-1', type: 'expense', category: 'materials', amount: 500, description: 'Lumber' };
    mockChainResult = { data: created, error: null };

    const result = await addProjectTransaction({
      project_id: 'p-1',
      type: 'expense',
      category: 'materials',
      amount: 500,
      description: 'Lumber',
      date: '2025-03-15',
    });

    expect(supabase.from).toHaveBeenCalledWith('project_transactions');
    const insertCall = mockChainCalls.find(c => c[0] === 'insert');
    expect(insertCall).toBeTruthy();
    expect(insertCall[1].project_id).toBe('p-1');
    expect(insertCall[1].amount).toBe(500);
    expect(insertCall[1].created_by).toBe('user-1');
    expect(result).toEqual(created);
  });

  test('throws on DB error', async () => {
    const err = { message: 'DB error' };
    const builder = createChainBuilder();
    builder.single = jest.fn(() => Promise.resolve({ data: null, error: err }));
    supabase.from.mockReturnValue(builder);

    await expect(
      addProjectTransaction({ project_id: 'p-1', type: 'expense', amount: 100, description: 'Test' })
    ).rejects.toEqual(err);
  });
});

describe('getProjectTransactions', () => {
  test('filters by projectId', async () => {
    const txs = [
      { id: 'tx-1', project_id: 'p-1', type: 'expense', amount: 500 },
      { id: 'tx-2', project_id: 'p-1', type: 'income', amount: 1000 },
    ];
    mockChainResult = { data: txs, error: null };

    const result = await getProjectTransactions('p-1');

    expect(supabase.from).toHaveBeenCalledWith('project_transactions');
    const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
    expect(eqCalls).toEqual(expect.arrayContaining([['eq', 'project_id', 'p-1']]));
    expect(result).toHaveLength(2);
  });

  test('applies optional type filter', async () => {
    // getProjectTransactions chains: .from().select().eq(project_id).order().order().limit()
    // then if type != null: .eq('type', type)
    // then awaits the query (thenable)
    // The eq after limit also returns builder which has .then
    mockChainResult = { data: [{ id: 'tx-1', type: 'expense' }], error: null };

    const result = await getProjectTransactions('p-1', 'expense');

    const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
    expect(eqCalls.some(c => c[1] === 'type' && c[2] === 'expense')).toBe(true);
  });

  test('returns empty array when no data', async () => {
    mockChainResult = { data: null, error: null };

    const result = await getProjectTransactions('p-1');
    expect(result).toEqual([]);
  });
});

describe('getProjectTransactionSummary', () => {
  test('groups by category, calculates expense/income totals', async () => {
    const txs = [
      { id: 'tx-1', type: 'expense', category: 'materials', amount: '500', subcategory: 'lumber' },
      { id: 'tx-2', type: 'expense', category: 'labor', amount: '1000' },
      { id: 'tx-3', type: 'income', amount: '3000' },
    ];
    mockChainResult = { data: txs, error: null };

    const result = await getProjectTransactionSummary('p-1');

    expect(result.totalExpenses).toBe(1500);
    expect(result.totalIncome).toBe(3000);
    expect(result.expensesByCategory.materials).toBe(500);
    expect(result.expensesByCategory.labor).toBe(1000);
    expect(result.transactionCount).toBe(3);
  });
});

describe('deleteTransaction', () => {
  test('deletes by ID', async () => {
    mockChainResult = { error: null };

    const result = await deleteTransaction('tx-1');

    expect(supabase.from).toHaveBeenCalledWith('project_transactions');
    expect(mockChainCalls.find(c => c[0] === 'delete')).toBeTruthy();
    expect(result).toBe(true);
  });

  test('throws on error', async () => {
    // The thenable builder resolves (not rejects) with { error }, then the function throws
    const builder = createChainBuilder();
    // Override then to simulate Supabase's behavior where error is in the resolved value
    builder.then = jest.fn((cb) => cb({ error: { message: 'Not found' } }));
    supabase.from.mockReturnValue(builder);

    await expect(deleteTransaction('tx-999')).rejects.toBeTruthy();
  });
});

describe('syncProjectTotalsFromTransactions', () => {
  test('sums expenses/income and updates project', async () => {
    const txs = [
      { id: 'tx-1', type: 'expense', amount: '500' },
      { id: 'tx-2', type: 'expense', amount: '300' },
      { id: 'tx-3', type: 'income', amount: '2000' },
    ];
    let callCount = 0;
    supabase.from.mockImplementation((table) => {
      callCount++;
      const builder = createChainBuilder();
      if (table === 'project_transactions') {
        mockChainResult = { data: txs, error: null };
      } else {
        // projects update
        mockChainResult = { data: { id: 'p-1', expenses: 800, income_collected: 2000 }, error: null };
      }
      return builder;
    });

    const result = await syncProjectTotalsFromTransactions('p-1');

    expect(result.expenses).toBe(800);
    expect(result.income_collected).toBe(2000);
  });
});

describe('auth required', () => {
  test('addProjectTransaction uses auth userId', async () => {
    mockChainResult = { data: { id: 'tx-1' }, error: null };

    await addProjectTransaction({
      project_id: 'p-1', type: 'expense', amount: 100, description: 'Test',
    });

    expect(getCurrentUserId).toHaveBeenCalled();
  });
});
