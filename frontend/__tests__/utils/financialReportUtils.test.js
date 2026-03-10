/**
 * Financial Report Utils Tests
 *
 * Validates getDateRangeForPeriod, calculateCashFlow,
 * and aggregatePnL — core financial calculation functions.
 */

jest.mock('../../src/lib/supabase', () => ({
  supabase: { from: jest.fn() },
}));

import { getDateRangeForPeriod, calculateCashFlow, aggregatePnL } from '../../src/utils/financialReportUtils';

// ============================================================
// getDateRangeForPeriod
// ============================================================
describe('getDateRangeForPeriod', () => {
  test('month → current month start to today', () => {
    const { startDate, endDate } = getDateRangeForPeriod('month');
    const now = new Date();

    expect(startDate).toBe(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
    expect(endDate).toBe(now.toISOString().split('T')[0]);
  });

  test('quarter → correct quarter start', () => {
    const { startDate, endDate } = getDateRangeForPeriod('quarter');
    const now = new Date();
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    const expectedStart = new Date(now.getFullYear(), quarterMonth, 1);

    expect(startDate).toBe(expectedStart.toISOString().split('T')[0]);
    expect(endDate).toBe(now.toISOString().split('T')[0]);
  });

  test('year → Jan 1 to today', () => {
    const { startDate, endDate } = getDateRangeForPeriod('year');
    const now = new Date();

    expect(startDate).toBe(`${now.getFullYear()}-01-01`);
    expect(endDate).toBe(now.toISOString().split('T')[0]);
  });

  test('unknown period → null startDate', () => {
    const { startDate } = getDateRangeForPeriod('week');
    expect(startDate).toBeNull();
  });
});

// ============================================================
// calculateCashFlow
// ============================================================
describe('calculateCashFlow', () => {
  test('groups transactions by month with cashIn/cashOut/net', () => {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const transactions = [
      { date: `${currentMonth}-05`, type: 'income', amount: '5000' },
      { date: `${currentMonth}-10`, type: 'expense', amount: '2000' },
      { date: `${currentMonth}-15`, type: 'expense', amount: '1000' },
    ];

    const buckets = calculateCashFlow(transactions, 1);

    expect(buckets).toHaveLength(1);
    expect(buckets[0].cashIn).toBe(5000);
    expect(buckets[0].cashOut).toBe(3000);
    expect(buckets[0].net).toBe(2000);
  });

  test('empty transactions → all zeros', () => {
    const buckets = calculateCashFlow([], 3);

    expect(buckets).toHaveLength(3);
    buckets.forEach(b => {
      expect(b.cashIn).toBe(0);
      expect(b.cashOut).toBe(0);
      expect(b.net).toBe(0);
    });
  });

  test('null transactions → all zeros', () => {
    const buckets = calculateCashFlow(null, 2);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].net).toBe(0);
  });

  test('transactions outside range are ignored', () => {
    const transactions = [
      { date: '2020-01-01', type: 'income', amount: '99999' },
    ];

    const buckets = calculateCashFlow(transactions, 3);
    buckets.forEach(b => {
      expect(b.cashIn).toBe(0);
    });
  });
});

// ============================================================
// aggregatePnL
// ============================================================
describe('aggregatePnL', () => {
  const baseProjects = [
    { id: 'p1', name: 'Kitchen Remodel', contract_amount: '50000', budget: '50000', income_collected: '20000', status: 'active' },
    { id: 'p2', name: 'Bathroom Reno', contract_amount: '30000', budget: '30000', income_collected: '15000', status: 'active' },
  ];

  test('income transactions → totalRevenue', () => {
    const transactions = [
      { project_id: 'p1', type: 'income', amount: '10000', date: '2025-03-01' },
      { project_id: 'p2', type: 'income', amount: '5000', date: '2025-03-05' },
    ];

    const result = aggregatePnL(transactions, baseProjects, '2025-01-01', '2025-12-31');

    expect(result.totalRevenue).toBe(15000);
  });

  test('expense transactions → totalCosts by category', () => {
    const transactions = [
      { project_id: 'p1', type: 'expense', category: 'materials', amount: '3000', date: '2025-03-01' },
      { project_id: 'p1', type: 'expense', category: 'labor', amount: '5000', date: '2025-03-05' },
      { project_id: 'p1', type: 'expense', category: 'unknown_cat', amount: '500', date: '2025-03-10' },
    ];

    const result = aggregatePnL(transactions, baseProjects, '2025-01-01', '2025-12-31');

    expect(result.totalCosts).toBe(8500);
    expect(result.costBreakdown.materials).toBe(3000);
    expect(result.costBreakdown.labor).toBe(5000);
    expect(result.costBreakdown.misc).toBe(500); // unknown maps to misc
  });

  test('grossMargin = (revenue - costs) / revenue * 100', () => {
    const transactions = [
      { project_id: 'p1', type: 'income', amount: '20000', date: '2025-03-01' },
      { project_id: 'p1', type: 'expense', category: 'materials', amount: '8000', date: '2025-03-05' },
    ];

    const result = aggregatePnL(transactions, baseProjects, '2025-01-01', '2025-12-31');

    expect(result.totalRevenue).toBe(20000);
    expect(result.totalCosts).toBe(8000);
    expect(result.grossProfit).toBe(12000);
    expect(result.grossMargin).toBe(60); // (12000/20000)*100
  });

  test('project-level breakdowns with budgetUsed %', () => {
    const transactions = [
      { project_id: 'p1', type: 'expense', category: 'labor', amount: '25000', date: '2025-03-01' },
      { project_id: 'p1', type: 'income', amount: '30000', date: '2025-03-01' },
    ];

    const result = aggregatePnL(transactions, baseProjects, '2025-01-01', '2025-12-31');

    const p1 = result.projectBreakdowns.find(p => p.id === 'p1');
    expect(p1.expenses).toBe(25000);
    expect(p1.budgetUsed).toBe(50); // 25000/50000 * 100
    expect(p1.incomeCollected).toBe(30000);
  });

  test('empty transactions → zeros', () => {
    const result = aggregatePnL([], baseProjects, '2025-01-01', '2025-12-31');

    expect(result.totalRevenue).toBe(0);
    expect(result.totalCosts).toBe(0);
    expect(result.grossProfit).toBe(0);
    expect(result.grossMargin).toBe(0);
  });

  test('fallback to project.income_collected when no income transactions and no date filter', () => {
    // When startDate is null and no income transactions, useProjectIncome = true
    const result = aggregatePnL([], baseProjects, null, null);

    // Should use project income_collected: 20000 + 15000 = 35000
    expect(result.totalRevenue).toBe(35000);
  });

  test('totalContractValue sums all projects', () => {
    const result = aggregatePnL([], baseProjects, '2025-01-01', '2025-12-31');

    expect(result.totalContractValue).toBe(80000); // 50000 + 30000
  });
});
