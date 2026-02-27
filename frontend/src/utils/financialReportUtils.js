import { supabase } from '../lib/supabase';
import { CATEGORIES, CATEGORY_COLORS, CATEGORY_LABELS } from '../constants/transactionCategories';

// Re-export for backward compatibility (other files import from here)
export { CATEGORY_COLORS, CATEGORY_LABELS };

export const getDateRangeForPeriod = (period) => {
  const now = new Date();
  let startDate = null;

  if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'quarter') {
    const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
    startDate = new Date(now.getFullYear(), quarterMonth, 1);
  } else if (period === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1);
  }

  return {
    startDate: startDate ? startDate.toISOString().split('T')[0] : null,
    endDate: now.toISOString().split('T')[0],
  };
};

export const fetchAllOwnerTransactions = async (projectIds) => {
  if (!projectIds || projectIds.length === 0) return [];

  try {
    const { data, error } = await supabase
      .from('project_transactions')
      .select('id, project_id, type, category, subcategory, description, amount, date, payment_method, receipt_url, notes')
      .in('project_id', projectIds)
      .order('date', { ascending: false })
      .limit(5000);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching all owner transactions:', error);
    return [];
  }
};

/**
 * Fetch full transaction detail for a single project (for per-project PDF)
 */
export const fetchProjectTransactionsForReport = async (projectId) => {
  if (!projectId) return [];

  try {
    const { data, error } = await supabase
      .from('project_transactions')
      .select('id, project_id, type, category, subcategory, description, amount, date, payment_method, receipt_url, notes')
      .eq('project_id', projectId)
      .order('date', { ascending: true })
      .limit(5000);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching project transactions for report:', error);
    return [];
  }
};

/**
 * Group transactions into monthly cash flow buckets (trailing 6 months)
 */
export const calculateCashFlow = (transactions, months = 6) => {
  const now = new Date();
  const buckets = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({
      key,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      year: d.getFullYear(),
      cashIn: 0,
      cashOut: 0,
      net: 0,
    });
  }

  const bucketMap = {};
  buckets.forEach(b => { bucketMap[b.key] = b; });

  (transactions || []).forEach(tx => {
    if (!tx.date) return;
    const monthKey = tx.date.substring(0, 7); // YYYY-MM
    const bucket = bucketMap[monthKey];
    if (!bucket) return;
    const amount = parseFloat(tx.amount || 0);
    if (tx.type === 'income') {
      bucket.cashIn += amount;
    } else if (tx.type === 'expense') {
      bucket.cashOut += amount;
    }
  });

  buckets.forEach(b => { b.net = b.cashIn - b.cashOut; });
  return buckets;
};

const filterByDate = (transactions, startDate, endDate) => {
  if (!startDate) return transactions;
  return transactions.filter((t) => {
    const d = t.date;
    return d >= startDate && d <= endDate;
  });
};

const emptyBreakdown = () => {
  const b = {};
  CATEGORIES.forEach((c) => (b[c] = 0));
  return b;
};

export const aggregatePnL = (transactions, projects, startDate, endDate) => {
  const filtered = filterByDate(transactions, startDate, endDate);

  let totalRevenue = 0;
  const costBreakdown = emptyBreakdown();
  let totalCosts = 0;

  // Subcategory and income breakdowns
  const subcategoryBreakdown = {}; // { labor: { wages: 500, overtime: 200 }, ... }
  const incomeBreakdown = {};       // { contract_payment: 50000, ... }

  // Per-project buckets
  const projectMap = {};
  projects.forEach((p) => {
    projectMap[p.id] = {
      id: p.id,
      name: p.name || 'Untitled Project',
      contractAmount: parseFloat(p.contract_amount || 0),
      incomeCollected: 0,
      budget: parseFloat(p.budget || p.contract_amount || 0),
      status: p.status,
      expenses: 0,
      costBreakdown: emptyBreakdown(),
      subcategoryBreakdown: {},
      incomeBreakdown: {},
    };
  });

  filtered.forEach((t) => {
    const amount = parseFloat(t.amount) || 0;
    const pId = t.project_id;

    if (t.type === 'income') {
      totalRevenue += amount;
      if (projectMap[pId]) projectMap[pId].incomeCollected += amount;

      // Income subcategory tracking
      if (t.subcategory) {
        incomeBreakdown[t.subcategory] = (incomeBreakdown[t.subcategory] || 0) + amount;
        if (projectMap[pId]) {
          projectMap[pId].incomeBreakdown[t.subcategory] =
            (projectMap[pId].incomeBreakdown[t.subcategory] || 0) + amount;
        }
      }
    } else if (t.type === 'expense') {
      const cat = CATEGORIES.includes(t.category) ? t.category : 'misc';
      costBreakdown[cat] += amount;
      totalCosts += amount;
      if (projectMap[pId]) {
        projectMap[pId].expenses += amount;
        projectMap[pId].costBreakdown[cat] += amount;
      }

      // Expense subcategory tracking
      if (t.subcategory) {
        if (!subcategoryBreakdown[cat]) subcategoryBreakdown[cat] = {};
        subcategoryBreakdown[cat][t.subcategory] =
          (subcategoryBreakdown[cat][t.subcategory] || 0) + amount;
        if (projectMap[pId]) {
          if (!projectMap[pId].subcategoryBreakdown[cat]) projectMap[pId].subcategoryBreakdown[cat] = {};
          projectMap[pId].subcategoryBreakdown[cat][t.subcategory] =
            (projectMap[pId].subcategoryBreakdown[cat][t.subcategory] || 0) + amount;
        }
      }
    }
  });

  const grossProfit = totalRevenue - totalCosts;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  const totalContractValue = projects.reduce((s, p) => s + parseFloat(p.contract_amount || 0), 0);

  // If no revenue transactions for period, use project-level income_collected
  const useProjectIncome = totalRevenue === 0 && startDate === null;
  if (useProjectIncome) {
    totalRevenue = projects.reduce((s, p) => s + parseFloat(p.income_collected || 0), 0);
  }

  const finalGrossProfit = useProjectIncome ? totalRevenue - totalCosts : grossProfit;
  const finalGrossMargin = totalRevenue > 0 ? (finalGrossProfit / totalRevenue) * 100 : 0;

  const projectBreakdowns = Object.values(projectMap).map((p) => {
    const pGrossProfit = (useProjectIncome ? parseFloat(projects.find(pr => pr.id === p.id)?.income_collected || 0) : p.incomeCollected) - p.expenses;
    const pRevenue = useProjectIncome ? parseFloat(projects.find(pr => pr.id === p.id)?.income_collected || 0) : p.incomeCollected;
    return {
      ...p,
      incomeCollected: pRevenue,
      grossProfit: pGrossProfit,
      grossMargin: pRevenue > 0 ? (pGrossProfit / pRevenue) * 100 : 0,
      budgetUsed: p.budget > 0 ? (p.expenses / p.budget) * 100 : 0,
    };
  });

  return {
    totalRevenue,
    totalContractValue,
    costBreakdown,
    subcategoryBreakdown,
    incomeBreakdown,
    totalCosts,
    grossProfit: finalGrossProfit,
    grossMargin: finalGrossMargin,
    projectBreakdowns,
    transactions: filtered,
  };
};
