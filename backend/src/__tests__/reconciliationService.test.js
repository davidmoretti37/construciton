/**
 * Reconciliation Service Tests
 *
 * Validates calculateMatchScore scoring logic and
 * reconcileTransactions auto-match/suggested/unmatched bucketing.
 */

jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { reconcileTransactions, calculateMatchScore } = require('../services/reconciliationService');

// ============================================================
// calculateMatchScore
// ============================================================
describe('calculateMatchScore', () => {
  test('exact amount + same date + same desc → high score (~1.0)', () => {
    const score = calculateMatchScore(
      125.50,
      new Date('2025-03-15'),
      'home depot',
      { amount: '125.50', date: '2025-03-15', description: 'Home Depot' }
    );

    // amount: 1.0*0.4=0.4, date: 1.0*0.3=0.3, desc: 0.9*0.3=0.27 → 0.97
    expect(score).toBeGreaterThanOrEqual(0.90);
  });

  test('exact amount + different date (3 days) → medium score', () => {
    const score = calculateMatchScore(
      100.00,
      new Date('2025-03-15'),
      'lowes',
      { amount: '100.00', date: '2025-03-18', description: 'Lowes purchase' }
    );

    // amount: 1.0*0.4=0.4, date: 0.2*0.3=0.06, desc: ~0.8*0.3=0.24 → ~0.70
    expect(score).toBeGreaterThan(0.50);
    expect(score).toBeLessThan(0.90);
  });

  test('different amount → 0 (short-circuit)', () => {
    const score = calculateMatchScore(
      100.00,
      new Date('2025-03-15'),
      'home depot',
      { amount: '500.00', date: '2025-03-15', description: 'Home Depot' }
    );

    expect(score).toBe(0);
  });

  test('amount within 1% → high amount score', () => {
    const score = calculateMatchScore(
      100.00,
      new Date('2025-03-15'),
      'store',
      { amount: '100.50', date: '2025-03-15', description: 'store' }
    );

    // 0.5% diff → amountScore=0.9, within range
    expect(score).toBeGreaterThan(0.75);
  });

  test('amount within 5% → moderate amount score', () => {
    const score = calculateMatchScore(
      100.00,
      new Date('2025-03-15'),
      'store',
      { amount: '104.00', date: '2025-03-15', description: 'store' }
    );

    // 4% diff → amountScore=0.5
    expect(score).toBeGreaterThan(0.40);
    expect(score).toBeLessThan(0.80);
  });

  test('no description on either side → 0.3 baseline desc score', () => {
    const score = calculateMatchScore(
      100.00,
      new Date('2025-03-15'),
      '',
      { amount: '100.00', date: '2025-03-15', description: '' }
    );

    // amount: 1.0*0.4=0.4, date: 1.0*0.3=0.3, desc: 0.3*0.3=0.09 → 0.79
    expect(score).toBeGreaterThan(0.70);
    expect(score).toBeLessThan(0.85);
  });

  test('partial word overlap in description', () => {
    const score = calculateMatchScore(
      250.00,
      new Date('2025-03-15'),
      'home depot store 1234',
      { amount: '250.00', date: '2025-03-15', description: 'Home Depot drywall' }
    );

    expect(score).toBeGreaterThan(0.80);
  });

  test('substring match in description → high desc score', () => {
    const score = calculateMatchScore(
      75.00,
      new Date('2025-03-15'),
      'lowes',
      { amount: '75.00', date: '2025-03-15', description: 'Lowes - lumber purchase' }
    );

    // bankDesc "lowes" is included in platformDesc → descScore 0.9
    expect(score).toBeGreaterThan(0.90);
  });
});

// ============================================================
// reconcileTransactions
// ============================================================
describe('reconcileTransactions', () => {
  let mockSupabase;

  beforeEach(() => {
    // Build a stateful mock Supabase client
    let currentTable = '';
    let filters = {};

    const builder = {
      select: jest.fn(() => builder),
      eq: jest.fn((col, val) => { filters[col] = val; return builder; }),
      gte: jest.fn(() => builder),
      lte: jest.fn(() => builder),
      is: jest.fn(() => builder),
      limit: jest.fn(() => builder),
      insert: jest.fn(() => builder),
      update: jest.fn(() => builder),
      then: jest.fn((cb) => cb({ data: null, error: null })),
    };

    const responses = {};

    mockSupabase = {
      from: jest.fn((table) => {
        currentTable = table;
        filters = {};

        // Override .then to use per-table responses
        builder.then = jest.fn((cb) => {
          const handler = responses[table];
          if (typeof handler === 'function') {
            return cb(handler(filters));
          }
          return cb(handler || { data: null, error: null });
        });

        return builder;
      }),
      _responses: responses,
    };
  });

  test('empty bank transactions → all zeros', async () => {
    mockSupabase._responses['bank_transactions'] = () => ({ data: [], error: null });

    const result = await reconcileTransactions('user-1', 'acct-1', mockSupabase);

    expect(result).toEqual({ autoMatched: 0, suggestedMatch: 0, unmatched: 0 });
  });

  test('no platform transactions → all unmatched', async () => {
    mockSupabase._responses['bank_transactions'] = () => ({
      data: [
        { id: 'bt-1', date: '2025-03-15', amount: -100, merchant_name: 'Home Depot', description: '' },
        { id: 'bt-2', date: '2025-03-16', amount: -200, merchant_name: 'Lowes', description: '' },
      ],
      error: null,
    });
    mockSupabase._responses['project_transactions'] = () => ({ data: [], error: null });
    mockSupabase._responses['projects'] = () => ({ data: [], error: null });
    mockSupabase._responses['notifications'] = () => ({ data: [], error: null });

    const result = await reconcileTransactions('user-1', 'acct-1', mockSupabase);

    expect(result.unmatched).toBe(2);
    expect(result.autoMatched).toBe(0);
  });

  test('bank tx error → returns zeros', async () => {
    mockSupabase._responses['bank_transactions'] = () => ({
      data: null,
      error: { message: 'DB error' },
    });

    const result = await reconcileTransactions('user-1', 'acct-1', mockSupabase);

    expect(result).toEqual({ autoMatched: 0, suggestedMatch: 0, unmatched: 0 });
  });
});
