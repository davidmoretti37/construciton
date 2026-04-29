// MODERN — pixel-faithful port of the user-supplied template_modern_bold_final.html.
// Only the data substitution is parameterized. No added borders, no added
// sections, no recoloring. The template owns its visual identity.

import { escape, formatCurrency, formatDate, formatQty } from './helpers';

function partyHtml(label, lines) {
  return `
    <div class="party-block">
      <h3>${escape(label)}</h3>
      ${lines.map((l) => `<p>${l}</p>`).join('')}
    </div>`;
}

function clientLines(client) {
  const out = [];
  if (client.name) out.push(escape(client.name));
  if (client.contact_person) out.push(escape(client.contact_person));
  if (client.address) out.push(escape(client.address));
  const cityLine = [client.city, [client.state, client.zip].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  if (cityLine) out.push(escape(cityLine));
  if (client.email) out.push(escape(client.email));
  if (client.phone) out.push(escape(client.phone));
  return out;
}

function itemsHtml(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return `<tr><td colspan="4" style="padding:24px 0;color:#94a3b8;text-align:center;font-style:italic;">No line items.</td></tr>`;
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

export function generateModernHTML(n) {
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

  const businessLine = [business.address, [business.city, business.state, business.zip].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');
  const businessContact = [business.phone, business.email].filter(Boolean).join(' | ');

  const projectExtraLine = business.license_number ? `License: ${business.license_number}` : '';

  // Source template has a single footer section. When notes/terms exist
  // we append them to the footer copy as additional lines — no new boxes.
  const footerLines = [footerText, notes, terms].filter(Boolean);
  if (business.phone || business.email) {
    const contact = `Questions? Contact us${business.phone ? ` at ${business.phone}` : ''}${business.email ? ` or ${business.email}` : ''}.`;
    footerLines.push(contact);
  }

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
    color: #0f172a;
    background: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .container {
    max-width: 8.5in;
    min-height: 11in;
    margin: 0 auto;
    background: #ffffff;
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

  .header-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 2px solid #0f172a;
  }
  .business-info { flex: 1; }
  .business-name {
    font-size: 28px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 0.25rem;
    letter-spacing: -0.02em;
  }
  .logo { max-height: 56px; max-width: 240px; display: block; }
  .business-details {
    font-size: 10px;
    color: #475569;
    line-height: 1.8;
    margin-top: 0.5rem;
  }
  .document-info { text-align: right; }
  .doc-type {
    font-size: 11px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 0.5rem;
    font-weight: 600;
  }
  .doc-number {
    font-size: 16px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 1rem;
  }
  .dates-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    font-size: 10px;
  }
  .date-item { text-align: right; }
  .date-label {
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 8px;
    margin-bottom: 0.3rem;
    font-weight: 600;
  }
  .date-value { color: #0f172a; font-weight: 600; }

  .parties-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-bottom: 1.5rem;
  }
  .party-block h3 {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #64748b;
    margin-bottom: 0.5rem;
    font-weight: 700;
  }
  .party-block p {
    font-size: 10px;
    color: #0f172a;
    margin-bottom: 0.15rem;
    line-height: 1.6;
  }

  .items-container { flex-grow: 1; margin-bottom: 1rem; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead {
    background: #f1f5f9;
    border-top: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
  }
  th {
    padding: 0.6rem;
    text-align: left;
    font-weight: 700;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #0f172a;
  }
  th:last-child { text-align: right; }
  tbody tr { border-bottom: 1px solid #e2e8f0; page-break-inside: avoid; }
  td { padding: 0.5rem 0.6rem; color: #0f172a; vertical-align: top; }
  td:last-child { text-align: right; }
  .item-desc { font-weight: 500; }
  .item-note { font-size: 9px; color: #64748b; margin-top: 0.1rem; }

  .totals-box {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 1rem;
  }
  .totals { width: 40%; min-width: 240px; }
  .total-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    padding: 0.5rem 0;
    font-size: 10px;
    border-bottom: 1px solid #e2e8f0;
  }
  .total-row.final {
    border-top: 2px solid #0f172a;
    border-bottom: none;
    padding: 0.75rem 0;
    font-weight: 700;
    font-size: 12px;
  }
  .total-label { text-align: left; color: #475569; }
  .total-row.final .total-label { color: #0f172a; }
  .total-value { text-align: right; color: #0f172a; }
  .total-row.final .total-value { font-weight: 700; }

  .footer-section {
    margin-top: auto;
    padding-top: 0.75rem;
    border-top: 1px solid #e2e8f0;
    font-size: 9px;
    color: #64748b;
    line-height: 1.6;
  }
  .footer-line { margin-bottom: 0.2rem; }
</style>
</head>
<body>
  <div class="container">
    <div class="content">

      <div class="header-top">
        <div class="business-info">
          ${logoBlock}
          ${businessLine || businessContact ? `<div class="business-details">
            ${businessLine ? escape(businessLine) + '<br>' : ''}
            ${businessContact ? escape(businessContact) : ''}
          </div>` : ''}
        </div>
        <div class="document-info">
          <div class="doc-type">${escape(docTypeLabel)}</div>
          <div class="doc-number">${escape(number)}</div>
          <div class="dates-row">
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
      </div>

      <div class="parties-section">
        ${partyHtml('Bill To', clientLines(client))}
        <div class="party-block">
          <h3>${escape(projectName ? 'Project' : 'From')}</h3>
          ${projectName ? `<p>${escape(projectName)}</p>` : ''}
          ${!projectName && business.name ? `<p>${escape(business.name)}</p>` : ''}
          ${projectExtraLine ? `<p style="margin-top: 0.5rem; color: #94a3b8; font-size: 9px;">${escape(projectExtraLine)}</p>` : ''}
        </div>
      </div>

      <div class="items-container">
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

      <div class="totals-box">
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

      <div class="footer-section">
        ${footerLines.map((l) => `<div class="footer-line">${escape(l)}</div>`).join('')}
      </div>
    </div>
  </div>
</body>
</html>`;
}
