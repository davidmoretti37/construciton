/**
 * Tool handlers — SMS / two-way messaging.
 * Split from handlers.js. Currently disabled at the product level
 * (not registered in TOOL_HANDLERS), kept here for one-line re-enable.
 */

const {
  supabase, logger, userSafeError,
  requireSupervisorPermission,
} = require('./_shared');

// ==================== SMS / TWO-WAY MESSAGING ====================
const twilioService = require('../../twilioService');

async function list_unread_sms(userId, args = {}) {
  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100);
  const companyId = await twilioService.resolveCompanyId(userId);
  const all = await twilioService.listThreads(companyId, { limit: 200 });
  const unread = all.filter(t => t.unread_count > 0).slice(0, limit);
  return {
    unread_count_total: unread.reduce((s, t) => s + t.unread_count, 0),
    threads: unread.map(t => ({
      customer_id: t.customer_id,
      customer_name: t.customer?.full_name || null,
      contact_phone: t.contact_phone,
      unread_count: t.unread_count,
      message_count: t.message_count,
      last_message: t.last_message?.body?.slice(0, 240) || '',
      last_message_at: t.last_message?.created_at,
      last_direction: t.last_message?.direction,
    })),
  };
}

async function read_sms_thread(userId, args = {}) {
  const companyId = await twilioService.resolveCompanyId(userId);
  let customerId = args.customer_id;

  if (!customerId && args.customer_name) {
    const { data: matches } = await supabase
      .from('clients')
      .select('id, full_name')
      .eq('owner_id', companyId)
      .ilike('full_name', `%${args.customer_name}%`)
      .limit(5);
    if (!matches || matches.length === 0) {
      return { error: `No customer found matching "${args.customer_name}"` };
    }
    if (matches.length > 1) {
      return {
        error: 'Multiple customers matched — please specify customer_id',
        candidates: matches.map(m => ({ id: m.id, name: m.full_name })),
      };
    }
    customerId = matches[0].id;
  }

  if (!customerId) {
    return { error: 'customer_id or customer_name is required' };
  }

  const limit = Math.min(Math.max(Number(args.limit) || 50, 1), 200);
  const messages = await twilioService.getThread(companyId, customerId, { limit });
  // Side effect: mark thread read since the agent just surfaced it.
  await twilioService.markThreadRead(companyId, customerId);

  const { data: customer } = await supabase
    .from('clients')
    .select('id, full_name, phone, sms_phone, email')
    .eq('id', customerId)
    .single();

  return {
    customer,
    message_count: messages.length,
    messages: messages.map(m => ({
      id: m.id,
      direction: m.direction,
      body: m.body,
      from: m.from_number,
      to: m.to_number,
      status: m.status,
      created_at: m.created_at,
      read_at: m.read_at,
    })),
  };
}

async function send_sms(userId, args = {}) {
  const { customer_id, to_number, body } = args;
  if (!body || !String(body).trim()) {
    return { error: 'body is required' };
  }
  if (!customer_id && !to_number) {
    return { error: 'customer_id or to_number is required' };
  }

  const companyId = await twilioService.resolveCompanyId(userId);

  let toNumber = to_number;
  let resolvedCustomerId = customer_id || null;
  if (resolvedCustomerId && !toNumber) {
    const { data: client } = await supabase
      .from('clients')
      .select('id, owner_id, phone, sms_phone')
      .eq('id', resolvedCustomerId)
      .single();
    if (!client || client.owner_id !== companyId) {
      return { error: 'Customer not found in this company' };
    }
    toNumber = client.sms_phone || client.phone;
    if (!toNumber) return { error: 'Customer has no phone on file' };
  }

  try {
    const row = await twilioService.sendSms(companyId, toNumber, body, {
      customerId: resolvedCustomerId,
      sentBy: userId,
    });
    return {
      id: row.id,
      to: row.to_number,
      body: row.body,
      status: row.status,
      mock: !twilioService.isLive(),
      sent_at: row.created_at,
    };
  } catch (err) {
    logger.error('[send_sms tool] failed:', err.message);
    return { error: err.message };
  }
}

// ==================== AUDIT LOG ====================

/**
 * Compute a readable diff between two row snapshots. Returns an
 * array of `{ field, before, after }` for fields that actually
 * changed. Used by all three audit handlers and exported via the
 * agent so Claude can render "total: $4,200 → $4,800" naturally.
 */

module.exports = { list_unread_sms, read_sms_thread, send_sms };
