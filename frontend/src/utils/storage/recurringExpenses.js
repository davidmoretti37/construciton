import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from './auth';
import { addProjectTransaction } from './transactions';

/**
 * Get all recurring expenses for current user
 */
export const fetchRecurringExpenses = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('recurring_expenses')
      .select('id, description, amount, category, tax_category, project_id, frequency, next_due_date, is_active, created_at, projects (id, name)')
      .eq('user_id', userId)
      .order('next_due_date', { ascending: true });

    if (error) {
      console.error('Error fetching recurring expenses:', error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error('Error in fetchRecurringExpenses:', error);
    return [];
  }
};

/**
 * Create a new recurring expense
 */
export const addRecurringExpense = async (expense) => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('recurring_expenses')
      .insert({
        user_id: userId,
        description: expense.description,
        amount: expense.amount,
        category: expense.category || 'misc',
        tax_category: expense.tax_category || null,
        project_id: expense.project_id || null,
        frequency: expense.frequency || 'monthly',
        next_due_date: expense.next_due_date,
        is_active: true,
      })
      .select('id, description, amount, category, tax_category, project_id, frequency, next_due_date, is_active, created_at')
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error adding recurring expense:', error);
    throw error;
  }
};

/**
 * Update a recurring expense
 */
export const updateRecurringExpense = async (id, updates) => {
  try {
    const { error } = await supabase
      .from('recurring_expenses')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error updating recurring expense:', error);
    return false;
  }
};

/**
 * Delete a recurring expense
 */
export const deleteRecurringExpense = async (id) => {
  try {
    const { error } = await supabase
      .from('recurring_expenses')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error deleting recurring expense:', error);
    return false;
  }
};

/**
 * Process overdue recurring expenses — auto-create transactions for past-due items
 * Call this on app focus/load.
 */
export const processOverdueRecurring = async () => {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return 0;

    const today = new Date().toISOString().split('T')[0];

    const { data: overdue, error } = await supabase
      .from('recurring_expenses')
      .select('id, description, amount, category, tax_category, project_id, frequency, next_due_date')
      .eq('user_id', userId)
      .eq('is_active', true)
      .lte('next_due_date', today);

    if (error || !overdue || overdue.length === 0) return 0;

    let created = 0;
    for (const item of overdue) {
      if (!item.project_id) continue;

      try {
        await addProjectTransaction({
          project_id: item.project_id,
          type: 'expense',
          category: item.category,
          tax_category: item.tax_category,
          description: `[Recurring] ${item.description}`,
          amount: item.amount,
          date: item.next_due_date,
          notes: 'Auto-created from recurring expense',
        });

        // Advance next_due_date
        const nextDate = new Date(item.next_due_date + 'T12:00:00');
        if (item.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
        else if (item.frequency === 'biweekly') nextDate.setDate(nextDate.getDate() + 14);
        else if (item.frequency === 'quarterly') nextDate.setMonth(nextDate.getMonth() + 3);
        else if (item.frequency === 'annually') nextDate.setFullYear(nextDate.getFullYear() + 1);
        else nextDate.setMonth(nextDate.getMonth() + 1);

        await supabase
          .from('recurring_expenses')
          .update({ next_due_date: nextDate.toISOString().split('T')[0] })
          .eq('id', item.id);

        created++;
      } catch (e) {
        console.error('Error processing recurring expense:', item.id, e);
      }
    }

    return created;
  } catch (error) {
    console.error('Error in processOverdueRecurring:', error);
    return 0;
  }
};
