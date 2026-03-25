/**
 * Reconciliation Service
 * Matches bank transactions against platform-recorded project_transactions.
 * Uses amount, date proximity, and description similarity scoring.
 */

const logger = require('../utils/logger');

/**
 * Reconcile unmatched bank transactions for a specific account.
 * Runs after every sync/import to auto-match where possible.
 *
 * @param {string} userId - Owner's user ID
 * @param {string} bankAccountId - Bank account ID to reconcile
 * @param {object} supabase - Supabase admin client
 * @returns {{ autoMatched: number, suggestedMatch: number, unmatched: number }}
 */
async function reconcileTransactions(userId, bankAccountId, supabase) {
  // Get all unmatched bank transactions for this account
  const { data: bankTxs, error: bankError } = await supabase
    .from('bank_transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('bank_account_id', bankAccountId)
    .eq('match_status', 'unmatched')
    .eq('is_pending', false);

  if (bankError || !bankTxs || bankTxs.length === 0) {
    return { autoMatched: 0, suggestedMatch: 0, unmatched: 0 };
  }

  // Get date range from bank transactions (with buffer)
  const dates = bankTxs.map(tx => new Date(tx.date));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  minDate.setDate(minDate.getDate() - 3);
  maxDate.setDate(maxDate.getDate() + 3);

  // Get all platform project_transactions in the date range for this user
  const { data: platformTxs, error: platformError } = await supabase
    .from('project_transactions')
    .select('id, project_id, type, category, description, amount, date, payment_method, bank_transaction_id')
    .gte('date', minDate.toISOString().split('T')[0])
    .lte('date', maxDate.toISOString().split('T')[0])
    .is('bank_transaction_id', null); // Only unlinked platform transactions

  if (platformError) {
    logger.error('Error fetching platform transactions for reconciliation:', platformError);
    return { autoMatched: 0, suggestedMatch: 0, unmatched: bankTxs.length };
  }

  // Also need to filter platform transactions by user's projects
  const { data: userProjects } = await supabase
    .from('projects')
    .select('id')
    .eq('user_id', userId);

  const userProjectIds = new Set((userProjects || []).map(p => p.id));
  const filteredPlatformTxs = (platformTxs || []).filter(tx => userProjectIds.has(tx.project_id));

  // Get active overhead items for overhead matching
  const { data: overheadItems } = await supabase
    .from('recurring_expenses')
    .select('id, description, amount, frequency')
    .eq('user_id', userId)
    .eq('is_active', true);

  let autoMatched = 0;
  let suggestedMatch = 0;
  let unmatched = 0;

  // Track which platform transactions have already been matched
  const matchedPlatformIds = new Set();

  for (const bankTx of bankTxs) {
    const bankAmount = Math.abs(bankTx.amount);
    const bankDate = new Date(bankTx.date);
    const bankDesc = (bankTx.merchant_name || bankTx.description || '').toLowerCase();

    let bestMatch = null;
    let bestScore = 0;

    for (const platformTx of filteredPlatformTxs) {
      if (matchedPlatformIds.has(platformTx.id)) continue;

      const score = calculateMatchScore(bankAmount, bankDate, bankDesc, platformTx);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = platformTx;
      }
    }

    if (bestScore >= 0.85 && bestMatch) {
      // Auto-match
      await supabase
        .from('bank_transactions')
        .update({
          match_status: 'auto_matched',
          matched_transaction_id: bestMatch.id,
          match_confidence: bestScore,
          matched_at: new Date().toISOString(),
          matched_by: 'auto',
        })
        .eq('id', bankTx.id);

      await supabase
        .from('project_transactions')
        .update({ bank_transaction_id: bankTx.id })
        .eq('id', bestMatch.id);

      matchedPlatformIds.add(bestMatch.id);
      autoMatched++;
    } else if (bestScore >= 0.60 && bestMatch) {
      // Suggested match - needs review
      await supabase
        .from('bank_transactions')
        .update({
          match_status: 'suggested_match',
          matched_transaction_id: bestMatch.id,
          match_confidence: bestScore,
          matched_by: 'auto',
        })
        .eq('id', bankTx.id);

      suggestedMatch++;
    } else {
      // No project match — try matching to overhead items
      let overheadMatched = false;

      if (overheadItems && overheadItems.length > 0) {
        let bestOverhead = null;
        let bestOverheadScore = 0;

        for (const oh of overheadItems) {
          const ohAmount = parseFloat(oh.amount);
          const ohDesc = (oh.description || '').toLowerCase();

          // Amount match
          let amountScore = 0;
          if (bankAmount === ohAmount) {
            amountScore = 1.0;
          } else {
            const diff = Math.abs(bankAmount - ohAmount);
            const pctDiff = diff / Math.max(bankAmount, ohAmount);
            if (pctDiff <= 0.01) amountScore = 0.9;
            else if (pctDiff <= 0.05) amountScore = 0.5;
          }

          if (amountScore === 0) continue;

          // Description match
          let descScore = 0;
          if (ohDesc && bankDesc) {
            if (bankDesc.includes(ohDesc) || ohDesc.includes(bankDesc)) {
              descScore = 0.9;
            } else {
              const ohWords = ohDesc.split(/\s+/).filter(w => w.length > 2);
              const bankWords = bankDesc.split(/\s+/).filter(w => w.length > 2);
              if (ohWords.length > 0 && bankWords.length > 0) {
                const overlap = ohWords.filter(w => bankWords.some(bw => bw.includes(w) || w.includes(bw))).length;
                descScore = (overlap / Math.max(ohWords.length, bankWords.length)) * 0.8;
              }
            }
          } else {
            descScore = 0.2;
          }

          const score = (amountScore * 0.6) + (descScore * 0.4);
          if (score > bestOverheadScore) {
            bestOverheadScore = score;
            bestOverhead = oh;
          }
        }

        if (bestOverheadScore >= 0.85 && bestOverhead) {
          await supabase
            .from('bank_transactions')
            .update({
              match_status: 'created',
              assigned_category: 'overhead',
              overhead_expense_id: bestOverhead.id,
              match_confidence: bestOverheadScore,
              matched_at: new Date().toISOString(),
              matched_by: 'auto',
            })
            .eq('id', bankTx.id);
          autoMatched++;
          overheadMatched = true;
        } else if (bestOverheadScore >= 0.60 && bestOverhead) {
          await supabase
            .from('bank_transactions')
            .update({
              match_status: 'suggested_match',
              assigned_category: 'overhead',
              overhead_expense_id: bestOverhead.id,
              match_confidence: bestOverheadScore,
              matched_by: 'auto',
            })
            .eq('id', bankTx.id);
          suggestedMatch++;
          overheadMatched = true;
        }
      }

      if (!overheadMatched) unmatched++;
    }
  }

  // Create notification if there are unmatched transactions
  const totalUnresolved = unmatched + suggestedMatch;
  if (totalUnresolved > 0) {
    await createReconciliationNotification(userId, unmatched, suggestedMatch, supabase);
  }

  logger.info(`Reconciliation for account ${bankAccountId}: ${autoMatched} auto-matched, ${suggestedMatch} suggested, ${unmatched} unmatched`);

  return { autoMatched, suggestedMatch, unmatched };
}

/**
 * Calculate match score between a bank transaction and a platform transaction.
 *
 * @param {number} bankAmount - Absolute bank transaction amount
 * @param {Date} bankDate - Bank transaction date
 * @param {string} bankDesc - Lowercased bank description/merchant name
 * @param {object} platformTx - Platform project_transaction record
 * @returns {number} Score between 0.0 and 1.0
 */
function calculateMatchScore(bankAmount, bankDate, bankDesc, platformTx) {
  const platformAmount = parseFloat(platformTx.amount);
  const platformDate = new Date(platformTx.date);
  const platformDesc = (platformTx.description || '').toLowerCase();

  // 1. Amount match (weight: 0.4)
  let amountScore = 0;
  if (bankAmount === platformAmount) {
    amountScore = 1.0;
  } else {
    const diff = Math.abs(bankAmount - platformAmount);
    const percentDiff = diff / Math.max(bankAmount, platformAmount);
    if (percentDiff <= 0.01) {
      amountScore = 0.9; // Within 1%
    } else if (percentDiff <= 0.05) {
      amountScore = 0.5; // Within 5%
    } else {
      amountScore = 0; // Too different
    }
  }

  // Short-circuit: if amounts don't match at all, no match possible
  if (amountScore === 0) return 0;

  // 2. Date proximity (weight: 0.3)
  const daysDiff = Math.abs((bankDate - platformDate) / (1000 * 60 * 60 * 24));
  let dateScore = 0;
  if (daysDiff <= 0.5) {
    dateScore = 1.0; // Same day
  } else if (daysDiff <= 1) {
    dateScore = 0.8; // +/- 1 day
  } else if (daysDiff <= 2) {
    dateScore = 0.5; // +/- 2 days
  } else if (daysDiff <= 3) {
    dateScore = 0.2; // +/- 3 days
  }

  // 3. Description similarity (weight: 0.3)
  let descScore = 0;
  if (bankDesc && platformDesc) {
    // Exact substring match
    if (platformDesc.includes(bankDesc) || bankDesc.includes(platformDesc)) {
      descScore = 0.9;
    } else {
      // Word overlap
      const bankWords = bankDesc.split(/\s+/).filter(w => w.length > 2);
      const platformWords = platformDesc.split(/\s+/).filter(w => w.length > 2);

      if (bankWords.length > 0 && platformWords.length > 0) {
        const overlap = bankWords.filter(w =>
          platformWords.some(pw => pw.includes(w) || w.includes(pw))
        ).length;
        const maxWords = Math.max(bankWords.length, platformWords.length);
        descScore = (overlap / maxWords) * 0.8;
      }
    }
  } else {
    // No description to compare, give a small base score if amount+date match well
    descScore = 0.3;
  }

  // Composite score
  return (amountScore * 0.4) + (dateScore * 0.3) + (descScore * 0.3);
}

/**
 * Create a notification for unresolved bank transactions.
 */
async function createReconciliationNotification(userId, unmatchedCount, suggestedCount, supabase) {
  const currentTotal = unmatchedCount + suggestedCount;
  if (currentTotal === 0) return;

  // Find the last acknowledged count from the most recent read notification
  const { data: lastRead } = await supabase
    .from('notifications')
    .select('action_data')
    .eq('user_id', userId)
    .eq('type', 'bank_reconciliation')
    .eq('read', true)
    .order('read_at', { ascending: false })
    .limit(1);

  const acknowledgedCount = lastRead?.[0]?.action_data?.acknowledged_count || 0;
  const newCount = Math.max(0, currentTotal - acknowledgedCount);

  if (newCount === 0) return; // No new transactions since last check

  // Check for existing unread notification to update
  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'bank_reconciliation')
    .eq('read', false)
    .limit(1);

  const title = `${newCount} new transaction${newCount !== 1 ? 's' : ''} need${newCount === 1 ? 's' : ''} attention`;
  const body = buildNotificationBody(unmatchedCount, suggestedCount, newCount);
  const actionData = {
    screen: 'BankReconciliation',
    params: { filter: 'unmatched' },
    current_total: currentTotal,
  };

  if (existing && existing.length > 0) {
    // Update existing unread notification with new count
    await supabase
      .from('notifications')
      .update({ title, body, action_data: actionData })
      .eq('id', existing[0].id);
  } else {
    // Create new notification
    await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        title,
        body,
        type: 'bank_reconciliation',
        icon: 'card',
        color: '#F59E0B',
        action_type: 'navigate',
        action_data: actionData,
      });
  }
}

function buildNotificationBody(unmatchedCount, suggestedCount, newCount) {
  return `${newCount} new since your last review. Tap to review and assign to projects.`;
}

module.exports = { reconcileTransactions, calculateMatchScore };
