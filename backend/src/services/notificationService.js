/**
 * Notification Service
 *
 * Fan-out helper that creates a public.notifications row (in-app) and
 * (optionally) sends an email via the existing emailService.
 *
 * Used by: subs, engagements, bidding, invoices, payments, compliance cron.
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function getEmailService() {
  // Lazy-load same as eSignService — emailService eagerly instantiates Resend.
  // eslint-disable-next-line global-require
  return require('./emailService');
}

const TYPE_DEFAULTS = {
  sub_doc_uploaded:        { icon: 'cloud-upload-outline', color: '#10B981' },
  sub_doc_expiring:        { icon: 'alert-circle-outline', color: '#F59E0B' },
  sub_doc_expired:         { icon: 'close-circle-outline', color: '#DC2626' },
  sub_doc_requested:       { icon: 'document-attach-outline', color: '#3B82F6' },
  sub_bid_invitation:      { icon: 'mail-outline', color: '#3B82F6' },
  sub_bid_submitted:       { icon: 'send-outline', color: '#3B82F6' },
  sub_bid_accepted:        { icon: 'checkmark-circle-outline', color: '#10B981' },
  sub_bid_declined:        { icon: 'close-outline', color: '#6B7280' },
  sub_contract_sent:       { icon: 'document-text-outline', color: '#3B82F6' },
  sub_contract_signed:     { icon: 'checkmark-done-outline', color: '#10B981' },
  sub_invoice_sent:        { icon: 'cash-outline', color: '#3B82F6' },
  sub_payment_received:    { icon: 'cash-outline', color: '#10B981' },
  sub_engagement_status_changed: { icon: 'sync-outline', color: '#3B82F6' },
  sub_upgrade_invite:      { icon: 'rocket-outline', color: '#8B5CF6' },
};

/**
 * Create a notification (in-app) and (optionally) send an email.
 *
 * params: {
 *   userId,        // recipient auth.users.id
 *   type,          // one of TYPE_DEFAULTS keys (or a legacy notification type)
 *   title,
 *   body,
 *   icon, color,   // optional overrides
 *   email,         // optional { to, subject, html, text } to send via Resend
 *   actionData,    // arbitrary JSONB payload for the in-app deep link
 * }
 */
async function notify({
  userId,
  type,
  title,
  body,
  icon = null,
  color = null,
  email = null,
  actionData = null,
}) {
  if (!userId || !type || !title || !body) {
    throw new Error('userId, type, title, body required');
  }

  const defaults = TYPE_DEFAULTS[type] || {};
  const insertRow = {
    user_id: userId,
    title,
    body,
    type,
    icon: icon || defaults.icon || 'notifications',
    color: color || defaults.color || '#3B82F6',
  };
  if (actionData) insertRow.action_data = actionData;

  const { data, error } = await supabase
    .from('notifications')
    .insert(insertRow)
    .select()
    .single();
  if (error) {
    logger.error('[notificationService] notify insert error:', error);
    // do not throw — best-effort
  }

  if (email && email.to && process.env.RESEND_API_KEY) {
    try {
      const emailSvc = getEmailService();
      if (typeof emailSvc.sendEmail === 'function') {
        await emailSvc.sendEmail({
          to: email.to,
          subject: email.subject || title,
          html: email.html,
          text: email.text || body,
        });
      }
    } catch (e) {
      logger.warn('[notificationService] email send failed:', e.message);
    }
  }

  return data;
}

/**
 * Notify multiple users with the same payload.
 */
async function notifyMany(userIds, payload) {
  await Promise.all(userIds.map((userId) => notify({ ...payload, userId })));
}

module.exports = {
  notify,
  notifyMany,
  TYPE_DEFAULTS,
};
