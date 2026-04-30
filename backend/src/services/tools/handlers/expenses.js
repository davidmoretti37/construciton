/**
 * Tool handlers — expenses and transactions ledger.
 * Split from handlers.js.
 */

const {
  supabase, logger, userSafeError,
  requireSupervisorPermission,
  toDate, getTodayBounds,
  resolveOwnerId, resolveProjectId, resolveServicePlanId,
  recalculatePhaseProgress,
} = require('./_shared');

async function get_transactions(userId, args = {}) {
  let { project_id, type, category, start_date, end_date } = args;

  // Resolve project name to UUID if needed
  if (project_id) {
    const resolved = await resolveProjectId(userId, project_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    project_id = resolved.id;
  }

  // Get user's project IDs for security
  const { data: projects } = await supabase
    .from('projects')
    .select('id')
    .or(`user_id.eq.${userId},assigned_supervisor_id.eq.${userId}`);

  const projectIds = (projects || []).map(p => p.id);
  if (projectIds.length === 0) return [];

  let q = supabase
    .from('project_transactions')
    .select('*, projects(name)')
    .in('project_id', projectIds);

  if (project_id) q = q.eq('project_id', project_id);
  if (type) q = q.eq('type', type);
  if (category) q = q.eq('category', category);
  if (start_date) q = q.gte('date', start_date);
  if (end_date) q = q.lte('date', end_date);

  const { data, error } = await q.order('date', { ascending: false }).limit(50);

  if (error) {
    logger.error('get_transactions error:', error);
    return { error: error.message };
  }

  return data || [];
}

// ==================== DAILY REPORTS & PHOTOS ====================

async function record_expense(userId, { project_id, service_plan_name, type, amount, category, description, date, subcategory, phase_id, phase_name }) {
  // Defensive normalization. The agent occasionally passes amounts as
  // currency strings ("R$ 10.54"), wrong types, or missing descriptions —
  // any of which would silently fail the insert with cryptic CHECK
  // violations or NOT NULL errors. Catch each one with a clear message
  // so the agent can recover gracefully on the next round.

  // Amount: strip non-numeric chars (currency symbols, spaces, commas).
  // Reject NaN, negative, or zero. Insert constraint requires amount >= 0
  // but $0 expenses are nonsense anyway.
  let amountNum = amount;
  if (typeof amountNum === 'string') {
    const cleaned = amountNum.replace(/[^0-9.\-]/g, '');
    amountNum = parseFloat(cleaned);
  } else {
    amountNum = parseFloat(amount);
  }
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return userSafeError(null, `Invalid amount: ${JSON.stringify(amount)}. Pass a positive number (e.g. 10.54), not a currency string.`);
  }

  // Type: must be 'expense' or 'income' per CHECK constraint.
  const txType = (type || '').toString().trim().toLowerCase();
  if (txType !== 'expense' && txType !== 'income') {
    return userSafeError(null, `Invalid type: "${type}". Must be exactly "expense" or "income".`);
  }

  // Description: NOT NULL in the schema. Empty string would fail.
  const safeDescription = (description || '').toString().trim();
  if (!safeDescription) {
    return userSafeError(null, 'Description is required (e.g. "Home Depot lumber" or "Client deposit"). Provide a brief description.');
  }

  const transactionDate = date || new Date().toISOString().split('T')[0];
  let insertData = {
    created_by: userId,
    type: txType,
    category,
    description: safeDescription,
    amount: amountNum,
    date: transactionDate,
  };
  if (subcategory) insertData.subcategory = subcategory;

  let entityName = '';
  let entityFilterCol = '';
  let entityFilterId = '';

  if (service_plan_name && !project_id) {
    // Resolve service plan by name. Use OWNER's id (not the auth user's
    // id) because supervisors should be able to operate on their owner's
    // plans. resolveOwnerId returns the auth user id directly when called
    // by an owner, or the parent owner's id when called by a supervisor.
    const ownerId = await resolveOwnerId(userId);
    const { data: plans } = await supabase
      .from('service_plans')
      .select('id, name')
      .eq('owner_id', ownerId)
      .ilike('name', `%${service_plan_name}%`);

    if (!plans || plans.length === 0) {
      return { error: `No service plan found matching "${service_plan_name}"` };
    }
    if (plans.length > 1) {
      return { error: `Multiple service plans match "${service_plan_name}". Be more specific.`, suggestions: plans.map(p => p.name) };
    }
    insertData.service_plan_id = plans[0].id;
    entityName = plans[0].name;
    entityFilterCol = 'service_plan_id';
    entityFilterId = plans[0].id;
  } else {
    // Resolve project (existing logic)
    const resolved = await resolveProjectId(userId, project_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    insertData.project_id = resolved.id;
    entityName = resolved.name || project_id;
    entityFilterCol = 'project_id';
    entityFilterId = resolved.id;
  }

  // Phase resolution (project-scoped only; service plans don't have phases).
  // Accept either phase_id (trusted as-is) or phase_name (fuzzy-matched).
  // For expenses we REQUIRE a phase_id or subcategory — if the AI didn't
  // supply one, return the list of phases so it can ask the user to pick.
  if (insertData.project_id) {
    const { data: projectPhases } = await supabase
      .from('project_phases')
      .select('id, name, order_index')
      .eq('project_id', insertData.project_id)
      .order('order_index', { ascending: true });

    if (phase_id) {
      // Validate that the id belongs to this project
      const match = (projectPhases || []).find((p) => p.id === phase_id);
      if (!match) {
        return {
          error: 'That phase isn\'t on this project. Ask the user which phase to use.',
          available_phase_names: (projectPhases || []).map((p) => p.name),
          needs_clarification: 'phase',
        };
      }
      insertData.phase_id = match.id;
    } else if (phase_name) {
      const needle = String(phase_name).trim().toLowerCase();
      const exact = (projectPhases || []).filter((p) => p.name.toLowerCase() === needle);
      const fuzzy = exact.length > 0
        ? exact
        : (projectPhases || []).filter((p) => p.name.toLowerCase().includes(needle));
      if (fuzzy.length === 0) {
        return {
          error: 'No phase matches that name on this project.',
          available_phase_names: (projectPhases || []).map((p) => p.name),
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
      insertData.phase_id = fuzzy[0].id;
    }

    if (type === 'expense' && !subcategory && !insertData.phase_id) {
      return {
        error: 'A phase is required for this expense. Ask the user which phase to assign it to.',
        available_phase_names: (projectPhases || []).map((p) => p.name),
        needs_clarification: 'phase',
      };
    }
  } else if (type === 'expense' && !subcategory) {
    // Service-plan expense — no phases to pick from, require subcategory.
    return {
      error: 'A subcategory is required for service-plan expenses. Ask the user what kind of expense this is (e.g. materials, labor, equipment).',
      needs_clarification: 'subcategory',
    };
  }

  const { data, error } = await supabase
    .from('project_transactions')
    .insert(insertData)
    .select()
    .single();

  if (error) return userSafeError(error, "Couldn't record that transaction.");

  // Get updated totals
  const { data: transactions } = await supabase
    .from('project_transactions')
    .select('type, amount')
    .eq(entityFilterCol, entityFilterId);

  const totalExpenses = (transactions || [])
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalIncome = (transactions || [])
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  // Notify project owner (when a supervisor recorded it) and any assigned
  // supervisor with can_pay_workers (when they aren't the recorder themselves).
  if (insertData.project_id) {
    const { data: proj } = await supabase.from('projects').select('user_id, name').eq('id', insertData.project_id).single();
    if (proj) {
      const expenseBody = `$${parseFloat(amount).toFixed(2)} ${category || ''} expense on ${proj.name}`;
      if (proj.user_id !== userId) {
        sendNotification({
          userId: proj.user_id,
          title: 'New Expense Recorded',
          body: expenseBody,
          type: 'financial_update',
          data: { screen: 'Projects' },
          projectId: insertData.project_id,
        });
      }
      const supId = await resolveSupervisorRecipient(insertData.project_id, proj.user_id, 'can_pay_workers');
      if (supId && supId !== userId) {
        sendNotification({
          userId: supId,
          title: 'New Expense Recorded',
          body: expenseBody,
          type: 'financial_update',
          data: { screen: 'Projects' },
          projectId: insertData.project_id,
        });
      }
    }
  }

  return {
    success: true,
    transaction: {
      id: data.id,
      type,
      amount: parseFloat(amount),
      category,
      description,
      date: transactionDate,
    },
    totals: {
      totalExpenses,
      totalIncome,
      profit: totalIncome - totalExpenses,
    },
    entityName,
  };
}

async function delete_expense(userId, { transaction_id, project_id }) {
  // OWNER-ONLY: Check if user is a supervisor
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profile?.role === 'supervisor') {
    return { error: 'Access denied - expense management is owner-only' };
  }

  // Resolve transaction if description/name provided
  let resolvedId = transaction_id;

  // If not a UUID, try to resolve from description + project
  if (!transaction_id.match(/^[0-9a-f]{8}-/i)) {
    // Get owner's projects (not supervisor's)
    const { data: userProjects } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId);  // Only owner's projects

    const projectIds = (userProjects || []).map(p => p.id);
    if (projectIds.length === 0) {
      return { error: 'No projects found' };
    }

    // Get transactions from user's projects
    let query = supabase
      .from('project_transactions')
      .select('id, description, amount, category, date, project_id, created_by')
      .in('project_id', projectIds);  // Search all transactions in user's projects

    if (project_id) {
      const projectResolved = await resolveProjectId(userId, project_id);
      if (projectResolved.error) return projectResolved;
      if (projectResolved.suggestions) return projectResolved;
      query = query.eq('project_id', projectResolved.id);
    }

    const { data: transactions } = await query.limit(10);

    if (!transactions || transactions.length === 0) {
      return { error: `Transaction not found matching "${transaction_id}"` };
    }

    // Try to match description or amount
    const searchLower = transaction_id.toLowerCase();
    const amountMatch = transaction_id.match(/\$?(\d+(?:\.\d+)?)/);
    const searchAmount = amountMatch ? parseFloat(amountMatch[1]) : null;

    const match = transactions.find(t =>
      t.description?.toLowerCase().includes(searchLower) ||
      (searchAmount && Math.abs(parseFloat(t.amount) - searchAmount) < 0.01)
    );

    if (!match && transactions.length === 1) {
      resolvedId = transactions[0].id;
    } else if (match) {
      resolvedId = match.id;
    } else {
      return {
        suggestions: transactions.map(t => ({
          id: t.id,
          description: t.description,
          amount: t.amount,
          category: t.category,
          date: t.date
        })),
        message: `Multiple transactions found. Which one did you mean?`
      };
    }
  }

  // Verify project ownership (not just transaction creator)
  const { data: transaction, error: fetchErr } = await supabase
    .from('project_transactions')
    .select('id, description, amount, category, project_id, created_by')
    .eq('id', resolvedId)
    .single();

  if (fetchErr || !transaction) {
    return { error: 'Transaction not found' };
  }

  // Verify user OWNS the project (not just supervises)
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', transaction.project_id)
    .eq('user_id', userId)  // Only project owner
    .single();

  if (!project) {
    return { error: 'Access denied - you do not own this project' };
  }

  const projectId = transaction.project_id;

  // Delete the transaction
  const { error: deleteErr } = await supabase
    .from('project_transactions')
    .delete()
    .eq('id', resolvedId);

  if (deleteErr) {
    return userSafeError(deleteErr, "Couldn't delete that transaction.");
  }

  // Get updated project totals
  const { data: remainingTransactions } = await supabase
    .from('project_transactions')
    .select('type, amount')
    .eq('project_id', projectId);

  const totalExpenses = (remainingTransactions || [])
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalIncome = (remainingTransactions || [])
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  logger.info(`✅ Deleted expense ${resolvedId}: ${transaction.description} ($${transaction.amount})`);

  return {
    success: true,
    deletedTransaction: {
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      category: transaction.category,
    },
    projectTotals: {
      totalExpenses,
      totalIncome,
      profit: totalIncome - totalExpenses,
    }
  };
}

async function update_expense(userId, { transaction_id, amount, category, description, date, subcategory, phase_id }) {
  // Reject explicit clears that would violate the new tx_phase_required CHECK.
  if (subcategory === '' || subcategory === null) {
    return { error: 'Cannot clear the phase/subcategory on an expense — pick a different phase or leave it as-is.' };
  }
  // Resolve transaction ID if needed
  let resolvedId = transaction_id;

  // For now, require UUID - can enhance later with resolution logic
  if (!transaction_id.match(/^[0-9a-f]{8}-/i)) {
    return { error: 'Please provide the transaction UUID. Use get_transactions to find the transaction ID first.' };
  }

  // Build updates object
  const updates = {};
  if (amount !== undefined) updates.amount = parseFloat(amount);
  if (category !== undefined) updates.category = category;
  if (description !== undefined) updates.description = description;
  if (date !== undefined) updates.date = date;
  if (subcategory !== undefined) updates.subcategory = subcategory;
  if (phase_id !== undefined) updates.phase_id = phase_id || null;

  if (Object.keys(updates).length === 0) {
    return { error: 'No fields to update. Provide at least one field: amount, category, description, date, subcategory, or phase_id.' };
  }

  // First, get the transaction to verify project ownership
  const { data: transaction } = await supabase
    .from('project_transactions')
    .select('id, project_id')
    .eq('id', resolvedId)
    .single();

  if (!transaction) {
    return { error: 'Transaction not found' };
  }

  // Verify user OWNS the project (not just supervises)
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', transaction.project_id)
    .eq('user_id', userId)  // Only project owner
    .single();

  if (!project) {
    return { error: 'Access denied - you do not own this project' };
  }

  // Now update the transaction
  const { data, error } = await supabase
    .from('project_transactions')
    .update(updates)
    .eq('id', resolvedId)
    .select('id, description, amount, category, date, type, project_id')
    .single();

  if (error || !data) {
    return { error: 'Failed to update transaction' };
  }

  // Get updated project totals
  const { data: transactions } = await supabase
    .from('project_transactions')
    .select('type, amount')
    .eq('project_id', data.project_id);

  const totalExpenses = (transactions || [])
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);
  const totalIncome = (transactions || [])
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  logger.info(`✅ Updated expense ${resolvedId}:`, updates);

  return {
    success: true,
    transaction: {
      id: data.id,
      description: data.description,
      amount: data.amount,
      category: data.category,
      date: data.date,
    },
    projectTotals: {
      totalExpenses,
      totalIncome,
      profit: totalIncome - totalExpenses,
    }
  };
}

// ==================== PHASE MUTATIONS ====================


module.exports = {
  get_transactions,
  record_expense,
  delete_expense,
  update_expense,
};
