/**
 * Plaid Routes
 * Handles bank/card connection, transaction syncing, and reconciliation.
 * Owner-only: Only business owners can connect bank accounts.
 */

const express = require('express');
const router = express.Router();
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { reconcileTransactions } = require('../services/reconciliationService');
const { parseCSV } = require('../services/csvParserService');

// Initialize Plaid (only if keys are configured)
let plaidClient = null;
if (process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET) {
  const config = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || 'sandbox'],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
        'PLAID-SECRET': process.env.PLAID_SECRET,
      },
      timeout: 15000,
    },
  });
  plaidClient = new PlaidApi(config);
}

// Initialize Supabase Admin Client
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);

  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      logger.warn('Auth failed:', error?.message || 'No user found');
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

// Owner-only middleware
const requireOwnerRole = async (req, res, next) => {
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', req.user.id)
      .single();

    if (profile?.role !== 'owner') {
      return res.status(403).json({ error: 'Bank connection is owner-only' });
    }
    next();
  } catch (error) {
    logger.error('Role check error:', error);
    return res.status(500).json({ error: 'Failed to verify role' });
  }
};

// ============================================================
// POST /webhook
// Plaid webhook receiver for real-time sync notifications
// Must be BEFORE auth middleware — called by Plaid servers (no auth token)
// ============================================================
router.post('/webhook', async (req, res) => {
  try {
    const { webhook_type, webhook_code, item_id } = req.body;

    logger.info(`Plaid webhook: ${webhook_type} / ${webhook_code} for item ${item_id}`);

    if (webhook_type === 'TRANSACTIONS') {
      if (webhook_code === 'SYNC_UPDATES_AVAILABLE' || webhook_code === 'DEFAULT_UPDATE') {
        // Find accounts for this item
        const { data: accounts } = await supabaseAdmin
          .from('connected_bank_accounts')
          .select('*')
          .eq('plaid_item_id', item_id)
          .eq('sync_status', 'active');

        if (accounts && accounts.length > 0) {
          for (const account of accounts) {
            try {
              await syncAccountTransactions(account.user_id, account);
            } catch (syncError) {
              logger.error(`Webhook sync failed for account ${account.id}:`, syncError.message);
            }
          }
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Plaid webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Log all incoming Plaid requests for debugging
router.use((req, res, next) => {
  logger.info(`[Plaid] ${req.method} ${req.path} from ${req.ip}`);
  next();
});

// Apply auth + owner check to all routes (below webhook)
router.use(authenticateUser);
router.use(requireOwnerRole);

// Guard middleware: return 503 if Plaid is not configured (except CSV upload)
const requirePlaid = (req, res, next) => {
  if (!plaidClient) {
    return res.status(503).json({ error: 'Plaid is not configured' });
  }
  next();
};

// ============================================================
// POST /create-link-token
// Creates a Plaid Link token for frontend bank connection flow
// ============================================================
router.post('/create-link-token', requirePlaid, async (req, res) => {
  try {
    const userId = req.user.id;
    const start = Date.now();

    logger.info(`Creating Plaid Link token for user ${userId.substring(0, 8)}...`);

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: userId },
      client_name: 'Construction Manager',
      products: ['transactions'],
      country_codes: ['US'],
      language: 'en',
    });

    logger.info(`Plaid Link token created in ${Date.now() - start}ms`);
    res.json({ link_token: response.data.link_token });
  } catch (error) {
    logger.error('Create link token error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create link token' });
  }
});

// ============================================================
// POST /exchange-token
// Exchanges Plaid public_token for access_token after bank connected
// ============================================================
router.post('/exchange-token', requirePlaid, async (req, res) => {
  try {
    const userId = req.user.id;
    const { public_token, metadata } = req.body;

    if (!public_token) {
      return res.status(400).json({ error: 'public_token is required' });
    }

    logger.info(`Exchanging token for user ${userId.substring(0, 8)}...`);

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Get account details
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const accounts = accountsResponse.data.accounts;
    const institution = metadata?.institution;

    // Store each account
    const savedAccounts = [];
    for (const account of accounts) {
      const { data, error } = await supabaseAdmin
        .from('connected_bank_accounts')
        .insert({
          user_id: userId,
          plaid_access_token: accessToken,
          plaid_item_id: itemId,
          plaid_institution_id: institution?.institution_id || null,
          institution_name: institution?.name || 'Unknown Bank',
          account_name: account.name,
          account_mask: account.mask,
          account_type: account.type,
          account_subtype: account.subtype,
          plaid_account_id: account.account_id,
          sync_status: 'active',
        })
        .select()
        .single();

      if (error) {
        logger.error('Error saving account:', error);
      } else {
        savedAccounts.push(data);
      }
    }

    logger.info(`Connected ${savedAccounts.length} accounts for user ${userId.substring(0, 8)}`);

    // Trigger initial sync for each account
    for (const account of savedAccounts) {
      try {
        await syncAccountTransactions(userId, account);
      } catch (syncError) {
        logger.error(`Initial sync failed for account ${account.id}:`, syncError.message);
      }
    }

    res.json({ accounts: savedAccounts });
  } catch (error) {
    logger.error('Exchange token error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to connect bank account' });
  }
});

// ============================================================
// GET /accounts
// List all connected bank accounts for the user
// ============================================================
router.get('/accounts', async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('connected_bank_accounts')
      .select('id, institution_name, account_name, account_mask, account_type, account_subtype, sync_status, last_sync_at, sync_error, is_manual, created_at')
      .eq('user_id', userId)
      .neq('sync_status', 'disconnected')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ accounts: data || [] });
  } catch (error) {
    logger.error('Get accounts error:', error);
    res.status(500).json({ error: 'Failed to get accounts' });
  }
});

// ============================================================
// DELETE /accounts/:accountId
// Disconnect a bank account
// ============================================================
router.delete('/accounts/:accountId', async (req, res) => {
  try {
    const userId = req.user.id;
    const { accountId } = req.params;

    // Get the account to remove Plaid access
    const { data: account } = await supabaseAdmin
      .from('connected_bank_accounts')
      .select('plaid_access_token, plaid_item_id')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Remove Plaid item access (if Plaid-connected)
    if (account.plaid_access_token && plaidClient) {
      try {
        await plaidClient.itemRemove({
          access_token: account.plaid_access_token,
        });
      } catch (plaidError) {
        logger.warn('Plaid item remove warning:', plaidError.message);
      }
    }

    // Soft delete - mark as disconnected
    await supabaseAdmin
      .from('connected_bank_accounts')
      .update({ sync_status: 'disconnected', plaid_access_token: null })
      .eq('id', accountId)
      .eq('user_id', userId);

    logger.info(`Disconnected bank account ${accountId}`);
    res.json({ success: true });
  } catch (error) {
    logger.error('Disconnect account error:', error);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

// ============================================================
// POST /accounts/:accountId/sync
// Trigger manual sync for a specific account
// ============================================================
router.post('/accounts/:accountId/sync', async (req, res) => {
  try {
    const userId = req.user.id;
    const { accountId } = req.params;

    const { data: account } = await supabaseAdmin
      .from('connected_bank_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (account.is_manual) {
      return res.status(400).json({ error: 'Manual accounts cannot be synced. Upload a new CSV instead.' });
    }

    if (!plaidClient) {
      return res.status(503).json({ error: 'Plaid is not configured' });
    }

    const result = await syncAccountTransactions(userId, account);
    res.json(result);
  } catch (error) {
    logger.error('Manual sync error:', error);
    res.status(500).json({ error: 'Failed to sync account' });
  }
});

// ============================================================
// GET /transactions
// Get bank transactions with filters
// ============================================================
router.get('/transactions', async (req, res) => {
  try {
    const userId = req.user.id;
    const { match_status, bank_account_id, start_date, end_date, limit = 50, offset = 0 } = req.query;

    let query = supabaseAdmin
      .from('bank_transactions')
      .select(`
        *,
        matched_transaction:matched_transaction_id (
          id, description, amount, category, project_id,
          project:project_id ( id, name )
        ),
        assigned_project:assigned_project_id ( id, name )
      `)
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    if (match_status) {
      query = query.eq('match_status', match_status);
    }
    if (bank_account_id) {
      query = query.eq('bank_account_id', bank_account_id);
    }
    if (start_date) {
      query = query.gte('date', start_date);
    }
    if (end_date) {
      query = query.lte('date', end_date);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({ transactions: data || [], count });
  } catch (error) {
    logger.error('Get transactions error:', error);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// ============================================================
// PATCH /transactions/:txId/match
// Manually match a bank transaction to a project_transaction
// ============================================================
router.patch('/transactions/:txId/match', async (req, res) => {
  try {
    const userId = req.user.id;
    const { txId } = req.params;
    const { project_transaction_id } = req.body;

    if (!project_transaction_id) {
      return res.status(400).json({ error: 'project_transaction_id is required' });
    }

    // Update bank transaction
    const { data, error } = await supabaseAdmin
      .from('bank_transactions')
      .update({
        match_status: 'manually_matched',
        matched_transaction_id: project_transaction_id,
        match_confidence: 1.0,
        matched_at: new Date().toISOString(),
        matched_by: 'manual',
      })
      .eq('id', txId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    // Update the project_transaction back-reference
    await supabaseAdmin
      .from('project_transactions')
      .update({ bank_transaction_id: txId })
      .eq('id', project_transaction_id);

    logger.info(`Manually matched bank tx ${txId} to project tx ${project_transaction_id}`);
    res.json({ transaction: data });
  } catch (error) {
    logger.error('Match transaction error:', error);
    res.status(500).json({ error: 'Failed to match transaction' });
  }
});

// ============================================================
// PATCH /transactions/:txId/ignore
// Mark a bank transaction as ignored (personal expense, etc.)
// ============================================================
router.patch('/transactions/:txId/ignore', async (req, res) => {
  try {
    const userId = req.user.id;
    const { txId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('bank_transactions')
      .update({
        match_status: 'ignored',
        matched_at: new Date().toISOString(),
        matched_by: 'manual',
      })
      .eq('id', txId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    res.json({ transaction: data });
  } catch (error) {
    logger.error('Ignore transaction error:', error);
    res.status(500).json({ error: 'Failed to ignore transaction' });
  }
});

// ============================================================
// POST /transactions/:txId/assign
// Create a new project_transaction from an unmatched bank transaction
// ============================================================
router.post('/transactions/:txId/assign', async (req, res) => {
  try {
    const userId = req.user.id;
    const { txId } = req.params;
    const { project_id, category, description } = req.body;

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required' });
    }

    // Get the bank transaction
    const { data: bankTx } = await supabaseAdmin
      .from('bank_transactions')
      .select('*')
      .eq('id', txId)
      .eq('user_id', userId)
      .single();

    if (!bankTx) {
      return res.status(404).json({ error: 'Bank transaction not found' });
    }

    // Verify project belongs to user
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, name')
      .eq('id', project_id)
      .eq('user_id', userId)
      .single();

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Create project_transaction from bank transaction
    const txAmount = Math.abs(bankTx.amount);
    const txType = bankTx.amount > 0 ? 'expense' : 'income';

    const { data: projectTx, error: insertError } = await supabaseAdmin
      .from('project_transactions')
      .insert({
        project_id,
        type: txType,
        category: category || bankTx.category || 'misc',
        description: description || bankTx.description,
        amount: txAmount,
        date: bankTx.date,
        payment_method: 'card',
        notes: `Imported from bank statement: ${bankTx.merchant_name || bankTx.description}`,
        created_by: userId,
        bank_transaction_id: txId,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Update bank transaction status
    await supabaseAdmin
      .from('bank_transactions')
      .update({
        match_status: 'created',
        matched_transaction_id: projectTx.id,
        matched_at: new Date().toISOString(),
        matched_by: 'manual',
        assigned_project_id: project_id,
        assigned_category: category || bankTx.category || 'misc',
      })
      .eq('id', txId);

    logger.info(`Assigned bank tx ${txId} to project ${project.name} as ${txType}`);
    res.json({ project_transaction: projectTx, project_name: project.name });
  } catch (error) {
    logger.error('Assign transaction error:', error);
    res.status(500).json({ error: 'Failed to assign transaction' });
  }
});

// ============================================================
// POST /transactions/batch-assign
// Bulk assign multiple unmatched transactions
// ============================================================
router.post('/transactions/batch-assign', async (req, res) => {
  try {
    const userId = req.user.id;
    const { assignments } = req.body;

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: 'assignments array is required' });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const assignment of assignments) {
      try {
        const { bank_transaction_id, project_id, category, description } = assignment;

        // Get bank transaction
        const { data: bankTx } = await supabaseAdmin
          .from('bank_transactions')
          .select('*')
          .eq('id', bank_transaction_id)
          .eq('user_id', userId)
          .single();

        if (!bankTx) {
          errorCount++;
          results.push({ bank_transaction_id, error: 'Not found' });
          continue;
        }

        const txAmount = Math.abs(bankTx.amount);
        const txType = bankTx.amount > 0 ? 'expense' : 'income';

        // Create project_transaction
        const { data: projectTx, error: insertError } = await supabaseAdmin
          .from('project_transactions')
          .insert({
            project_id,
            type: txType,
            category: category || 'misc',
            description: description || bankTx.description,
            amount: txAmount,
            date: bankTx.date,
            payment_method: 'card',
            notes: `Imported from bank statement: ${bankTx.merchant_name || bankTx.description}`,
            created_by: userId,
            bank_transaction_id,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Update bank transaction
        await supabaseAdmin
          .from('bank_transactions')
          .update({
            match_status: 'created',
            matched_transaction_id: projectTx.id,
            matched_at: new Date().toISOString(),
            matched_by: 'manual',
            assigned_project_id: project_id,
            assigned_category: category || 'misc',
          })
          .eq('id', bank_transaction_id);

        successCount++;
        results.push({ bank_transaction_id, project_transaction_id: projectTx.id, success: true });
      } catch (err) {
        errorCount++;
        results.push({ bank_transaction_id: assignment.bank_transaction_id, error: err.message });
      }
    }

    logger.info(`Batch assign: ${successCount} success, ${errorCount} errors`);
    res.json({ results, successCount, errorCount });
  } catch (error) {
    logger.error('Batch assign error:', error);
    res.status(500).json({ error: 'Failed to batch assign transactions' });
  }
});

// ============================================================
// POST /csv-upload
// Parse and import a CSV bank statement
// ============================================================
router.post('/csv-upload', async (req, res) => {
  try {
    const userId = req.user.id;
    const { csv_content, file_name, institution_name } = req.body;

    if (!csv_content) {
      return res.status(400).json({ error: 'csv_content is required' });
    }

    // Parse CSV
    const transactions = parseCSV(csv_content);

    if (transactions.length === 0) {
      return res.status(400).json({ error: 'No valid transactions found in CSV' });
    }

    // Create or find manual bank account
    let { data: account } = await supabaseAdmin
      .from('connected_bank_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_manual', true)
      .eq('institution_name', institution_name || 'CSV Import')
      .eq('sync_status', 'active')
      .single();

    if (!account) {
      const { data: newAccount, error: createError } = await supabaseAdmin
        .from('connected_bank_accounts')
        .insert({
          user_id: userId,
          institution_name: institution_name || 'CSV Import',
          account_name: file_name || 'Uploaded Statement',
          is_manual: true,
          sync_status: 'active',
        })
        .select()
        .single();

      if (createError) throw createError;
      account = newAccount;
    }

    // Create sync log
    const batchId = `csv_${Date.now()}`;
    const { data: syncLog } = await supabaseAdmin
      .from('bank_sync_logs')
      .insert({
        user_id: userId,
        bank_account_id: account.id,
        sync_type: 'csv_import',
        status: 'success',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Insert transactions
    let addedCount = 0;
    for (const tx of transactions) {
      // Check for duplicates (same account, date, amount, description)
      const { data: existing } = await supabaseAdmin
        .from('bank_transactions')
        .select('id')
        .eq('bank_account_id', account.id)
        .eq('date', tx.date)
        .eq('amount', tx.amount)
        .eq('description', tx.description)
        .limit(1);

      if (existing && existing.length > 0) continue;

      const { error: insertError } = await supabaseAdmin
        .from('bank_transactions')
        .insert({
          user_id: userId,
          bank_account_id: account.id,
          amount: tx.amount,
          date: tx.date,
          description: tx.description,
          merchant_name: tx.merchant_name || null,
          category: tx.category || null,
          import_batch_id: batchId,
          match_status: 'unmatched',
        });

      if (!insertError) addedCount++;
    }

    // Run reconciliation
    const reconcileResult = await reconcileTransactions(userId, account.id, supabaseAdmin);

    // Update sync log
    await supabaseAdmin
      .from('bank_sync_logs')
      .update({
        transactions_added: addedCount,
        auto_matched: reconcileResult.autoMatched,
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncLog.id);

    // Update account last_sync_at
    await supabaseAdmin
      .from('connected_bank_accounts')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', account.id);

    logger.info(`CSV import: ${addedCount} transactions added, ${reconcileResult.autoMatched} auto-matched`);

    res.json({
      account_id: account.id,
      transactions_parsed: transactions.length,
      transactions_added: addedCount,
      auto_matched: reconcileResult.autoMatched,
      unmatched: reconcileResult.unmatched,
    });
  } catch (error) {
    logger.error('CSV upload error:', error);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

// ============================================================
// GET /reconciliation-summary
// Dashboard stats: counts by match_status, unmatched total
// ============================================================
router.get('/reconciliation-summary', async (req, res) => {
  try {
    const userId = req.user.id;
    const { start_date, end_date } = req.query;

    let baseQuery = supabaseAdmin
      .from('bank_transactions')
      .select('match_status, amount')
      .eq('user_id', userId);

    if (start_date) baseQuery = baseQuery.gte('date', start_date);
    if (end_date) baseQuery = baseQuery.lte('date', end_date);

    const { data, error } = await baseQuery;
    if (error) throw error;

    const summary = {
      total: data.length,
      auto_matched: 0,
      suggested_match: 0,
      manually_matched: 0,
      unmatched: 0,
      ignored: 0,
      created: 0,
      unmatched_total_amount: 0,
      total_amount: 0,
    };

    for (const tx of data) {
      const absAmount = Math.abs(tx.amount);
      summary.total_amount += absAmount;

      if (tx.match_status === 'unmatched') {
        summary.unmatched++;
        summary.unmatched_total_amount += absAmount;
      } else if (summary[tx.match_status] !== undefined) {
        summary[tx.match_status]++;
      }
    }

    summary.matched_total = summary.auto_matched + summary.manually_matched + summary.created;
    summary.unmatched_total_amount = parseFloat(summary.unmatched_total_amount.toFixed(2));
    summary.total_amount = parseFloat(summary.total_amount.toFixed(2));

    // Get connected accounts count
    const { data: accounts } = await supabaseAdmin
      .from('connected_bank_accounts')
      .select('id')
      .eq('user_id', userId)
      .neq('sync_status', 'disconnected');

    summary.connected_accounts = accounts?.length || 0;

    res.json(summary);
  } catch (error) {
    logger.error('Reconciliation summary error:', error);
    res.status(500).json({ error: 'Failed to get reconciliation summary' });
  }
});

// ============================================================
// INTERNAL: Sync transactions for an account using Plaid API
// ============================================================
async function syncAccountTransactions(userId, account) {
  if (!plaidClient || !account.plaid_access_token) {
    throw new Error('Plaid not configured or no access token');
  }

  const batchId = `plaid_${Date.now()}`;
  let added = 0;
  let updated = 0;
  let removed = 0;
  let hasMore = true;
  let cursor = account.last_sync_cursor || '';

  // Create sync log
  const { data: syncLog } = await supabaseAdmin
    .from('bank_sync_logs')
    .insert({
      user_id: userId,
      bank_account_id: account.id,
      sync_type: 'plaid_sync',
      status: 'success',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  try {
    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: account.plaid_access_token,
        cursor: cursor || undefined,
        count: 500,
      });

      const data = response.data;

      // Process added transactions
      for (const tx of data.added) {
        // Only include transactions for this specific account
        if (tx.account_id !== account.plaid_account_id) continue;

        const { error } = await supabaseAdmin
          .from('bank_transactions')
          .upsert({
            user_id: userId,
            bank_account_id: account.id,
            plaid_transaction_id: tx.transaction_id,
            amount: tx.amount, // Plaid: positive = debit, negative = credit
            date: tx.date,
            description: tx.name || tx.original_description || 'Unknown',
            merchant_name: tx.merchant_name || null,
            category: tx.personal_finance_category?.primary || null,
            is_pending: tx.pending,
            import_batch_id: batchId,
            match_status: 'unmatched',
          }, { onConflict: 'plaid_transaction_id' });

        if (!error) added++;
      }

      // Process modified transactions
      for (const tx of data.modified) {
        if (tx.account_id !== account.plaid_account_id) continue;

        await supabaseAdmin
          .from('bank_transactions')
          .update({
            amount: tx.amount,
            date: tx.date,
            description: tx.name || tx.original_description || 'Unknown',
            merchant_name: tx.merchant_name || null,
            is_pending: tx.pending,
          })
          .eq('plaid_transaction_id', tx.transaction_id);

        updated++;
      }

      // Process removed transactions
      for (const tx of data.removed) {
        await supabaseAdmin
          .from('bank_transactions')
          .delete()
          .eq('plaid_transaction_id', tx.transaction_id);

        removed++;
      }

      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    // Update account sync state
    await supabaseAdmin
      .from('connected_bank_accounts')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_cursor: cursor,
        sync_status: 'active',
        sync_error: null,
      })
      .eq('id', account.id);

    // Run reconciliation
    const reconcileResult = await reconcileTransactions(userId, account.id, supabaseAdmin);

    // Update sync log
    await supabaseAdmin
      .from('bank_sync_logs')
      .update({
        transactions_added: added,
        transactions_updated: updated,
        transactions_removed: removed,
        auto_matched: reconcileResult.autoMatched,
        status: 'success',
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncLog.id);

    logger.info(`Plaid sync for account ${account.id}: +${added} ~${updated} -${removed}, ${reconcileResult.autoMatched} auto-matched`);

    return {
      transactions_added: added,
      transactions_updated: updated,
      transactions_removed: removed,
      auto_matched: reconcileResult.autoMatched,
      unmatched: reconcileResult.unmatched,
    };
  } catch (error) {
    // Update account with error
    await supabaseAdmin
      .from('connected_bank_accounts')
      .update({
        sync_status: 'error',
        sync_error: error.message,
      })
      .eq('id', account.id);

    // Update sync log
    await supabaseAdmin
      .from('bank_sync_logs')
      .update({
        status: 'error',
        error_message: error.message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncLog.id);

    throw error;
  }
}

module.exports = router;
