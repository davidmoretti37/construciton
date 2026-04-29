// CREATIVE — pixel-faithful port of the user-supplied template_creative_artistic_final.html.
// Indigo (#6366f1) is the template's identity — NOT recolored. Only data
// substitution is parameterized. Borders/cards exactly as in the source.

import { escape, formatCurrency, formatDate, formatQty } from './helpers';

function partyLines(party) {
  const out = [];
  if (party.name) out.push(escape(party.name));
  if (party.contact_person) out.push(escape(party.contact_person));
  if (party.address) out.push(escape(party.address));
  const cityLine = [party.city, [party.state, party.zip].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  if (cityLine) out.push(escape(cityLine));
  if (party.email) out.push(escape(party.email));
  if (party.phone) out.push(escape(party.phone));
  return out;
}

function itemsHtml(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<tr><td colspan="4" style="padding:22px 0;color:#999;text-align:center;font-style:italic;">No line items.</td></tr>`;
  }
  return items.map((it) => {
    const sec = it.secondary ? `<div class="item-note">${escape(it.secondary)}</div>` : '';
    return `<tr>
      <td>
        <div class="item-desc">${escape(it.description)}</div>
        ${sec}
      </td>
      <td>${escape(formatQty(it.qty))}</td>
      <td>${escape(formatCurrency(it.rate))}</td>
      <td>${escape(formatCurrency(it.amount))}</td>
    </tr>`;
  }).join('');
}

export function generateCreativeHTML(n) {
  const { docTypeLabel, number, issuedAt, dueAt, validUntil, isEstimate,
    business, client, projectName, items,
    subtotal, taxRate, taxAmount, total,
    notes, terms, footerText } = n;

  const dueLabel = isEstimate ? 'Valid until' : 'Due';
  const dueDate = isEstimate ? validUntil : dueAt;
  const totalLabel = isEstimate ? 'Estimated Total' : 'Amount Due';

  const logoBlock = business.logo_url
    ? `<img class="logo" src="${escape(business.logo_url)}" alt="${escape(business.name)}" />`
    : `<div class="business-name">${escape(business.name)}</div>`;

  const projectExtraLine = business.license_number ? `License: ${business.license_number}` : '';
  const businessLine = [business.address, [business.city, business.state, business.zip].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const businessContact = [business.phone, business.email].filter(Boolean).join(' | ');

  // Source has a single .footer-box. Keep that. Notes get the primary
  // body, with terms appended after a separator if both exist.
  const footerCopy = [notes, terms, footerText].filter(Boolean).join(' — ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escape(docTypeLabel)} ${escape(number)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: letter; margin: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 11px;
    line-height: 1.6;
    color: #1a1a1a;
    background: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .container {
    max-width: 8.5in;
    min-height: 11in;
    margin: 0 auto;
    background: linear-gradient(135deg, #fafbfc 0%, #f5f7fa 100%);
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }
  .content {
    padding: 0.5in;
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    position: relative;
  }

  .top-section {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
    border-bottom: 3px solid #6366f1;
  }
  .business-header {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .business-name {
    font-size: 32px;
    font-weight: 800;
    color: #1a1a1a;
    margin-bottom: 0.5rem;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .logo { max-height: 64px; max-width: 280px; display: block; margin-bottom: 0.5rem; }
  .business-details {
    font-size: 10px;
    color: #555;
    line-height: 1.8;
  }

  .doc-meta {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    border: 2px solid #6366f1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .doc-type {
    font-size: 10px;
    color: #6366f1;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-weight: 700;
    margin-bottom: 0.3rem;
  }
  .doc-number {
    font-size: 14px;
    font-weight: 700;
    color: #1a1a1a;
  }

  .middle-section {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  .info-card {
    background: white;
    padding: 0.8rem;
    border-radius: 6px;
    border-left: 4px solid #6366f1;
  }
  .info-card h3 {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #6366f1;
    margin-bottom: 0.4rem;
    font-weight: 700;
  }
  .info-card p {
    font-size: 9px;
    color: #1a1a1a;
    margin-bottom: 0.1rem;
    line-height: 1.5;
  }
  .info-card.date-card {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .date-item { margin-bottom: 0.4rem; }
  .date-label {
    font-size: 7px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 600;
  }
  .date-value {
    font-size: 10px;
    color: #1a1a1a;
    font-weight: 600;
  }

  .items-section {
    flex-grow: 1;
    margin-bottom: 1rem;
    background: white;
    padding: 1rem;
    border-radius: 8px;
  }
  .items-header {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6366f1;
    font-weight: 700;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #6366f1;
  }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  th {
    padding: 0.5rem 0;
    text-align: left;
    font-weight: 700;
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #666;
    border-bottom: 1px solid #e5e7eb;
  }
  th:last-child { text-align: right; }
  tbody tr { border-bottom: 1px solid #f3f4f6; page-break-inside: avoid; }
  td { padding: 0.4rem 0; color: #1a1a1a; vertical-align: top; }
  td:last-child { text-align: right; }
  .item-desc { font-weight: 600; }
  .item-note { font-size: 8px; color: #999; margin-top: 0.05rem; }

  .bottom-section {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1.5rem;
    margin-bottom: 0;
  }
  .totals-box {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    border: 2px solid #6366f1;
  }
  .totals-header {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6366f1;
    font-weight: 700;
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid #6366f1;
  }
  .total-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    padding: 0.4rem 0;
    font-size: 9px;
    border-bottom: 1px solid #f3f4f6;
  }
  .total-row.final {
    border-top: 2px solid #6366f1;
    border-bottom: none;
    padding: 0.6rem 0;
    font-weight: 700;
    font-size: 10px;
  }
  .total-label { text-align: left; color: #666; }
  .total-row.final .total-label { color: #1a1a1a; }
  .total-value { text-align: right; color: #1a1a1a; }
  .total-row.final .total-value { color: #6366f1; font-weight: 700; }

  .footer-box {
    background: white;
    padding: 1rem;
    border-radius: 8px;
    border-left: 4px solid #6366f1;
  }
  .footer-label {
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #6366f1;
    font-weight: 700;
    margin-bottom: 0.4rem;
  }
  .footer-text {
    font-size: 9px;
    color: #666;
    line-height: 1.5;
  }
</style>
</head>
<body>
  <div class="container">
    <div class="content">

      <div class="top-section">
        <div class="business-header">
          ${logoBlock}
          ${businessLine || businessContact ? `<div class="business-details">
            ${businessLine ? escape(businessLine) + '<br>' : ''}
            ${businessContact ? escape(businessContact) : ''}
          </div>` : ''}
        </div>
        <div class="doc-meta">
          <div class="doc-type">${escape(docTypeLabel)}</div>
          <div class="doc-number">${escape(number)}</div>
        </div>
      </div>

      <div class="middle-section">
        <div class="info-card">
          <h3>Bill To</h3>
          ${partyLines(client).map((l) => `<p>${l}</p>`).join('')}
        </div>
        <div class="info-card">
          <h3>${escape(projectName ? 'Project' : 'From')}</h3>
          ${projectName ? `<p>${escape(projectName)}</p>` : ''}
          ${!projectName && business.name ? `<p>${escape(business.name)}</p>` : ''}
          ${projectExtraLine ? `<p style="margin-top: 0.3rem; color: #999; font-size: 8px;">${escape(projectExtraLine)}</p>` : ''}
        </div>
        <div class="info-card date-card">
          <div class="date-item">
            <div class="date-label">Issued</div>
            <div class="date-value">${escape(formatDate(issuedAt)) || '—'}</div>
          </div>
          <div class="date-item">
            <div class="date-label">${escape(dueLabel)}</div>
            <div class="date-value">${escape(formatDate(dueDate)) || '—'}</div>
          </div>
        </div>
      </div>

      <div class="items-section">
        <div class="items-header">Line Items</div>
        <table>
          <thead>
            <tr>
              <th style="width: 50%;">Description</th>
              <th style="width: 12%;">Qty</th>
              <th style="width: 18%;">Rate</th>
              <th style="width: 20%;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml(items)}
          </tbody>
        </table>
      </div>

      <div class="bottom-section">
        <div class="footer-box">
          <div class="footer-label">Notes</div>
          <div class="footer-text">${escape(footerCopy)}${business.phone || business.email ? ` Questions? Contact us${business.phone ? ` at ${escape(business.phone)}` : ''}${business.email ? ` or ${escape(business.email)}` : ''}.` : ''}</div>
        </div>
        <div class="totals-box">
          <div class="totals-header">Summary</div>
          <div class="total-row">
            <div class="total-label">Subtotal</div>
            <div class="total-value">${escape(formatCurrency(subtotal))}</div>
          </div>
          ${taxAmount > 0 ? `
            <div class="total-row">
              <div class="total-label">Tax${taxRate ? ` (${(taxRate * 100).toFixed(2).replace(/\.?0+$/, '')}%)` : ''}</div>
              <div class="total-value">${escape(formatCurrency(taxAmount))}</div>
            </div>` : ''}
          <div class="total-row final">
            <div class="total-label">${escape(totalLabel)}</div>
            <div class="total-value">${escape(formatCurrency(total))}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}
