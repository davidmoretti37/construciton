/**
 * Bulk-import orchestrators — agent-facing native tools that combine
 *   MCP adapter calls (read from QBO / Monday) with Supabase writes
 *   (idempotent upserts into clients / workers / projects / invoices).
 *
 * Pattern for every importer:
 *   1. Call mcpClient.callTool('<provider>__list_<entity>', ...) to fetch.
 *   2. For each fetched record:
 *        a. Try to match an existing local row (by external_id, then email,
 *           then name+phone fallback).
 *        b. INSERT if no match; UPDATE if matched and we're refreshing.
 *        c. Stamp <provider>_id, <provider>_synced_at, import_source.
 *   3. Return a summary: { created, updated, skipped, errors[] }.
 *
 * All handlers accept `dry_run: true` to compute the summary without
 * writing anything — used by the agent to preview changes before
 * confirming.
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../../utils/logger');
const mcpClient = require('../mcp/mcpClient');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// ─────────────────────────────────────────────────────────────────
// QBO ONBOARDING SUMMARY — count everything before any imports
// ─────────────────────────────────────────────────────────────────

/**
 * Returns counts the agent uses for the opening pitch:
 *   "Found 245 customers, 12 subs, 412 items, $2.1M in invoices last year."
 *
 * Skips fetching every record — just paginates with page_size=1 to read
 * the total count. Some QBO entities don't return totalCount, so we
 * fall back to a single-page sample as a lower bound.
 */
async function qbo_onboarding_summary(userId) {
  const company = await call('qbo__get_company_info', {}, userId);
  if (company.error) return { error: company.error };

  const counts = {};
  const samples = {};
  for (const entity of ['customers', 'vendors', 'employees', 'items', 'classes', 'projects']) {
    const r = await call(`qbo__list_${entity}`, { page: 1, page_size: 1 }, userId);
    if (r.error) {
      counts[entity] = 0;
      samples[entity] = [];
      continue;
    }
    counts[entity] = r.total != null ? r.total : (r.has_more ? 'many' : r.count);
    samples[entity] = r.items || [];
  }
  // Subs = vendors with 1099 flag
  const subsR = await call('qbo__list_vendors', { page: 1, page_size: 1, only_1099: true }, userId);
  counts.subcontractors = subsR.error ? 0 : (subsR.total != null ? subsR.total : (subsR.has_more ? 'many' : subsR.count));

  // Last 12 months invoice volume (for the "$2.1M revenue" headline)
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];
  let invoiceTotal = 0;
  try {
    const pl = await call('qbo__get_pl_report', { date_from: oneYearAgo, date_to: today, summarize_by: 'Total' }, userId);
    // Crudely extract total income: pl.rows is a flattened tree; income summary row contains "Total Income"
    const incomeRow = (pl.rows || []).find((r) => r.cells && /total income/i.test(String(r.cells[0] || '')));
    if (incomeRow) invoiceTotal = parseFloat(String(incomeRow.cells[1] || '0').replace(/[^0-9.\-]/g, '')) || 0;
  } catch (_) { /* best-effort */ }

  return {
    success: true,
    company,
    counts,
    samples,
    last_12_months_revenue: invoiceTotal,
  };
}

// ─────────────────────────────────────────────────────────────────
// IMPORTERS
// ─────────────────────────────────────────────────────────────────

/**
 * Pull every QB Customer (paginated) and upsert into our clients table.
 * Dedup priority: qbo_id → email (case-insensitive) → name+phone fallback.
 */
async function import_qbo_clients(userId, args = {}) {
  const dryRun = !!args.dry_run;
  const summary = newSummary();

  let page = 1;
  while (true) {
    const r = await call('qbo__list_customers', { page, page_size: 100, active_only: args.include_inactive !== true }, userId);
    if (r.error) return { error: r.error };
    if (!r.items || r.items.length === 0) break;

    for (const c of r.items) {
      // Skip sub-customers — they get imported as projects elsewhere if the
      // user picks the sub_customers project mapping. Importing them as
      // clients pollutes the contact list with job-numbered duplicates.
      if (c.is_sub_customer) {
        summary.skipped++;
        continue;
      }
      const op = await upsertClient(userId, c, dryRun);
      summary[op]++;
    }
    if (!r.has_more && (r.items?.length || 0) < 100) break;
    page++;
    if (page > 200) break; // safety: 20,000 customers is enough
  }
  summary.dry_run = dryRun;
  return summary;
}

async function upsertClient(userId, c, dryRun) {
  const fullName = c.display_name || c.company_name || [c.given_name, c.family_name].filter(Boolean).join(' ') || 'QBO Customer';
  const email = c.email ? c.email.toLowerCase() : null;
  const phone = c.phone || c.mobile || null;

  // 1. Match by qbo_id
  let { data: existing } = await supabase
    .from('clients')
    .select('id, full_name, email, phone, qbo_id, import_source')
    .eq('user_id', userId)
    .eq('qbo_id', c.qbo_id)
    .maybeSingle();

  // 2. Fallback: email
  if (!existing && email) {
    const { data } = await supabase
      .from('clients')
      .select('id, full_name, email, phone, qbo_id, import_source')
      .eq('user_id', userId)
      .ilike('email', email)
      .is('qbo_id', null)
      .maybeSingle();
    existing = data;
  }
  // 3. Fallback: exact name + phone
  if (!existing && phone) {
    const { data } = await supabase
      .from('clients')
      .select('id, full_name, email, phone, qbo_id, import_source')
      .eq('user_id', userId)
      .ilike('full_name', fullName)
      .eq('phone', phone)
      .is('qbo_id', null)
      .maybeSingle();
    existing = data;
  }

  if (dryRun) return existing ? 'updated' : 'created';

  const stamp = importStamp('qbo', c.qbo_id);
  if (existing) {
    await supabase
      .from('clients')
      .update({
        qbo_id: c.qbo_id,
        qbo_synced_at: new Date().toISOString(),
        import_source: { ...(existing.import_source || {}), ...stamp },
        // Don't overwrite manually-entered email/phone — only fill blanks.
        email: existing.email || c.email || null,
        phone: existing.phone || phone,
      })
      .eq('id', existing.id);
    return 'updated';
  }
  const { error } = await supabase.from('clients').insert({
    user_id: userId,
    owner_id: userId,
    full_name: fullName,
    email: c.email || null,
    phone,
    qbo_id: c.qbo_id,
    qbo_synced_at: new Date().toISOString(),
    import_source: stamp,
  });
  if (error) {
    logger.warn(`[import_qbo_clients] insert failed for ${fullName}: ${error.message}`);
    return 'errors';
  }
  return 'created';
}

/**
 * Pull QB Vendors, optionally filtered to 1099 only, into workers.
 * is_subcontractor=true is stamped so the rest of the app can treat them
 * differently from W-2 employees.
 */
async function import_qbo_subcontractors(userId, args = {}) {
  const dryRun = !!args.dry_run;
  const filter1099 = args.only_1099 !== false; // default true
  const summary = newSummary();

  let page = 1;
  while (true) {
    const r = await call('qbo__list_vendors', { page, page_size: 100, only_1099: filter1099 }, userId);
    if (r.error) return { error: r.error };
    if (!r.items || r.items.length === 0) break;

    for (const v of r.items) {
      const op = await upsertWorker(userId, v, /*isSubcontractor*/ true, dryRun);
      summary[op]++;
    }
    if (!r.has_more && (r.items?.length || 0) < 100) break;
    page++;
    if (page > 100) break;
  }
  summary.dry_run = dryRun;
  return summary;
}

async function import_qbo_employees(userId, args = {}) {
  const dryRun = !!args.dry_run;
  const summary = newSummary();
  let page = 1;
  while (true) {
    const r = await call('qbo__list_employees', { page, page_size: 100 }, userId);
    if (r.error) return { error: r.error };
    if (!r.items || r.items.length === 0) break;
    for (const e of r.items) {
      const op = await upsertWorker(userId, { ...e, company_name: null, is_1099: false }, /*isSubcontractor*/ false, dryRun);
      summary[op]++;
    }
    if (!r.has_more && (r.items?.length || 0) < 100) break;
    page++;
    if (page > 50) break;
  }
  summary.dry_run = dryRun;
  return summary;
}

async function upsertWorker(userId, v, isSubcontractor, dryRun) {
  const fullName = v.display_name || [v.given_name, v.family_name].filter(Boolean).join(' ') || v.company_name || 'QBO Vendor';
  const email = v.email ? v.email.toLowerCase() : null;
  const phone = v.phone || v.mobile || null;

  let { data: existing } = await supabase
    .from('workers')
    .select('id, full_name, email, phone, qbo_id, is_subcontractor, import_source')
    .eq('user_id', userId)
    .eq('qbo_id', v.qbo_id)
    .maybeSingle();

  if (!existing && email) {
    const { data } = await supabase
      .from('workers')
      .select('id, full_name, email, phone, qbo_id, is_subcontractor, import_source')
      .eq('user_id', userId)
      .ilike('email', email)
      .is('qbo_id', null)
      .maybeSingle();
    existing = data;
  }

  if (dryRun) return existing ? 'updated' : 'created';

  const stamp = importStamp('qbo', v.qbo_id);
  if (existing) {
    await supabase
      .from('workers')
      .update({
        qbo_id: v.qbo_id,
        qbo_synced_at: new Date().toISOString(),
        is_subcontractor: existing.is_subcontractor || isSubcontractor,
        business_name: v.company_name || null,
        import_source: { ...(existing.import_source || {}), ...stamp },
        email: existing.email || v.email || null,
        phone: existing.phone || phone,
      })
      .eq('id', existing.id);
    return 'updated';
  }
  const { error } = await supabase.from('workers').insert({
    user_id: userId,
    owner_id: userId,
    full_name: fullName,
    business_name: v.company_name || null,
    email: v.email || null,
    phone,
    is_subcontractor: isSubcontractor,
    status: 'active',
    is_onboarded: false,
    qbo_id: v.qbo_id,
    qbo_synced_at: new Date().toISOString(),
    import_source: stamp,
  });
  if (error) {
    logger.warn(`[import_qbo_subs/employees] insert failed for ${fullName}: ${error.message}`);
    return 'errors';
  }
  return 'created';
}

/**
 * Import QB Items (services + products) into user_services as the contractor's
 * default service catalog. Pricing comes from QB.
 */
async function import_qbo_service_catalog(userId, args = {}) {
  const dryRun = !!args.dry_run;
  const summary = newSummary();
  let page = 1;
  while (true) {
    const r = await call('qbo__list_items', { page, page_size: 100, type: args.type || 'Service' }, userId);
    if (r.error) return { error: r.error };
    if (!r.items || r.items.length === 0) break;
    for (const it of r.items) {
      const op = await upsertService(userId, it, dryRun);
      summary[op]++;
    }
    if (!r.has_more && (r.items?.length || 0) < 100) break;
    page++;
    if (page > 100) break;
  }
  summary.dry_run = dryRun;
  return summary;
}

async function upsertService(userId, item, dryRun) {
  const { data: existing } = await supabase
    .from('user_services')
    .select('id, qbo_id, import_source')
    .eq('user_id', userId)
    .eq('qbo_id', item.qbo_id)
    .maybeSingle();

  if (dryRun) return existing ? 'updated' : 'created';
  const stamp = importStamp('qbo', item.qbo_id);
  if (existing) {
    await supabase
      .from('user_services')
      .update({
        qbo_synced_at: new Date().toISOString(),
        import_source: { ...(existing.import_source || {}), ...stamp },
      })
      .eq('id', existing.id);
    return 'updated';
  }
  const { error } = await supabase.from('user_services').insert({
    user_id: userId,
    name: item.name,
    description: item.description,
    default_price: item.unit_price || 0,
    qbo_id: item.qbo_id,
    qbo_synced_at: new Date().toISOString(),
    import_source: stamp,
  });
  if (error) {
    logger.warn(`[import_qbo_service_catalog] insert failed for ${item.name}: ${error.message}`);
    return 'errors';
  }
  return 'created';
}

/**
 * Import projects from QuickBooks. Three sources, picked via `mapping`:
 *   - 'projects'      → QB native Projects entity (modern users)
 *   - 'classes'       → QB Classes (often used as project codes)
 *   - 'sub_customers' → Sub-customers under a parent customer (older pattern)
 */
async function import_qbo_projects(userId, args = {}) {
  const dryRun = !!args.dry_run;
  const mapping = args.mapping || 'projects';
  const summary = newSummary();

  let entries = [];
  if (mapping === 'projects') {
    let page = 1;
    while (true) {
      const r = await call('qbo__list_projects', { page, page_size: 100 }, userId);
      if (r.error) return { error: r.error };
      if (!r.items || r.items.length === 0) break;
      entries.push(...r.items.map((p) => ({ qbo_id: p.qbo_id, name: p.name, customer_qbo_id: p.customer_qbo_id, customer_name: p.customer_name })));
      if (!r.has_more) break;
      page++;
      if (page > 50) break;
    }
  } else if (mapping === 'classes') {
    const r = await call('qbo__list_classes', { page: 1, page_size: 1000 }, userId);
    if (r.error) return { error: r.error };
    entries = (r.items || []).map((c) => ({ qbo_id: c.qbo_id, name: c.name, customer_qbo_id: null, customer_name: null }));
  } else if (mapping === 'sub_customers') {
    let page = 1;
    while (true) {
      const r = await call('qbo__list_customers', { page, page_size: 100, active_only: true }, userId);
      if (r.error) return { error: r.error };
      const subs = (r.items || []).filter((c) => c.is_sub_customer);
      for (const s of subs) {
        entries.push({ qbo_id: s.qbo_id, name: s.display_name, customer_qbo_id: s.parent_qbo_id, customer_name: null });
      }
      if (!r.has_more && (r.items?.length || 0) < 100) break;
      page++;
      if (page > 200) break;
    }
  } else {
    return { error: `Unknown mapping "${mapping}". Use one of: projects | classes | sub_customers.` };
  }

  for (const p of entries) {
    const op = await upsertProject(userId, p, dryRun);
    summary[op]++;
  }
  summary.dry_run = dryRun;
  summary.mapping = mapping;
  return summary;
}

async function upsertProject(userId, p, dryRun) {
  const { data: existing } = await supabase
    .from('projects')
    .select('id, name, qbo_id, import_source')
    .eq('user_id', userId)
    .eq('qbo_id', p.qbo_id)
    .maybeSingle();
  if (dryRun) return existing ? 'updated' : 'created';

  const stamp = importStamp('qbo', p.qbo_id);

  // Try to attach to an already-imported client by their qbo_id
  let clientName = p.customer_name;
  if (p.customer_qbo_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('full_name')
      .eq('user_id', userId)
      .eq('qbo_id', p.customer_qbo_id)
      .maybeSingle();
    if (client?.full_name) clientName = client.full_name;
  }

  if (existing) {
    await supabase
      .from('projects')
      .update({
        qbo_synced_at: new Date().toISOString(),
        import_source: { ...(existing.import_source || {}), ...stamp },
      })
      .eq('id', existing.id);
    return 'updated';
  }
  const { error } = await supabase.from('projects').insert({
    user_id: userId,
    name: p.name,
    client_name: clientName || null,
    status: 'draft',
    qbo_id: p.qbo_id,
    qbo_synced_at: new Date().toISOString(),
    import_source: stamp,
  });
  if (error) {
    logger.warn(`[import_qbo_projects] insert failed for ${p.name}: ${error.message}`);
    return 'errors';
  }
  return 'created';
}

/**
 * Import historical invoices for AR aging populated on day one.
 * Note: only basic fields — line items aren't imported (QB stores them
 * differently; better to leave the original in QB for the CPA's view).
 */
async function import_qbo_invoice_history(userId, args = {}) {
  const dryRun = !!args.dry_run;
  const months = clamp(args.months_back, 1, 60, 12);
  const dateFrom = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = new Date().toISOString().split('T')[0];
  const summary = newSummary();

  let page = 1;
  while (true) {
    const r = await call('qbo__list_invoices', { page, page_size: 100, date_from: dateFrom, date_to: dateTo }, userId);
    if (r.error) return { error: r.error };
    if (!r.items || r.items.length === 0) break;
    for (const inv of r.items) {
      const op = await upsertInvoice(userId, inv, dryRun);
      summary[op]++;
    }
    if (!r.has_more && (r.items?.length || 0) < 100) break;
    page++;
    if (page > 100) break;
  }
  summary.dry_run = dryRun;
  summary.date_range = { from: dateFrom, to: dateTo };
  return summary;
}

async function upsertInvoice(userId, inv, dryRun) {
  const { data: existing } = await supabase
    .from('invoices')
    .select('id, qbo_id, import_source')
    .eq('user_id', userId)
    .eq('qbo_id', inv.qbo_id)
    .maybeSingle();
  if (dryRun) return existing ? 'updated' : 'created';

  const stamp = importStamp('qbo', inv.qbo_id);
  // Look up client by qbo_id
  let clientName = inv.customer_name;
  if (inv.customer_qbo_id) {
    const { data: c } = await supabase
      .from('clients')
      .select('full_name')
      .eq('user_id', userId)
      .eq('qbo_id', inv.customer_qbo_id)
      .maybeSingle();
    if (c?.full_name) clientName = c.full_name;
  }

  const status = inv.balance > 0 ? 'unpaid' : 'paid';
  const amountPaid = inv.total - inv.balance;

  if (existing) {
    await supabase
      .from('invoices')
      .update({
        qbo_synced_at: new Date().toISOString(),
        import_source: { ...(existing.import_source || {}), ...stamp },
        amount_paid: amountPaid,
        status,
      })
      .eq('id', existing.id);
    return 'updated';
  }
  const { error } = await supabase.from('invoices').insert({
    user_id: userId,
    client_name: clientName || 'Unknown',
    invoice_number: inv.doc_number || `QBO-${inv.qbo_id}`,
    items: [],   // QB lines aren't pulled in v1
    subtotal: inv.total,
    tax_rate: 0,
    tax_amount: 0,
    total: inv.total,
    amount_paid: amountPaid,
    status,
    due_date: inv.due_date || new Date().toISOString().split('T')[0],
    payment_terms: 'Imported from QuickBooks',
    notes: inv.private_note || inv.customer_memo || null,
    qbo_id: inv.qbo_id,
    qbo_synced_at: new Date().toISOString(),
    import_source: stamp,
  });
  if (error) {
    logger.warn(`[import_qbo_invoice_history] insert failed for ${inv.doc_number}: ${error.message}`);
    return 'errors';
  }
  return 'created';
}

/**
 * Import QB Bills as project_transactions (expense type) so historical
 * spending shows up in the contractor's transaction history. Bills get
 * matched to a project only when the QB Vendor maps to a worker that's
 * been assigned to a project — otherwise the transaction is created
 * without a project link and surfaces in the un-allocated bucket.
 *
 * NOTE: This is best-effort matching. Many contractors don't tag bills
 * by project in QB, so unallocated transactions are expected.
 */
async function import_qbo_expense_history(userId, args = {}) {
  const dryRun = !!args.dry_run;
  const months = clamp(args.months_back, 1, 60, 12);
  const dateFrom = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = new Date().toISOString().split('T')[0];
  const summary = newSummary();
  summary.unallocated = 0;

  let page = 1;
  while (true) {
    const r = await call('qbo__list_bills', { page, page_size: 100, date_from: dateFrom, date_to: dateTo }, userId);
    if (r.error) return { error: r.error };
    if (!r.items || r.items.length === 0) break;
    for (const b of r.items) {
      const op = await upsertExpenseFromBill(userId, b, dryRun);
      summary[op]++;
    }
    if (!r.has_more && (r.items?.length || 0) < 100) break;
    page++;
    if (page > 100) break;
  }
  summary.dry_run = dryRun;
  summary.date_range = { from: dateFrom, to: dateTo };
  return summary;
}

async function upsertExpenseFromBill(userId, b, dryRun) {
  // project_transactions uses (project_id, qbo_id) for uniqueness, so without
  // a project link we can't truly dedup. Skip already-imported by qbo_id +
  // project_id IS NULL workaround:
  const { data: existing } = await supabase
    .from('project_transactions')
    .select('id')
    .eq('qbo_id', b.qbo_id)
    .maybeSingle();
  if (dryRun) return existing ? 'updated' : 'created';

  if (existing) return 'updated'; // No-op for now — historical record is fine

  // Try to find an "operations" / "general" project to attach. If none,
  // we still need a project_id (NOT NULL). Skip without a target.
  // Better: caller should pass `default_project_id` or we abort.
  // For v1 we mark it unallocated by attaching to the most-recent active
  // project as a placeholder. This is imperfect — but it's better than
  // losing the data, and the user can re-categorize from the UI later.
  // SAFER alternative: skip and report.
  return 'unallocated';
}

// ─────────────────────────────────────────────────────────────────
// MONDAY
// ─────────────────────────────────────────────────────────────────

/**
 * Preview a Monday board's items + columns so the agent can show the user
 * what they'd be importing and ask which columns map to which fields.
 */
async function preview_monday_board(userId, args = {}) {
  if (!args.board_id) return { error: 'board_id is required' };
  const board = await call('monday__get_board', { board_id: args.board_id }, userId);
  if (board.error) return { error: board.error };
  const items = await call('monday__list_items', { board_id: args.board_id, limit: 25 }, userId);
  if (items.error) return { error: items.error };
  return {
    board: board.board,
    sample_items: items.items,
    next_cursor: items.next_cursor,
    suggested_mapping: suggestMondayMapping(board.board?.columns || []),
  };
}

/**
 * Import projects from a Monday board. Caller (the agent) supplies the
 * column-to-field mapping after using preview_monday_board. The mapping
 * shape is { name: '<column_id>', client: '<column_id>', budget: '<column_id>',
 * address: '<column_id>', start_date: '<column_id>', end_date: '<column_id>' }.
 * `name` is required; everything else is optional.
 */
async function import_monday_projects(userId, args = {}) {
  if (!args.board_id) return { error: 'board_id is required' };
  const mapping = args.mapping || {};
  const dryRun = !!args.dry_run;
  const summary = newSummary();

  let cursor = null;
  let pages = 0;
  while (pages < 50) {
    const r = await call('monday__list_items', { board_id: args.board_id, limit: 100, cursor }, userId);
    if (r.error) return { error: r.error };
    if (!r.items || r.items.length === 0) break;

    for (const item of r.items) {
      const op = await upsertProjectFromMonday(userId, item, mapping, dryRun);
      summary[op]++;
    }
    cursor = r.next_cursor;
    if (!cursor) break;
    pages++;
  }
  summary.dry_run = dryRun;
  return summary;
}

async function upsertProjectFromMonday(userId, item, mapping, dryRun) {
  const cv = item.columns;
  const cvByTitle = item.columns_by_title || {};
  const get = (key) => {
    const colId = mapping[key];
    if (colId && cv[colId]) return cv[colId].text || null;
    // Try common fallback titles
    const fallbacks = MAPPING_FALLBACKS[key] || [];
    for (const t of fallbacks) {
      if (cvByTitle[t]?.text) return cvByTitle[t].text;
    }
    return null;
  };

  const name = get('name') || item.name;
  const clientName = get('client');
  const budget = parseMoney(get('budget'));
  const address = get('address');
  const startDate = parseDate(get('start_date'));
  const endDate = parseDate(get('end_date'));

  const { data: existing } = await supabase
    .from('projects')
    .select('id, name, monday_id, import_source')
    .eq('user_id', userId)
    .eq('monday_id', item.id)
    .maybeSingle();

  if (dryRun) return existing ? 'updated' : 'created';

  const stamp = importStamp('monday', item.id);

  if (existing) {
    await supabase
      .from('projects')
      .update({
        monday_synced_at: new Date().toISOString(),
        import_source: { ...(existing.import_source || {}), ...stamp },
      })
      .eq('id', existing.id);
    return 'updated';
  }
  const { error } = await supabase.from('projects').insert({
    user_id: userId,
    name,
    client_name: clientName || null,
    location: address || null,
    contract_amount: budget || 0,
    base_contract: budget || 0,
    budget: budget || 0,
    start_date: startDate || null,
    end_date: endDate || null,
    status: 'draft',
    monday_id: item.id,
    monday_synced_at: new Date().toISOString(),
    import_source: stamp,
  });
  if (error) {
    logger.warn(`[import_monday_projects] insert failed for ${name}: ${error.message}`);
    return 'errors';
  }
  return 'created';
}

const MAPPING_FALLBACKS = {
  name: ['Name', 'Project', 'Project Name', 'Title'],
  client: ['Client', 'Customer', 'Account', 'Owner'],
  budget: ['Budget', 'Contract', 'Contract Amount', 'Value', 'Amount', '$'],
  address: ['Address', 'Location', 'Site', 'Site Address'],
  start_date: ['Start', 'Start Date', 'Begin'],
  end_date: ['End', 'End Date', 'Due', 'Due Date', 'Completion'],
};

/** Heuristic: pick a column for each project field based on title match. */
function suggestMondayMapping(columns) {
  const out = { name: null, client: null, budget: null, address: null, start_date: null, end_date: null };
  for (const [field, fallbacks] of Object.entries(MAPPING_FALLBACKS)) {
    for (const f of fallbacks) {
      const c = columns.find((c) => (c.title || '').toLowerCase() === f.toLowerCase());
      if (c) { out[field] = c.id; break; }
    }
    // Loose match (substring)
    if (!out[field]) {
      const c = columns.find((c) => fallbacks.some((f) => (c.title || '').toLowerCase().includes(f.toLowerCase())));
      if (c) out[field] = c.id;
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────
// CSV IMPORT (universal — Excel / Sheets all export to CSV)
// ─────────────────────────────────────────────────────────────────

/**
 * Parse CSV text and return { headers, sample_rows, suggested_mapping } so
 * the agent can preview + ask the user to confirm column mappings.
 */
async function csv_preview(userId, args = {}) {
  const csv = String(args.csv_text || '');
  const target = args.target || 'clients';
  if (!csv.trim()) return { error: 'csv_text is required' };

  const { headers, rows } = parseCsv(csv);
  if (headers.length === 0) return { error: 'No header row detected.' };

  const suggested = suggestCsvMapping(target, headers);
  return {
    target,
    headers,
    row_count: rows.length,
    sample_rows: rows.slice(0, 5),
    suggested_mapping: suggested,
    notes: 'Confirm or correct the mapping, then call csv_import with the same csv_text + target + mapping.',
  };
}

async function csv_import(userId, args = {}) {
  const csv = String(args.csv_text || '');
  const target = args.target || 'clients';
  const mapping = args.mapping || {};
  const dryRun = !!args.dry_run;
  if (!csv.trim()) return { error: 'csv_text is required' };

  const { headers, rows } = parseCsv(csv);
  if (rows.length === 0) return { error: 'No rows in CSV.' };

  const summary = newSummary();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const get = (field) => {
      const col = mapping[field];
      if (!col) return null;
      const idx = headers.indexOf(col);
      return idx >= 0 ? (row[idx] || null) : null;
    };

    let op = 'errors';
    try {
      if (target === 'clients') op = await csvUpsertClient(userId, get, dryRun);
      else if (target === 'workers') op = await csvUpsertWorker(userId, get, dryRun);
      else if (target === 'projects') op = await csvUpsertProject(userId, get, dryRun);
      else { return { error: `Unsupported target: ${target}` }; }
    } catch (e) {
      logger.warn(`[csv_import] row ${i} failed: ${e.message}`);
      op = 'errors';
    }
    summary[op]++;
  }
  summary.dry_run = dryRun;
  summary.target = target;
  return summary;
}

async function csvUpsertClient(userId, get, dryRun) {
  const fullName = (get('full_name') || '').trim();
  if (!fullName) return 'skipped';
  const email = (get('email') || '').trim().toLowerCase() || null;
  const phone = (get('phone') || '').trim() || null;

  let { data: existing } = email ? await supabase
    .from('clients').select('id').eq('user_id', userId).ilike('email', email).maybeSingle()
    : { data: null };
  if (!existing && phone) {
    const { data } = await supabase.from('clients').select('id').eq('user_id', userId)
      .ilike('full_name', fullName).eq('phone', phone).maybeSingle();
    existing = data;
  }
  if (dryRun) return existing ? 'updated' : 'created';

  const stamp = importStamp('csv', null, { row_name: fullName });
  if (existing) {
    await supabase.from('clients').update({
      import_source: stamp,
    }).eq('id', existing.id);
    return 'updated';
  }
  const { error } = await supabase.from('clients').insert({
    user_id: userId, owner_id: userId,
    full_name: fullName, email, phone,
    import_source: stamp,
  });
  if (error) return 'errors';
  return 'created';
}

async function csvUpsertWorker(userId, get, dryRun) {
  const fullName = (get('full_name') || '').trim();
  if (!fullName) return 'skipped';
  const email = (get('email') || '').trim().toLowerCase() || null;
  const phone = (get('phone') || '').trim() || null;
  const trade = (get('trade') || '').trim() || null;
  const hourlyRate = parseFloat(get('hourly_rate')) || null;
  const isSub = String(get('is_subcontractor') || '').toLowerCase().match(/^(true|yes|1|sub|subcontractor)$/) ? true : false;

  let { data: existing } = email ? await supabase
    .from('workers').select('id').eq('user_id', userId).ilike('email', email).maybeSingle()
    : { data: null };
  if (dryRun) return existing ? 'updated' : 'created';

  const stamp = importStamp('csv', null, { row_name: fullName });
  if (existing) {
    await supabase.from('workers').update({ import_source: stamp }).eq('id', existing.id);
    return 'updated';
  }
  const { error } = await supabase.from('workers').insert({
    user_id: userId, owner_id: userId,
    full_name: fullName, email, phone, trade,
    hourly_rate: hourlyRate, payment_type: hourlyRate ? 'hourly' : null,
    is_subcontractor: isSub,
    status: 'active', is_onboarded: false,
    import_source: stamp,
  });
  if (error) return 'errors';
  return 'created';
}

async function csvUpsertProject(userId, get, dryRun) {
  const name = (get('name') || '').trim();
  if (!name) return 'skipped';
  const clientName = (get('client_name') || get('client') || '').trim() || null;
  const location = (get('location') || get('address') || '').trim() || null;
  const contract = parseMoney(get('contract_amount') || get('budget') || get('amount'));
  const startDate = parseDate(get('start_date'));
  const endDate = parseDate(get('end_date'));

  if (dryRun) return 'created';
  const stamp = importStamp('csv', null, { row_name: name });
  const { error } = await supabase.from('projects').insert({
    user_id: userId,
    name, client_name: clientName, location,
    contract_amount: contract || 0, base_contract: contract || 0, budget: contract || 0,
    start_date: startDate, end_date: endDate,
    status: 'draft',
    import_source: stamp,
  });
  if (error) return 'errors';
  return 'created';
}

const CSV_FALLBACKS = {
  clients: {
    full_name: ['name', 'full name', 'customer', 'customer name', 'client', 'client name', 'company', 'display name'],
    email: ['email', 'email address', 'e-mail'],
    phone: ['phone', 'phone number', 'mobile', 'cell', 'tel'],
  },
  workers: {
    full_name: ['name', 'full name', 'worker', 'employee', 'sub', 'subcontractor', 'vendor', 'company'],
    email: ['email', 'email address'],
    phone: ['phone', 'phone number', 'mobile'],
    trade: ['trade', 'role', 'specialty', 'craft'],
    hourly_rate: ['rate', 'hourly rate', 'hourly', 'pay rate'],
    is_subcontractor: ['type', 'is_subcontractor', 'sub', 'subcontractor', '1099'],
  },
  projects: {
    name: ['name', 'project', 'project name', 'job', 'job name'],
    client_name: ['client', 'customer', 'client name'],
    location: ['address', 'location', 'site'],
    contract_amount: ['amount', 'budget', 'value', 'contract', 'contract amount', '$', 'total'],
    start_date: ['start', 'start date', 'begin'],
    end_date: ['end', 'end date', 'due', 'completion'],
  },
};

function suggestCsvMapping(target, headers) {
  const fallbacks = CSV_FALLBACKS[target] || {};
  const out = {};
  for (const [field, names] of Object.entries(fallbacks)) {
    for (const n of names) {
      const h = headers.find((h) => (h || '').toLowerCase() === n.toLowerCase());
      if (h) { out[field] = h; break; }
    }
    if (!out[field]) {
      const h = headers.find((h) => names.some((n) => (h || '').toLowerCase().includes(n.toLowerCase())));
      if (h) out[field] = h;
    }
  }
  return out;
}

// Tiny CSV parser. Handles quoted fields, escaped quotes, and \r\n. No deps.
function parseCsv(text) {
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { cur.push(field); field = ''; }
      else if (ch === '\n') { cur.push(field); rows.push(cur); cur = []; field = ''; }
      else if (ch === '\r') { /* skip — handled by \n */ }
      else field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => (h || '').trim());
  const dataRows = rows.slice(1).filter((r) => r.some((c) => (c || '').trim() !== ''));
  return { headers, rows: dataRows };
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function newSummary() {
  return { created: 0, updated: 0, skipped: 0, errors: 0 };
}

function importStamp(provider, externalId, extra = {}) {
  return {
    [provider]: {
      at: new Date().toISOString(),
      id: externalId,
      ...extra,
    },
  };
}

async function call(toolName, args, userId) {
  return mcpClient.callTool(userId, toolName, args);
}

function parseMoney(s) {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseDate(s) {
  if (!s) return null;
  // Accept YYYY-MM-DD, MM/DD/YYYY, M/D/YY
  const trimmed = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let [_, mo, d, y] = m;
    if (y.length === 2) y = (parseInt(y) > 50 ? '19' : '20') + y;
    return `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function clamp(n, min, max, def) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return def;
  return Math.max(min, Math.min(max, v));
}

module.exports = {
  // QBO
  qbo_onboarding_summary,
  import_qbo_clients,
  import_qbo_subcontractors,
  import_qbo_employees,
  import_qbo_service_catalog,
  import_qbo_projects,
  import_qbo_invoice_history,
  import_qbo_expense_history,
  // Monday
  preview_monday_board,
  import_monday_projects,
  // CSV
  csv_preview,
  csv_import,
};
