// PREMIUM — pixel-faithful port of the user-supplied premium_luxury_refined.html.
// Bronze (#8b7355) is the template's identity — NOT recolored by user
// accent_color. Only data substitution is parameterized. No added borders,
// no notes-blocks. Notes/terms append to the existing footer copy.

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
    return `<tr><td colspan="4" style="padding:24px 0;color:#999;text-align:center;font-style:italic;">No line items.</td></tr>`;
  }
  return items.map((it) => {
    const sec = it.secondary ? `<div class="item-secondary">${escape(it.secondary)}</div>` : '';
    return `<tr>
      <td>
        <div class="item-description">${escape(it.description)}</div>
        ${sec}
      </td>
      <td>${escape(formatQty(it.qty))}</td>
      <td>${escape(formatCurrency(it.rate))}</td>
      <td>${escape(formatCurrency(it.amount))}</td>
    </tr>`;
  }).join('');
}

export function generatePremiumHTML(n) {
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

  // Original footer is centered prose. Notes/terms get appended as
  // additional centered lines — no boxes, no borders.
  const footerLines = [footerText];
  if (notes) footerLines.push(notes);
  if (terms) footerLines.push(terms);
  if (business.phone) footerLines.push(`Questions? ${business.phone}`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escape(docTypeLabel)} ${escape(number)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: letter; margin: 0; }
  body {
    font-family: "Georgia", "Garamond", serif;
    font-size: 11px;
    line-height: 1.6;
    color: #2c2c2c;
    background: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .container {
    max-width: 8.5in;
    min-height: 11in;
    margin: 0 auto;
    background: linear-gradient(180deg, #fafaf8 0%, #f5f3f0 50%, #ede9e4 100%);
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }
  .accent-left {
    position: absolute;
    left: 0; top: 0;
    width: 4px;
    height: 100%;
    background: linear-gradient(180deg, #8b7355 0%, #a0826d 50%, #8b7355 100%);
    z-index: 10;
  }
  .accent-corner {
    position: absolute;
    top: 0; right: 0;
    width: 120px;
    height: 120px;
    background: radial-gradient(circle at top right, rgba(139, 115, 85, 0.08), transparent);
    z-index: 1;
  }
  .content {
    padding: 0.75in;
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    position: relative;
    z-index: 2;
  }

  .header-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-bottom: 1.5rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid rgba(139, 115, 85, 0.15);
  }
  .business-name {
    font-size: 20px;
    font-weight: 400;
    color: #2c2c2c;
    margin-bottom: 0.25rem;
    letter-spacing: 0.02em;
  }
  .logo { max-height: 56px; max-width: 240px; display: block; }
  .business-tagline {
    font-size: 10px;
    color: #8b7355;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    margin-bottom: 0.75rem;
    font-weight: 500;
  }
  .business-details {
    font-size: 10px;
    color: #555;
    line-height: 1.6;
    font-style: italic;
  }
  .document-header {
    text-align: right;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }
  .doc-type-label {
    font-size: 10px;
    color: #8b7355;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }
  .doc-type {
    font-size: 18px;
    font-weight: 300;
    color: #2c2c2c;
    margin-bottom: 1rem;
    letter-spacing: 0.05em;
  }
  .doc-number {
    font-size: 10px;
    color: #666;
    margin-bottom: 1rem;
    letter-spacing: 0.05em;
  }
  .key-dates {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    font-size: 10px;
  }
  .key-date { text-align: right; }
  .key-date-label {
    color: #8b7355;
    text-transform: uppercase;
    font-size: 8px;
    letter-spacing: 0.1em;
    margin-bottom: 0.3rem;
    font-weight: 500;
  }
  .key-date-value { color: #2c2c2c; font-size: 11px; }

  .divider {
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(139, 115, 85, 0.2), transparent);
    margin: 1.5rem 0;
  }

  .details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-bottom: 1.5rem;
  }
  .detail-card h3 {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #8b7355;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }
  .detail-card p {
    font-size: 10px;
    color: #2c2c2c;
    margin-bottom: 0.15rem;
    line-height: 1.5;
  }

  .items-section { flex-grow: 1; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead {
    border-top: 1px solid rgba(139, 115, 85, 0.3);
    border-bottom: 1px solid rgba(139, 115, 85, 0.3);
  }
  th {
    padding: 0.6rem 0;
    text-align: left;
    font-weight: 500;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #8b7355;
  }
  th:last-child { text-align: right; }
  tbody tr {
    border-bottom: 1px solid rgba(139, 115, 85, 0.08);
    page-break-inside: avoid;
  }
  td { padding: 0.5rem 0; color: #2c2c2c; vertical-align: top; }
  td:last-child { text-align: right; }
  .item-description { font-weight: 500; }
  .item-secondary { font-size: 9px; color: #999; margin-top: 0.1rem; font-style: italic; }

  .totals-section {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 1rem;
  }
  .totals { width: 45%; min-width: 240px; }
  .total-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    padding: 0.5rem 0;
    font-size: 10px;
    border-bottom: 1px solid rgba(139, 115, 85, 0.1);
  }
  .total-row.final {
    border-top: 1px solid rgba(139, 115, 85, 0.3);
    border-bottom: none;
    padding: 0.75rem 0;
    font-weight: 500;
    font-size: 11px;
  }
  .total-label { text-align: left; color: #666; }
  .total-row.final .total-label {
    color: #2c2c2c;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .total-value { text-align: right; color: #2c2c2c; }
  .total-row.final .total-value { color: #8b7355; font-weight: 600; }

  .footer {
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid rgba(139, 115, 85, 0.15);
    font-size: 9px;
    color: #8b7355;
    line-height: 1.5;
    text-align: center;
    letter-spacing: 0.05em;
  }
  .footer-text { margin-bottom: 0.3rem; }
</style>
</head>
<body>
  <div class="container">
    <div class="accent-left"></div>
    <div class="accent-corner"></div>
    <div class="content">

      <div class="header-section">
        <div class="business-header">
          ${logoBlock}
          ${business.tagline ? `<div class="business-tagline">${escape(business.tagline)}</div>` : ''}
          <div class="business-details">
            ${[business.address, [business.city, business.state, business.zip].filter(Boolean).join(', '), business.phone, business.email]
              .filter(Boolean).map(escape).join('<br>')}
          </div>
        </div>
        <div class="document-header">
          <div class="doc-type-label">Document</div>
          <div class="doc-type">${escape(docTypeLabel)}</div>
          <div class="doc-number">${escape(number)}</div>
          <div class="key-dates">
            <div class="key-date">
              <div class="key-date-label">Issued</div>
              <div class="key-date-value">${escape(formatDate(issuedAt)) || '—'}</div>
            </div>
            <div class="key-date">
              <div class="key-date-label">${escape(dueLabel)}</div>
              <div class="key-date-value">${escape(formatDate(dueDate)) || '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <div class="details-grid">
        <div class="detail-card">
          <h3>Bill To</h3>
          ${partyLines(client).map((l) => `<p>${l}</p>`).join('')}
        </div>
        <div class="detail-card">
          <h3>${escape(projectName ? 'Project Details' : 'From')}</h3>
          ${projectName ? `<p>${escape(projectName)}</p>` : ''}
          ${!projectName && business.name ? `<p>${escape(business.name)}</p>` : ''}
          ${projectExtraLine ? `<p style="margin-top: 0.5rem; color: #999; font-size: 9px;">${escape(projectExtraLine)}</p>` : ''}
        </div>
      </div>

      <div class="items-section">
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

      <div class="totals-section">
        <div class="totals">
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

      <div class="footer">
        ${footerLines.filter(Boolean).map((l) => `<div class="footer-text">${escape(l)}</div>`).join('')}
      </div>
    </div>
  </div>
</body>
</html>`;
}
