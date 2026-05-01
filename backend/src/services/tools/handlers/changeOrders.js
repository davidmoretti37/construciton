/**
 * Tool handlers — change orders.
 *
 * Five tools mapped to the change_orders + change_order_line_items tables
 * (created in migration 20260429_change_orders.sql) and the existing HTTP
 * endpoints in routes/portalOwner.js. We talk to Supabase directly here
 * (consistent with every other tool handler) but mirror the same flow:
 *
 *   create  → draft row + line items
 *   list    → with optional project / status filter
 *   get     → single CO with line items + project context
 *   update  → only when status='draft' (locked once sent)
 *   send    → status flip + client email + optional e-sign request
 */

const {
  supabase, logger, userSafeError,
  requireSupervisorPermission, sendNotification,
  resolveProjectId,
} = require('./_shared');

const VALID_STATUS = ['draft', 'pending_client', 'approved', 'rejected', 'voided', 'applied'];

/**
 * Resolve a change_order id from a UUID, CO number ("CO-002"), or title text.
 * Returns { id } | { error } | { suggestions }.
 */
async function resolveChangeOrderId(userId, idOrToken) {
  if (!idOrToken) return { error: 'No change order specified' };

  // UUID
  if (idOrToken.match(/^[0-9a-f]{8}-/i)) {
    const { data } = await supabase
      .from('change_orders')
      .select('id')
      .eq('id', idOrToken)
      .eq('owner_id', userId)
      .maybeSingle();
    if (!data) return { error: 'Change order not found or access denied' };
    return { id: idOrToken };
  }

  // CO-### or just a number
  const numMatch = idOrToken.match(/(\d+)/);
  if (numMatch) {
    const n = parseInt(numMatch[1], 10);
    const { data } = await supabase
      .from('change_orders')
      .select('id, co_number, title')
      .eq('owner_id', userId)
      .eq('co_number', n)
      .limit(5);
    if (data && data.length === 1) return { id: data[0].id };
    if (data && data.length > 1) return { suggestions: data, message: `Multiple COs match #${n}.` };
  }

  // Title fallback
  const { data: byTitle } = await supabase
    .from('change_orders')
    .select('id, co_number, title, status, project_id')
    .eq('owner_id', userId)
    .ilike('title', `%${idOrToken}%`)
    .limit(5);
  if (!byTitle || byTitle.length === 0) return { error: `No change order matching "${idOrToken}"` };
  if (byTitle.length === 1) return { id: byTitle[0].id };
  return { suggestions: byTitle, message: `Multiple COs match "${idOrToken}".` };
}

// ─────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────

async function create_change_order(userId, args = {}) {
  const gate = await requireSupervisorPermission(userId, 'can_create_invoices');
  if (gate) return gate;

  const {
    project_id, title, description, line_items = [],
    schedule_impact_days = 0, tax_rate = 0,
    signature_required = false, billing_strategy = 'invoice_now',
    phase_placement = null, target_phase_id = null, new_phase_name = null,
  } = args;

  if (!project_id) return { error: 'project_id is required' };
  if (!title) return { error: 'title is required' };
  if (!Array.isArray(line_items) || line_items.length === 0) {
    return { error: 'At least one line item is required.' };
  }

  // Resolve project id (caller can pass UUID or name)
  const resolved = await resolveProjectId(userId, project_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  // Verify ownership
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, user_id, contract_amount, end_date')
    .eq('id', resolved.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (!project) return { error: 'Project not found or access denied' };

  // Compute totals from line items
  const cleaned = line_items.map((li, idx) => ({
    position: idx + 1,
    description: String(li.description || '').trim(),
    quantity: Number(li.quantity || 1),
    unit: li.unit || null,
    unit_price: Number(li.unit_price || 0),
    category: li.category || null,
  }));
  const subtotal = cleaned.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
  const totalAmount = subtotal * (1 + Number(tax_rate || 0));

  const { data: co, error: coErr } = await supabase
    .from('change_orders')
    .insert({
      project_id: project.id,
      owner_id: userId,
      title: String(title).trim(),
      description: description ? String(description).trim() : null,
      subtotal,
      tax_rate,
      total_amount: totalAmount,
      schedule_impact_days,
      signature_required: !!signature_required,
      billing_strategy,
      phase_placement: phase_placement || null,
      target_phase_id: target_phase_id || null,
      new_phase_name: new_phase_name ? String(new_phase_name).trim() : null,
      status: 'draft',
    })
    .select()
    .single();
  if (coErr) return userSafeError(coErr, "Couldn't create change order.");

  if (cleaned.length > 0) {
    const rows = cleaned.map((li) => ({ change_order_id: co.id, ...li }));
    const { error: liErr } = await supabase
      .from('change_order_line_items')
      .insert(rows);
    if (liErr) {
      logger.warn('[create_change_order] line items failed:', liErr.message);
    }
  }

  return {
    success: true,
    change_order: {
      id: co.id,
      co_number: co.co_number,
      project_id: project.id,
      project_name: project.name,
      title: co.title,
      total_amount: parseFloat(co.total_amount),
      schedule_impact_days: co.schedule_impact_days,
      status: co.status,
      line_count: cleaned.length,
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// LIST
// ─────────────────────────────────────────────────────────────────

async function list_change_orders(userId, args = {}) {
  const { project_id, status, limit = 25 } = args;

  let q = supabase
    .from('change_orders')
    .select('id, co_number, title, project_id, total_amount, schedule_impact_days, status, sent_at, created_at, projects(name, client_name)')
    .eq('owner_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100));

  if (project_id) {
    const resolved = await resolveProjectId(userId, project_id);
    if (resolved.error) return resolved;
    if (resolved.suggestions) return resolved;
    q = q.eq('project_id', resolved.id);
  }
  if (status) {
    if (!VALID_STATUS.includes(status)) {
      return { error: `Invalid status. Use one of: ${VALID_STATUS.join(', ')}` };
    }
    q = q.eq('status', status);
  }

  const { data, error } = await q;
  if (error) return userSafeError(error, "Couldn't list change orders.");

  return {
    success: true,
    count: data?.length || 0,
    change_orders: (data || []).map((c) => ({
      id: c.id,
      co_number: c.co_number,
      number_label: `CO-${String(c.co_number).padStart(3, '0')}`,
      title: c.title,
      project_id: c.project_id,
      project_name: c.projects?.name || null,
      client_name: c.projects?.client_name || null,
      total_amount: parseFloat(c.total_amount || 0),
      schedule_impact_days: c.schedule_impact_days,
      status: c.status,
      sent_at: c.sent_at,
      created_at: c.created_at,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────
// GET ONE
// ─────────────────────────────────────────────────────────────────

async function get_change_order(userId, args = {}) {
  if (!args.change_order_id) return { error: 'change_order_id is required' };
  const resolved = await resolveChangeOrderId(userId, args.change_order_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  const { data: co, error } = await supabase
    .from('change_orders')
    .select(`
      *,
      change_order_line_items(id, position, description, quantity, unit, unit_price, amount, category),
      projects(id, name, client_name, contract_amount)
    `)
    .eq('id', resolved.id)
    .eq('owner_id', userId)
    .maybeSingle();
  if (error) return userSafeError(error, "Couldn't load change order.");
  if (!co) return { error: 'Change order not found' };

  const lineItems = (co.change_order_line_items || []).sort((a, b) => a.position - b.position);

  return {
    success: true,
    change_order: {
      id: co.id,
      co_number: co.co_number,
      number_label: `CO-${String(co.co_number).padStart(3, '0')}`,
      title: co.title,
      description: co.description,
      project: {
        id: co.projects?.id,
        name: co.projects?.name,
        client_name: co.projects?.client_name,
        contract_amount: parseFloat(co.projects?.contract_amount || 0),
      },
      subtotal: parseFloat(co.subtotal || 0),
      tax_rate: parseFloat(co.tax_rate || 0),
      tax_amount: parseFloat(co.tax_amount || 0),
      total_amount: parseFloat(co.total_amount || 0),
      schedule_impact_days: co.schedule_impact_days,
      billing_strategy: co.billing_strategy,
      phase_placement: co.phase_placement,
      target_phase_id: co.target_phase_id,
      new_phase_name: co.new_phase_name,
      applied_phase_id: co.applied_phase_id,
      signature_required: !!co.signature_required,
      status: co.status,
      sent_at: co.sent_at,
      client_viewed_at: co.client_viewed_at,
      client_responded_at: co.client_responded_at,
      approved_at: co.approved_at,
      rejected_at: co.rejected_at,
      approved_by_name: co.approved_by_name,
      client_response_reason: co.client_response_reason,
      applied_at: co.applied_at,
      applied_contract_delta: co.applied_contract_delta != null ? parseFloat(co.applied_contract_delta) : null,
      applied_schedule_delta_days: co.applied_schedule_delta_days,
      created_at: co.created_at,
      updated_at: co.updated_at,
      line_items: lineItems.map((li) => ({
        id: li.id,
        position: li.position,
        description: li.description,
        quantity: parseFloat(li.quantity),
        unit: li.unit,
        unit_price: parseFloat(li.unit_price),
        amount: parseFloat(li.amount),
        category: li.category,
      })),
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// UPDATE (draft only)
// ─────────────────────────────────────────────────────────────────

async function update_change_order(userId, args = {}) {
  const gate = await requireSupervisorPermission(userId, 'can_create_invoices');
  if (gate) return gate;

  if (!args.change_order_id) return { error: 'change_order_id is required' };
  const resolved = await resolveChangeOrderId(userId, args.change_order_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  const { data: existing } = await supabase
    .from('change_orders')
    .select('id, status, owner_id')
    .eq('id', resolved.id)
    .eq('owner_id', userId)
    .maybeSingle();
  if (!existing) return { error: 'Change order not found' };
  if (existing.status !== 'draft') {
    return { error: `Only draft change orders can be edited. This one is "${existing.status}". Recall it first if you need changes.` };
  }

  const updates = {};
  if (args.title != null) updates.title = String(args.title).trim();
  if (args.description !== undefined) updates.description = args.description ? String(args.description).trim() : null;
  if (args.schedule_impact_days != null) updates.schedule_impact_days = parseInt(args.schedule_impact_days, 10) || 0;
  if (args.tax_rate != null) updates.tax_rate = Number(args.tax_rate);
  if (args.signature_required != null) updates.signature_required = !!args.signature_required;
  if (args.billing_strategy != null) updates.billing_strategy = args.billing_strategy;
  if (args.phase_placement !== undefined) updates.phase_placement = args.phase_placement || null;
  if (args.target_phase_id !== undefined) updates.target_phase_id = args.target_phase_id || null;
  if (args.new_phase_name !== undefined) updates.new_phase_name = args.new_phase_name ? String(args.new_phase_name).trim() : null;

  // Replace line items wholesale if provided
  let newSubtotal = null;
  if (Array.isArray(args.line_items)) {
    const cleaned = args.line_items.map((li, idx) => ({
      change_order_id: resolved.id,
      position: idx + 1,
      description: String(li.description || '').trim(),
      quantity: Number(li.quantity || 1),
      unit: li.unit || null,
      unit_price: Number(li.unit_price || 0),
      category: li.category || null,
    }));
    newSubtotal = cleaned.reduce((s, li) => s + li.quantity * li.unit_price, 0);

    await supabase.from('change_order_line_items').delete().eq('change_order_id', resolved.id);
    if (cleaned.length > 0) {
      const { error: liErr } = await supabase.from('change_order_line_items').insert(cleaned);
      if (liErr) return userSafeError(liErr, "Couldn't update line items.");
    }
    updates.subtotal = newSubtotal;
  }

  // Recompute total when subtotal or tax_rate changed
  if (newSubtotal != null || updates.tax_rate != null) {
    const { data: cur } = await supabase
      .from('change_orders')
      .select('subtotal, tax_rate')
      .eq('id', resolved.id)
      .maybeSingle();
    const sub = updates.subtotal != null ? updates.subtotal : parseFloat(cur?.subtotal || 0);
    const rate = updates.tax_rate != null ? updates.tax_rate : parseFloat(cur?.tax_rate || 0);
    updates.total_amount = sub * (1 + rate);
  }

  if (Object.keys(updates).length === 0) {
    return { error: 'Nothing to update — pass at least one field.' };
  }

  const { data, error } = await supabase
    .from('change_orders')
    .update(updates)
    .eq('id', resolved.id)
    .eq('owner_id', userId)
    .eq('status', 'draft') // belt-and-suspenders
    .select('id, co_number, title, total_amount, status')
    .single();
  if (error) return userSafeError(error, "Couldn't update change order.");

  return {
    success: true,
    change_order: {
      id: data.id,
      co_number: data.co_number,
      title: data.title,
      total_amount: parseFloat(data.total_amount || 0),
      status: data.status,
    },
  };
}

// ─────────────────────────────────────────────────────────────────
// SEND (draft → pending_client)
// ─────────────────────────────────────────────────────────────────

async function send_change_order(userId, args = {}) {
  const gate = await requireSupervisorPermission(userId, 'can_create_invoices');
  if (gate) return gate;
  if (!args.change_order_id) return { error: 'change_order_id is required' };
  const resolved = await resolveChangeOrderId(userId, args.change_order_id);
  if (resolved.error) return resolved;
  if (resolved.suggestions) return resolved;

  const { data: co } = await supabase
    .from('change_orders')
    .select('*, change_order_line_items(*)')
    .eq('id', resolved.id)
    .eq('owner_id', userId)
    .maybeSingle();
  if (!co) return { error: 'Change order not found' };
  if (co.status !== 'draft') {
    return { error: `Cannot send a CO in status "${co.status}". Recall it first if you need to resend.` };
  }

  // Resolve client email — explicit project_clients wins, then project fallback
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, user_id, client_email, client_name, contract_amount, end_date')
    .eq('id', co.project_id)
    .maybeSingle();
  if (!project) return { error: 'Project missing for this change order' };

  let clientEmail = project.client_email || null;
  let clientFullName = project.client_name || null;
  const { data: pc } = await supabase
    .from('project_clients')
    .select('clients(email, full_name)')
    .eq('project_id', co.project_id)
    .limit(1)
    .single();
  if (pc?.clients?.email) {
    clientEmail = pc.clients.email;
    clientFullName = pc.clients.full_name || clientFullName;
  }
  if (!clientEmail) {
    return { error: 'No client email on file. Add one to the project before sending.' };
  }

  // Flip status FIRST so the email link points at a sendable record
  const sentAt = new Date().toISOString();
  const { error: updErr } = await supabase
    .from('change_orders')
    .update({ status: 'pending_client', sent_at: sentAt })
    .eq('id', resolved.id)
    .eq('status', 'draft');
  if (updErr) return userSafeError(updErr, "Couldn't update change order status.");

  // Pull business name for the email subject
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, business_name')
    .eq('id', userId)
    .maybeSingle();
  const { data: branding } = await supabase
    .from('client_portal_branding')
    .select('business_name')
    .eq('owner_id', userId)
    .maybeSingle();
  const businessName = branding?.business_name || profile?.business_name || profile?.full_name || '';

  // Send email (best-effort — non-fatal if mail service is down)
  let emailResult = null;
  try {
    const { sendChangeOrderEmail } = require('../../emailService');
    emailResult = await sendChangeOrderEmail({
      changeOrder: co,
      lineItems: co.change_order_line_items || [],
      project,
      businessName,
      clientEmail,
    });
  } catch (e) {
    logger.warn('[send_change_order] email send failed:', e.message);
  }

  // Optional e-signature request
  let signature = null;
  if (co.signature_required) {
    try {
      const eSign = require('../../eSignService');
      signature = await eSign.createSignatureRequest({
        ownerId: userId,
        documentType: 'change_order',
        documentId: resolved.id,
        signerName: clientFullName || 'Client',
        signerEmail: clientEmail,
      });
    } catch (sigErr) {
      logger.warn('[send_change_order] signature request failed:', sigErr.message);
    }
  }

  // Domain event + audit
  try {
    const { emit, EVENT_TYPES } = require('../../eventEmitter');
    emit({
      ownerId: userId,
      eventType: EVENT_TYPES.CHANGE_ORDER_SENT,
      actorId: userId, actorType: 'owner', source: 'agent',
      entityType: 'change_order', entityId: resolved.id,
      payload: { co_number: co.co_number, project_id: co.project_id, total_amount: co.total_amount },
      summary: `Sent change order CO-${String(co.co_number).padStart(3, '0')} to ${clientEmail}`,
    });
  } catch {}

  // Notify owner if a supervisor sent it
  try {
    sendNotification({
      userId,
      title: 'Change order sent',
      body: `CO-${String(co.co_number).padStart(3, '0')} ${co.title} sent to ${clientEmail}`,
      type: 'change_order_sent',
      data: { screen: 'Projects', change_order_id: resolved.id, project_id: co.project_id },
      projectId: co.project_id,
    });
  } catch {}

  return {
    success: true,
    change_order_id: resolved.id,
    co_number: co.co_number,
    sent_to: clientEmail,
    email_sent: !!emailResult,
    signature_request_id: signature?.id || null,
    status: 'pending_client',
  };
}

module.exports = {
  create_change_order,
  list_change_orders,
  get_change_order,
  update_change_order,
  send_change_order,
};
