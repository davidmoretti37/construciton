/**
 * Twilio Service — two-way SMS for Sylk.
 *
 * Each company (owner profile) gets their own Twilio number, provisioned the
 * first time they need it. Inbound replies route to the customer record by
 * matching the From number against `clients.sms_phone` or `clients.phone`.
 *
 * If TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN are not set we run in mock mode:
 * outbound messages are persisted with status='mock' and inbound webhook
 * handling still works (signature check is skipped). This keeps local dev and
 * CI usable without real credentials and matches the pattern the project uses
 * for other paid integrations.
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { sendPushToUser } = require('./pushNotificationService');

let twilioLib = null;
try {
  // Top-level require so the missing-package failure mode shows up at boot,
  // not on the first SMS.
  twilioLib = require('twilio');
} catch (e) {
  logger.warn('[Twilio] twilio package not installed — running in mock mode regardless of env');
}

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const WEBHOOK_BASE_URL = process.env.TWILIO_WEBHOOK_BASE_URL || '';

function isLive() {
  return !!(twilioLib && ACCOUNT_SID && AUTH_TOKEN);
}

let _client = null;
function getClient() {
  if (!isLive()) return null;
  if (!_client) _client = twilioLib(ACCOUNT_SID, AUTH_TOKEN);
  return _client;
}

/**
 * Strip a phone string to digits only and trim US country code so that
 * "+1 (555) 123-4567" and "5551234567" compare equal. Returns last 10 digits
 * for US-shaped numbers and the full digit string otherwise.
 */
function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D+/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

/**
 * Look up the company (owner profile) that owns a given Twilio number.
 * Inbound webhook arrives with To = company number; we resolve back to the
 * owner so the message is stored under the right tenant.
 */
async function findCompanyByNumber(toNumber) {
  const target = normalizePhone(toNumber);
  if (!target) return null;
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, business_phone_number, twilio_number')
    .or(`business_phone_number.ilike.%${target}%,twilio_number.ilike.%${target}%`)
    .limit(50);
  if (error) {
    logger.error('[Twilio] findCompanyByNumber error:', error.message);
    return null;
  }
  // Tighten the match in JS — ilike is fuzzy. We want exact normalized match.
  for (const row of data || []) {
    const candidate = normalizePhone(row.twilio_number || row.business_phone_number);
    if (candidate && candidate === target) return row;
  }
  return null;
}

/**
 * Look up the customer record by phone within the given company's clients.
 * Returns null if no match (the message will still be stored with
 * customer_id=null and surfaced as an unknown-sender thread).
 */
async function findCustomerByPhone(companyId, fromNumber) {
  const target = normalizePhone(fromNumber);
  if (!target) return null;
  const { data, error } = await supabaseAdmin
    .from('clients')
    .select('id, full_name, phone, sms_phone')
    .eq('owner_id', companyId)
    .limit(500);
  if (error) {
    logger.error('[Twilio] findCustomerByPhone error:', error.message);
    return null;
  }
  for (const c of data || []) {
    if (normalizePhone(c.sms_phone) === target) return c;
    if (normalizePhone(c.phone) === target) return c;
  }
  return null;
}

/**
 * Provision a Twilio phone number for a company. Searches available local
 * numbers in `areaCode`, buys the first one, and saves the SID + number on
 * the owner's profile. Idempotent: if the company already has a number we
 * return it unchanged.
 */
async function provisionNumber(companyId, areaCode) {
  const { data: profile, error: pErr } = await supabaseAdmin
    .from('profiles')
    .select('id, twilio_number, twilio_phone_sid, business_phone_number, phone_provisioned_at')
    .eq('id', companyId)
    .single();
  if (pErr || !profile) {
    throw new Error('Company profile not found');
  }
  const existing = profile.twilio_number || profile.business_phone_number;
  if (existing) {
    return { phoneNumber: existing, sid: profile.twilio_phone_sid, alreadyProvisioned: true };
  }

  if (!isLive()) {
    // Mock provisioning: synthesize a deterministic test number so dev
    // builds can exercise the full flow without paying Twilio.
    const mockSuffix = String(companyId).replace(/\D+/g, '').slice(-7).padStart(7, '0');
    const phoneNumber = `+1${areaCode || '555'}${mockSuffix.slice(0, 7)}`;
    const sid = `MOCK_${companyId.slice(0, 8)}`;
    await supabaseAdmin.from('profiles').update({
      twilio_number: phoneNumber,
      business_phone_number: phoneNumber,
      twilio_phone_sid: sid,
      phone_provisioned_at: new Date().toISOString(),
    }).eq('id', companyId);
    return { phoneNumber, sid, mock: true };
  }

  const client = getClient();
  const search = await client
    .availablePhoneNumbers('US')
    .local
    .list({ areaCode: areaCode ? Number(areaCode) : undefined, smsEnabled: true, limit: 1 });
  if (!search || search.length === 0) {
    throw new Error(`No Twilio numbers available in area code ${areaCode || 'any'}`);
  }

  const smsUrl = WEBHOOK_BASE_URL ? `${WEBHOOK_BASE_URL.replace(/\/$/, '')}/webhooks/twilio/sms` : undefined;
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: search[0].phoneNumber,
    smsUrl,
    smsMethod: smsUrl ? 'POST' : undefined,
  });

  await supabaseAdmin.from('profiles').update({
    twilio_number: purchased.phoneNumber,
    business_phone_number: purchased.phoneNumber,
    twilio_phone_sid: purchased.sid,
    phone_provisioned_at: new Date().toISOString(),
  }).eq('id', companyId);

  return { phoneNumber: purchased.phoneNumber, sid: purchased.sid };
}

/**
 * Send an outbound SMS from the company's number. Auto-provisions a number
 * if the company doesn't yet have one (first-SMS-use trigger).
 *
 * @param {string} companyId — owner profile id (auth user id of the owner)
 * @param {string} to — destination phone (any format; we'll let Twilio parse)
 * @param {string} body — message body
 * @param {Object} opts
 * @param {string} [opts.customerId] — link to clients.id when known
 * @param {string} [opts.sentBy] — auth user id of the sender (owner or supervisor)
 * @returns the inserted sms_messages row
 */
async function sendSms(companyId, to, body, opts = {}) {
  if (!companyId) throw new Error('companyId is required');
  if (!to) throw new Error('to is required');
  if (!body || !String(body).trim()) throw new Error('body is required');

  const { data: profile, error: pErr } = await supabaseAdmin
    .from('profiles')
    .select('id, twilio_number, business_phone_number, twilio_phone_sid')
    .eq('id', companyId)
    .single();
  if (pErr || !profile) throw new Error('Company profile not found');

  let fromNumber = profile.twilio_number || profile.business_phone_number;
  if (!fromNumber) {
    const provisioned = await provisionNumber(companyId, opts.areaCode);
    fromNumber = provisioned.phoneNumber;
  }

  // Resolve customer if not passed but we can match on phone
  let customerId = opts.customerId || null;
  if (!customerId) {
    const cust = await findCustomerByPhone(companyId, to);
    if (cust) customerId = cust.id;
  }

  let twilioSid = null;
  let status = 'mock';
  let errorMessage = null;

  if (isLive()) {
    try {
      const msg = await getClient().messages.create({ from: fromNumber, to, body });
      twilioSid = msg.sid;
      status = msg.status || 'queued';
    } catch (err) {
      status = 'failed';
      errorMessage = err?.message || String(err);
      logger.error('[Twilio] sendSms failed:', errorMessage);
    }
  } else {
    logger.info(`[Twilio:mock] Would send to ${to} from ${fromNumber}: ${body.slice(0, 80)}`);
  }

  const { data: row, error: insertErr } = await supabaseAdmin
    .from('sms_messages')
    .insert({
      company_id: companyId,
      customer_id: customerId,
      direction: 'out',
      body,
      from_number: fromNumber,
      to_number: to,
      twilio_sid: twilioSid,
      status,
      error_message: errorMessage,
      sent_by: opts.sentBy || null,
    })
    .select('*')
    .single();

  if (insertErr) {
    logger.error('[Twilio] sendSms insert error:', insertErr.message);
    throw new Error(`Failed to persist outbound SMS: ${insertErr.message}`);
  }

  return row;
}

/**
 * Validate Twilio webhook signature. Returns true if the request is from
 * Twilio (or if we're in mock mode and the validator is intentionally
 * bypassed). Mirrors Twilio's published validation algorithm.
 */
function validateInboundSignature(req) {
  if (!isLive()) return true; // mock mode — accept anything (still rate-limited)
  const signature = req.headers['x-twilio-signature'] || req.headers['X-Twilio-Signature'];
  if (!signature) return false;
  const url = (WEBHOOK_BASE_URL.replace(/\/$/, '') + req.originalUrl) || `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  try {
    return twilioLib.validateRequest(AUTH_TOKEN, signature, url, req.body || {});
  } catch (e) {
    logger.warn('[Twilio] signature validation threw:', e.message);
    return false;
  }
}

/**
 * Handle an inbound Twilio SMS webhook. Parses the urlencoded body, resolves
 * the company by To-number, stores the message, attempts customer match by
 * From-number, and pushes a notification to the company owner.
 *
 * Returns { status: 'ok', messageId, companyId, customerId }.
 */
async function handleInbound(req) {
  const body = req.body || {};
  const fromNumber = body.From;
  const toNumber = body.To;
  const messageBody = body.Body || '';
  const twilioSid = body.MessageSid || body.SmsSid || null;

  if (!fromNumber || !toNumber) {
    return { status: 'error', error: 'missing From/To' };
  }

  const company = await findCompanyByNumber(toNumber);
  if (!company) {
    logger.warn(`[Twilio] Inbound for unknown number ${toNumber}`);
    return { status: 'ignored', reason: 'unknown company number' };
  }

  const customer = await findCustomerByPhone(company.id, fromNumber);

  const { data: row, error: insertErr } = await supabaseAdmin
    .from('sms_messages')
    .insert({
      company_id: company.id,
      customer_id: customer?.id || null,
      direction: 'in',
      body: messageBody,
      from_number: fromNumber,
      to_number: toNumber,
      twilio_sid: twilioSid,
      status: 'received',
    })
    .select('*')
    .single();

  if (insertErr) {
    logger.error('[Twilio] inbound insert error:', insertErr.message);
    return { status: 'error', error: insertErr.message };
  }

  // Best-effort push notification — don't fail the webhook if it errors.
  // Push lands on the owner so the supervisor inbox surfacing comes from
  // the screen subscription, not from a duplicate push.
  try {
    const senderLabel = customer?.full_name || fromNumber;
    await sendPushToUser(company.id, {
      title: `New SMS from ${senderLabel}`,
      body: messageBody.slice(0, 140),
      data: {
        screen: 'Thread',
        params: { customerId: customer?.id || null, threadKey: customer?.id || normalizePhone(fromNumber) },
      },
    });
  } catch (e) {
    logger.warn('[Twilio] inbound push notify failed:', e.message);
  }

  return { status: 'ok', messageId: row.id, companyId: company.id, customerId: customer?.id || null };
}

/**
 * Build the threads list for a company. Groups sms_messages by customer_id
 * (unmatched messages threaded by from_number digits). For each thread we
 * return the latest message preview, total + unread counts, and basic
 * customer fields when known.
 */
async function listThreads(companyId, { limit = 100 } = {}) {
  const { data: messages, error } = await supabaseAdmin
    .from('sms_messages')
    .select('id, customer_id, direction, body, from_number, to_number, status, created_at, read_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);

  const threadMap = new Map();
  for (const m of messages || []) {
    const key = m.customer_id || `phone:${normalizePhone(m.direction === 'in' ? m.from_number : m.to_number)}`;
    if (!threadMap.has(key)) {
      threadMap.set(key, {
        key,
        customer_id: m.customer_id || null,
        contact_phone: m.direction === 'in' ? m.from_number : m.to_number,
        last_message: m,
        message_count: 0,
        unread_count: 0,
      });
    }
    const t = threadMap.get(key);
    t.message_count += 1;
    if (m.direction === 'in' && !m.read_at) t.unread_count += 1;
  }

  const threads = Array.from(threadMap.values());

  // Hydrate customer info for known customer_ids in one query.
  const customerIds = threads.map(t => t.customer_id).filter(Boolean);
  let customerMap = new Map();
  if (customerIds.length > 0) {
    const { data: clients } = await supabaseAdmin
      .from('clients')
      .select('id, full_name, phone, sms_phone, email')
      .in('id', customerIds);
    for (const c of clients || []) customerMap.set(c.id, c);
  }
  for (const t of threads) {
    if (t.customer_id && customerMap.has(t.customer_id)) {
      t.customer = customerMap.get(t.customer_id);
    } else {
      t.customer = null;
    }
  }

  threads.sort((a, b) => {
    if ((a.unread_count > 0) !== (b.unread_count > 0)) return a.unread_count > 0 ? -1 : 1;
    return new Date(b.last_message.created_at) - new Date(a.last_message.created_at);
  });

  return threads.slice(0, limit);
}

/**
 * Full message history for one thread (by customer_id). Inbox UIs fetch this
 * when a thread is opened.
 */
async function getThread(companyId, customerId, { limit = 200 } = {}) {
  const { data, error } = await supabaseAdmin
    .from('sms_messages')
    .select('*')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Mark all unread inbound messages for a thread as read.
 */
async function markThreadRead(companyId, customerId) {
  const { data, error } = await supabaseAdmin
    .from('sms_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .eq('direction', 'in')
    .is('read_at', null)
    .select('id');
  if (error) throw new Error(error.message);
  return { updated: data?.length || 0 };
}

/**
 * Resolve the owner/company id for an authenticated user. Owners have
 * profiles.owner_id = NULL; supervisors have it set to their parent owner.
 */
async function resolveCompanyId(userId) {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, role, owner_id')
    .eq('id', userId)
    .single();
  if (!profile) return userId; // assume the user is a fresh owner
  return profile.owner_id || profile.id;
}

module.exports = {
  isLive,
  normalizePhone,
  provisionNumber,
  sendSms,
  handleInbound,
  validateInboundSignature,
  listThreads,
  getThread,
  markThreadRead,
  findCustomerByPhone,
  findCompanyByNumber,
  resolveCompanyId,
};
