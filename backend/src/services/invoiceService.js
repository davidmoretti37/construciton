/**
 * Sub Invoice Service
 *
 * Sub creates invoices against engagements; GC reviews + records payments.
 * No automated payment processing in v1 — GC manually marks paid with
 * method/reference (check #, ACH ID, Zelle, etc.).
 */

const { createClient } = require('@supabase/supabase-js');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// =============================================================================
// createInvoice (sub-side)
// =============================================================================

async function createInvoice({
  engagementId,
  subAuthUserId,
  invoiceNumber = null,
  totalAmount,
  retentionAmount = 0,
  periodStart = null,
  periodEnd = null,
  dueAt = null,
  notes = null,
  lines = [],
}) {
  if (!engagementId || totalAmount == null) {
    throw new Error('engagementId and totalAmount required');
  }

  // Verify engagement is owned by this sub
  const { data: engagement, error: engErr } = await supabase
    .from('sub_engagements')
    .select('id, sub_organization_id, sub:sub_organizations(auth_user_id)')
    .eq('id', engagementId)
    .maybeSingle();
  if (engErr) throw engErr;
  if (!engagement) throw new Error('Engagement not found');
  if (engagement.sub.auth_user_id !== subAuthUserId) {
    throw new Error('Access denied — only the engaged sub can invoice');
  }

  const netAmount = Number(totalAmount) - Number(retentionAmount || 0);

  const { data: invoice, error } = await supabase
    .from('sub_invoices')
    .insert({
      engagement_id: engagementId,
      invoice_number: invoiceNumber,
      total_amount: totalAmount,
      retention_amount: retentionAmount,
      net_amount: netAmount,
      period_start: periodStart,
      period_end: periodEnd,
      due_at: dueAt,
      notes,
      status: 'draft',
    })
    .select()
    .single();
  if (error) throw error;

  if (Array.isArray(lines) && lines.length > 0) {
    const lineRows = lines.map((l, idx) => ({
      sub_invoice_id: invoice.id,
      line_number: l.line_number || (idx + 1),
      description: l.description || '',
      quantity: l.quantity || 1,
      unit_price: l.unit_price || null,
      amount: l.amount,
    }));
    const { error: linesErr } = await supabase
      .from('sub_invoice_lines')
      .insert(lineRows);
    if (linesErr) logger.warn('[invoiceService] line insert error:', linesErr);
  }

  return invoice;
}

async function sendInvoice({ invoiceId, subAuthUserId }) {
  const { data: invoice } = await supabase
    .from('sub_invoices')
    .select('*, engagement:sub_engagements(id, gc_user_id, sub:sub_organizations(auth_user_id, legal_name))')
    .eq('id', invoiceId)
    .maybeSingle();
  if (!invoice) throw new Error('Invoice not found');
  if (invoice.engagement.sub.auth_user_id !== subAuthUserId) {
    throw new Error('Access denied');
  }
  const { data, error } = await supabase
    .from('sub_invoices')
    .update({ status: 'sent', submitted_at: new Date().toISOString() })
    .eq('id', invoiceId)
    .select()
    .single();
  if (error) throw error;

  try {
    await notificationService.notify({
      userId: invoice.engagement.gc_user_id,
      type: 'sub_invoice_sent',
      title: `Invoice from ${invoice.engagement.sub.legal_name}`,
      body: `$${Number(invoice.total_amount).toLocaleString()} • due ${invoice.due_at || 'on receipt'}`,
      actionData: { engagement_id: invoice.engagement.id, invoice_id: invoice.id },
    });
  } catch (e) { logger.warn('[invoiceService] notify on sendInvoice:', e.message); }

  return data;
}

// =============================================================================
// listInvoices
// =============================================================================

async function listInvoicesForEngagement({ engagementId, callerUserId }) {
  // Caller must be GC or sub on this engagement
  const { data: engagement } = await supabase
    .from('sub_engagements')
    .select('id, gc_user_id, sub:sub_organizations(auth_user_id)')
    .eq('id', engagementId)
    .maybeSingle();
  if (!engagement) return [];
  const isGc = engagement.gc_user_id === callerUserId;
  const isSub = engagement.sub?.auth_user_id === callerUserId;
  if (!isGc && !isSub) return [];

  const { data, error } = await supabase
    .from('sub_invoices')
    .select('*, lines:sub_invoice_lines(*)')
    .eq('engagement_id', engagementId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function listInvoicesForSub(subAuthUserId) {
  const { data: sub } = await supabase
    .from('sub_organizations')
    .select('id')
    .eq('auth_user_id', subAuthUserId)
    .maybeSingle();
  if (!sub) return [];

  const { data: engagements } = await supabase
    .from('sub_engagements')
    .select('id')
    .eq('sub_organization_id', sub.id);
  const engagementIds = (engagements || []).map((e) => e.id);
  if (engagementIds.length === 0) return [];

  const { data, error } = await supabase
    .from('sub_invoices')
    .select('*, engagement:sub_engagements(id, project_id, trade, gc_user_id)')
    .in('engagement_id', engagementIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// =============================================================================
// recordPayment (GC-side)
// =============================================================================

async function recordPayment({
  engagementId,
  gcUserId,
  amount,
  paidAt,
  method,
  reference = null,
  subInvoiceId = null,
  milestoneId = null,
  notes = null,
}) {
  if (!engagementId || amount == null || !paidAt) {
    throw new Error('engagementId, amount, paidAt required');
  }

  const { data: engagement } = await supabase
    .from('sub_engagements')
    .select('gc_user_id, sub:sub_organizations(auth_user_id, legal_name)')
    .eq('id', engagementId)
    .maybeSingle();
  if (!engagement) throw new Error('Engagement not found');
  if (engagement.gc_user_id !== gcUserId) throw new Error('Access denied');

  const { data, error } = await supabase
    .from('payment_records')
    .insert({
      engagement_id: engagementId,
      sub_invoice_id: subInvoiceId,
      milestone_id: milestoneId,
      amount,
      paid_at: paidAt,
      method,
      reference,
      notes,
      recorded_by: gcUserId,
    })
    .select()
    .single();
  if (error) throw error;

  // Notify the sub
  try {
    if (engagement.sub?.auth_user_id) {
      await notificationService.notify({
        userId: engagement.sub.auth_user_id,
        type: 'sub_payment_received',
        title: 'Payment received',
        body: `$${Number(amount).toLocaleString()} • ${method || 'recorded'}${reference ? ` (${reference})` : ''}`,
        actionData: { engagement_id: engagementId, payment_id: data.id },
      });
    }
  } catch (e) { logger.warn('[invoiceService] notify on recordPayment:', e.message); }

  // If tied to an invoice, update invoice status when fully paid
  if (subInvoiceId) {
    const { data: inv } = await supabase
      .from('sub_invoices')
      .select('id, total_amount, retention_amount')
      .eq('id', subInvoiceId)
      .single();
    const { data: paidRows } = await supabase
      .from('payment_records')
      .select('amount')
      .eq('sub_invoice_id', subInvoiceId);
    const paidSoFar = (paidRows || []).reduce((s, r) => s + Number(r.amount), 0);
    const target = Number(inv.total_amount) - Number(inv.retention_amount || 0);
    if (paidSoFar >= target) {
      await supabase.from('sub_invoices')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', subInvoiceId);
    } else if (paidSoFar > 0) {
      await supabase.from('sub_invoices')
        .update({ status: 'partial_paid' })
        .eq('id', subInvoiceId);
    }
  }

  return data;
}

// =============================================================================
// getEngagementBalance — computed
// =============================================================================

async function getEngagementBalance({ engagementId, callerUserId }) {
  const { data: engagement } = await supabase
    .from('sub_engagements')
    .select('id, gc_user_id, contract_amount, retention_pct, sub:sub_organizations(auth_user_id)')
    .eq('id', engagementId)
    .maybeSingle();
  if (!engagement) return null;

  const isGc = engagement.gc_user_id === callerUserId;
  const isSub = engagement.sub?.auth_user_id === callerUserId;
  if (!isGc && !isSub) return null;

  const { data: payments } = await supabase
    .from('payment_records')
    .select('amount')
    .eq('engagement_id', engagementId);
  const paid = (payments || []).reduce((s, r) => s + Number(r.amount), 0);

  const { data: invoices } = await supabase
    .from('sub_invoices')
    .select('total_amount, status')
    .eq('engagement_id', engagementId);
  const invoiced = (invoices || []).reduce((s, r) => s + Number(r.total_amount), 0);

  const contract = Number(engagement.contract_amount || 0);
  const retentionPct = Number(engagement.retention_pct || 0) / 100;
  const retention = contract * retentionPct;

  return {
    contract_amount: contract,
    retention_amount: retention,
    invoiced_amount: invoiced,
    paid_amount: paid,
    outstanding: Math.max(0, invoiced - paid),
    remaining_to_invoice: Math.max(0, contract - retention - invoiced),
  };
}

module.exports = {
  createInvoice,
  sendInvoice,
  listInvoicesForEngagement,
  listInvoicesForSub,
  recordPayment,
  getEngagementBalance,
};
