import { supabase } from '../lib/supabase';

const CATEGORIES = ['labor', 'materials', 'subcontractor', 'equipment', 'permits', 'misc'];

export const CATEGORY_COLORS = {
  labor: '#3B82F6',
  materials: '#10B981',
  equipment: '#F59E0B',
  permits: '#8B5CF6',
  subcontractor: '#EF4444',
  misc: '#6B7280',
};

export const CATEGORY_LABELS = {
  labor: 'Labor',
  materials: 'Materials',
  equipment: 'Equipment',
  permits: 'Permits',
  subcontractor: 'Subcontractors',
  misc: 'Miscellaneous',
};

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
      .select('id, project_id, type, category, amount, date')
      .in('project_id', projectIds)
      .order('date', { ascending: false })
      .limit(1000);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching all owner transactions:', error);
    return [];
  }
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
    };
  });

  filtered.forEach((t) => {
    const amount = parseFloat(t.amount) || 0;
    const pId = t.project_id;

    if (t.type === 'income') {
      totalRevenue += amount;
      if (projectMap[pId]) projectMap[pId].incomeCollected += amount;
    } else if (t.type === 'expense') {
      const cat = CATEGORIES.includes(t.category) ? t.category : 'misc';
      costBreakdown[cat] += amount;
      totalCosts += amount;
      if (projectMap[pId]) {
        projectMap[pId].expenses += amount;
        projectMap[pId].costBreakdown[cat] += amount;
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
    totalRevenue: useProjectIncome ? totalRevenue : totalRevenue,
    totalContractValue,
    costBreakdown,
    totalCosts,
    grossProfit: finalGrossProfit,
    grossMargin: finalGrossMargin,
    projectBreakdowns,
  };
};
