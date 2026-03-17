/**
 * Teller Routes
 * Handles bank/card connection, transaction syncing, and reconciliation.
 * Owner-only: Only business owners can connect bank accounts.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const https = require('https');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { reconcileTransactions } = require('../services/reconciliationService');
const { parseCSV } = require('../services/csvParserService');

// Initialize Teller mTLS agent (skip for sandbox — sandbox uses token auth only)
// Supports certs from files (local dev) or base64 env vars (Railway/production)
let tellerAgent = null;
const tellerEnv = process.env.TELLER_ENV || 'sandbox';
if (tellerEnv !== 'sandbox') {
  try {
    let cert, key;

    if (process.env.TELLER_CERT_BASE64 && process.env.TELLER_KEY_BASE64) {
      cert = Buffer.from(process.env.TELLER_CERT_BASE64, 'base64');
      key = Buffer.from(process.env.TELLER_KEY_BASE64, 'base64');
      logger.info('Teller mTLS: loaded certs from base64 env vars');
    } else if (process.env.TELLER_CERT_PATH && process.env.TELLER_KEY_PATH) {
      cert = fs.readFileSync(process.env.TELLER_CERT_PATH);
      key = fs.readFileSync(process.env.TELLER_KEY_PATH);
      logger.info('Teller mTLS: loaded certs from file paths');
    }

    if (cert && key) {
      tellerAgent = new https.Agent({ cert, key });
      logger.info('Teller mTLS agent initialized');
    } else {
      logger.warn('Teller mTLS: no certs found — API calls will fail for non-sandbox env');
    }
  } catch (err) {
    logger.error('Failed to load Teller certificates:', err.message);
  }
}

const TELLER_API_BASE = 'https://api.teller.io';

/**
 * Make an authenticated request to the Teller API.
 * Uses HTTP Basic Auth with access_token as username, empty password.
 */
async function tellerFetch(accessToken, path, method = 'GET') {
  const url = `${TELLER_API_BASE}${path}`;
  const authHeader = 'Basic ' + Buffer.from(`${accessToken}:`).toString('base64');

  const options = {
    method,
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    },
  };

  if (tellerAgent) {
    options.agent = tellerAgent;
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Teller API ${method} ${path} failed: ${response.status} ${errorBody}`);
  }

  if (response.status === 204) return null;
  return response.json();
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
// Teller webhook receiver for real-time sync notifications
// Must be BEFORE auth middleware — called by Teller servers (no auth token)
// ============================================================
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['teller-signature'];
    if (!signature || !process.env.TELLER_SIGNING_SECRET) {
      logger.warn('Teller webhook: missing signature or signing secret');
      return res.status(400).json({ error: 'Missing signature' });
    }

    const parts = {};
    for (const pair of signature.split(',')) {
      const [key, value] = pair.split('=');
      parts[key.trim()] = value.trim();
    }

    const timestamp = parts.t;
    const sig = parts.v1;

    // Reject if timestamp > 3 minutes old
    const age = Math.abs(Date.now() / 1000 - parseInt(timestamp));
    if (age > 180) {
      logger.warn('Teller webhook: timestamp too old');
      return res.status(400).json({ error: 'Timestamp too old' });
    }

    const body = typeof req.body === 'string' ? req.body : req.body.toString('utf8');
    const expectedSig = crypto
      .createHmac('sha256', process.env.TELLER_SIGNING_SECRET)
      .update(`${timestamp}.${body}`)
      .digest('hex');

    if (sig !== expectedSig) {
      logger.warn('Teller webhook: invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(body);
    const { type, payload: eventPayload } = payload;

    logger.info(`Teller webhook: ${type}`);

    if (type === 'transactions.processed') {
      const enrollmentId = eventPayload?.enrollment_id;
      if (enrollmentId) {
        const { data: accounts } = await supabaseAdmin
          .from('connected_bank_accounts')
          .select('*')
          .eq('teller_enrollment_id', enrollmentId)
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
    } else if (type === 'enrollment.disconnected') {
      const enrollmentId = eventPayload?.enrollment_id;
      if (enrollmentId) {
        await supabaseAdmin
          .from('connected_bank_accounts')
          .update({ sync_status: 'error', sync_error: 'Bank disconnected' })
          .eq('teller_enrollment_id', enrollmentId);
        logger.info(`Enrollment ${enrollmentId} marked as disconnected`);
      }
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Teller webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================================
// TELLER CONNECT PAGE (public — opened in Safari, no auth needed)
// ============================================================
const connectSessions = new Map();

router.get('/connect-page/:sessionId', (req, res) => {
  const session = connectSessions.get(req.params.sessionId);
  if (!session) {
    return res.status(404).send(`<!DOCTYPE html><html><head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;color:#666;text-align:center;padding:20px;}</style>
      </head><body><p>Session expired. Please go back to the app and try again.</p></body></html>`);
  }

  const scheme = 'sylk';

  // Override CSP to allow Teller Connect scripts, iframes, and inline JS
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.teller.io; " +
    "frame-src https://teller.io https://*.teller.io; " +
    "style-src 'self' 'unsafe-inline'; " +
    "connect-src *; " +
    "img-src * data:;"
  );
  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; background: #fff; font-family: -apple-system, sans-serif; }
    #launcher {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100%; padding: 32px; text-align: center;
    }
    #launcher h2 { font-size: 22px; color: #1a1a1a; margin-bottom: 12px; }
    #launcher p { font-size: 15px; color: #666; line-height: 1.5; margin-bottom: 32px; max-width: 300px; }
    #openBtn {
      width: 100%; max-width: 320px; padding: 18px 24px;
      background: #1E40AF; color: #fff; border: none; border-radius: 14px;
      font-size: 17px; font-weight: 600; cursor: pointer;
    }
    #openBtn:disabled { background: #93a3c0; }
    #status { margin-top: 16px; font-size: 13px; color: #999; }
  </style>
</head><body>
  <div id="launcher">
    <h2>Connect Your Bank</h2>
    <p>Securely link your bank account to automatically track and match transactions.</p>
    <button id="openBtn" disabled>Loading...</button>
    <div id="status"></div>
  </div>
  <script>
    var btn = document.getElementById('openBtn');
    var status = document.getElementById('status');
    var tc = null;

    function initTeller() {
      if (typeof TellerConnect === 'undefined') {
        status.textContent = "Teller script not available. Retrying...";
        setTimeout(initTeller, 500);
        return;
      }
      try {
        tc = TellerConnect.setup({
          applicationId: "${session.application_id}",
          environment: "${session.environment}",
          products: ["transactions"],
          onSuccess: function(enrollment) {
            status.textContent = "Saving account...";
            btn.disabled = true;
            btn.textContent = "Saving...";
            // Save enrollment server-side, then redirect to app
            fetch("/api/teller/connect-page/${req.params.sessionId}/complete", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                access_token: enrollment.accessToken,
                enrollment: {
                  id: enrollment.enrollment ? enrollment.enrollment.id : "",
                  institution: enrollment.institution || {}
                }
              })
            }).then(function(r) { return r.json(); }).then(function(data) {
              if (data.success) {
                status.textContent = "Connected " + data.accounts + " account(s)! Returning to app...";
                btn.textContent = "Done";
                setTimeout(function() {
                  window.location.href = "${scheme}://teller-callback?type=success";
                }, 1000);
              } else {
                status.textContent = "Server error: " + (data.error || "Unknown error");
                btn.textContent = "Error";
                btn.disabled = false;
              }
            }).catch(function(e) {
              status.textContent = "Network error: " + e.message;
              btn.textContent = "Error";
              btn.disabled = false;
            });
          },
          onExit: function() {
            window.location.href = "${scheme}://teller-callback?type=exit";
          }
        });
        btn.disabled = false;
        btn.textContent = "Connect Bank Account";
        status.textContent = "";
      } catch(e) {
        btn.textContent = "Error";
        status.textContent = "Failed: " + e.message;
      }
    }

    btn.addEventListener('click', function() {
      if (tc) tc.open();
    });

    // Load Teller Connect script dynamically
    var s = document.createElement('script');
    s.src = "https://cdn.teller.io/connect/connect.js";
    s.onload = initTeller;
    s.onerror = function() {
      btn.textContent = "Error";
      status.textContent = "Failed to load Teller Connect script.";
    };
    document.body.appendChild(s);
  </script>
</body></html>`);
});

// POST /connect-page/:sessionId/complete — called from Safari JS after Teller success
// Public route (no auth) but protected by session ID
router.post('/connect-page/:sessionId/complete', express.json(), async (req, res) => {
  const session = connectSessions.get(req.params.sessionId);
  if (!session || !session.user_id) {
    return res.status(404).json({ error: 'Session expired' });
  }

  try {
    const { access_token, enrollment } = req.body;
    if (!access_token || !enrollment) {
      return res.status(400).json({ error: 'Missing access_token or enrollment' });
    }

    const userId = session.user_id;
    logger.info(`[Teller] Saving enrollment for user ${userId.substring(0, 8)} from Safari callback`);

    // Fetch accounts from Teller API
    const accounts = await tellerFetch(access_token, '/accounts');

    const savedAccounts = [];
    for (const account of accounts) {
      const { data, error } = await supabaseAdmin
        .from('connected_bank_accounts')
        .insert({
          user_id: userId,
          teller_access_token: access_token,
          teller_enrollment_id: enrollment.id,
          teller_institution_id: enrollment.institution?.id || null,
          institution_name: enrollment.institution?.name || 'Unknown Bank',
          account_name: account.name,
          account_mask: account.last_four,
          account_type: account.type,
          account_subtype: account.subtype,
          teller_account_id: account.id,
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

    logger.info(`[Teller] Connected ${savedAccounts.length} accounts for user ${userId.substring(0, 8)}`);

    // Trigger initial sync
    for (const account of savedAccounts) {
      try {
        await syncAccountTransactions(userId, account);
      } catch (syncError) {
        logger.error(`Initial sync failed for account ${account.id}:`, syncError.message);
      }
    }

    // Clean up session
    connectSessions.delete(req.params.sessionId);

    res.json({ success: true, accounts: savedAccounts.length });
  } catch (error) {
    logger.error('[Teller] Complete enrollment error:', error.message, error.stack);
    res.status(500).json({ error: error.message || 'Failed to save enrollment' });
  }
});

// Log all incoming Teller requests for debugging
router.use((req, res, next) => {
  logger.info(`[Teller] ${req.method} ${req.path} from ${req.ip}`);
  next();
});

// Apply auth + owner check to all routes (below webhook + connect-page)
router.use(authenticateUser);
router.use(requireOwnerRole);

// ============================================================
// POST /connect-session
// Creates a session for the WebView to load the connect page via URL
// ============================================================
router.post('/connect-session', async (req, res) => {
  try {
    const applicationId = process.env.TELLER_APPLICATION_ID;
    if (!applicationId) {
      return res.status(503).json({ error: 'Teller is not configured' });
    }

    const sessionId = crypto.randomUUID();
    connectSessions.set(sessionId, {
      application_id: applicationId,
      environment: tellerEnv,
      user_id: req.user.id, // Store user ID for server-side enrollment save
    });

    setTimeout(() => connectSessions.delete(sessionId), 10 * 60 * 1000);

    const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : `${req.protocol}://${req.get('host')}`;

    res.json({ url: `${baseUrl}/api/teller/connect-page/${sessionId}` });
  } catch (error) {
    logger.error('Connect session error:', error.message);
    res.status(500).json({ error: 'Failed to create connect session' });
  }
});

// ============================================================
// GET /connect-config
// Returns Teller Connect configuration for frontend WebView
// ============================================================
router.get('/connect-config', async (req, res) => {
  try {
    const applicationId = process.env.TELLER_APPLICATION_ID;
    if (!applicationId) {
      return res.status(503).json({ error: 'Teller is not configured' });
    }

    res.json({
      application_id: applicationId,
      environment: tellerEnv,
    });
  } catch (error) {
    logger.error('Connect config error:', error);
    res.status(500).json({ error: 'Failed to get connect config' });
  }
});

// ============================================================
// POST /save-enrollment
// Saves enrollment data after Teller Connect success
// ============================================================
router.post('/save-enrollment', async (req, res) => {
  try {
    const userId = req.user.id;
    const { access_token, enrollment } = req.body;

    if (!access_token || !enrollment) {
      return res.status(400).json({ error: 'access_token and enrollment are required' });
    }

    logger.info(`Saving enrollment for user ${userId.substring(0, 8)}...`);

    // Fetch accounts from Teller API
    const accounts = await tellerFetch(access_token, '/accounts');

    const savedAccounts = [];
    for (const account of accounts) {
      const { data, error } = await supabaseAdmin
        .from('connected_bank_accounts')
        .insert({
          user_id: userId,
          teller_access_token: access_token,
          teller_enrollment_id: enrollment.id,
          teller_institution_id: enrollment.institution?.id || null,
          institution_name: enrollment.institution?.name || 'Unknown Bank',
          account_name: account.name,
          account_mask: account.last_four,
          account_type: account.type,
          account_subtype: account.subtype,
          teller_account_id: account.id,
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
    logger.error('Save enrollment error:', error.message);
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

    const { data: account } = await supabaseAdmin
      .from('connected_bank_accounts')
      .select('teller_access_token, teller_account_id')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Delete account via Teller API (if Teller-connected)
    if (account.teller_access_token && account.teller_account_id) {
      try {
        await tellerFetch(account.teller_access_token, `/accounts/${account.teller_account_id}`, 'DELETE');
      } catch (tellerError) {
        logger.warn('Teller account delete warning:', tellerError.message);
      }
    }

    // Soft delete - mark as disconnected
    await supabaseAdmin
      .from('connected_bank_accounts')
      .update({ sync_status: 'disconnected', teller_access_token: null })
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

    if (!account.teller_access_token) {
      return res.status(503).json({ error: 'No Teller access token for this account' });
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
// INTERNAL: Sync transactions for an account using Teller API
// ============================================================
async function syncAccountTransactions(userId, account) {
  if (!account.teller_access_token || !account.teller_account_id) {
    throw new Error('No Teller access token or account ID');
  }

  const batchId = `teller_${Date.now()}`;
  let added = 0;
  let updated = 0;

  // Create sync log
  const { data: syncLog } = await supabaseAdmin
    .from('bank_sync_logs')
    .insert({
      user_id: userId,
      bank_account_id: account.id,
      sync_type: 'teller_sync',
      status: 'success',
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  try {
    // Determine start date: last sync or 90 days ago
    const startDate = account.last_sync_date
      || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Paginate through transactions
    let allTransactions = [];
    let fromId = null;
    const pageSize = 250;

    while (true) {
      let path = `/accounts/${account.teller_account_id}/transactions?count=${pageSize}&from_date=${startDate}`;
      if (fromId) {
        path += `&from_id=${fromId}`;
      }

      const transactions = await tellerFetch(account.teller_access_token, path);

      if (!transactions || transactions.length === 0) break;

      allTransactions = allTransactions.concat(transactions);

      if (transactions.length < pageSize) break;

      // Use last transaction ID for next page
      fromId = transactions[transactions.length - 1].id;
    }

    // Upsert transactions
    for (const tx of allTransactions) {
      // Negate Teller amounts: Teller uses negative=debit, positive=credit
      // Our convention: positive=expense (debit), negative=income (credit)
      const amount = -parseFloat(tx.amount);

      const { error } = await supabaseAdmin
        .from('bank_transactions')
        .upsert({
          user_id: userId,
          bank_account_id: account.id,
          teller_transaction_id: tx.id,
          amount: amount,
          date: tx.date,
          description: tx.description || 'Unknown',
          merchant_name: tx.details?.counterparty?.name || null,
          category: tx.details?.category || null,
          is_pending: tx.status === 'pending',
          import_batch_id: batchId,
          match_status: 'unmatched',
        }, { onConflict: 'teller_transaction_id' });

      if (!error) added++;
    }

    // Update account sync state
    const today = new Date().toISOString().split('T')[0];
    await supabaseAdmin
      .from('connected_bank_accounts')
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_date: today,
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
        auto_matched: reconcileResult.autoMatched,
        status: 'success',
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncLog.id);

    logger.info(`Teller sync for account ${account.id}: +${added}, ${reconcileResult.autoMatched} auto-matched`);

    return {
      transactions_added: added,
      transactions_updated: updated,
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
