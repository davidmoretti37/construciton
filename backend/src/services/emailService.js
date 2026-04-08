const { Resend } = require('resend');
const logger = require('../utils/logger');

const resend = new Resend(process.env.RESEND_API_KEY);

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
        <div class="business-name">${businessName || 'Your Contractor'}</div>
        <div class="invoice-title">Invoice</div>
        <div class="invoice-num">${invoice.invoice_number || ''}</div>
      </div>

      <div class="divider"></div>

      ${invoice.project_name ? `<div class="amount-row"><span class="amount-label">Project</span><span class="amount-value">${invoice.project_name}</span></div>` : ''}
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
      ${businessName || ''}
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
            <h2 style="margin:0;color:#0F172A;">${businessName || 'Your Contractor'}</h2>
            <p style="color:#64748B;">You have a new estimate for $${amount}</p>
            <p style="font-size:13px;color:#94A3B8;">${estimate.estimate_number || ''} • ${estimate.project_name || ''}</p>
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

module.exports = { sendInvoiceEmail, sendEstimateEmail };
