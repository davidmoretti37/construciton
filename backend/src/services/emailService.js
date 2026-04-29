const { Resend } = require('resend');
const logger = require('../utils/logger');

// Lazy-init so the module is safe to require at boot when RESEND_API_KEY is
// missing (CI / local dev without prod email creds). Same pattern as twilioService.
let _resend = null;
function getResend() {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) {
    logger.warn('[email] RESEND_API_KEY not set — outbound emails are no-ops');
    return null;
  }
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// Read-time proxy so legacy `resend.emails.send(...)` call sites keep working
// without sprinkling getResend() everywhere. Methods on the proxy throw a
// clear error if no key is set, instead of an obscure SDK constructor error.
const resend = new Proxy({}, {
  get(_target, prop) {
    const r = getResend();
    if (!r) {
      // Return a chainable no-op so consumer-side `await resend.emails.send(...)`
      // resolves to a sentinel rather than crashing the request.
      const noop = new Proxy(function () {}, {
        get: () => noop,
        apply: () => Promise.resolve({ id: null, mocked: true, reason: 'RESEND_API_KEY missing' }),
      });
      return noop;
    }
    return r[prop];
  },
});

/** Escape user-supplied values before embedding in HTML emails */
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FROM_EMAIL = process.env.EMAIL_FROM || 'Sylk <noreply@sylkapp.ai>';
const PORTAL_URL = process.env.PORTAL_URL || 'https://sylkapp.ai/portal';

/**
 * Send invoice email to client with payment link
 */
async function sendInvoiceEmail({ invoice, businessName, pdfUrl }) {
  if (!invoice.client_email) {
    throw new Error('No client email on invoice');
  }

  if (!process.env.RESEND_API_KEY) {
    logger.warn('[Email] RESEND_API_KEY not set, skipping email');
    return { sent: false, reason: 'no_api_key' };
  }

  const amount = parseFloat(invoice.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const amountDue = parseFloat(invoice.amount_due || invoice.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  const dueDate = invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'Upon receipt';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #F8FAFC; color: #0F172A; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #FFFFFF; border-radius: 16px; padding: 32px; box-shadow: 0 2px 8px rgba(15,23,42,0.06); }
    .header { text-align: center; margin-bottom: 24px; }
    .business-name { font-size: 14px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; }
    .invoice-title { font-size: 24px; font-weight: 700; color: #0F172A; margin-top: 8px; }
    .invoice-num { font-size: 13px; color: #94A3B8; margin-top: 4px; }
    .divider { height: 1px; background: #F1F5F9; margin: 20px 0; }
    .amount-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
    .amount-label { font-size: 14px; color: #64748B; }
    .amount-value { font-size: 14px; font-weight: 600; color: #0F172A; }
    .total-row { padding: 12px 0; border-top: 2px solid #F1F5F9; margin-top: 8px; }
    .total-value { font-size: 28px; font-weight: 700; color: #0F172A; }
    .due-date { font-size: 13px; color: #94A3B8; margin-top: 4px; }
    .pay-btn { display: block; background: #1E40AF; color: #FFFFFF !important; text-decoration: none; text-align: center; font-size: 16px; font-weight: 600; padding: 16px; border-radius: 12px; margin-top: 24px; }
    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #94A3B8; }
    .pdf-link { color: #1E40AF; text-decoration: none; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="business-name">${esc(businessName || 'Your Contractor')}</div>
        <div class="invoice-title">Invoice</div>
        <div class="invoice-num">${esc(invoice.invoice_number || '')}</div>
      </div>

      <div class="divider"></div>

      ${invoice.project_name ? `<div class="amount-row"><span class="amount-label">Project</span><span class="amount-value">${esc(invoice.project_name)}</span></div>` : ''}
      <div class="amount-row"><span class="amount-label">Subtotal</span><span class="amount-value">$${parseFloat(invoice.subtotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>
      ${invoice.tax_amount > 0 ? `<div class="amount-row"><span class="amount-label">Tax (${invoice.tax_rate || 0}%)</span><span class="amount-value">$${parseFloat(invoice.tax_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>` : ''}

      <div class="total-row">
        <div class="amount-row">
          <span class="amount-label" style="font-size:16px;font-weight:600;color:#0F172A;">Amount Due</span>
          <span class="total-value">$${amountDue}</span>
        </div>
        <div class="due-date">Due ${dueDate}</div>
      </div>

      <a href="${PORTAL_URL}" class="pay-btn">View & Pay Invoice</a>

      ${pdfUrl ? `<div style="text-align:center;margin-top:16px;"><a href="${pdfUrl}" class="pdf-link">Download PDF</a></div>` : ''}
    </div>

    <div class="footer">
      Sent via <strong>Sylk</strong> — the modern way to manage projects<br>
      ${esc(businessName || '')}
    </div>
  </div>
</body>
</html>`;

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [invoice.client_email],
      subject: `Invoice ${invoice.invoice_number || ''} — $${amountDue} due ${dueDate}`,
      html,
    });

    if (error) {
      logger.error('[Email] Resend error:', error);
      return { sent: false, error: error.message };
    }

    logger.info(`[Email] Invoice ${invoice.invoice_number} sent to ${invoice.client_email}`);
    return { sent: true, emailId: data?.id, email: invoice.client_email };
  } catch (err) {
    logger.error('[Email] Send failed:', err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Send estimate email to client
 */
async function sendEstimateEmail({ estimate, businessName, pdfUrl }) {
  if (!estimate.client_email || !process.env.RESEND_API_KEY) {
    return { sent: false, reason: 'no_email_or_key' };
  }

  const amount = parseFloat(estimate.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [estimate.client_email],
      subject: `Estimate ${estimate.estimate_number || ''} — $${amount} from ${businessName || 'Your Contractor'}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;">
          <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <h2 style="margin:0;color:#0F172A;">${esc(businessName || 'Your Contractor')}</h2>
            <p style="color:#64748B;">You have a new estimate for $${amount}</p>
            <p style="font-size:13px;color:#94A3B8;">${esc(estimate.estimate_number || '')} • ${esc(estimate.project_name || '')}</p>
            <a href="${PORTAL_URL}" style="display:block;background:#1E40AF;color:#fff;text-align:center;padding:16px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:24px;">View Estimate</a>
            ${pdfUrl ? `<p style="text-align:center;margin-top:12px;"><a href="${pdfUrl}" style="color:#1E40AF;font-size:13px;">Download PDF</a></p>` : ''}
          </div>
        </div>`,
    });

    if (error) return { sent: false, error: error.message };
    return { sent: true, emailId: data?.id };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

/**
 * Send a signature-request email with a signing link.
 */
async function sendSignatureRequestEmail({ documentType, documentTitle, signerName, signerEmail, businessName, signingUrl, expiresAt }) {
  if (!signerEmail || !process.env.RESEND_API_KEY) {
    return { sent: false, reason: 'no_email_or_key' };
  }
  const expires = expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null;
  const docLabel = { estimate: 'Estimate', invoice: 'Invoice', contract: 'Contract', change_order: 'Change Order' }[documentType] || 'Document';

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [signerEmail],
      subject: `Please sign: ${docLabel} ${esc(documentTitle || '')} from ${esc(businessName || 'Your Contractor')}`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#F8FAFC;">
          <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 8px rgba(15,23,42,0.06);">
            <div style="font-size:14px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;text-align:center;">${esc(businessName || 'Your Contractor')}</div>
            <h2 style="margin:8px 0 0;color:#0F172A;text-align:center;">Signature requested</h2>
            <p style="color:#64748B;text-align:center;font-size:14px;margin-top:6px;">${esc(docLabel)} ${esc(documentTitle || '')}</p>
            <p style="color:#0F172A;font-size:15px;line-height:1.5;margin-top:24px;">Hi ${esc(signerName || 'there')},</p>
            <p style="color:#0F172A;font-size:15px;line-height:1.5;">Please review and sign the ${docLabel.toLowerCase()} below.${expires ? ` This link expires on ${expires}.` : ''}</p>
            <a href="${signingUrl}" style="display:block;background:#1E40AF;color:#fff;text-align:center;padding:16px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:24px;font-size:16px;">Review & Sign</a>
            <p style="color:#94A3B8;font-size:12px;margin-top:24px;text-align:center;">If the button doesn't work, copy this link into your browser:<br><span style="color:#475569;word-break:break-all;">${signingUrl}</span></p>
          </div>
          <div style="text-align:center;margin-top:24px;font-size:12px;color:#94A3B8;">Sent via <strong>Sylk</strong></div>
        </div>`,
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true, emailId: data?.id };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

/**
 * Notify the owner that their document was signed.
 */
async function sendSignatureCompletedEmail({ ownerEmail, documentTitle, signerName, signedPdfUrl }) {
  if (!ownerEmail || !process.env.RESEND_API_KEY) {
    return { sent: false, reason: 'no_email_or_key' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [ownerEmail],
      subject: `Signed: ${esc(documentTitle || '')}`,
      html: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;">
          <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
            <h2 style="margin:0;color:#0F172A;">Document signed</h2>
            <p style="color:#64748B;">${esc(signerName || 'The signer')} signed ${esc(documentTitle || 'your document')}.</p>
            ${signedPdfUrl ? `<a href="${signedPdfUrl}" style="display:block;background:#1E40AF;color:#fff;text-align:center;padding:16px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:24px;">View signed PDF</a>` : ''}
          </div>
        </div>`,
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true, emailId: data?.id };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

/**
 * Send a change-order email to the client with a link to review & approve.
 * Mirrors the invoice/estimate templates: subject leads with CO number + total
 * + schedule impact, body shows line items + new contract callout.
 */
async function sendChangeOrderEmail({ changeOrder, lineItems, project, businessName, clientEmail }) {
  if (!clientEmail) throw new Error('No client email for change order');
  if (!process.env.RESEND_API_KEY) {
    logger.warn('[Email] RESEND_API_KEY not set, skipping CO email');
    return { sent: false, reason: 'no_api_key' };
  }

  const total = parseFloat(changeOrder.total_amount || 0)
    .toLocaleString('en-US', { minimumFractionDigits: 2 });
  const subtotal = parseFloat(changeOrder.subtotal || 0)
    .toLocaleString('en-US', { minimumFractionDigits: 2 });
  const taxAmount = parseFloat(changeOrder.tax_amount || 0);
  const taxRate = parseFloat(changeOrder.tax_rate || 0);
  const days = Number(changeOrder.schedule_impact_days || 0);
  const coLabel = `CO-${String(changeOrder.co_number || 0).padStart(3, '0')}`;

  // New contract / new end-date callouts (client cares about these as much as $)
  const oldContract = parseFloat(project?.contract_amount || 0);
  const newContract = oldContract + parseFloat(changeOrder.total_amount || 0);
  const oldEnd = project?.end_date ? new Date(project.end_date) : null;
  const newEnd = (oldEnd && days)
    ? new Date(oldEnd.getTime() + days * 86400000)
    : null;
  const fmtDate = (d) => d
    ? d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  const itemsHtml = (lineItems || []).map(li => `
    <div class="amount-row">
      <span class="amount-label">${esc(li.description || '')}${li.quantity ? ` <span style="color:#94A3B8;">× ${li.quantity}${li.unit ? ' ' + esc(li.unit) : ''}</span>` : ''}</span>
      <span class="amount-value">$${parseFloat(li.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
    </div>`).join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #F8FAFC; color: #0F172A; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #FFFFFF; border-radius: 16px; padding: 32px; box-shadow: 0 2px 8px rgba(15,23,42,0.06); }
    .header { text-align: center; margin-bottom: 24px; }
    .business-name { font-size: 14px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; }
    .doc-title { font-size: 24px; font-weight: 700; color: #0F172A; margin-top: 8px; }
    .doc-num { font-size: 13px; color: #94A3B8; margin-top: 4px; }
    .divider { height: 1px; background: #F1F5F9; margin: 20px 0; }
    .amount-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; }
    .amount-label { font-size: 14px; color: #64748B; }
    .amount-value { font-size: 14px; font-weight: 600; color: #0F172A; }
    .total-row { padding: 12px 0; border-top: 2px solid #F1F5F9; margin-top: 8px; }
    .total-value { font-size: 28px; font-weight: 700; color: #0F172A; }
    .schedule-callout { background: #FEF3C7; border: 1px solid #FCD34D; border-radius: 12px; padding: 16px; margin-top: 20px; font-size: 13px; color: #78350F; }
    .pay-btn { display: block; background: #1E40AF; color: #FFFFFF !important; text-decoration: none; text-align: center; font-size: 16px; font-weight: 600; padding: 16px; border-radius: 12px; margin-top: 24px; }
    .footer { text-align: center; margin-top: 24px; font-size: 12px; color: #94A3B8; }
    .new-contract { font-size: 13px; color: #475569; margin-top: 12px; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="business-name">${esc(businessName || 'Your Contractor')}</div>
        <div class="doc-title">Change Order</div>
        <div class="doc-num">${coLabel}${changeOrder.title ? ' &middot; ' + esc(changeOrder.title) : ''}</div>
      </div>

      ${project?.name ? `<div class="amount-row"><span class="amount-label">Project</span><span class="amount-value">${esc(project.name)}</span></div>` : ''}
      ${changeOrder.description ? `<p style="color:#475569;font-size:14px;line-height:1.5;margin:12px 0;">${esc(changeOrder.description)}</p>` : ''}

      <div class="divider"></div>
      ${itemsHtml || `<div class="amount-row"><span class="amount-label">Subtotal</span><span class="amount-value">$${subtotal}</span></div>`}
      ${taxAmount > 0 ? `<div class="amount-row"><span class="amount-label">Tax (${(taxRate * 100).toFixed(2)}%)</span><span class="amount-value">$${taxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></div>` : ''}

      <div class="total-row">
        <div class="amount-row">
          <span class="amount-label" style="font-size:16px;font-weight:600;color:#0F172A;">Total</span>
          <span class="total-value">$${total}</span>
        </div>
      </div>

      ${days !== 0 ? `<div class="schedule-callout">⏱ Adds ${days > 0 ? '+' : ''}${days} day${Math.abs(days) === 1 ? '' : 's'} to the schedule.${newEnd ? ` New estimated completion: <strong>${fmtDate(newEnd)}</strong>` : ''}</div>` : ''}

      ${newContract > 0 ? `<div class="new-contract">New contract total: <strong>$${newContract.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>${oldContract > 0 ? ` (was $${oldContract.toLocaleString('en-US', { minimumFractionDigits: 2 })})` : ''}</div>` : ''}

      <a href="${PORTAL_URL}" class="pay-btn">Review &amp; Approve</a>
    </div>

    <div class="footer">
      Sent via <strong>Sylk</strong><br>
      ${esc(businessName || '')}
    </div>
  </div>
</body>
</html>`;

  try {
    const subject = `Change Order ${coLabel} — $${total}${days !== 0 ? ` · ${days > 0 ? '+' : ''}${days}d` : ''} for ${esc(project?.name || 'your project')}`;
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [clientEmail],
      subject,
      html,
    });
    if (error) {
      logger.error('[Email] Resend error (CO):', error);
      return { sent: false, error: error.message };
    }
    logger.info(`[Email] Change order ${coLabel} sent to ${clientEmail}`);
    return { sent: true, emailId: data?.id, email: clientEmail };
  } catch (err) {
    logger.error('[Email] CO send failed:', err.message);
    return { sent: false, error: err.message };
  }
}

/**
 * Subcontractor invitation email — invites the sub to install Sylk and
 * sign up with the same email. On first sign-up the backend auto-links
 * their auth.users row to the pre-created sub_organizations record.
 */
async function sendSubInvitationEmail({ subEmail, subName, businessName, ownerName, signupUrl }) {
  if (!subEmail || !process.env.RESEND_API_KEY) {
    return { sent: false, reason: 'no_email_or_key' };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [subEmail],
      subject: `${esc(businessName || 'A contractor')} invited you to Sylk`,
      html: `
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;background:#F8FAFC;">
          <div style="background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 8px rgba(15,23,42,0.06);">
            <div style="font-size:14px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.5px;text-align:center;">${esc(businessName || 'Your Contractor')}</div>
            <h2 style="margin:8px 0 0;color:#0F172A;text-align:center;">You're invited</h2>
            <p style="color:#64748B;text-align:center;font-size:14px;margin-top:6px;">As a subcontractor on Sylk</p>
            <p style="color:#0F172A;font-size:15px;line-height:1.5;margin-top:24px;">Hi ${esc(subName || 'there')},</p>
            <p style="color:#0F172A;font-size:15px;line-height:1.5;">${esc(ownerName || businessName || 'Your contractor')} added you on Sylk to manage documents, bids, and payments in one place.</p>
            <p style="color:#0F172A;font-size:15px;line-height:1.5;"><strong>How to get in:</strong></p>
            <ol style="color:#0F172A;font-size:15px;line-height:1.6;padding-left:20px;">
              <li>Install Sylk from the App Store or Google Play.</li>
              <li>Tap <strong>Sign up</strong> and use this email: <strong>${esc(subEmail)}</strong></li>
              <li>You'll see your subcontractor portal with documents, engagements, and invoices.</li>
            </ol>
            ${signupUrl ? `<a href="${signupUrl}" style="display:block;background:#1E40AF;color:#fff;text-align:center;padding:16px;border-radius:12px;text-decoration:none;font-weight:600;margin-top:24px;font-size:16px;">Open Sylk</a>` : ''}
            <p style="color:#94A3B8;font-size:12px;margin-top:24px;text-align:center;">It's free for subs. ${esc(businessName || 'Your contractor')} will see your insurance and license once you upload them.</p>
          </div>
          <div style="text-align:center;margin-top:24px;font-size:12px;color:#94A3B8;">Sent via <strong>Sylk</strong></div>
        </div>`,
    });
    if (error) return { sent: false, error: error.message };
    return { sent: true, emailId: data?.id };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

module.exports = {
  sendInvoiceEmail,
  sendEstimateEmail,
  sendChangeOrderEmail,
  sendSignatureRequestEmail,
  sendSignatureCompletedEmail,
  sendSubInvitationEmail,
};
