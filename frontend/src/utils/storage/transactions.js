import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from './auth';
import { clearCache } from '../../services/offlineCache';

// ============================================================
// Project Transaction Functions
// ============================================================

/**
 * Add a new transaction (expense or income) to a project
 * @param {object} transaction - Transaction data
 * @returns {Promise<object>} Created transaction
 */
export const addProjectTransaction = async (transaction) => {
  try {
    const userId = await getCurrentUserId();

    // Validate financial data
    const amount = parseFloat(transaction.amount);
    if (isNaN(amount) || amount < 0 || amount > 999999999) {
      throw new Error(`Invalid transaction amount: ${transaction.amount}`);
    }

    const { data, error } = await supabase
      .from('project_transactions')
      .insert({
        project_id: transaction.project_id || null,
        service_plan_id: transaction.service_plan_id || null,
        type: transaction.type,
        category: transaction.category,
        subcategory: transaction.subcategory || null,
        tax_category: transaction.tax_category || null,
        description: transaction.description,
        amount,
        date: transaction.date || new Date().toISOString().split('T')[0],
        worker_id: transaction.worker_id || null,
        payment_method: transaction.payment_method || null,
        notes: transaction.notes || null,
        receipt_url: transaction.receipt_url || null,
        line_items: transaction.line_items || null,
        is_auto_generated: false,
        created_by: userId
      })
      .select('id, project_id, type, category, subcategory, tax_category, description, amount, date, worker_id, payment_method, notes, receipt_url, line_items, is_auto_generated, created_by, created_at')
      .single();

    if (error) throw error;
    clearCache('projects'); // Invalidate project cache after financial write
    return data;
  } catch (error) {
    console.error('Error adding transaction:', error);
    throw error;
  }
};

/**
 * Get all transactions for a project, optionally filtered by type
 * @param {string} projectId - Project ID
 * @param {string} type - Optional filter ('expense' or 'income')
 * @returns {Promise<array>} Array of transactions
 */
export const getProjectTransactions = async (projectId, type = null) => {
  try {
    let query = supabase
      .from('project_transactions')
      .select(`
        id, project_id, type, category, subcategory, description, amount, date, worker_id,
        payment_method, notes, receipt_url, line_items, is_auto_generated, created_by, created_at,
        workers (id, full_name)
      `)
      .eq('project_id', projectId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching transactions:', error);
    throw error;
  }
};

/**
 * Update an existing transaction
 * @param {string} transactionId - Transaction ID
 * @param {object} updates - Fields to update
 * @returns {Promise<object>} Updated transaction
 */
export const updateTransaction = async (transactionId, updates) => {
  try {
    // Validate financial data
    const amount = parseFloat(updates.amount);
    if (isNaN(amount) || amount < 0 || amount > 999999999) {
      throw new Error(`Invalid transaction amount: ${updates.amount}`);
    }

    const { data, error } = await supabase
      .from('project_transactions')
      .update({
        type: updates.type,
        category: updates.category,
        subcategory: updates.subcategory,
        description: updates.description,
        amount,
        date: updates.date,
        payment_method: updates.payment_method,
        notes: updates.notes,
        updated_at: new Date().toISOString()
      })
      .eq('id', transactionId)
      .select('id, project_id, type, category, subcategory, description, amount, date, payment_method, notes, updated_at, created_at')
      .single();

    if (error) throw error;
    clearCache('projects');
    return data;
  } catch (error) {
    console.error('Error updating transaction:', error);
    throw error;
  }
};

/**
 * Delete a transaction
 * @param {string} transactionId - Transaction ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteTransaction = async (transactionId) => {
  try {
    const { error } = await supabase
      .from('project_transactions')
      .delete()
      .eq('id', transactionId);

    if (error) throw error;
    clearCache('projects');
    return true;
  } catch (error) {
    console.error('Error deleting transaction:', error);
    throw error;
  }
};

/**
 * Get transaction summary for a project (totals by category)
 * @param {string} projectId - Project ID
 * @returns {Promise<object>} Summary object
 */
export const getProjectTransactionSummary = async (projectId) => {
  try {
    const transactions = await getProjectTransactions(projectId);

    const summary = {
      totalExpenses: 0,
      totalIncome: 0,
      expensesByCategory: {},
      expensesBySubcategory: {},
      transactionCount: transactions.length,
      latestTransaction: transactions[0] || null
    };

    transactions.forEach(t => {
      const amount = parseFloat(t.amount);
      if (t.type === 'expense') {
        summary.totalExpenses += amount;
        if (t.category) {
          summary.expensesByCategory[t.category] =
            (summary.expensesByCategory[t.category] || 0) + amount;
        }
        if (t.subcategory) {
          summary.expensesBySubcategory[t.subcategory] =
            (summary.expensesBySubcategory[t.subcategory] || 0) + amount;
        }
      } else if (t.type === 'income') {
        summary.totalIncome += amount;
      }
    });

    return summary;
  } catch (error) {
    console.error('Error getting transaction summary:', error);
    throw error;
  }
};

/**
 * Manually sync project totals from transactions
 * Use this as a backup if the database trigger fails
 * @param {string} projectId - Project ID to sync
 * @returns {Promise<object>} Updated totals
 */
export const syncProjectTotalsFromTransactions = async (projectId) => {
  try {
    // Get all transactions for the project
    const transactions = await getProjectTransactions(projectId);

    // Calculate totals
    let totalExpenses = 0;
    let totalIncome = 0;

    transactions.forEach(t => {
      const amount = parseFloat(t.amount) || 0;
      if (t.type === 'expense') {
        totalExpenses += amount;
      } else if (t.type === 'income') {
        totalIncome += amount;
      }
    });

    // Update the project record
    const { data, error } = await supabase
      .from('projects')
      .update({
        expenses: totalExpenses,
        income_collected: totalIncome,
        updated_at: new Date().toISOString()
      })
      .eq('id', projectId)
      .select('id, name, expenses, income_collected, updated_at')
      .single();

    if (error) {
      console.error('Error syncing project totals:', error);
      throw error;
    }

    return {
      expenses: totalExpenses,
      income_collected: totalIncome,
      project: data
    };
  } catch (error) {
    console.error('Error in syncProjectTotalsFromTransactions:', error);
    throw error;
  }
};

// ============================================================
// Financial Analytics Functions
// ============================================================

/**
 * Get transactions filtered by category
 * @param {string} category - Category filter
 * @param {string} projectId - Optional project filter
 * @returns {Promise<array>} Array of transactions
 */
export const getTransactionsByCategory = async (category, projectId = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return [];
    }

    let query = supabase
      .from('project_transactions')
      .select('id, project_id, type, category, description, amount, date, worker_id, payment_method, notes, receipt_url, line_items, created_at')
      .eq('user_id', user.id)
      .eq('category', category)
      .order('transaction_date', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query.limit(100);

    if (error) {
      console.error('Error fetching transactions by category:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getTransactionsByCategory:', error);
    return [];
  }
};

/**
 * Get transactions within a date range
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @param {string} projectId - Optional project filter
 * @returns {Promise<array>} Array of transactions
 */
export const getTransactionsByDateRange = async (startDate, endDate, projectId = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return [];
    }

    let query = supabase
      .from('project_transactions')
      .select('id, project_id, type, category, description, amount, date, worker_id, payment_method, notes, receipt_url, line_items, created_at')
      .eq('user_id', user.id)
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate)
      .order('transaction_date', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query.limit(100);

    if (error) {
      console.error('Error fetching transactions by date range:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getTransactionsByDateRange:', error);
    return [];
  }
};

/**
 * Get transactions by payment method
 * @param {string} paymentMethod - Payment method filter
 * @param {string} projectId - Optional project filter
 * @returns {Promise<array>} Array of transactions
 */
export const getTransactionsByPaymentMethod = async (paymentMethod, projectId = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return [];
    }

    let query = supabase
      .from('project_transactions')
      .select('id, project_id, type, category, description, amount, date, worker_id, payment_method, notes, receipt_url, line_items, created_at')
      .eq('user_id', user.id)
      .eq('payment_method', paymentMethod)
      .order('transaction_date', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query.limit(100);

    if (error) {
      console.error('Error fetching transactions by payment method:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getTransactionsByPaymentMethod:', error);
    return [];
  }
};

/**
 * Calculate labor costs from time tracking
 * @param {string} projectId - Optional project filter
 * @param {string} startDate - Optional start date
 * @param {string} endDate - Optional end date
 * @returns {Promise<object>} Labor cost breakdown
 */
export const calculateLaborCostsFromTimeTracking = async (projectId = null, startDate = null, endDate = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return { totalCost: 0, breakdown: [] };
    }

    let query = supabase
      .from('clock_in_records')
      .select(`
        id, worker_id, project_id, clock_in_time, clock_out_time,
        workers:worker_id (
          id,
          full_name,
          hourly_rate
        ),
        projects:project_id (
          id,
          name
        )
      `)
      .eq('user_id', user.id)
      .not('clock_out_time', 'is', null);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    if (startDate) {
      query = query.gte('clock_in_time', startDate);
    }

    if (endDate) {
      query = query.lte('clock_out_time', endDate);
    }

    const { data: records, error } = await query;

    if (error) {
      console.error('Error fetching time records:', error);
      return { totalCost: 0, breakdown: [] };
    }

    const breakdown = {};
    let totalCost = 0;

    records.forEach(record => {
      const clockIn = new Date(record.clock_in_time);
      const clockOut = new Date(record.clock_out_time);
      const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60);
      const rate = record.workers?.hourly_rate || 0;
      const cost = hoursWorked * rate;

      totalCost += cost;

      const workerName = record.workers?.full_name || 'Unknown Worker';
      if (!breakdown[workerName]) {
        breakdown[workerName] = { hours: 0, cost: 0, rate };
      }
      breakdown[workerName].hours += hoursWorked;
      breakdown[workerName].cost += cost;
    });

    return {
      totalCost,
      breakdown: Object.entries(breakdown).map(([name, data]) => ({
        workerName: name,
        hours: data.hours,
        rate: data.rate,
        cost: data.cost
      }))
    };
  } catch (error) {
    console.error('Error in calculateLaborCostsFromTimeTracking:', error);
    return { totalCost: 0, breakdown: [] };
  }
};

/**
 * Get spending trends by category
 * @param {string} projectId - Optional project filter
 * @param {number} months - Number of months to analyze
 * @returns {Promise<object>} Spending trends by category
 */
export const getSpendingTrendsByCategory = async (projectId = null, months = 3) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return {};
    }

    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    let query = supabase
      .from('project_transactions')
      .select('id, project_id, type, category, description, amount, date, worker_id, payment_method, notes, created_at')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .gte('transaction_date', startDate.toISOString());

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data: transactions, error } = await query.limit(100);

    if (error) {
      console.error('Error fetching spending trends:', error);
      return {};
    }

    const trends = {};
    transactions.forEach(tx => {
      const category = tx.category || 'other';
      if (!trends[category]) {
        trends[category] = { total: 0, count: 0, transactions: [] };
      }
      trends[category].total += parseFloat(tx.amount);
      trends[category].count += 1;
      trends[category].transactions.push(tx);
    });

    return trends;
  } catch (error) {
    console.error('Error in getSpendingTrendsByCategory:', error);
    return {};
  }
};

/**
 * Detect cost overruns (actual vs budget)
 * @param {string} projectId - Project ID
 * @returns {Promise<object|null>} Cost overrun analysis
 */
export const detectCostOverruns = async (projectId) => {
  try {
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, name, contract_amount, phases:project_phases(id, name, status, payment_amount)')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('Error fetching project:', projectError);
      return null;
    }

    const { data: expenses, error: expensesError } = await supabase
      .from('project_transactions')
      .select('id, amount')
      .eq('project_id', projectId)
      .eq('type', 'expense');

    if (expensesError) {
      console.error('Error fetching expenses:', expensesError);
      return null;
    }

    const totalExpenses = expenses.reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    const budget = parseFloat(project.contract_amount || 0);
    const overBudget = totalExpenses > budget;
    const variance = totalExpenses - budget;
    const percentageOver = budget > 0 ? (variance / budget) * 100 : 0;

    return {
      projectName: project.name,
      budget,
      totalExpenses,
      variance,
      percentageOver,
      overBudget,
      status: overBudget ? 'over-budget' : 'on-budget'
    };
  } catch (error) {
    console.error('Error in detectCostOverruns:', error);
    return null;
  }
};

/**
 * Predict cash flow based on payment schedules
 * @param {number} months - Number of months to predict
 * @returns {Promise<object>} Cash flow predictions
 */
export const predictCashFlow = async (months = 3) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return { predictions: [], summary: {} };
    }

    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, contract_amount, income_collected, status, phases:project_phases(id, name, status, payment_amount, end_date)')
      .eq('user_id', user.id)
      .in('status', ['active', 'on-track', 'behind', 'over-budget'])
      .limit(100);

    if (error) {
      console.error('Error fetching projects:', error);
      return { predictions: [], summary: {} };
    }

    const predictions = [];
    let totalExpectedIncome = 0;
    let totalPendingPayments = 0;

    projects.forEach(project => {
      const contractAmount = parseFloat(project.contract_amount || 0);
      const collected = parseFloat(project.income_collected || 0);
      const pending = contractAmount - collected;

      if (pending > 0) {
        totalPendingPayments += pending;

        const phasesWithPayment = project.phases?.filter(p => p.payment_amount > 0) || [];

        phasesWithPayment.forEach(phase => {
          predictions.push({
            projectName: project.name,
            phaseName: phase.name,
            amount: phase.payment_amount,
            expectedDate: phase.end_date,
            status: phase.status
          });
        });

        if (phasesWithPayment.length === 0) {
          predictions.push({
            projectName: project.name,
            phaseName: 'Final Payment',
            amount: pending,
            expectedDate: null,
            status: 'pending'
          });
        }

        totalExpectedIncome += pending;
      }
    });

    return {
      predictions: predictions.sort((a, b) => {
        if (!a.expectedDate) return 1;
        if (!b.expectedDate) return -1;
        return new Date(a.expectedDate) - new Date(b.expectedDate);
      }),
      summary: {
        totalExpectedIncome,
        totalPendingPayments,
        projectCount: projects.length
      }
    };
  } catch (error) {
    console.error('Error in predictCashFlow:', error);
    return { predictions: [], summary: {} };
  }
};

// ============================================================
// Worker Expense Submission Functions
// ============================================================

/**
 * Submit a worker expense with receipt
 * Auto-approves and updates project expenses immediately via DB trigger
 * @param {object} expense - Expense data
 * @param {string} expense.projectId - Project ID
 * @param {string} expense.workerId - Worker ID
 * @param {number} expense.amount - Expense amount
 * @param {string} expense.description - Description
 * @param {string} expense.category - Category (materials, equipment, permits, subcontractor, misc)
 * @param {string} expense.date - Date (YYYY-MM-DD)
 * @param {string} expense.receiptUrl - URL to uploaded receipt image
 * @param {array} expense.lineItems - Array of line items from receipt
 * @param {string} expense.paymentMethod - Payment method
 * @param {string} expense.notes - Additional notes
 * @returns {Promise<object>} Created transaction
 */
export const submitWorkerExpense = async (expense) => {
  try {
    const userId = await getCurrentUserId();

    const { data, error } = await supabase
      .from('project_transactions')
      .insert({
        project_id: expense.projectId || null,
        service_plan_id: expense.servicePlanId || null,
        type: 'expense',
        category: expense.category || 'misc',
        subcategory: expense.subcategory || null,
        phase_id: expense.phaseId || null,
        description: expense.description,
        amount: expense.amount,
        date: expense.date || new Date().toISOString().split('T')[0],
        worker_id: expense.workerId,
        payment_method: expense.paymentMethod || null,
        notes: expense.notes || null,
        receipt_url: expense.receiptUrl || null,
        line_items: expense.lineItems || null,
        is_auto_generated: false,
        created_by: userId
      })
      .select('id, project_id, type, category, subcategory, phase_id, description, amount, date, worker_id, payment_method, notes, receipt_url, line_items, is_auto_generated, created_by, created_at')
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error submitting worker expense:', error);
    throw error;
  }
};

/**
 * Get worker's submitted expenses
 * @param {string} workerId - Worker ID
 * @returns {Promise<array>} Array of expenses with project info
 */
export const getWorkerExpenses = async (workerId) => {
  try {
    const { data, error } = await supabase
      .from('project_transactions')
      .select(`
        id, project_id, type, category, subcategory, description, amount, date, worker_id, payment_method, notes, receipt_url, line_items, created_at,
        projects (id, name)
      `)
      .eq('worker_id', workerId)
      .eq('type', 'expense')
      .neq('category', 'labor') // Exclude labor costs (payments) - workers shouldn't see payment info
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching worker expenses:', error);
    throw error;
  }
};
