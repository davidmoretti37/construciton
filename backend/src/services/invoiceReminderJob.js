/**
 * Invoice Reminder Job
 *
 * Daily tick that sends tiered payment reminders to clients on portal-shared
 * projects where the owner has invoice_reminders enabled. Each tier
 * (pre_due_3, due_today, overdue_7, overdue_14, overdue_30) fires exactly
 * once per invoice — idempotent via the invoice_reminder_log unique index.
 *
 * Sends:
 *   - Email to the client (Resend, no-op if RESEND_API_KEY missing)
 *   - In-app notification to the owner ("Reminder sent for INV-### to client")
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');
const { sendInvoiceReminderEmail } = require('./emailService');
const { notify } = require('./notificationService');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Default daily. Override for dev/testing.
const TICK_MS = parseInt(process.env.INVOICE_REMINDER_INTERVAL_MS, 10)
  || 24 * 60 * 60 * 1000;

/**
 * Map an invoice's days-from-due to a reminder tier (or null if no tier
 * applies today). Negative = before due, positive = after.
 */
function pickReminderType(daysFromDue) {
  if (daysFromDue === -3) return 'pre_due_3';
  if (daysFromDue === 0) return 'due_today';
  if (daysFromDue === 7) return 'overdue_7';
  if (daysFromDue === 14) return 'overdue_14';
  if (daysFromDue === 30) return 'overdue_30';
  return null;
}

function daysBetween(dueDateStr, today) {
  // Both as YYYY-MM-DD; compute integer days. Avoids timezone drift by
  // forcing UTC midnight on both sides.
  const due = new Date(`${dueDateStr}T00:00:00Z`).getTime();
  const now = new Date(`${today}T00:00:00Z`).getTime();
  return Math.round((now - due) / 86400000);
}

async function runInvoiceReminderTick() {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Pull every still-owed invoice that has a project and an email.
    // We filter on project-level toggle in JS rather than through Postgres
    // joins so the query stays simple and the cap stays predictable.
    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('id, user_id, project_id, invoice_number, client_email, total, amount_due, due_date, status')
      .in('status', ['unpaid', 'partial', 'overdue'])
      .gt('amount_due', 0)
      .not('project_id', 'is', null)
      .not('client_email', 'is', null);

    if (error) {
      logger.warn('[invoiceReminder] fetch invoices failed:', error.message);
      return 0;
    }
    if (!invoices || invoices.length === 0) return 0;

    // Bucket invoices by project_id so we can fetch settings + business names
    // in one query each.
    const projectIds = [...new Set(invoices.map(i => i.project_id))];
    const ownerIds = [...new Set(invoices.map(i => i.user_id))];

    const [settingsRes, profilesRes, projectClientsRes] = await Promise.all([
      supabase
        .from('client_portal_settings')
        .select('project_id, invoice_reminders')
        .in('project_id', projectIds),
      supabase
        .from('profiles')
        .select('id, business_name')
        .in('id', ownerIds),
      supabase
        .from('project_clients')
        .select('project_id')
        .in('project_id', projectIds),
    ]);

    const settingsByProject = new Map(
      (settingsRes.data || []).map(s => [s.project_id, s])
    );
    const profileByOwner = new Map(
      (profilesRes.data || []).map(p => [p.id, p])
    );
    const sharedProjects = new Set(
      (projectClientsRes.data || []).map(pc => pc.project_id)
    );

    let sent = 0;
    let skipped = 0;

    for (const inv of invoices) {
      // Project must be shared with a portal client — otherwise nothing to
      // remind about (the client never agreed to the portal flow).
      if (!sharedProjects.has(inv.project_id)) {
        skipped++;
        continue;
      }
      const settings = settingsByProject.get(inv.project_id);
      // Default ON if no row — matches the GET defaults in portalOwner.js.
      if (settings && settings.invoice_reminders === false) {
        skipped++;
        continue;
      }

      const reminderType = pickReminderType(daysBetween(inv.due_date, today));
      if (!reminderType) continue;

      // Check idempotency — skip if we already logged this tier for this invoice.
      const { data: existing } = await supabase
        .from('invoice_reminder_log')
        .select('id')
        .eq('invoice_id', inv.id)
        .eq('reminder_type', reminderType)
        .maybeSingle();
      if (existing) continue;

      const profile = profileByOwner.get(inv.user_id);
      const businessName = profile?.business_name || 'Your Contractor';

      // Send email (best-effort — log row still inserted so we don't retry forever).
      let deliveryResult = { sent: false };
      try {
        deliveryResult = await sendInvoiceReminderEmail({
          invoice: inv,
          businessName,
          reminderType,
        });
      } catch (e) {
        logger.warn(`[invoiceReminder] email threw for invoice ${inv.id}: ${e.message}`);
      }

      // Insert log row — UNIQUE(invoice_id, reminder_type) enforces idempotency
      // even under concurrent ticks.
      const { error: logErr } = await supabase
        .from('invoice_reminder_log')
        .insert({
          invoice_id: inv.id,
          reminder_type: reminderType,
          email_to: inv.client_email,
          delivery_id: deliveryResult.emailId || null,
          delivery_status: deliveryResult.sent ? 'sent' : (deliveryResult.reason || deliveryResult.error || 'failed'),
        });
      if (logErr && !logErr.message?.includes('duplicate')) {
        logger.warn(`[invoiceReminder] log insert failed for invoice ${inv.id}: ${logErr.message}`);
      }

      // Notify the owner so the action is visible in the in-app feed.
      try {
        const titleByType = {
          pre_due_3:   `Reminder sent (3 days out)`,
          due_today:   `Reminder sent (due today)`,
          overdue_7:   `Reminder sent (1 week overdue)`,
          overdue_14:  `Reminder sent (2 weeks overdue)`,
          overdue_30:  `Reminder sent (30+ days overdue)`,
        };
        await notify({
          userId: inv.user_id,
          type: 'invoice_overdue',
          title: titleByType[reminderType] || 'Invoice reminder sent',
          body: `Invoice ${inv.invoice_number} ($${parseFloat(inv.amount_due || 0).toFixed(2)}) — emailed to ${inv.client_email}`,
          actionData: { invoice_id: inv.id, project_id: inv.project_id, reminder_type: reminderType },
        });
      } catch (e) {
        logger.warn('[invoiceReminder] owner notify failed:', e.message);
      }

      sent++;
    }

    if (sent + skipped > 0) {
      logger.info(`[invoiceReminder] tick: sent=${sent} skipped=${skipped}`);
    }
    return sent;
  } catch (e) {
    logger.error('[invoiceReminder] tick threw:', e.message);
    return 0;
  }
}

function startInvoiceReminderJob() {
  if (process.env.DISABLE_INVOICE_REMINDERS === '1') {
    logger.info('[invoiceReminder] Disabled by env');
    return null;
  }
  // Initial run delayed past server boot
  setTimeout(() => { runInvoiceReminderTick().catch(() => {}); }, 60 * 1000);
  return setInterval(() => {
    runInvoiceReminderTick().catch(() => {});
  }, TICK_MS);
}

module.exports = {
  runInvoiceReminderTick,
  startInvoiceReminderJob,
  pickReminderType,
  daysBetween,
};
