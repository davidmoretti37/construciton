/**
 * Tool handlers — financial reports, AR aging, P&L, payroll, cash flow,
 * tax summary, recurring expenses, bank reconciliation.
 * Split from handlers.js.
 */

const {
  supabase, logger, userSafeError,
  toDate, today, getTodayBounds,
  resolveOwnerId,
} = require('./_shared');

async function get_financial_overview(userId, args = {}) {
  const { start_date, end_date } = args;

  // Get all projects with financials
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, status, budget, base_contract, contract_amount, expenses, income_collected, extras')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  // Get transactions with optional date filter
  let txQuery = supabase
    .from('project_transactions')
    .select('project_id, type, category, amount, date')
    .in('project_id', (projects || []).map(p => p.id));

  if (start_date) txQuery = txQuery.gte('date', start_date);
  if (end_date) txQuery = txQuery.lte('date', end_date);

  const { data: transactions } = await txQuery;

  // Calculate totals
  let totalIncome = 0, totalExpenses = 0;
  const byProject = {};

  if (transactions) {
    for (const t of transactions) {
      if (t.type === 'income') totalIncome += t.amount;
      else totalExpenses += t.amount;

      if (!byProject[t.project_id]) {
        byProject[t.project_id] = { income: 0, expenses: 0 };
      }
      if (t.type === 'income') byProject[t.project_id].income += t.amount;
      else byProject[t.project_id].expenses += t.amount;
    }
  }

  // Get invoice totals
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total, amount_paid, status')
    .eq('user_id', userId);

  let totalInvoiced = 0, totalCollected = 0, totalOutstanding = 0;
  if (invoices) {
    for (const inv of invoices) {
      totalInvoiced += inv.total || 0;
      totalCollected += inv.amount_paid || 0;
      if (['unpaid', 'partial', 'overdue'].includes(inv.status)) {
        totalOutstanding += (inv.total || 0) - (inv.amount_paid || 0);
      }
    }
  }

  return {
    totalIncome,
    totalExpenses,
    profit: totalIncome - totalExpenses,
    totalInvoiced,
    totalCollected,
    totalOutstanding,
    projectCount: (projects || []).length,
    activeProjects: (projects || []).filter(p => !['completed', 'archived'].includes(p.status)).length,
    projectBreakdown: (projects || []).map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      budget: p.contract_amount || p.budget || 0,
      incomeCollected: p.income_collected || 0,
      expenses: p.expenses || 0,
      profit: (p.income_collected || 0) - (p.expenses || 0)
    }))
  };
}

async function get_bank_transactions(userId, args = {}) {
  const { match_status, start_date, end_date, bank_account_id } = args;

  // Verify user is an owner
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profile?.role !== 'owner') {
    return { error: 'Bank transactions are only available to business owners.' };
  }

  let q = supabase
    .from('bank_transactions')
    .select(`
      id, amount, date, description, merchant_name, category,
      match_status, match_confidence, matched_at,
      matched_transaction:matched_transaction_id (
        id, description, amount, category, project_id,
        project:project_id ( id, name )
      ),
      assigned_project:assigned_project_id ( id, name ),
      bank_account:bank_account_id ( institution_name, account_mask )
    `)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(30);

  if (match_status) q = q.eq('match_status', match_status);
  if (bank_account_id) q = q.eq('bank_account_id', bank_account_id);
  if (start_date) q = q.gte('date', start_date);
  if (end_date) q = q.lte('date', end_date);

  const { data, error } = await q;

  if (error) {
    logger.error('get_bank_transactions error:', error);
    return { error: error.message };
  }

  return {
    transactions: data || [],
    count: (data || []).length,
    hint: 'Use assign_bank_transaction to assign unmatched transactions to projects.'
  };
}

async function assign_bank_transaction(userId, args = {}) {
  const { bank_transaction_id, project_id, category, description, subcategory, phase_id, phase_name } = args;

  if (!bank_transaction_id || !project_id) {
    return { error: 'Both bank_transaction_id and project_id are required.' };
  }

  // Verify user is an owner
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profile?.role !== 'owner') {
    return { error: 'Bank transaction assignment is only available to business owners.' };
  }

  // Resolve bank transaction - try UUID first, then fuzzy match
  let bankTx = null;
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (isUUID.test(bank_transaction_id)) {
    const { data } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('id', bank_transaction_id)
      .eq('user_id', userId)
      .single();
    bankTx = data;
  }

  // Fuzzy match by description, merchant name, or amount
  if (!bankTx) {
    const searchTerm = bank_transaction_id.toLowerCase();
    const { data: candidates } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('user_id', userId)
      .in('match_status', ['unmatched', 'suggested_match'])
      .order('date', { ascending: false })
      .limit(100);

    if (candidates) {
      // Try to match by amount (e.g., "$432" or "432")
      const amountSearch = parseFloat(searchTerm.replace(/[$,]/g, ''));

      bankTx = candidates.find(tx => {
        const desc = (tx.description || '').toLowerCase();
        const merchant = (tx.merchant_name || '').toLowerCase();
        // Match by description or merchant name
        if (desc.includes(searchTerm) || merchant.includes(searchTerm)) return true;
        // Match by amount
        if (!isNaN(amountSearch) && Math.abs(tx.amount) === amountSearch) return true;
        return false;
      });
    }
  }

  if (!bankTx) {
    return { error: `Could not find a bank transaction matching "${bank_transaction_id}". Try providing more specific details.` };
  }

  if (bankTx.match_status === 'created' || bankTx.match_status === 'manually_matched' || bankTx.match_status === 'auto_matched') {
    return { error: `This bank transaction is already matched/assigned.` };
  }

  // Resolve project
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;
  const resolvedProjectId = resolved.id;

  // Get project name
  const { data: project } = await supabase
    .from('projects')
    .select('name')
    .eq('id', resolvedProjectId)
    .single();

  // Create project_transaction
  const txAmount = Math.abs(bankTx.amount);
  const txType = bankTx.amount > 0 ? 'expense' : 'income';

  // Phase resolution mirrors record_expense (handlers.js:2358–2406). Trust
  // phase_id only when it actually belongs to the resolved project; fuzzy
  // match phase_name otherwise. On any failure return the live phase list
  // so the AI can ask the user instead of inventing one. Newly-created
  // phases are read directly from project_phases — no caching, so they're
  // immediately valid for assignment.
  let resolvedPhaseId = null;
  let availablePhases = [];
  if (txType === 'expense') {
    const { data: projectPhases } = await supabase
      .from('project_phases')
      .select('id, name, order_index')
      .eq('project_id', resolvedProjectId)
      .order('order_index', { ascending: true });
    availablePhases = (projectPhases || []).map((p) => p.name);

    if (phase_id) {
      const match = (projectPhases || []).find((p) => p.id === phase_id);
      if (!match) {
        return {
          error: 'That phase isn\'t on this project. Ask the user which phase to use.',
          available_phase_names: availablePhases,
          needs_clarification: 'phase',
        };
      }
      resolvedPhaseId = match.id;
    } else if (phase_name) {
      const needle = String(phase_name).trim().toLowerCase();
      const exact = (projectPhases || []).filter((p) => p.name.toLowerCase() === needle);
      const fuzzy = exact.length > 0
        ? exact
        : (projectPhases || []).filter((p) => p.name.toLowerCase().includes(needle));
      if (fuzzy.length === 0) {
        return {
          error: 'No phase matches that name on this project.',
          available_phase_names: availablePhases,
          needs_clarification: 'phase',
        };
      }
      if (fuzzy.length > 1) {
        return {
          error: 'That name matches multiple phases. Ask the user which one.',
          matching_phase_names: fuzzy.map((p) => p.name),
          needs_clarification: 'phase',
        };
      }
      resolvedPhaseId = fuzzy[0].id;
    }

    // An expense must carry either a phase or a subcategory.
    if (!resolvedPhaseId && !subcategory) {
      return {
        error: 'A phase is required to assign this bank transaction as an expense.',
        available_phase_names: availablePhases,
        needs_clarification: 'phase',
      };
    }
  }

  const insertData = {
    project_id: resolvedProjectId,
    type: txType,
    category: category || bankTx.category || 'misc',
    description: description || bankTx.merchant_name || bankTx.description,
    amount: txAmount,
    date: bankTx.date,
    payment_method: 'card',
    notes: `Imported from bank: ${bankTx.description}`,
    created_by: userId,
    bank_transaction_id: bankTx.id,
  };
  if (subcategory) insertData.subcategory = subcategory;
  if (resolvedPhaseId) insertData.phase_id = resolvedPhaseId;

  const { data: projectTx, error: insertError } = await supabase
    .from('project_transactions')
    .insert(insertData)
    .select()
    .single();

  if (insertError) {
    logger.error('assign_bank_transaction insert error:', insertError);
    return { error: insertError.message };
  }

  // Update bank transaction status
  await supabase
    .from('bank_transactions')
    .update({
      match_status: 'created',
      matched_transaction_id: projectTx.id,
      matched_at: new Date().toISOString(),
      matched_by: 'ai',
      assigned_project_id: resolvedProjectId,
      assigned_category: category || bankTx.category || 'misc',
    })
    .eq('id', bankTx.id);

  return {
    success: true,
    message: `Assigned $${txAmount.toFixed(2)} ${txType} to "${project?.name || 'project'}" as ${category || 'misc'}.`,
    project_transaction: projectTx,
    bank_transaction_id: bankTx.id,
  };
}

async function get_reconciliation_summary(userId, args = {}) {
  const { start_date, end_date } = args;

  // Verify user is an owner
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profile?.role !== 'owner') {
    return { error: 'Reconciliation summary is only available to business owners.' };
  }

  let q = supabase
    .from('bank_transactions')
    .select('match_status, amount')
    .eq('user_id', userId);

  if (start_date) q = q.gte('date', start_date);
  if (end_date) q = q.lte('date', end_date);

  const { data, error } = await q;

  if (error) {
    logger.error('get_reconciliation_summary error:', error);
    return { error: error.message };
  }

  if (!data || data.length === 0) {
    // Check if they have connected accounts
    const { data: accounts } = await supabase
      .from('connected_bank_accounts')
      .select('id')
      .eq('user_id', userId)
      .neq('sync_status', 'disconnected');

    if (!accounts || accounts.length === 0) {
      return { message: 'No bank accounts connected yet. Connect a bank account or upload a CSV statement to start reconciling transactions.' };
    }
    return { message: 'No bank transactions found for the selected period.' };
  }

  const summary = {
    total_transactions: data.length,
    auto_matched: 0,
    suggested_matches: 0,
    manually_matched: 0,
    created_from_bank: 0,
    unmatched: 0,
    ignored: 0,
    unmatched_amount: 0,
    total_amount: 0,
  };

  for (const tx of data) {
    const absAmount = Math.abs(tx.amount);
    summary.total_amount += absAmount;

    switch (tx.match_status) {
      case 'auto_matched': summary.auto_matched++; break;
      case 'suggested_match': summary.suggested_matches++; break;
      case 'manually_matched': summary.manually_matched++; break;
      case 'created': summary.created_from_bank++; break;
      case 'ignored': summary.ignored++; break;
      case 'unmatched':
        summary.unmatched++;
        summary.unmatched_amount += absAmount;
        break;
    }
  }

  summary.total_matched = summary.auto_matched + summary.manually_matched + summary.created_from_bank;
  summary.needs_attention = summary.unmatched + summary.suggested_matches;
  summary.unmatched_amount = parseFloat(summary.unmatched_amount.toFixed(2));
  summary.total_amount = parseFloat(summary.total_amount.toFixed(2));

  return summary;
}


const DEFAULT_TAX_CATEGORY_MAP = {
  materials: 'cogs',
  labor: 'contract_labor',
  subcontractor: 'contract_labor',
  equipment: 'rent_lease',
  permits: 'taxes_licenses',
  misc: 'other_deduction',
  payment: null,
  deposit: null,
};

const TAX_CATEGORY_LABELS = {
  cogs: 'Cost of Goods Sold',
  contract_labor: 'Contract Labor',
  rent_lease: 'Rent / Lease',
  repairs_maintenance: 'Repairs & Maintenance',
  supplies: 'Supplies',
  taxes_licenses: 'Taxes & Licenses',
  utilities: 'Utilities',
  vehicle: 'Vehicle Expenses',
  insurance: 'Insurance',
  other_deduction: 'Other Deductions',
};

async function get_ar_aging(userId) {
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, client_name, project_name, total, amount_paid, status, due_date, created_at')
    .eq('user_id', userId)
    .in('status', ['unpaid', 'partial', 'overdue']);

  if (!invoices || invoices.length === 0) {
    return { clients: [], totals: { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0, total: 0 }, invoiceCount: 0 };
  }

  const now = new Date();
  const buckets = { current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0 };
  const clientMap = {};

  for (const inv of invoices) {
    const balance = (inv.total || 0) - (inv.amount_paid || 0);
    if (balance <= 0) continue;

    const dueDate = inv.due_date ? new Date(inv.due_date + 'T12:00:00') : null;
    const daysOverdue = dueDate ? Math.max(0, Math.floor((now - dueDate) / (1000 * 60 * 60 * 24))) : 0;

    let bucket;
    if (!dueDate || daysOverdue === 0) bucket = 'current';
    else if (daysOverdue <= 30) bucket = 'days1_30';
    else if (daysOverdue <= 60) bucket = 'days31_60';
    else if (daysOverdue <= 90) bucket = 'days61_90';
    else bucket = 'days90plus';

    buckets[bucket] += balance;

    const client = inv.client_name || 'Unknown Client';
    if (!clientMap[client]) {
      clientMap[client] = { client, current: 0, days1_30: 0, days31_60: 0, days61_90: 0, days90plus: 0, total: 0, invoices: [] };
    }
    clientMap[client][bucket] += balance;
    clientMap[client].total += balance;
    clientMap[client].invoices.push({
      invoice_number: inv.invoice_number,
      project: inv.project_name,
      balance: parseFloat(balance.toFixed(2)),
      daysOverdue,
      dueDate: inv.due_date,
    });
  }

  const total = buckets.current + buckets.days1_30 + buckets.days31_60 + buckets.days61_90 + buckets.days90plus;

  return {
    clients: Object.values(clientMap).sort((a, b) => b.total - a.total).map(c => ({
      ...c,
      current: parseFloat(c.current.toFixed(2)),
      days1_30: parseFloat(c.days1_30.toFixed(2)),
      days31_60: parseFloat(c.days31_60.toFixed(2)),
      days61_90: parseFloat(c.days61_90.toFixed(2)),
      days90plus: parseFloat(c.days90plus.toFixed(2)),
      total: parseFloat(c.total.toFixed(2)),
    })),
    totals: {
      current: parseFloat(buckets.current.toFixed(2)),
      days1_30: parseFloat(buckets.days1_30.toFixed(2)),
      days31_60: parseFloat(buckets.days31_60.toFixed(2)),
      days61_90: parseFloat(buckets.days61_90.toFixed(2)),
      days90plus: parseFloat(buckets.days90plus.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
    },
    invoiceCount: invoices.length,
  };
}

async function get_tax_summary(userId, args = {}) {
  const taxYear = args.tax_year || new Date().getFullYear();
  const yearStart = `${taxYear}-01-01`;
  const yearEnd = `${taxYear}-12-31`;

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  const projectIds = (projects || []).map(p => p.id);
  if (projectIds.length === 0) {
    return { taxYear, grossRevenue: 0, deductions: {}, totalDeductions: 0, netProfit: 0, contractors: [] };
  }

  const { data: transactions } = await supabase
    .from('project_transactions')
    .select('type, category, tax_category, amount, description')
    .in('project_id', projectIds)
    .gte('date', yearStart)
    .lte('date', yearEnd);

  let grossRevenue = 0;
  const deductions = {};
  const contractorTotals = {};

  for (const t of (transactions || [])) {
    if (t.type === 'income') {
      grossRevenue += parseFloat(t.amount || 0);
      continue;
    }

    // Expense — determine tax category
    const taxCat = t.tax_category || DEFAULT_TAX_CATEGORY_MAP[t.category] || 'other_deduction';
    if (taxCat) {
      deductions[taxCat] = (deductions[taxCat] || 0) + parseFloat(t.amount || 0);
    }

    // Track contractor payments for 1099
    if (t.category === 'subcontractor' || (t.category === 'labor' && t.description)) {
      const name = (t.description || 'Unknown Contractor').trim();
      contractorTotals[name] = (contractorTotals[name] || 0) + parseFloat(t.amount || 0);
    }
  }

  const totalDeductions = Object.values(deductions).reduce((s, v) => s + v, 0);

  // Format deductions with labels
  const formattedDeductions = {};
  for (const [key, amount] of Object.entries(deductions)) {
    formattedDeductions[TAX_CATEGORY_LABELS[key] || key] = parseFloat(amount.toFixed(2));
  }

  const contractors = Object.entries(contractorTotals)
    .map(([name, totalPaid]) => ({
      name,
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      requires1099: totalPaid >= 600,
    }))
    .sort((a, b) => b.totalPaid - a.totalPaid);

  return {
    taxYear,
    grossRevenue: parseFloat(grossRevenue.toFixed(2)),
    deductions: formattedDeductions,
    totalDeductions: parseFloat(totalDeductions.toFixed(2)),
    netProfit: parseFloat((grossRevenue - totalDeductions).toFixed(2)),
    contractors,
    contractorsRequiring1099: contractors.filter(c => c.requires1099).length,
  };
}

async function get_payroll_summary(userId, args = {}) {
  const now = new Date();
  const startDate = args.start_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const endDate = args.end_date || now.toISOString().split('T')[0];

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  const projectIds = (projects || []).map(p => p.id);
  const projectMap = {};
  (projects || []).forEach(p => { projectMap[p.id] = p.name; });

  if (projectIds.length === 0) {
    return { period: { start: startDate, end: endDate }, workers: [], totalGrossPay: 0, workerCount: 0 };
  }

  // Get labor transactions
  const { data: laborTx } = await supabase
    .from('project_transactions')
    .select('amount, description, project_id')
    .in('project_id', projectIds)
    .eq('type', 'expense')
    .eq('category', 'labor')
    .gte('date', startDate)
    .lte('date', endDate);

  // Get workers for matching
  const ownerId = await resolveOwnerId(userId);
  const { data: workers } = await supabase
    .from('workers')
    .select('id, name, trade, hourly_rate, payment_type, payment_rate')
    .eq('owner_id', ownerId);

  const workerMap = {};
  (workers || []).forEach(w => { workerMap[w.name?.toLowerCase()] = w; });

  // Group by worker name (from description)
  const payByWorker = {};
  for (const tx of (laborTx || [])) {
    const name = (tx.description || 'Unknown Worker').trim();
    if (!payByWorker[name]) {
      const matched = workerMap[name.toLowerCase()];
      payByWorker[name] = {
        name,
        trade: matched?.trade || '',
        rate: matched?.payment_rate || matched?.hourly_rate || null,
        paymentType: matched?.payment_type || null,
        grossPay: 0,
        projects: new Set(),
      };
    }
    payByWorker[name].grossPay += parseFloat(tx.amount || 0);
    payByWorker[name].projects.add(projectMap[tx.project_id] || 'Unknown Project');
  }

  const workerList = Object.values(payByWorker)
    .map(w => ({
      name: w.name,
      trade: w.trade,
      rate: w.rate,
      paymentType: w.paymentType,
      grossPay: parseFloat(w.grossPay.toFixed(2)),
      projects: [...w.projects],
    }))
    .sort((a, b) => b.grossPay - a.grossPay);

  const totalGrossPay = workerList.reduce((s, w) => s + w.grossPay, 0);

  return {
    period: { start: startDate, end: endDate },
    workers: workerList,
    totalGrossPay: parseFloat(totalGrossPay.toFixed(2)),
    workerCount: workerList.length,
  };
}

async function get_cash_flow(userId, args = {}) {
  const months = Math.min(args.months || 6, 12);

  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  const projectIds = (projects || []).map(p => p.id);

  // Calculate start date (N months ago, first of month)
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const startStr = startDate.toISOString().split('T')[0];

  let totalCashIn = 0, totalCashOut = 0;
  const monthlyData = [];

  if (projectIds.length > 0) {
    const { data: transactions } = await supabase
      .from('project_transactions')
      .select('type, amount, date')
      .in('project_id', projectIds)
      .gte('date', startStr)
      .order('date', { ascending: true });

    // Build month buckets
    const monthMap = {};
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap[key] = { period: key, cashIn: 0, cashOut: 0, net: 0 };
    }

    for (const t of (transactions || [])) {
      const monthKey = t.date?.substring(0, 7);
      if (!monthMap[monthKey]) continue;
      const amount = parseFloat(t.amount || 0);
      if (t.type === 'income') {
        monthMap[monthKey].cashIn += amount;
        totalCashIn += amount;
      } else {
        monthMap[monthKey].cashOut += amount;
        totalCashOut += amount;
      }
    }

    for (const m of Object.values(monthMap)) {
      m.cashIn = parseFloat(m.cashIn.toFixed(2));
      m.cashOut = parseFloat(m.cashOut.toFixed(2));
      m.net = parseFloat((m.cashIn - m.cashOut).toFixed(2));
      monthlyData.push(m);
    }
  }

  // Outstanding receivables
  const { data: invoices } = await supabase
    .from('invoices')
    .select('total, amount_paid')
    .eq('user_id', userId)
    .in('status', ['unpaid', 'partial', 'overdue']);

  let outstandingReceivables = 0;
  for (const inv of (invoices || [])) {
    outstandingReceivables += (inv.total || 0) - (inv.amount_paid || 0);
  }

  return {
    months: monthlyData,
    outstandingReceivables: parseFloat(outstandingReceivables.toFixed(2)),
    totalCashIn: parseFloat(totalCashIn.toFixed(2)),
    totalCashOut: parseFloat(totalCashOut.toFixed(2)),
    netCashFlow: parseFloat((totalCashIn - totalCashOut).toFixed(2)),
  };
}

// get_profit_loss
// ----------------------------------------------------------------
// Returns a full P&L breakdown for a date range, optionally
// scoped to a single project. Includes per-category cost rollups,
// gross profit + margin, prorated overhead from recurring_expenses
// (NOT annualized — proration matches the actual date range), and
// outstanding receivables. Owner-only. Read-only.
const PNL_CATEGORIES = ['labor', 'materials', 'subcontractor', 'equipment', 'permits', 'misc'];

function _periodFractionFromRange(startDate, endDate) {
  // Average month is 30.44 days. Used to prorate monthly recurring
  // overhead across an arbitrary date range.
  const s = new Date(startDate + 'T00:00:00Z');
  const e = new Date(endDate + 'T00:00:00Z');
  const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
  return days / 30.44;
}

async function get_profit_loss(userId, args = {}) {
  const { start_date, end_date, project_id, include_projects } = args;

  if (!start_date || !end_date) {
    return { error: 'start_date and end_date are required (YYYY-MM-DD).' };
  }
  if (start_date > end_date) {
    return { error: 'start_date must be on or before end_date.' };
  }

  // Owner-only — labor / margin data is sensitive
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  if (profile?.role !== 'owner') {
    return { error: 'Profit & loss reports are only available to business owners.' };
  }

  // Resolve project scope: single project (by id or fuzzy name) or company-wide
  let scopedProject = null;
  if (project_id) {
    const resolved = await resolveProjectId(userId, project_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    const { data: pRow } = await supabase
      .from('projects')
      .select('id, name, contract_amount, status')
      .eq('id', resolved.id)
      .single();
    scopedProject = pRow || { id: resolved.id, name: resolved.name };
  }

  // Pull every project the owner has so per-project breakdown can name them
  const { data: ownerProjects } = await supabase
    .from('projects')
    .select('id, name, contract_amount, status')
    .eq('user_id', userId);
  const projectIds = scopedProject
    ? [scopedProject.id]
    : (ownerProjects || []).map((p) => p.id);

  if (projectIds.length === 0) {
    return {
      error: 'No projects found for this owner. Create a project before running a P&L report.',
    };
  }

  // Pull transactions in range, scoped to projectIds
  const { data: rawTx, error: txError } = await supabase
    .from('project_transactions')
    .select('id, project_id, type, category, subcategory, amount, date, description')
    .in('project_id', projectIds)
    .gte('date', start_date)
    .lte('date', end_date)
    .order('date', { ascending: false });
  if (txError) {
    logger.error('get_profit_loss transactions error:', txError);
    return { error: txError.message };
  }

  // Aggregate
  let totalRevenue = 0;
  let totalCosts = 0;
  const costBreakdown = Object.fromEntries(PNL_CATEGORIES.map((c) => [c, 0]));

  // Per-project rollup (only used when caller wants it OR when not scoped)
  const projectRollup = new Map(); // id -> { id, name, revenue, costs, costBreakdown }
  for (const p of (ownerProjects || [])) {
    if (scopedProject && p.id !== scopedProject.id) continue;
    projectRollup.set(p.id, {
      id: p.id,
      name: p.name || 'Untitled',
      contractAmount: parseFloat(p.contract_amount || 0),
      revenue: 0,
      costs: 0,
      costBreakdown: Object.fromEntries(PNL_CATEGORIES.map((c) => [c, 0])),
    });
  }

  for (const t of (rawTx || [])) {
    const amount = parseFloat(t.amount || 0);
    const cat = PNL_CATEGORIES.includes(t.category) ? t.category : 'misc';
    const slot = projectRollup.get(t.project_id);
    if (t.type === 'income') {
      totalRevenue += amount;
      if (slot) slot.revenue += amount;
    } else if (t.type === 'expense') {
      totalCosts += amount;
      costBreakdown[cat] += amount;
      if (slot) {
        slot.costs += amount;
        slot.costBreakdown[cat] += amount;
      }
    }
  }

  const grossProfit = totalRevenue - totalCosts;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Prorate recurring overhead across the requested range. Service-business
  // overhead is treated as company-wide; when the report is project-scoped
  // we still include overhead but flag it so the LLM can disclose.
  const periodMonths = _periodFractionFromRange(start_date, end_date);
  const { data: recurring } = await supabase
    .from('recurring_expenses')
    .select('amount, frequency, is_active, project_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  let overhead = 0;
  for (const r of (recurring || [])) {
    // If this report is project-scoped, only include recurring expenses
    // tied to that project (or untied = company-wide is excluded for
    // project P&L to avoid double-charging across projects).
    if (scopedProject && r.project_id && r.project_id !== scopedProject.id) continue;
    if (scopedProject && !r.project_id) continue;
    const monthly = r.frequency === 'weekly'
      ? parseFloat(r.amount) * 4.33
      : r.frequency === 'biweekly'
        ? parseFloat(r.amount) * 2.17
        : r.frequency === 'quarterly'
          ? parseFloat(r.amount) / 3
          : parseFloat(r.amount); // monthly default
    overhead += monthly * periodMonths;
  }

  const netProfit = grossProfit - overhead;
  const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  // Outstanding receivables (only when company-wide; project-scoped uses
  // its own invoices)
  let outstandingReceivables = 0;
  let invoiceQuery = supabase
    .from('invoices')
    .select('total, amount_paid, status, project_id')
    .eq('user_id', userId)
    .neq('status', 'paid')
    .neq('status', 'cancelled')
    .neq('status', 'void');
  if (scopedProject) invoiceQuery = invoiceQuery.eq('project_id', scopedProject.id);
  const { data: invoices } = await invoiceQuery;
  for (const inv of (invoices || [])) {
    outstandingReceivables += Math.max(0, parseFloat(inv.total || 0) - parseFloat(inv.amount_paid || 0));
  }

  // Per-project breakdown (when requested or always for company-wide)
  let projectBreakdowns = null;
  if (include_projects || !scopedProject) {
    projectBreakdowns = Array.from(projectRollup.values())
      .filter((p) => p.revenue > 0 || p.costs > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        revenue: parseFloat(p.revenue.toFixed(2)),
        costs: parseFloat(p.costs.toFixed(2)),
        costBreakdown: Object.fromEntries(
          Object.entries(p.costBreakdown).map(([k, v]) => [k, parseFloat(v.toFixed(2))])
        ),
        grossProfit: parseFloat((p.revenue - p.costs).toFixed(2)),
        grossMargin: p.revenue > 0
          ? parseFloat((((p.revenue - p.costs) / p.revenue) * 100).toFixed(1))
          : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }

  return {
    success: true,
    scope: scopedProject ? 'project' : 'company',
    project: scopedProject ? { id: scopedProject.id, name: scopedProject.name } : null,
    dateRange: { start: start_date, end: end_date, days: Math.round(periodMonths * 30.44) },
    summary: {
      revenue: parseFloat(totalRevenue.toFixed(2)),
      costs: parseFloat(totalCosts.toFixed(2)),
      costBreakdown: Object.fromEntries(
        Object.entries(costBreakdown).map(([k, v]) => [k, parseFloat(v.toFixed(2))])
      ),
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      grossMargin: parseFloat(grossMargin.toFixed(1)),
      overhead: parseFloat(overhead.toFixed(2)),
      netProfit: parseFloat(netProfit.toFixed(2)),
      netMargin: parseFloat(netMargin.toFixed(1)),
      outstandingReceivables: parseFloat(outstandingReceivables.toFixed(2)),
      transactionCount: (rawTx || []).length,
    },
    projectBreakdowns,
    visualElement: {
      type: 'pnl-report',
      data: {
        scope: scopedProject ? 'project' : 'company',
        projectName: scopedProject?.name || null,
        startDate: start_date,
        endDate: end_date,
        revenue: parseFloat(totalRevenue.toFixed(2)),
        costs: parseFloat(totalCosts.toFixed(2)),
        costBreakdown: Object.fromEntries(
          Object.entries(costBreakdown).map(([k, v]) => [k, parseFloat(v.toFixed(2))])
        ),
        grossProfit: parseFloat(grossProfit.toFixed(2)),
        grossMargin: parseFloat(grossMargin.toFixed(1)),
        overhead: parseFloat(overhead.toFixed(2)),
        netProfit: parseFloat(netProfit.toFixed(2)),
        outstandingReceivables: parseFloat(outstandingReceivables.toFixed(2)),
        projectBreakdowns: projectBreakdowns || [],
      },
    },
    hint: 'Render the visualElement as a pnl-report card so the user can review and download a PDF.',
  };
}

async function get_recurring_expenses(userId, args = {}) {
  const activeOnly = args.active_only !== false; // default true

  let q = supabase
    .from('recurring_expenses')
    .select('id, description, amount, category, tax_category, frequency, next_due_date, is_active, project_id, projects(name)')
    .eq('user_id', userId)
    .order('next_due_date', { ascending: true });

  if (activeOnly) q = q.eq('is_active', true);

  const { data, error } = await q;

  if (error) {
    logger.error('get_recurring_expenses error:', error);
    return { error: error.message };
  }

  const expenses = (data || []).map(e => ({
    id: e.id,
    description: e.description,
    amount: parseFloat(e.amount || 0),
    category: e.category,
    taxCategory: e.tax_category,
    frequency: e.frequency,
    nextDueDate: e.next_due_date,
    isActive: e.is_active,
    projectName: e.projects?.name || null,
  }));

  // Estimate monthly cost
  let estimatedMonthlyCost = 0;
  for (const e of expenses) {
    if (!e.isActive) continue;
    if (e.frequency === 'weekly') estimatedMonthlyCost += e.amount * 4.33;
    else if (e.frequency === 'biweekly') estimatedMonthlyCost += e.amount * 2.17;
    else estimatedMonthlyCost += e.amount;
  }

  return {
    expenses,
    count: expenses.length,
    estimatedMonthlyCost: parseFloat(estimatedMonthlyCost.toFixed(2)),
  };
}



module.exports = {
  get_financial_overview,
  get_bank_transactions,
  assign_bank_transaction,
  get_reconciliation_summary,
  get_ar_aging,
  get_tax_summary,
  get_payroll_summary,
  get_cash_flow,
  get_profit_loss,
  get_recurring_expenses,
};
