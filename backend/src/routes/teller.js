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
// TRANSACTION CLASSIFICATION HELPERS
// ============================================================

// ── Classification Pattern Maps ──────────────────────────────
// Each entry: { keywords, type, subcategory, confidence }
// Ordered most-specific → least-specific within each map.

const TRANSFER_PATTERNS = [
  { keywords: ['CREDIT CARD PAYMENT', 'CC PAYMENT', 'CARD PAYMENT', 'CRCARDPMT', 'CARDMEMBER SVCS', 'CARDMEMBER SVC'], type: 'transfer', subcategory: 'credit_card_payment', confidence: 'medium' },
  { keywords: ['WIRE TRANSFER', 'WIRE TFR', 'WIRE IN', 'WIRE OUT', 'DOMESTIC WIRE', 'INTL WIRE', 'INCOMING WIRE', 'OUTGOING WIRE'], type: 'transfer', subcategory: 'wire_transfer', confidence: 'medium' },
  { keywords: ['LOAN PAYMENT', 'LOAN PMT', 'MORTGAGE PMT', 'MTG PMT', 'MORTGAGE', 'STUDENT LOAN', 'AUTO LOAN', 'CAR PAYMENT', 'SBA LOAN'], type: 'transfer', subcategory: 'loan_payment', confidence: 'medium' },
  { keywords: ['ZELLE', 'VENMO', 'PAYPAL', 'CASHAPP', 'CASH APP', 'SQUARE CASH', 'APPLE CASH', 'APPLE PAY CASH'], type: 'transfer', subcategory: 'p2p_transfer', confidence: 'medium' },
  { keywords: ['ACH TRANSFER', 'ACH CREDIT', 'ACH DEBIT', 'ACH PMT', 'ACH PAYMENT', 'AUTOPAY', 'AUTO PAY', 'DIRECT PAY', 'BILL PAY', 'BILLPAY', 'ONLINE PMT', 'ELECTRONIC PMT', 'EPAY'], type: 'transfer', subcategory: 'ach_transfer', confidence: 'medium' },
  { keywords: ['TRANSFER', 'XFER', 'MOBILE TRANSFER', 'SAVINGS TRANSFER', 'CHECKING TRANSFER', 'FUNDS TRANSFER', 'BETWEEN ACCOUNTS'], type: 'transfer', subcategory: 'internal_transfer', confidence: 'medium' },
];

const FEE_PATTERNS = [
  { keywords: ['INTEREST CHARGE', 'LATE FEE', 'ANNUAL FEE', 'FINANCE CHARGE', 'OVERDRAFT FEE', 'OVERDRAFT', 'NSF FEE', 'SERVICE CHARGE', 'MONTHLY FEE', 'MAINTENANCE FEE', 'ATM FEE', 'FOREIGN TRANSACTION FEE', 'WIRE FEE', 'ACCOUNT FEE'], type: 'expense', subcategory: 'bank_fee', confidence: 'high' },
];

const INCOME_PATTERNS = [
  { keywords: ['CLIENT PAYMENT', 'INVOICE PAYMENT', 'CONSTRUCTION PMT'], type: 'income', subcategory: 'contract_payment', confidence: 'medium' },
  { keywords: ['DIRECT DEPOSIT', 'DIRECT DEP', 'DIR DEP', 'PAYCHECK'], type: 'income', subcategory: 'deposit', confidence: 'medium' },
  { keywords: ['RETAINAGE', 'RETENTION RELEASE'], type: 'income', subcategory: 'retainage_release', confidence: 'medium' },
  { keywords: ['REFUND', 'RETURN', 'CASHBACK', 'CASH BACK', 'REVERSAL', 'CREDIT ADJ', 'CREDIT ADJUSTMENT', 'REBATE'], type: 'income', subcategory: 'income_other', confidence: 'medium' },
];

const PAYROLL_PATTERNS = [
  { keywords: ['WORKERS COMP', 'WORK COMP', 'WC PREMIUM'], type: 'expense', subcategory: 'workers_comp', confidence: 'high' },
  { keywords: ['EFTPS', 'IRS', 'STATE TAX', 'FUTA', 'SUTA', 'FICA', '941 TAX'], type: 'expense', subcategory: 'payroll_taxes', confidence: 'high' },
  { keywords: ['ADP', 'GUSTO', 'PAYCHEX', 'PAYLOCITY', 'PAYCOM', 'QUICKBOOKS PAYROLL', 'SQUARE PAYROLL', 'INTUIT PAYROLL', 'RIPPLING', 'JUSTWORKS'], type: 'expense', subcategory: 'wages', confidence: 'high' },
];

const MERCHANT_PATTERNS = [
  // Materials
  { keywords: ['HOME DEPOT', 'LOWES', "LOWE'S", '84 LUMBER', 'MENARDS', 'BUILDERS FIRSTSOURCE', 'ABC SUPPLY', 'BMC STOCK', 'US LBM'], type: 'expense', subcategory: 'lumber', confidence: 'medium' },
  { keywords: ['FERGUSON', 'FERGUSON ENT', 'HAJOCA', 'WINSUPPLY', 'MOORE SUPPLY'], type: 'expense', subcategory: 'plumbing_supplies', confidence: 'medium' },
  { keywords: ['GRAYBAR', 'CED ', 'REXEL', 'ANIXTER', 'ELECTRICAL WHOLESAL'], type: 'expense', subcategory: 'electrical_supplies', confidence: 'medium' },
  { keywords: ['QUIKRETE', 'SAKRETE', 'READY MIX', 'CEMEX', 'VULCAN MATERIALS', 'US CONCRETE'], type: 'expense', subcategory: 'concrete_cement', confidence: 'medium' },
  { keywords: ['ACE HARDWARE', 'TRUE VALUE', 'DO IT BEST', 'HARBOR FREIGHT', 'TRACTOR SUPPLY', 'NORTHERN TOOL'], type: 'expense', subcategory: 'hardware', confidence: 'medium' },
  { keywords: ['SHERWIN WILLIAMS', 'SHERWIN-WILLIAMS', 'BENJAMIN MOORE', 'PPG PAINT', 'BEHR', 'PAINT STORE'], type: 'expense', subcategory: 'paint', confidence: 'medium' },
  { keywords: ['BEACON ROOFING', 'SRS DISTRIBUTION', 'ABC ROOFING', 'ROOF SUPPLY', 'GAF MATERIALS'], type: 'expense', subcategory: 'roofing', confidence: 'medium' },
  { keywords: ['FLOOR & DECOR', 'FLOOR AND DECOR', 'LL FLOORING', 'LUMBER LIQUIDATORS', 'TILE SHOP', 'DALTILE'], type: 'expense', subcategory: 'flooring', confidence: 'medium' },
  { keywords: ['KOHLER', 'MOEN', 'DELTA FAUCET', 'AMERICAN STANDARD', 'SIGNATURE HARDWARE', 'FERGUSON SHOWROOM'], type: 'expense', subcategory: 'fixtures', confidence: 'medium' },
  // Equipment
  { keywords: ['SUNBELT RENTALS', 'UNITED RENTALS', 'HERC RENTALS', 'AHERN RENTALS', 'NEFF RENTALS', 'BLUELINE RENTAL', 'EQUIPMENTSHARE'], type: 'expense', subcategory: 'rental', confidence: 'medium' },
  { keywords: ['SHELL', 'CHEVRON', 'EXXON', 'MOBIL', 'BP ', 'MARATHON', 'WAWA', 'SPEEDWAY', 'PILOT', 'FLYING J', 'RACETRAC', 'QUIKTRIP', 'QT ', 'CIRCLE K', '7-ELEVEN', '7 ELEVEN', 'SHEETZ', "BUCCEES", "BUC-EE", 'CASEY'], type: 'expense', subcategory: 'fuel_gas', confidence: 'medium' },
  { keywords: ['GRAINGER', 'FASTENAL', 'MSC INDUSTRIAL', 'MCMASTER', 'W.W. GRAINGER', 'HILTI', 'DEWALT', 'MILWAUKEE TOOL', 'MAKITA', 'BOSCH TOOLS'], type: 'expense', subcategory: 'small_tools', confidence: 'medium' },
  { keywords: ['CAT EQUIPMENT', 'CATERPILLAR', 'JOHN DEERE', 'KUBOTA', 'BOBCAT', 'CASE EQUIPMENT', 'KOMATSU'], type: 'expense', subcategory: 'purchase', confidence: 'medium' },
  { keywords: ['NAPA AUTO', 'OREILLY', "O'REILLY", 'AUTOZONE', 'ADVANCE AUTO', 'PENSKE', 'RYDER', 'FLEET MAINTENANCE'], type: 'expense', subcategory: 'maintenance_repair', confidence: 'medium' },
  // Misc
  { keywords: ['WASTE MANAGEMENT', 'REPUBLIC SERVICES', 'DUMPSTER', 'BAGSTER', 'JUNK REMOVAL', '1-800-GOT-JUNK', 'DEBRIS BOX'], type: 'expense', subcategory: 'cleanup_disposal', confidence: 'medium' },
  { keywords: ['STAPLES', 'OFFICE DEPOT', 'AMAZON', 'AMZN', 'WALMART', 'TARGET', 'COSTCO', 'SAMS CLUB', "SAM'S CLUB"], type: 'expense', subcategory: 'office_supplies', confidence: 'medium' },
  { keywords: ['PROCORE', 'BUILDERTREND', 'PLANSWIFT', 'BLUEBEAM', 'AUTOCAD', 'AUTODESK'], type: 'expense', subcategory: 'professional_fees', confidence: 'medium' },
  { keywords: ['TOLL', 'E-ZPASS', 'SUNPASS', 'UBER', 'LYFT', 'ENTERPRISE RENT', 'HERTZ', 'AVIS', 'BUDGET RENT'], type: 'expense', subcategory: 'vehicle_transport', confidence: 'medium' },
  { keywords: ['STATE FARM', 'GEICO', 'PROGRESSIVE', 'ALLSTATE', 'LIBERTY MUTUAL', 'NATIONWIDE', 'TRAVELERS', 'HARTFORD', 'NEXT INSURANCE', 'SIMPLY BUSINESS', 'CNA INSURANCE'], type: 'expense', subcategory: 'insurance', confidence: 'medium' },
  // Permits
  { keywords: ['CITY OF', 'COUNTY OF', 'BUILDING DEPT', 'PERMIT', 'CODE ENFORCEMENT'], type: 'expense', subcategory: 'building_permit', confidence: 'medium' },
  { keywords: ['INSPECTION', 'INSPECTOR'], type: 'expense', subcategory: 'inspection_fee', confidence: 'medium' },
];

// Teller's own category → our transaction_type + subcategory mapping.
// These are the 28 categories Teller returns in details.category.
// Only map the ones we can confidently classify.
const TELLER_CATEGORY_MAP = {
  // Clear expenses
  accommodation: { type: 'expense', subcategory: 'misc_other' },
  advertising:   { type: 'expense', subcategory: 'advertising' },
  bar:           { type: 'expense', subcategory: 'misc_other' },
  charity:       { type: 'expense', subcategory: 'misc_other' },
  clothing:      { type: 'expense', subcategory: 'misc_other' },
  dining:        { type: 'expense', subcategory: 'misc_other' },
  education:     { type: 'expense', subcategory: 'professional_fees' },
  electronics:   { type: 'expense', subcategory: 'office_supplies' },
  entertainment: { type: 'expense', subcategory: 'misc_other' },
  fuel:          { type: 'expense', subcategory: 'fuel_gas' },
  groceries:     { type: 'expense', subcategory: 'misc_other' },
  health:        { type: 'expense', subcategory: 'misc_other' },
  home:          { type: 'expense', subcategory: 'hardware' },
  insurance:     { type: 'expense', subcategory: 'insurance' },
  office:        { type: 'expense', subcategory: 'office_supplies' },
  phone:         { type: 'expense', subcategory: 'misc_other' },
  service:       { type: 'expense', subcategory: 'professional_fees' },
  shopping:      { type: 'expense', subcategory: 'misc_other' },
  software:      { type: 'expense', subcategory: 'professional_fees' },
  sport:         { type: 'expense', subcategory: 'misc_other' },
  tax:           { type: 'expense', subcategory: 'payroll_taxes' },
  transport:     { type: 'expense', subcategory: 'vehicle_transport' },
  transportation:{ type: 'expense', subcategory: 'vehicle_transport' },
  utilities:     { type: 'expense', subcategory: 'misc_other' },
  // These need amount-direction context — handled specially in classifyTransaction
  general:       null, // too vague, skip
  income:        { type: 'income', subcategory: 'income_other' },
  investment:    { type: 'transfer', subcategory: 'internal_transfer' },
  loan:          { type: 'transfer', subcategory: 'loan_payment' },
};

/**
 * Match a description against a pattern map.
 * Returns the first matching pattern or null.
 */
function matchPatterns(description, patterns) {
  for (const p of patterns) {
    if (p.keywords.some(kw => description.includes(kw))) return p;
  }
  return null;
}

/**
 * Normalize a transaction description for rule matching.
 * Strips numbers, store IDs, city/state suffixes, and noise.
 */
function normalizeDescription(desc) {
  if (!desc) return '';
  let normalized = desc.toUpperCase();
  // Strip store IDs like #1234
  normalized = normalized.replace(/#\d+/g, '');
  // Strip standalone numbers (amounts, zip codes, etc.)
  normalized = normalized.replace(/\b\d{3,}\b/g, '');
  // Strip common US state abbreviations at end (CITY ST pattern)
  normalized = normalized.replace(/\b[A-Z]{2,}\s+[A-Z]{2}\s*\d*\s*(USA?)?\s*$/i, '');
  // Strip "USA" suffix
  normalized = normalized.replace(/\s+USA?\s*$/i, '');
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

/**
 * Classify a transaction using a 10-level priority chain:
 * 1. User rules (high) → 2. Fees (high) → 3. Payroll (high)
 * 4. Worker name (medium) → 5. Transfers (medium) → 6. Income (medium)
 * 7. Merchants (medium) → 8. Teller category (medium) → 9. Smart amount fallback (low)
 * 10. Unknown (null)
 *
 * @param {string} userId
 * @param {string} description
 * @param {number} amount - positive=expense, negative=income convention
 * @param {string} accountType - 'credit' or 'depository'
 * @param {string[]} connectedInstitutions - owner's connected bank names
 * @param {Array} workers - owner's active workers [{id, full_name}]
 * @param {string|null} tellerCategory - Teller's own category from details.category
 * @returns {{ transaction_type, classification_confidence, subcategory, worker_id? }}
 */
function classifyTransaction(description, amount, accountType, connectedInstitutions, workers, userRules, tellerCategory) {
  const normalizedDesc = normalizeDescription(description);
  const upperDesc = (description || '').toUpperCase();

  // 1. User rules — highest confidence, always wins
  if (userRules && userRules.length > 0) {
    for (const rule of userRules) {
      if (normalizedDesc.includes(rule.description_pattern)) {
        return {
          transaction_type: rule.transaction_type,
          classification_confidence: 'high',
          subcategory: rule.subcategory || null,
        };
      }
    }
  }

  // 2. Fee detection — unambiguous, check before transfers
  const feeMatch = matchPatterns(upperDesc, FEE_PATTERNS);
  if (feeMatch) {
    return { transaction_type: feeMatch.type, classification_confidence: feeMatch.confidence, subcategory: feeMatch.subcategory };
  }

  // 3. Payroll service detection — ADP, Gusto, etc.
  const payrollMatch = matchPatterns(upperDesc, PAYROLL_PATTERNS);
  if (payrollMatch) {
    return { transaction_type: payrollMatch.type, classification_confidence: payrollMatch.confidence, subcategory: payrollMatch.subcategory };
  }

  // 4. Worker name matching — full name first, then first+last initial
  if (workers.length > 0) {
    for (const worker of workers) {
      if (!worker.full_name) continue;
      const nameParts = worker.full_name.toUpperCase().split(/\s+/);

      // Try full name match first (most accurate)
      if (upperDesc.includes(worker.full_name.toUpperCase())) {
        return { transaction_type: 'expense', classification_confidence: 'medium', subcategory: 'wages', worker_id: worker.id };
      }

      // Try first name + last initial (e.g., "CARLOS R" matches "Carlos Rodriguez")
      if (nameParts.length >= 2) {
        const firstName = nameParts[0];
        const lastInitial = nameParts[nameParts.length - 1][0];
        // Only match if first name is 4+ chars to avoid false positives on short names
        if (firstName.length >= 4 && upperDesc.includes(firstName + ' ' + lastInitial)) {
          return { transaction_type: 'expense', classification_confidence: 'medium', subcategory: 'wages', worker_id: worker.id };
        }
      }
    }
  }

  // 5. Transfer detection — keywords + own-account check
  const isOwnAccountTransfer = connectedInstitutions.some(name =>
    upperDesc.includes(name.toUpperCase())
  );
  if (isOwnAccountTransfer) {
    return { transaction_type: 'transfer', classification_confidence: 'medium', subcategory: 'internal_transfer' };
  }

  const transferMatch = matchPatterns(upperDesc, TRANSFER_PATTERNS);
  if (transferMatch) {
    return { transaction_type: transferMatch.type, classification_confidence: transferMatch.confidence, subcategory: transferMatch.subcategory };
  }

  // 6. Income detection
  const incomeMatch = matchPatterns(upperDesc, INCOME_PATTERNS);
  if (incomeMatch) {
    return { transaction_type: incomeMatch.type, classification_confidence: incomeMatch.confidence, subcategory: incomeMatch.subcategory };
  }

  // 7. Merchant/construction detection
  const merchantMatch = matchPatterns(upperDesc, MERCHANT_PATTERNS);
  if (merchantMatch) {
    return { transaction_type: merchantMatch.type, classification_confidence: merchantMatch.confidence, subcategory: merchantMatch.subcategory };
  }

  // 8. Teller category fallback — use Teller's own classification
  if (tellerCategory) {
    const mapped = TELLER_CATEGORY_MAP[tellerCategory.toLowerCase()];
    if (mapped) {
      return { transaction_type: mapped.type, classification_confidence: 'medium', subcategory: mapped.subcategory };
    }
  }

  // 9. Smart amount-direction fallback
  if (accountType === 'credit') {
    if (amount > 0) {
      return { transaction_type: 'expense', classification_confidence: 'low' };
    } else {
      return { transaction_type: 'transfer', classification_confidence: 'low', subcategory: 'credit_card_payment' };
    }
  } else {
    // Depository (checking/savings)
    if (amount > 0) {
      // Money left the account
      const absAmount = Math.abs(amount);
      // Round numbers ending in 00 are more likely transfers/payments than purchases
      if (absAmount >= 500 && absAmount % 100 === 0) {
        return { transaction_type: 'expense', classification_confidence: 'low' };
      }
      return { transaction_type: 'expense', classification_confidence: 'low' };
    } else {
      // Money came in
      const absAmount = Math.abs(amount);
      // Very small credits are likely interest
      if (absAmount < 1) {
        return { transaction_type: 'income', classification_confidence: 'medium', subcategory: 'income_other' };
      }
      // Round amounts coming in are likely client payments
      if (absAmount >= 1000 && absAmount % 100 === 0) {
        return { transaction_type: 'income', classification_confidence: 'low', subcategory: 'contract_payment' };
      }
      return { transaction_type: 'income', classification_confidence: 'low' };
    }
  }
}

/**
 * Auto-split a worker payment across projects based on time tracked.
 * Creates project_transactions for each project proportionally.
 * Returns array of created project_transactions or empty if no hours found.
 */
async function autoSplitWorkerPayment(userId, bankTxId, workerId, workerName, amount, txDate) {
  // Look up worker hours for the 7 days before the transaction
  const fromDate = new Date(txDate);
  fromDate.setDate(fromDate.getDate() - 7);

  const { data: timeEntries } = await supabaseAdmin
    .from('time_tracking')
    .select('project_id, clock_in, clock_out')
    .eq('worker_id', workerId)
    .not('clock_out', 'is', null)
    .gte('clock_in', fromDate.toISOString())
    .lte('clock_in', new Date(txDate).toISOString());

  if (!timeEntries || timeEntries.length === 0) {
    return []; // No hours — leave unmatched for user to assign
  }

  // Calculate hours per project
  const projectHours = {};
  let totalHours = 0;
  for (const entry of timeEntries) {
    const hours = (new Date(entry.clock_out) - new Date(entry.clock_in)) / (1000 * 60 * 60);
    if (hours > 0) {
      projectHours[entry.project_id] = (projectHours[entry.project_id] || 0) + hours;
      totalHours += hours;
    }
  }

  if (totalHours === 0) return [];

  const projectIds = Object.keys(projectHours);
  const absAmount = Math.abs(amount);
  const createdTxs = [];

  // Get project names
  const { data: projects } = await supabaseAdmin
    .from('projects')
    .select('id, name')
    .in('id', projectIds);
  const projectNames = {};
  (projects || []).forEach(p => { projectNames[p.id] = p.name; });

  for (const projectId of projectIds) {
    const proportion = projectHours[projectId] / totalHours;
    const splitAmount = Math.round(absAmount * proportion * 100) / 100;

    const { data: ptx } = await supabaseAdmin
      .from('project_transactions')
      .insert({
        project_id: projectId,
        type: 'expense',
        category: 'labor',
        description: `Payment to ${workerName} - ${projectNames[projectId] || 'Project'}`,
        amount: splitAmount,
        date: txDate,
        worker_id: workerId,
        bank_transaction_id: bankTxId,
        is_auto_generated: true,
        created_by: userId,
        payment_method: 'bank',
      })
      .select()
      .single();

    if (ptx) createdTxs.push(ptx);
  }

  return createdTxs;
}

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
                  id: enrollment.enrollment ? enrollment.enrollment.id : (enrollment.id || ""),
                  institution: enrollment.institution || (enrollment.enrollment ? enrollment.enrollment.institution : {})
                },
                raw_enrollment: enrollment
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
    const { access_token, enrollment, raw_enrollment } = req.body;
    if (!access_token || !enrollment) {
      return res.status(400).json({ error: 'Missing access_token or enrollment' });
    }

    const userId = session.user_id;
    logger.info(`[Teller] Saving enrollment for user ${userId.substring(0, 8)} from Safari callback`);
    logger.info(`[Teller] Raw enrollment data: ${JSON.stringify(raw_enrollment || enrollment)}`);

    // Fetch accounts from Teller API — accounts have institution info
    const accounts = await tellerFetch(access_token, '/accounts');
    logger.info(`[Teller] Fetched ${accounts.length} accounts from Teller API`);

    // Get institution name from enrollment, raw enrollment, or first account
    const institutionName = enrollment.institution?.name
      || raw_enrollment?.institution?.name
      || (accounts[0]?.institution?.name)
      || (accounts[0]?.institution?.id)
      || 'Unknown Bank';

    const institutionId = enrollment.institution?.id
      || raw_enrollment?.institution?.id
      || accounts[0]?.institution?.id
      || null;

    const savedAccounts = [];
    for (const account of accounts) {
      const { data, error } = await supabaseAdmin
        .from('connected_bank_accounts')
        .insert({
          user_id: userId,
          teller_access_token: access_token,
          teller_enrollment_id: enrollment.id,
          teller_institution_id: institutionId,
          institution_name: account.institution?.name || institutionName,
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

    // Don't auto-sync — frontend will trigger sync after user picks import range

    // Clean up session
    connectSessions.delete(req.params.sessionId);

    res.json({ success: true, accounts: savedAccounts.length, accountIds: savedAccounts.map(a => a.id) });
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

    // Delete all transactions for this account
    const { count: deletedCount } = await supabaseAdmin
      .from('bank_transactions')
      .delete({ count: 'exact' })
      .eq('bank_account_id', accountId);

    logger.info(`Deleted ${deletedCount || 0} unmatched transactions for account ${accountId}`);

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
    const { from_date } = req.body || {};

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

    const result = await syncAccountTransactions(userId, account, from_date || null);
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
// PATCH /transactions/:txId/edit
// Edit transaction type, subcategory, notes. Creates learning rule.
// ============================================================
router.patch('/transactions/:txId/edit', async (req, res) => {
  try {
    const userId = req.user.id;
    const { txId } = req.params;
    const { transaction_type, subcategory, notes } = req.body;

    // Build update object with only provided fields
    const updates = {};
    if (transaction_type !== undefined) updates.transaction_type = transaction_type;
    if (subcategory !== undefined) updates.subcategory = subcategory;
    if (notes !== undefined) updates.notes = notes;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // If type was changed, set confidence to high (user-verified)
    if (transaction_type) {
      updates.classification_confidence = 'high';
    }

    const { data: tx, error } = await supabaseAdmin
      .from('bank_transactions')
      .update(updates)
      .eq('id', txId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;

    // Create/update learning rule when type is changed
    if (transaction_type && tx.description) {
      const pattern = normalizeDescription(tx.description);
      if (pattern.length > 2) {
        await supabaseAdmin
          .from('transaction_rules')
          .upsert({
            user_id: userId,
            description_pattern: pattern,
            transaction_type: transaction_type,
            subcategory: subcategory || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id, description_pattern' });
      }
    }

    res.json({ transaction: tx });
  } catch (error) {
    logger.error('Edit transaction error:', error);
    res.status(500).json({ error: 'Failed to edit transaction' });
  }
});

// ============================================================
// PATCH /transactions/bulk-edit
// Bulk update type, subcategory, or assign to project
// ============================================================
router.patch('/transactions/bulk-edit', async (req, res) => {
  try {
    const userId = req.user.id;
    const { transaction_ids, transaction_type, subcategory, project_id, action } = req.body;

    if (!transaction_ids || !Array.isArray(transaction_ids) || transaction_ids.length === 0) {
      return res.status(400).json({ error: 'transaction_ids array required' });
    }

    if (action === 'reclassify' && !transaction_type) {
      return res.status(400).json({ error: 'transaction_type required for reclassify' });
    }

    let updated = 0;

    if (action === 'reclassify') {
      const updates = { transaction_type, classification_confidence: 'high' };
      if (subcategory !== undefined) updates.subcategory = subcategory;

      const { data, error } = await supabaseAdmin
        .from('bank_transactions')
        .update(updates)
        .in('id', transaction_ids)
        .eq('user_id', userId)
        .select('id, description');

      if (error) throw error;
      updated = data?.length || 0;

      // Create learning rules for each unique description
      if (data) {
        const seenPatterns = new Set();
        for (const tx of data) {
          const pattern = normalizeDescription(tx.description);
          if (pattern.length > 2 && !seenPatterns.has(pattern)) {
            seenPatterns.add(pattern);
            await supabaseAdmin
              .from('transaction_rules')
              .upsert({
                user_id: userId,
                description_pattern: pattern,
                transaction_type,
                subcategory: subcategory || null,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'user_id, description_pattern' });
          }
        }
      }
    } else if (action === 'ignore') {
      const { error } = await supabaseAdmin
        .from('bank_transactions')
        .update({ match_status: 'ignored' })
        .in('id', transaction_ids)
        .eq('user_id', userId);

      if (error) throw error;
      updated = transaction_ids.length;
    }

    res.json({ updated });
  } catch (error) {
    logger.error('Bulk edit error:', error);
    res.status(500).json({ error: 'Failed to bulk edit transactions' });
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
    // Use classified transaction_type, fallback to amount-based logic
    const txType = bankTx.transaction_type === 'transfer' ? 'expense'
      : bankTx.transaction_type || (bankTx.amount > 0 ? 'expense' : 'income');

    const { data: projectTx, error: insertError } = await supabaseAdmin
      .from('project_transactions')
      .insert({
        project_id,
        type: txType,
        category: category || bankTx.subcategory || bankTx.category || 'misc',
        description: description || bankTx.description,
        amount: txAmount,
        date: bankTx.date,
        payment_method: 'card',
        notes: bankTx.notes || `Imported from bank statement: ${bankTx.merchant_name || bankTx.description}`,
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
      .select('match_status, amount, transaction_type')
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
      const isTransfer = tx.transaction_type === 'transfer';

      // Exclude transfers from totals — they're not real expenses/income
      if (!isTransfer) {
        summary.total_amount += absAmount;
      }

      if (tx.match_status === 'unmatched') {
        summary.unmatched++;
        // Only count expenses in unrecorded amount (not transfers)
        if (!isTransfer) {
          summary.unmatched_total_amount += absAmount;
        }
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
async function syncAccountTransactions(userId, account, overrideFromDate = null) {
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
    // Determine start date: override (initial import range) > last sync > today
    const startDate = overrideFromDate
      || account.last_sync_date
      || new Date().toISOString().split('T')[0];

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

    // Get owner's connected institution names for transfer detection
    const { data: ownerAccounts } = await supabaseAdmin
      .from('connected_bank_accounts')
      .select('institution_name')
      .eq('user_id', userId);
    const connectedInstitutions = (ownerAccounts || []).map(a => a.institution_name).filter(Boolean);

    // Get owner's active workers for worker payment detection
    const { data: ownerWorkers } = await supabaseAdmin
      .from('workers')
      .select('id, full_name')
      .eq('owner_id', userId)
      .eq('status', 'active');
    const workers = ownerWorkers || [];

    // Load user rules ONCE for the entire batch (not per-transaction)
    const { data: userRules } = await supabaseAdmin
      .from('transaction_rules')
      .select('description_pattern, transaction_type, subcategory')
      .eq('user_id', userId);

    // Upsert transactions with classification
    const workerPayments = []; // Track for auto-split after upsert
    for (const tx of allTransactions) {
      // Convert Teller amounts to our convention (positive=expense, negative=income)
      const rawAmount = parseFloat(tx.amount);
      const amount = account.account_type === 'credit' ? rawAmount : -rawAmount;

      // Classify transaction (pass Teller's own category as fallback)
      const tellerCategory = tx.details?.category || null;
      const classification = classifyTransaction(
        tx.description, amount, account.account_type, connectedInstitutions, workers, userRules || [], tellerCategory
      );

      const { data: upserted, error } = await supabaseAdmin
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
          transaction_type: classification.transaction_type,
          classification_confidence: classification.classification_confidence,
          subcategory: classification.subcategory || tx.details?.category || null,
          worker_id: classification.worker_id || null,
        }, { onConflict: 'teller_transaction_id' })
        .select('id')
        .single();

      if (!error) {
        added++;
        // Queue worker payment for auto-split
        if (classification.worker_id && upserted) {
          const worker = workers.find(w => w.id === classification.worker_id);
          workerPayments.push({
            bankTxId: upserted.id,
            workerId: classification.worker_id,
            workerName: worker?.full_name || 'Worker',
            amount: amount,
            date: tx.date,
          });
        }
      }
    }

    // Auto-split worker payments across projects by hours
    for (const wp of workerPayments) {
      try {
        const splits = await autoSplitWorkerPayment(userId, wp.bankTxId, wp.workerId, wp.workerName, wp.amount, wp.date);
        if (splits.length > 0) {
          // Mark bank transaction as created (assigned)
          await supabaseAdmin
            .from('bank_transactions')
            .update({
              match_status: 'created',
              assigned_project_id: splits[0].project_id,
              assigned_category: 'labor',
            })
            .eq('id', wp.bankTxId);
          logger.info(`Auto-split worker payment for ${wp.workerName}: ${splits.length} projects`);
        }
      } catch (splitError) {
        logger.warn(`Worker payment auto-split failed for ${wp.workerName}:`, splitError.message);
      }
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
    // Clean up error message for display
    const isExpired = error.message?.includes('not_found') || error.message?.includes('404') || error.message?.includes('unauthorized') || error.message?.includes('401');
    const displayError = isExpired
      ? 'Connection expired. Please disconnect and reconnect this account.'
      : error.message;

    // Update account with error
    await supabaseAdmin
      .from('connected_bank_accounts')
      .update({
        sync_status: 'error',
        sync_error: displayError,
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
