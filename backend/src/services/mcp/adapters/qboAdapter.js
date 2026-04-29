/**
 * QuickBooks Online adapter — comprehensive read surface.
 *
 * Tools exposed (namespace `qbo__`):
 *
 *   READ — people:
 *     qbo__list_customers                — paginated, with sub-customer flag
 *     qbo__list_vendors                  — paginated, with 1099 flag
 *     qbo__list_employees                — paginated
 *
 *   READ — money:
 *     qbo__list_invoices                 — paginated, with date filter
 *     qbo__list_bills                    — paginated, with date filter
 *     qbo__list_estimates                — paginated
 *     qbo__list_payments                 — paginated, with date filter
 *
 *   READ — catalog & structure:
 *     qbo__list_items                    — services + products + prices
 *     qbo__list_classes                  — often used as project codes
 *     qbo__list_accounts                 — chart of accounts
 *     qbo__list_projects                 — QB's native Projects entity
 *
 *   READ — meta & reports:
 *     qbo__get_company_info              — verify connection
 *     qbo__get_pl_report                 — Profit & Loss for date range
 *     qbo__get_ar_aging                  — current AR aging buckets
 *
 * OAuth: Intuit's standard authorization-code flow. Two extras vs Google:
 *   1. Sandbox vs Production mode — chosen via QBO_ENV env var
 *      ('sandbox' | 'production', defaults to 'sandbox' for safety)
 *   2. realmId (company file ID) is returned as a query param on the
 *      callback redirect — it is NOT in the token payload. We capture it
 *      in `oauthExchangeCode` via the `state` carrying the URL params, then
 *      stash it in credential.metadata.realmId. Every API call needs it.
 *
 * Required env vars:
 *   QBO_OAUTH_CLIENT_ID
 *   QBO_OAUTH_CLIENT_SECRET
 *   QBO_ENV               — 'sandbox' (default) or 'production'
 */

const SCOPES = ['com.intuit.quickbooks.accounting'];

// Intuit OAuth + Discovery endpoints (these are stable across environments).
const AUTH_ENDPOINT = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_ENDPOINT = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const REVOKE_ENDPOINT = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';

// API base URL differs between sandbox and production.
function apiBase() {
  const env = (process.env.QBO_ENV || 'sandbox').toLowerCase();
  return env === 'production'
    ? 'https://quickbooks.api.intuit.com/v3'
    : 'https://sandbox-quickbooks.api.intuit.com/v3';
}

function clientCreds() {
  const id = process.env.QBO_OAUTH_CLIENT_ID;
  const secret = process.env.QBO_OAUTH_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error('QuickBooks OAuth not configured (QBO_OAUTH_CLIENT_ID / QBO_OAUTH_CLIENT_SECRET missing)');
  }
  return { id, secret };
}

// ─────────────────────────────────────────────────────────────────
// Tool definitions (OpenAI function-calling shape)
// ─────────────────────────────────────────────────────────────────

const READ_META = {
  category: 'mcp_qbo',
  risk_level: 'read',
  requires_approval: false,
  model_tier_required: 'any',
  tags: ['mcp', 'qbo', 'accounting'],
};

function readTool(name, description, props = {}, required = []) {
  return {
    type: 'function',
    function: {
      name,
      description,
      parameters: {
        type: 'object',
        properties: props,
        ...(required.length ? { required } : {}),
      },
    },
    metadata: READ_META,
  };
}

const PAGE_PROPS = {
  page: { type: 'integer', description: '1-based page number. Defaults to 1.' },
  page_size: { type: 'integer', description: 'Records per page. Default 100, max 1000.' },
};

const DATE_PROPS = {
  date_from: { type: 'string', description: 'Inclusive lower bound, ISO YYYY-MM-DD. Defaults to 1 year ago.' },
  date_to: { type: 'string', description: 'Inclusive upper bound, ISO YYYY-MM-DD. Defaults to today.' },
};

const TOOLS = [
  readTool(
    'qbo__get_company_info',
    'Return the connected QuickBooks company name, country, and key settings. Use first to confirm the connection works before any imports.'
  ),
  readTool(
    'qbo__list_customers',
    'List QuickBooks Customers (your clients). Returns id, display name, company, email, phone, billing/shipping address, sub-customer flag, parent_id, balance, active flag. Use as the first step of importing clients into our app. Paginated.',
    { ...PAGE_PROPS, active_only: { type: 'boolean', description: 'If true (default), exclude archived customers.' } }
  ),
  readTool(
    'qbo__list_vendors',
    'List QuickBooks Vendors (subcontractors + suppliers). Returns id, display name, company, email, phone, address, 1099 flag, balance, active flag. Filter by 1099 status to import only subcontractors. Paginated.',
    { ...PAGE_PROPS, only_1099: { type: 'boolean', description: 'If true, only return vendors marked as 1099 (typical for subcontractors).' } }
  ),
  readTool(
    'qbo__list_employees',
    'List QuickBooks Employees (W-2). Returns id, display name, email, phone, hire date, billable rate. Useful for importing your in-house workforce. Paginated.',
    { ...PAGE_PROPS }
  ),
  readTool(
    'qbo__list_items',
    'List QuickBooks Items (your services + products). Returns id, name, type (Service/Inventory/NonInventory), unit price, income account, tax. Use to populate your service catalog with the same pricing your CPA already sees. Paginated.',
    { ...PAGE_PROPS, type: { type: 'string', enum: ['Service', 'Inventory', 'NonInventory', 'Category'], description: 'Filter to one item type.' } }
  ),
  readTool(
    'qbo__list_classes',
    'List QuickBooks Classes. Many contractors use Classes as project codes — this is one of three possible mappings to our projects table.',
    { ...PAGE_PROPS }
  ),
  readTool(
    'qbo__list_accounts',
    'List QuickBooks chart of accounts. Used to map QB transactions to our expense categories during invoice/bill import.',
    { ...PAGE_PROPS, account_type: { type: 'string', description: 'Optional QBO account type filter (e.g. Expense, Income, Bank).' } }
  ),
  readTool(
    'qbo__list_projects',
    'List QuickBooks Projects (Intuit\'s native Project entity, distinct from Classes/sub-customers). Modern QB users put project tracking here. Use as one of three project mappings.',
    { ...PAGE_PROPS }
  ),
  readTool(
    'qbo__list_invoices',
    'List QuickBooks Invoices (your billing history). Returns id, doc number, customer, total, balance, due date, status. Paginated. Use for historical AR import + populating our invoices table.',
    { ...PAGE_PROPS, ...DATE_PROPS }
  ),
  readTool(
    'qbo__list_bills',
    'List QuickBooks Bills (vendor invoices you owe). Returns id, vendor, total, balance, due date. Used to import expense history.',
    { ...PAGE_PROPS, ...DATE_PROPS }
  ),
  readTool(
    'qbo__list_estimates',
    'List QuickBooks Estimates (formal quotes). Returns id, doc number, customer, total, status. Useful when migrating in-flight quotes.',
    { ...PAGE_PROPS, ...DATE_PROPS }
  ),
  readTool(
    'qbo__list_payments',
    'List QuickBooks Payments (money received from customers). Returns id, customer, amount, date, deposit_to_account_ref. Used to populate our income transactions.',
    { ...PAGE_PROPS, ...DATE_PROPS }
  ),
  readTool(
    'qbo__get_pl_report',
    'Fetch a QuickBooks Profit & Loss report for a date range. Returns income, expense breakdown, and net. Use to populate the contractor\'s historical P&L on day one.',
    { ...DATE_PROPS, summarize_by: { type: 'string', enum: ['Total', 'Month', 'Quarter', 'Year'], description: 'Time grouping in the report. Default Total.' } }
  ),
  readTool(
    'qbo__get_ar_aging',
    'Fetch QuickBooks A/R Aging Detail report — currently outstanding invoices bucketed by 0-30 / 31-60 / 61-90 / 90+ days overdue. Mirrors what our get_ar_aging tool reports, but for the imported QB data on day one.'
  ),
];

function getTools() {
  return TOOLS;
}

// ─────────────────────────────────────────────────────────────────
// OAuth
// ─────────────────────────────────────────────────────────────────

/**
 * Build the Intuit consent URL. We add `state` as-is; routes/integrations.js
 * uses state to round-trip the userId. Intuit returns realmId on the
 * callback as a separate query param.
 */
async function oauthAuthorizeUrl(state, redirectUri) {
  const { id } = clientCreds();
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Exchange the auth code for tokens. Intuit needs the realmId from the
 * callback URL (passed in via the optional 4th arg) so we stash it in
 * metadata. Our routes/integrations.js needs to be updated to forward
 * the realmId — see the patch in that file.
 */
async function oauthExchangeCode(code, redirectUri, callbackParams = {}) {
  const { id, secret } = clientCreds();
  const basicAuth = Buffer.from(`${id}:${secret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`QBO token exchange failed (${resp.status}): ${text}`);
  }
  const json = await resp.json();
  // realmId comes from the callback URL — Intuit appends it as a query
  // param alongside ?code=...&state=...&realmId=123456789012345.
  const realmId = callbackParams.realmId || callbackParams.realm_id || null;
  if (!realmId) {
    throw new Error('QBO callback missing realmId — verify your OAuth redirect handler passes Intuit query params through.');
  }
  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000).toISOString()
    : null;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || null,
    expiresAt,
    scopes: SCOPES,
    metadata: {
      realmId,
      tokenType: json.token_type || 'Bearer',
      env: (process.env.QBO_ENV || 'sandbox').toLowerCase(),
      x_refresh_token_expires_in: json.x_refresh_token_expires_in || null,
    },
  };
}

async function oauthRefresh(refreshToken) {
  const { id, secret } = clientCreds();
  const basicAuth = Buffer.from(`${id}:${secret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basicAuth}`,
    },
    body: body.toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`QBO token refresh failed (${resp.status}): ${text}`);
  }
  const json = await resp.json();
  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000).toISOString()
    : null;
  return {
    accessToken: json.access_token,
    // Intuit rotates refresh tokens periodically; reuse old when none returned
    refreshToken: json.refresh_token || null,
    expiresAt,
  };
}

// ─────────────────────────────────────────────────────────────────
// Tool dispatcher
// ─────────────────────────────────────────────────────────────────

async function callTool(toolName, args, credential) {
  if (!credential || !credential.accessToken || !credential.metadata?.realmId) {
    return { error: 'Not connected to QuickBooks (missing access token or realmId).' };
  }
  args = args || {};

  switch (toolName) {
    case 'qbo__get_company_info':  return getCompanyInfo(credential);
    case 'qbo__list_customers':    return listEntities(credential, 'Customer', args, mapCustomer, customerWhere(args));
    case 'qbo__list_vendors':      return listEntities(credential, 'Vendor', args, mapVendor, vendorWhere(args));
    case 'qbo__list_employees':    return listEntities(credential, 'Employee', args, mapEmployee);
    case 'qbo__list_items':        return listEntities(credential, 'Item', args, mapItem, itemWhere(args));
    case 'qbo__list_classes':      return listEntities(credential, 'Class', args, mapClass);
    case 'qbo__list_accounts':     return listEntities(credential, 'Account', args, mapAccount, accountWhere(args));
    case 'qbo__list_projects':     return listEntities(credential, 'Project', args, mapProject);
    case 'qbo__list_invoices':     return listEntities(credential, 'Invoice', args, mapInvoice, dateWhere(args, 'TxnDate'));
    case 'qbo__list_bills':        return listEntities(credential, 'Bill', args, mapBill, dateWhere(args, 'TxnDate'));
    case 'qbo__list_estimates':    return listEntities(credential, 'Estimate', args, mapEstimate, dateWhere(args, 'TxnDate'));
    case 'qbo__list_payments':     return listEntities(credential, 'Payment', args, mapPayment, dateWhere(args, 'TxnDate'));
    case 'qbo__get_pl_report':     return getReport(credential, 'ProfitAndLoss', args);
    case 'qbo__get_ar_aging':      return getReport(credential, 'AgedReceivables', args);
    default:
      return { error: `Unknown QBO tool: ${toolName}` };
  }
}

// ─────────────────────────────────────────────────────────────────
// Low-level: query + report + auth helpers
// ─────────────────────────────────────────────────────────────────

function authHeaders(credential) {
  return {
    Authorization: `Bearer ${credential.accessToken}`,
    Accept: 'application/json',
  };
}

function realmUrl(credential, path) {
  return `${apiBase()}/company/${credential.metadata.realmId}${path}`;
}

/**
 * QBO uses a SQL-ish "QBO query language" via /query?query=...&minorversion=...
 * We never accept user-supplied SQL; the WHERE clause is built from typed args.
 */
async function qboQuery(credential, queryString) {
  const url = realmUrl(credential, `/query?query=${encodeURIComponent(queryString)}&minorversion=70`);
  const resp = await fetch(url, { headers: authHeaders(credential) });
  if (!resp.ok) {
    const text = await resp.text();
    if (resp.status === 401) {
      const err = new Error('QBO 401 — token expired');
      err.status = 401;
      throw err;
    }
    throw new Error(`QBO query failed (${resp.status}): ${text.slice(0, 300)}`);
  }
  return resp.json();
}

async function getCompanyInfo(credential) {
  const json = await qboQuery(credential, 'SELECT * FROM CompanyInfo');
  const c = json.QueryResponse?.CompanyInfo?.[0];
  if (!c) return { error: 'Could not load company info' };
  return {
    company_id: credential.metadata.realmId,
    company_name: c.CompanyName,
    legal_name: c.LegalName,
    country: c.Country,
    fiscal_year_start_month: c.FiscalYearStartMonth,
    email: c.Email?.Address,
    phone: c.PrimaryPhone?.FreeFormNumber,
    address: formatQboAddress(c.CompanyAddr),
    env: credential.metadata.env || 'sandbox',
  };
}

/**
 * Generic paginated QBO entity query.
 *  - QBO uses STARTPOSITION (1-based) + MAXRESULTS (max 1000)
 *  - mapFn normalizes a QBO record to our flatter shape
 *  - whereClause is the optional " WHERE Active = true" etc.
 */
async function listEntities(credential, entity, args, mapFn, whereClause = '') {
  const page = clamp(args.page, 1, 9999, 1);
  const pageSize = clamp(args.page_size, 1, 1000, 100);
  const start = (page - 1) * pageSize + 1;
  const q = `SELECT * FROM ${entity}${whereClause ? ' WHERE ' + whereClause : ''} STARTPOSITION ${start} MAXRESULTS ${pageSize}`;
  const json = await qboQuery(credential, q);
  const raw = json.QueryResponse?.[entity] || [];
  const total = json.QueryResponse?.totalCount;
  const results = raw.map(mapFn);
  return {
    entity,
    page,
    page_size: pageSize,
    count: results.length,
    total: typeof total === 'number' ? total : null,
    has_more: results.length === pageSize, // QBO doesn't always return totalCount
    items: results,
  };
}

async function getReport(credential, reportName, args) {
  const params = new URLSearchParams({ minorversion: '70' });
  if (args.date_from) params.append('start_date', args.date_from);
  if (args.date_to) params.append('end_date', args.date_to);
  if (args.summarize_by) params.append('summarize_column_by', args.summarize_by);
  const url = realmUrl(credential, `/reports/${reportName}?${params}`);
  const resp = await fetch(url, { headers: authHeaders(credential) });
  if (!resp.ok) {
    const text = await resp.text();
    return { error: `QBO ${reportName} report failed (${resp.status}): ${text.slice(0, 200)}` };
  }
  const json = await resp.json();
  return {
    report: reportName,
    header: json.Header || null,
    columns: (json.Columns?.Column || []).map((c) => c.ColTitle),
    rows: simplifyReportRows(json.Rows),
  };
}

// Where-clause builders. NEVER concatenate user strings — these only
// accept booleans / known values from typed args.
function customerWhere(args) {
  return args.active_only === false ? '' : 'Active = true';
}
function vendorWhere(args) {
  const parts = ['Active = true'];
  if (args.only_1099 === true) parts.push('Vendor1099 = true');
  return parts.join(' AND ');
}
function itemWhere(args) {
  const parts = ['Active = true'];
  if (args.type) parts.push(`Type = '${args.type.replace(/'/g, "''")}'`);
  return parts.join(' AND ');
}
function accountWhere(args) {
  const parts = ['Active = true'];
  if (args.account_type) parts.push(`AccountType = '${args.account_type.replace(/'/g, "''")}'`);
  return parts.join(' AND ');
}
function dateWhere(args, fieldName) {
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];
  const from = (args.date_from && /^\d{4}-\d{2}-\d{2}$/.test(args.date_from)) ? args.date_from : oneYearAgo;
  const to = (args.date_to && /^\d{4}-\d{2}-\d{2}$/.test(args.date_to)) ? args.date_to : today;
  return `${fieldName} >= '${from}' AND ${fieldName} <= '${to}'`;
}

// ─────────────────────────────────────────────────────────────────
// Mappers — QBO record → our flattened shape
// ─────────────────────────────────────────────────────────────────

function mapCustomer(c) {
  return {
    qbo_id: c.Id,
    display_name: c.DisplayName,
    company_name: c.CompanyName || null,
    given_name: c.GivenName || null,
    family_name: c.FamilyName || null,
    email: c.PrimaryEmailAddr?.Address || null,
    phone: c.PrimaryPhone?.FreeFormNumber || null,
    mobile: c.Mobile?.FreeFormNumber || null,
    billing_address: formatQboAddress(c.BillAddr),
    shipping_address: formatQboAddress(c.ShipAddr),
    is_sub_customer: !!c.Job,
    parent_qbo_id: c.ParentRef?.value || null,
    balance: parseFloat(c.Balance || 0),
    notes: c.Notes || null,
    active: c.Active !== false,
  };
}

function mapVendor(v) {
  return {
    qbo_id: v.Id,
    display_name: v.DisplayName,
    company_name: v.CompanyName || null,
    given_name: v.GivenName || null,
    family_name: v.FamilyName || null,
    email: v.PrimaryEmailAddr?.Address || null,
    phone: v.PrimaryPhone?.FreeFormNumber || null,
    mobile: v.Mobile?.FreeFormNumber || null,
    address: formatQboAddress(v.BillAddr || v.VendorAddr),
    is_1099: !!v.Vendor1099,
    tax_id: v.TaxIdentifier || null,
    balance: parseFloat(v.Balance || 0),
    active: v.Active !== false,
    notes: v.Notes || null,
  };
}

function mapEmployee(e) {
  return {
    qbo_id: e.Id,
    display_name: e.DisplayName,
    given_name: e.GivenName || null,
    family_name: e.FamilyName || null,
    email: e.PrimaryEmailAddr?.Address || null,
    phone: e.PrimaryPhone?.FreeFormNumber || null,
    address: formatQboAddress(e.PrimaryAddr),
    hire_date: e.HiredDate || null,
    billable_rate: parseFloat(e.BillRate || 0),
    active: e.Active !== false,
  };
}

function mapItem(i) {
  return {
    qbo_id: i.Id,
    name: i.Name,
    description: i.Description || null,
    fully_qualified_name: i.FullyQualifiedName || null,
    type: i.Type,                                  // Service / Inventory / NonInventory / Category
    sku: i.Sku || null,
    unit_price: parseFloat(i.UnitPrice || 0),
    purchase_cost: parseFloat(i.PurchaseCost || 0),
    taxable: !!i.Taxable,
    income_account: i.IncomeAccountRef?.name || null,
    expense_account: i.ExpenseAccountRef?.name || null,
    active: i.Active !== false,
  };
}

function mapClass(c) {
  return {
    qbo_id: c.Id,
    name: c.Name,
    fully_qualified_name: c.FullyQualifiedName || null,
    parent_qbo_id: c.ParentRef?.value || null,
    active: c.Active !== false,
  };
}

function mapAccount(a) {
  return {
    qbo_id: a.Id,
    name: a.Name,
    account_type: a.AccountType,
    sub_type: a.AccountSubType,
    classification: a.Classification,
    current_balance: parseFloat(a.CurrentBalance || 0),
    active: a.Active !== false,
  };
}

function mapProject(p) {
  return {
    qbo_id: p.Id,
    name: p.ProjectName || p.DisplayName,
    customer_qbo_id: p.CustomerRef?.value || null,
    customer_name: p.CustomerRef?.name || null,
    status: p.ProjectStatus || null,
    notes: p.Notes || null,
    active: p.Active !== false,
  };
}

function mapInvoice(inv) {
  return {
    qbo_id: inv.Id,
    doc_number: inv.DocNumber || null,
    customer_qbo_id: inv.CustomerRef?.value || null,
    customer_name: inv.CustomerRef?.name || null,
    txn_date: inv.TxnDate || null,
    due_date: inv.DueDate || null,
    total: parseFloat(inv.TotalAmt || 0),
    balance: parseFloat(inv.Balance || 0),
    status: inv.Balance > 0 ? 'unpaid' : 'paid',
    line_count: (inv.Line || []).filter((l) => l.DetailType !== 'SubTotalLineDetail').length,
    private_note: inv.PrivateNote || null,
    customer_memo: inv.CustomerMemo?.value || null,
  };
}

function mapBill(b) {
  return {
    qbo_id: b.Id,
    doc_number: b.DocNumber || null,
    vendor_qbo_id: b.VendorRef?.value || null,
    vendor_name: b.VendorRef?.name || null,
    txn_date: b.TxnDate || null,
    due_date: b.DueDate || null,
    total: parseFloat(b.TotalAmt || 0),
    balance: parseFloat(b.Balance || 0),
    private_note: b.PrivateNote || null,
  };
}

function mapEstimate(e) {
  return {
    qbo_id: e.Id,
    doc_number: e.DocNumber || null,
    customer_qbo_id: e.CustomerRef?.value || null,
    customer_name: e.CustomerRef?.name || null,
    txn_date: e.TxnDate || null,
    expiration_date: e.ExpirationDate || null,
    total: parseFloat(e.TotalAmt || 0),
    status: e.TxnStatus || null,
    customer_memo: e.CustomerMemo?.value || null,
  };
}

function mapPayment(p) {
  return {
    qbo_id: p.Id,
    customer_qbo_id: p.CustomerRef?.value || null,
    customer_name: p.CustomerRef?.name || null,
    txn_date: p.TxnDate || null,
    total: parseFloat(p.TotalAmt || 0),
    payment_ref_num: p.PaymentRefNum || null,
    private_note: p.PrivateNote || null,
  };
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function formatQboAddress(addr) {
  if (!addr) return null;
  const parts = [
    addr.Line1,
    addr.Line2,
    [addr.City, addr.CountrySubDivisionCode, addr.PostalCode].filter(Boolean).join(' '),
    addr.Country,
  ].filter(Boolean);
  return parts.join(', ') || null;
}

/** Flatten a QBO Report Rows tree into a list of {label, values} objects. */
function simplifyReportRows(rows, depth = 0) {
  const out = [];
  if (!rows || !Array.isArray(rows.Row)) return out;
  for (const row of rows.Row) {
    if (row.Header) out.push({ depth, type: 'header', label: row.Header.ColData?.[0]?.value || '' });
    if (row.ColData) {
      out.push({
        depth,
        type: row.type || 'row',
        cells: row.ColData.map((c) => c.value),
      });
    }
    if (row.Rows) {
      out.push(...simplifyReportRows(row.Rows, depth + 1));
    }
    if (row.Summary?.ColData) {
      out.push({
        depth,
        type: 'summary',
        cells: row.Summary.ColData.map((c) => c.value),
      });
    }
  }
  return out;
}

function clamp(n, min, max, def) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

module.exports = {
  type: 'qbo',
  oauth: true,
  getTools,
  callTool,
  oauthAuthorizeUrl,
  oauthExchangeCode,
  oauthRefresh,
};
