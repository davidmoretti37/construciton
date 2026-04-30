/**
 * Tool handlers — invoices, draws (progress billing), unified project billing.
 * Split from handlers.js.
 */

const {
  supabase, logger, userSafeError,
  requireSupervisorPermission, sendNotification, resolveSupervisorRecipient,
  resolveOwnerId, resolveProjectId, resolveInvoiceId, resolveEstimateId,
} = require('./_shared');

async function search_invoices(userId, args = {}) {
  const { query, status } = args;

  let q = supabase
    .from('invoices')
    .select('id, invoice_number, client_name, project_name, total, amount_paid, status, due_date, created_at, estimate_id, project_id')
    .eq('user_id', userId);

  if (query) {
    const filter = buildWordSearch(query, ['client_name', 'project_name', 'invoice_number']);
    if (filter) q = q.or(filter);
  }
  if (status) {
    q = q.eq('status', status);
  }

  const { data, error } = await q.order('created_at', { ascending: false }).limit(20);

  if (error) {
    logger.error('search_invoices error:', error);
    return { error: error.message };
  }

  return data || [];
}

async function get_invoice_details(userId, args) {
  let { invoice_id } = args;

  // Resolve name/number to UUID if needed
  const resolved = await resolveInvoiceId(userId, invoice_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  invoice_id = resolved.id;

  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoice_id)
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return { error: 'Invoice not found' };
  }

  return data;
}


async function update_invoice(userId, { invoice_id, status, due_date, payment_terms, notes, amount_paid, payment_method }) {
  const gate = await requireSupervisorPermission(userId, 'can_create_invoices');
  if (gate) return gate;
  const resolved = await resolveInvoiceId(userId, invoice_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  // Build update object from provided fields only
  const updates = {};
  if (due_date) updates.due_date = due_date;
  if (payment_terms) updates.payment_terms = payment_terms;
  if (notes !== undefined) updates.notes = notes;
  if (payment_method) updates.payment_method = payment_method;

  if (amount_paid !== undefined) {
    updates.amount_paid = parseFloat(amount_paid);

    // Fetch total to derive status
    const { data: inv } = await supabase
      .from('invoices')
      .select('total')
      .eq('id', resolved.id)
      .single();

    if (inv) {
      const total = parseFloat(inv.total);
      if (parseFloat(amount_paid) >= total) {
        updates.status = 'paid';
        updates.paid_date = new Date().toISOString();
      } else if (parseFloat(amount_paid) > 0) {
        updates.status = 'partial';
      }
    }
  }

  // Explicit status override takes precedence
  if (status) updates.status = status;
  if (status === 'paid' && !updates.paid_date) {
    updates.paid_date = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return { error: 'No fields to update. Specify at least one field (status, due_date, amount_paid, etc.).' };
  }

  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', resolved.id)
    .eq('user_id', userId)
    .select('invoice_number, status, amount_paid, total, due_date')
    .single();

  if (error) return userSafeError(error, "Couldn't update that invoice.");

  // Cascade to linked draw_schedule_item, if any. paid invoice → draw paid;
  // cancelled invoice → draw goes back to pending and detaches.
  if (updates.status) {
    if (updates.status === 'paid') {
      await supabase
        .from('draw_schedule_items')
        .update({ status: 'paid' })
        .eq('invoice_id', resolved.id)
        .eq('user_id', userId);
    } else if (updates.status === 'cancelled') {
      await supabase
        .from('draw_schedule_items')
        .update({ status: 'pending', invoice_id: null })
        .eq('invoice_id', resolved.id)
        .eq('user_id', userId);
    }
  }

  // Notify owner about invoice status changes (if caller is a supervisor) AND
  // any assigned supervisor with can_pay_workers (if they aren't the actor).
  if (updates.status) {
    const { data: inv } = await supabase.from('invoices').select('project_id').eq('id', resolved.id).single();
    if (inv?.project_id) {
      const { data: proj } = await supabase.from('projects').select('user_id, name').eq('id', inv.project_id).single();
      if (proj) {
        const invoiceBody = `Invoice #${data.invoice_number} marked as ${data.status} on ${proj.name}`;
        if (proj.user_id !== userId) {
          sendNotification({
            userId: proj.user_id,
            title: 'Invoice Updated',
            body: invoiceBody,
            type: 'financial_update',
            data: { screen: 'Projects' },
            projectId: inv.project_id,
          });
        }
        const supId = await resolveSupervisorRecipient(inv.project_id, proj.user_id, 'can_pay_workers');
        if (supId && supId !== userId) {
          sendNotification({
            userId: supId,
            title: 'Invoice Updated',
            body: invoiceBody,
            type: 'financial_update',
            data: { screen: 'Projects' },
            projectId: inv.project_id,
          });
        }
      }
    }
  }

  return {
    success: true,
    invoice: {
      invoice_number: data.invoice_number,
      status: data.status,
      amount_paid: parseFloat(data.amount_paid),
      amount_due: parseFloat(data.total) - parseFloat(data.amount_paid),
      due_date: data.due_date,
    },
  };
}

async function void_invoice(userId, { invoice_id }) {
  const gate = await requireSupervisorPermission(userId, 'can_create_invoices');
  if (gate) return gate;
  const resolved = await resolveInvoiceId(userId, invoice_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  const { data, error } = await supabase
    .from('invoices')
    .update({ status: 'cancelled' })
    .eq('id', resolved.id)
    .eq('user_id', userId)
    .select('invoice_number')
    .single();

  if (error) return userSafeError(error, "Couldn't void that invoice.");

  // Detach any linked draw item — the draw goes back to pending so the
  // owner can re-issue against it.
  await supabase
    .from('draw_schedule_items')
    .update({ status: 'pending', invoice_id: null })
    .eq('invoice_id', resolved.id)
    .eq('user_id', userId);

  return { success: true, invoice_number: data.invoice_number };
}


/**
 * Resolve a draw_schedule_items ID. Today only UUIDs are supported (the
 * agent passes them through after get_draw_schedule). Kept in a helper so
 * we can grow it (e.g. "the foundation draw") without touching callers.
 */
async function resolveDrawItemId(userId, idOrName) {
  if (!idOrName) return { error: 'No draw item specified' };

  if (idOrName.match(/^[0-9a-f]{8}-/i)) {
    const { data } = await supabase
      .from('draw_schedule_items')
      .select('id')
      .eq('id', idOrName)
      .eq('user_id', userId)
      .single();
    if (!data) return { error: 'Draw item not found or access denied' };
    return { id: idOrName };
  }

  const filter = buildWordSearch(idOrName, ['description']);
  if (!filter) return { error: 'No draw item specified' };

  const { data } = await supabase
    .from('draw_schedule_items')
    .select('id, description, status, order_index')
    .eq('user_id', userId)
    .or(filter)
    .limit(5);

  if (!data || data.length === 0) return { error: `No draw matching "${idOrName}"` };
  if (data.length === 1) return { id: data[0].id };
  return { suggestions: data, message: `Multiple draws match "${idOrName}". Pass a UUID.` };
}

async function create_draw_schedule(userId, { project_id, retainage_percent = 0, items = [] }) {
  const gate = await requireSupervisorPermission(userId, 'can_create_invoices');
  if (gate) return gate;

  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  if (!Array.isArray(items) || items.length === 0) {
    return { error: 'At least one draw item is required.' };
  }
  for (const it of items) {
    const hasPct = it.percent_of_contract != null;
    const hasFixed = it.fixed_amount != null;
    if (hasPct === hasFixed) {
      return { error: `Each draw must have exactly one of percent_of_contract or fixed_amount (got "${it.description || 'unnamed'}").` };
    }
    const trig = it.trigger_type || 'phase_completion';
    if (!['phase_completion', 'project_start', 'manual'].includes(trig)) {
      return { error: `Unknown trigger_type "${trig}" on "${it.description || 'unnamed'}".` };
    }
    if (trig === 'phase_completion' && !it.phase_id) {
      return { error: `Draw "${it.description || 'unnamed'}" uses trigger_type=phase_completion but has no phase_id. Either pick a phase or use project_start (deposit) / manual.` };
    }
  }

  // Replace any existing schedule (one schedule per project).
  const { data: existing } = await supabase
    .from('draw_schedules')
    .select('id')
    .eq('project_id', resolved.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from('draw_schedules').delete().eq('id', existing.id).eq('user_id', userId);
  }

  const { data: schedule, error: schedErr } = await supabase
    .from('draw_schedules')
    .insert({ project_id: resolved.id, user_id: userId, retainage_percent })
    .select()
    .single();
  if (schedErr) return userSafeError(schedErr, "Couldn't create the draw schedule.");

  const itemRows = items.map((it, idx) => ({
    schedule_id: schedule.id,
    project_id: resolved.id,
    user_id: userId,
    order_index: idx,
    description: it.description,
    phase_id: it.phase_id || null,
    percent_of_contract: it.percent_of_contract != null ? it.percent_of_contract : null,
    fixed_amount: it.fixed_amount != null ? it.fixed_amount : null,
    trigger_type: it.trigger_type || 'phase_completion',
  }));

  const { data: insertedItems, error: itemErr } = await supabase
    .from('draw_schedule_items')
    .insert(itemRows)
    .select();
  if (itemErr) {
    // Roll back the schedule we just created so we don't leave a half-built record.
    await supabase.from('draw_schedules').delete().eq('id', schedule.id);
    return userSafeError(itemErr, "Couldn't save the draws.");
  }

  return {
    success: true,
    schedule: {
      id: schedule.id,
      project_id: schedule.project_id,
      retainage_percent: parseFloat(schedule.retainage_percent),
      items: insertedItems.map((i) => ({
        id: i.id,
        order_index: i.order_index,
        description: i.description,
        percent_of_contract: i.percent_of_contract != null ? parseFloat(i.percent_of_contract) : null,
        fixed_amount: i.fixed_amount != null ? parseFloat(i.fixed_amount) : null,
        phase_id: i.phase_id,
        status: i.status,
      })),
    },
  };
}

async function generate_draw_invoice(userId, { schedule_item_id, due_in_days = 30 }) {
  const gate = await requireSupervisorPermission(userId, 'can_create_invoices');
  if (gate) return gate;

  const resolved = await resolveDrawItemId(userId, schedule_item_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  const { data: item, error: itemErr } = await supabase
    .from('draw_schedule_items')
    .select(`
      id, description, percent_of_contract, fixed_amount, status, invoice_id,
      schedule:draw_schedules(retainage_percent),
      project:projects(id, name, contract_amount, client_name, client_email, client_phone, client_address)
    `)
    .eq('id', resolved.id)
    .eq('user_id', userId)
    .single();

  if (itemErr || !item) return { error: 'Draw item not found' };
  if (item.invoice_id) return { error: 'This draw has already been invoiced. Void the existing invoice first if you need to re-issue.' };
  if (!item.project) return { error: 'Draw item is not linked to a project (data integrity issue).' };

  const contract = parseFloat(item.project.contract_amount || 0);
  const retainagePct = parseFloat(item.schedule?.retainage_percent || 0);

  const gross = item.percent_of_contract != null
    ? contract * parseFloat(item.percent_of_contract) / 100
    : parseFloat(item.fixed_amount || 0);

  if (!(gross > 0)) {
    return { error: 'Draw amount computes to $0 — check the contract amount or draw configuration.' };
  }

  const retainage = gross * retainagePct / 100;
  const net = gross - retainage;

  const due = new Date();
  due.setDate(due.getDate() + due_in_days);
  const dueStr = due.toISOString().split('T')[0];

  const lineItems = [
    {
      description: `Progress draw: ${item.description}`,
      quantity: 1,
      unit: 'draw',
      pricePerUnit: gross,
      total: gross,
    },
  ];
  if (retainage > 0) {
    lineItems.push({
      description: `Retainage held (${retainagePct}%)`,
      quantity: 1,
      unit: '',
      pricePerUnit: -retainage,
      total: -retainage,
    });
  }

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      user_id: userId,
      project_id: item.project.id,
      client_name: item.project.client_name,
      client_email: item.project.client_email,
      client_phone: item.project.client_phone,
      client_address: item.project.client_address,
      project_name: item.project.name,
      items: lineItems,
      subtotal: net,
      tax_rate: 0,
      tax_amount: 0,
      total: net,
      due_date: dueStr,
      payment_terms: `Net ${due_in_days}`,
      status: 'unpaid',
      notes: `Progress draw — ${item.description}${retainage > 0 ? ` (gross $${gross.toFixed(2)}, retainage $${retainage.toFixed(2)})` : ''}`,
    })
    .select()
    .single();
  if (invErr) return userSafeError(invErr, "Couldn't create the draw invoice.");

  const { error: linkErr } = await supabase
    .from('draw_schedule_items')
    .update({ status: 'invoiced', invoice_id: invoice.id })
    .eq('id', item.id)
    .eq('user_id', userId);
  if (linkErr) {
    // Invoice created; the link failed. Surface the issue rather than silently
    // leaving the draw out-of-sync.
    return {
      success: true,
      warning: 'Invoice was created but the draw link failed. Reconcile manually.',
      invoice: { id: invoice.id, invoice_number: invoice.invoice_number, total: net },
    };
  }

  return {
    success: true,
    invoice: {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      total: net,
      gross,
      retainage_held: retainage,
      due_date: dueStr,
      status: invoice.status,
    },
    draw_item_id: item.id,
  };
}

async function get_draw_schedule(userId, { project_id }) {
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  const { data: schedule } = await supabase
    .from('draw_schedules')
    .select('id, retainage_percent')
    .eq('project_id', resolved.id)
    .eq('user_id', userId)
    .maybeSingle();

  if (!schedule) {
    return { success: true, has_schedule: false, items: [], message: 'No draw schedule on this project.' };
  }

  const [{ data: items }, { data: progress }, { data: project }] = await Promise.all([
    supabase
      .from('draw_schedule_items')
      .select('id, order_index, description, percent_of_contract, fixed_amount, phase_id, status, invoice_id, trigger_type')
      .eq('schedule_id', schedule.id)
      .eq('user_id', userId)
      .order('order_index'),
    supabase
      .from('draw_schedule_progress')
      .select('contract_amount, drawn_to_date, paid_to_date, draws_billed, draws_total')
      .eq('schedule_id', schedule.id)
      .single(),
    supabase
      .from('projects')
      .select('contract_amount, name')
      .eq('id', resolved.id)
      .single(),
  ]);

  const invoiceIds = (items || []).map((i) => i.invoice_id).filter(Boolean);
  let invoiceMap = {};
  if (invoiceIds.length > 0) {
    const { data: invs } = await supabase
      .from('invoices')
      .select('id, invoice_number, status, total, amount_paid')
      .in('id', invoiceIds);
    (invs || []).forEach((inv) => { invoiceMap[inv.id] = inv; });
  }

  const contract = parseFloat(progress?.contract_amount ?? project?.contract_amount ?? 0);

  const enriched = (items || []).map((it) => {
    const computed = it.percent_of_contract != null
      ? contract * parseFloat(it.percent_of_contract) / 100
      : parseFloat(it.fixed_amount || 0);
    return {
      id: it.id,
      order_index: it.order_index,
      description: it.description,
      percent_of_contract: it.percent_of_contract != null ? parseFloat(it.percent_of_contract) : null,
      fixed_amount: it.fixed_amount != null ? parseFloat(it.fixed_amount) : null,
      computed_amount: Number(computed.toFixed(2)),
      phase_id: it.phase_id,
      trigger_type: it.trigger_type,
      status: it.status,
      invoice: it.invoice_id ? (invoiceMap[it.invoice_id] || null) : null,
    };
  });

  return {
    success: true,
    has_schedule: true,
    project: { id: resolved.id, name: project?.name, contract_amount: contract },
    retainage_percent: parseFloat(schedule.retainage_percent),
    drawn_to_date: parseFloat(progress?.drawn_to_date || 0),
    paid_to_date: parseFloat(progress?.paid_to_date || 0),
    draws_billed: progress?.draws_billed || 0,
    draws_total: progress?.draws_total || 0,
    items: enriched,
  };
}

/**
 * List all draws across all projects with status='ready' — used for daily
 * briefings, the "anything to bill?" question, and as the agent's first
 * call when the user mentions invoicing without naming a project.
 */
async function get_ready_draws(userId) {
  const { data: items, error } = await supabase
    .from('draw_schedule_items')
    .select(`
      id, description, percent_of_contract, fixed_amount, status, trigger_type,
      schedule:draw_schedules(retainage_percent),
      project:projects(id, name, contract_amount, client_name)
    `)
    .eq('user_id', userId)
    .eq('status', 'ready')
    .order('created_at', { ascending: true });

  if (error) return userSafeError(error, "Couldn't load ready draws.");

  const ready = (items || []).map((it) => {
    const contract = parseFloat(it.project?.contract_amount || 0);
    const retPct = parseFloat(it.schedule?.retainage_percent || 0);
    const gross = it.percent_of_contract != null
      ? contract * parseFloat(it.percent_of_contract) / 100
      : parseFloat(it.fixed_amount || 0);
    const retainage = gross * retPct / 100;
    const net = gross - retainage;
    return {
      schedule_item_id: it.id,
      project_id: it.project?.id,
      project_name: it.project?.name,
      client_name: it.project?.client_name,
      description: it.description,
      trigger_type: it.trigger_type,
      gross: Number(gross.toFixed(2)),
      retainage_held: Number(retainage.toFixed(2)),
      net: Number(net.toFixed(2)),
    };
  });

  const totalNet = ready.reduce((s, r) => s + r.net, 0);

  return {
    success: true,
    count: ready.length,
    total_net: Number(totalNet.toFixed(2)),
    draws: ready,
  };
}


/**
 * get_project_billing — assembles every billable event for a project into the
 * unified shape consumed by the BillingCard. Each row is a "billable event"
 * with a normalized status / amount / source / expected_action_by.
 *
 * Three zones:
 *   action: needs owner attention now (ready/overdue/awaiting_response)
 *   upcoming: passive — scheduled but not yet ready (pending draws)
 *   history: terminal-state events (paid/approved/rejected/void/cancelled)
 *
 * Used by GET /portal-admin/projects/:id/billing AND by the agent tool of the same name.
 */
async function get_project_billing(userId, args = {}) {
  let { project_id } = args;
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return { error: resolved.error };
  if (resolved.suggestions) return resolved;
  project_id = resolved.id;

  const todayDate = new Date().toISOString().split('T')[0];

  // Fetch everything in parallel
  const [
    projectRes, estimatesRes, drawScheduleRes, drawItemsRes,
    invoicesRes, changeOrdersRes,
  ] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name, contract_amount, base_contract, end_date, status, user_id')
      .eq('id', project_id)
      .single(),
    supabase
      .from('estimates')
      .select('id, estimate_number, total, status, created_at, accepted_date')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false }),
    supabase
      .from('draw_schedules')
      .select('id, retainage_percent')
      .eq('project_id', project_id)
      .maybeSingle(),
    supabase
      .from('draw_schedule_items')
      .select(`
        id, order_index, description, percent_of_contract, fixed_amount,
        status, trigger_type, invoice_id, co_id, updated_at, created_at,
        invoice:invoices(id, invoice_number, status, total, amount_paid, amount_due, due_date, paid_date)
      `)
      .eq('project_id', project_id)
      .order('order_index', { ascending: true }),
    supabase
      .from('invoices')
      .select('id, invoice_number, status, total, amount_paid, amount_due, due_date, paid_date, created_at, sent_date')
      .eq('project_id', project_id)
      .order('created_at', { ascending: false }),
    supabase
      .from('change_orders')
      .select(`
        id, co_number, title, status, total_amount, schedule_impact_days,
        billing_strategy, sent_at, approved_at, rejected_at, client_responded_at,
        client_response_reason, signature_required, created_at,
        change_order_line_items(id, description, quantity, unit, unit_price, amount)
      `)
      .eq('project_id', project_id)
      .order('co_number', { ascending: true }),
  ]);

  if (projectRes.error || !projectRes.data) {
    return { error: 'Project not found' };
  }
  const project = projectRes.data;

  // Verify ownership / supervisor access (RLS would block but explicit check for clean error)
  if (project.user_id !== userId) {
    // Supervisor flow lives via the assigned_supervisor_id column elsewhere — RLS handles it
    // Don't fail here; just continue.
  }

  const contract = parseFloat(project.contract_amount || 0);
  const baseContract = parseFloat(project.base_contract || contract);
  const drawSchedule = drawScheduleRes.data || null;
  const retainagePct = parseFloat(drawSchedule?.retainage_percent || 0);

  const events = [];

  // === Estimates ===
  for (const est of (estimatesRes.data || [])) {
    events.push({
      id: 'est-' + est.id,
      source: 'estimate',
      source_id: est.id,
      label: est.estimate_number || 'Estimate',
      description: 'Estimate',
      amount: parseFloat(est.total || 0),
      status: est.status === 'accepted' ? 'accepted' : (est.status || 'draft'),
      zone: est.status === 'accepted' || est.status === 'rejected' ? 'history' : 'action',
      occurred_at: est.accepted_date || est.created_at,
      action_type: est.status === 'accepted' ? null : 'open_estimate',
      cta_label: null,
    });
  }

  // === Draws ===
  for (const dsi of (drawItemsRes.data || [])) {
    const gross = dsi.percent_of_contract != null
      ? contract * parseFloat(dsi.percent_of_contract) / 100
      : parseFloat(dsi.fixed_amount || 0);
    const retainage = gross * retainagePct / 100;
    const net = gross - retainage;
    let zone = 'upcoming';
    let cta_label = null;
    let action_type = null;
    if (dsi.status === 'ready') {
      zone = 'action'; cta_label = 'Send invoice'; action_type = 'send_draw';
    } else if (dsi.status === 'paid' || dsi.status === 'invoiced' || dsi.status === 'skipped') {
      zone = 'history';
    }
    events.push({
      id: 'draw-' + dsi.id,
      source: 'draw',
      source_id: dsi.id,
      co_id: dsi.co_id || null,
      label: dsi.co_id ? 'CO Draw' : ('Draw #' + (dsi.order_index || '?')),
      description: dsi.description,
      amount: Number(net.toFixed(2)),
      gross: Number(gross.toFixed(2)),
      retainage_held: Number(retainage.toFixed(2)),
      status: dsi.status,
      trigger_type: dsi.trigger_type,
      zone,
      occurred_at: dsi.updated_at || dsi.created_at,
      invoice: dsi.invoice ? {
        id: dsi.invoice.id,
        invoice_number: dsi.invoice.invoice_number,
        status: dsi.invoice.status,
        amount_due: parseFloat(dsi.invoice.amount_due || 0),
        paid_date: dsi.invoice.paid_date,
        due_date: dsi.invoice.due_date,
      } : null,
      action_type, cta_label,
    });
  }

  // === Invoices NOT linked to a draw (standalone or CO-direct) ===
  // Draw-linked invoices already surface inside their draw event; skip those.
  const linkedInvoiceIds = new Set(
    (drawItemsRes.data || []).map(d => d.invoice_id).filter(Boolean)
  );
  for (const inv of (invoicesRes.data || [])) {
    if (linkedInvoiceIds.has(inv.id)) continue;
    const amountDue = parseFloat(inv.amount_due || 0);
    const isOverdue = amountDue > 0 && inv.due_date && inv.due_date < todayDate;
    let zone = 'history';
    let cta_label = null;
    let action_type = null;
    if (inv.status === 'paid') {
      zone = 'history';
    } else if (isOverdue) {
      zone = 'action'; cta_label = 'Nudge client'; action_type = 'nudge_invoice';
    } else if (amountDue > 0) {
      zone = 'upcoming';
    }
    events.push({
      id: 'inv-' + inv.id,
      source: 'invoice',
      source_id: inv.id,
      label: inv.invoice_number,
      description: inv.invoice_number,
      amount: parseFloat(inv.total || 0),
      amount_due: amountDue,
      status: isOverdue ? 'overdue' : (inv.status || 'unpaid'),
      due_date: inv.due_date,
      days_overdue: isOverdue ? Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000) : 0,
      zone,
      occurred_at: inv.paid_date || inv.sent_date || inv.created_at,
      action_type, cta_label,
    });
  }

  // === Change orders ===
  // Approved COs that spawned a draw → already represented as that draw event.
  // Show ALL COs in HISTORY (audit trail), but keep approved-with-draw as compact reference.
  // Pending/rejected/void COs that need attention → ACTION zone.
  for (const co of (changeOrdersRes.data || [])) {
    const coLabel = 'CO-' + String(co.co_number || 0).padStart(3, '0');
    let zone = 'history';
    let cta_label = null;
    let action_type = null;
    let statusText = co.status;
    let occurredAt = co.created_at;

    if (co.status === 'pending_client' || co.status === 'viewed') {
      const days = co.sent_at ? Math.floor((Date.now() - new Date(co.sent_at).getTime()) / 86400000) : 0;
      zone = 'action';
      cta_label = 'Resend';
      action_type = 'resend_co';
      statusText = `awaiting client (${days}d)`;
      occurredAt = co.sent_at || co.created_at;
    } else if (co.status === 'draft') {
      zone = 'action';
      cta_label = 'Send';
      action_type = 'send_co';
      statusText = 'draft';
    } else if (co.status === 'approved') {
      zone = 'history';
      occurredAt = co.approved_at || co.created_at;
    } else if (co.status === 'rejected') {
      zone = 'history';
      occurredAt = co.rejected_at || co.created_at;
    }

    events.push({
      id: 'co-' + co.id,
      source: 'change_order',
      source_id: co.id,
      label: coLabel,
      description: co.title,
      amount: parseFloat(co.total_amount || 0),
      schedule_impact_days: co.schedule_impact_days,
      status: statusText,
      raw_status: co.status,
      billing_strategy: co.billing_strategy,
      zone,
      occurred_at: occurredAt,
      action_type, cta_label,
      line_items: (co.change_order_line_items || []).map(li => ({
        description: li.description,
        quantity: parseFloat(li.quantity || 0),
        unit: li.unit,
        unit_price: parseFloat(li.unit_price || 0),
        amount: parseFloat(li.amount || 0),
      })),
    });
  }

  // Roll-up totals
  const drawnToDate = events
    .filter(e => e.source === 'draw' && (e.status === 'invoiced' || e.status === 'paid'))
    .reduce((s, e) => s + (e.gross || 0), 0);
  const collected = events
    .filter(e => (e.source === 'draw' && e.invoice?.status === 'paid') || (e.source === 'invoice' && e.status === 'paid'))
    .reduce((s, e) => s + (e.gross || e.amount || 0), 0);
  const outstanding = contract - collected;

  // Sort each zone by occurred_at desc (history) / asc (upcoming)
  const action = events.filter(e => e.zone === 'action')
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
  const upcoming = events.filter(e => e.zone === 'upcoming')
    .sort((a, b) => new Date(a.occurred_at) - new Date(b.occurred_at));
  const history = events.filter(e => e.zone === 'history')
    .sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));

  return {
    project: {
      id: project.id, name: project.name,
      contract_amount: contract,
      base_contract: baseContract,
      contract_delta_from_cos: contract - baseContract,
      end_date: project.end_date,
      retainage_percent: retainagePct,
      drawn_to_date: Number(drawnToDate.toFixed(2)),
      collected: Number(collected.toFixed(2)),
      outstanding: Number(outstanding.toFixed(2)),
      has_draw_schedule: !!drawSchedule,
    },
    counts: {
      action: action.length,
      upcoming: upcoming.length,
      history: history.length,
    },
    action, upcoming, history,
  };
}



module.exports = {
  search_invoices,
  get_invoice_details,
  update_invoice,
  void_invoice,
  create_draw_schedule,
  generate_draw_invoice,
  get_draw_schedule,
  get_ready_draws,
  get_project_billing,
};
