import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import { Alert, Platform } from 'react-native';

/**
 * Generate HTML for estimate PDF
 */
export const generateEstimateHTML = (estimateData) => {
  const {
    estimateNumber = 'EST-XXX',
    businessName = 'Your Business',
    client,
    clientName,
    projectName,
    date = new Date().toLocaleDateString(),
    items = [],
    phases = [],
    schedule = {},
    scope = {},
    subtotal = 0,
    total = 0,
    notes = '',
  } = estimateData;

  const displayClientName = clientName || (typeof client === 'string' ? client : client?.name) || 'Client';
  const clientAddress = typeof client === 'object' ? client?.address : '';
  const clientPhone = typeof client === 'object' ? client?.phone : '';
  const clientEmail = typeof client === 'object' ? client?.email : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Estimate ${estimateNumber}</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
          color: #1f2937;
          line-height: 1.6;
          padding: 40px;
          max-width: 800px;
          margin: 0 auto;
        }

        .header {
          border-bottom: 3px solid #3b82f6;
          padding-bottom: 20px;
          margin-bottom: 30px;
        }

        .header h1 {
          font-size: 32px;
          color: #3b82f6;
          margin-bottom: 5px;
        }

        .header .estimate-number {
          font-size: 18px;
          font-weight: 600;
          color: #3b82f6;
          margin-bottom: 5px;
        }

        .header .business-name {
          font-size: 14px;
          color: #6b7280;
        }

        .info-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
          gap: 40px;
        }

        .info-block {
          flex: 1;
        }

        .info-block h3 {
          font-size: 12px;
          text-transform: uppercase;
          color: #6b7280;
          margin-bottom: 8px;
          font-weight: 600;
        }

        .info-block p {
          font-size: 14px;
          margin-bottom: 4px;
        }

        .section {
          margin-bottom: 30px;
        }

        .section-title {
          font-size: 18px;
          font-weight: 700;
          color: #1f2937;
          margin-bottom: 15px;
          padding-bottom: 8px;
          border-bottom: 2px solid #e5e7eb;
        }

        .scope-text {
          font-size: 14px;
          color: #4b5563;
          line-height: 1.8;
          margin-bottom: 10px;
        }

        .complexity {
          display: inline-block;
          padding: 4px 12px;
          background: #f3f4f6;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          text-transform: capitalize;
        }

        .phases-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin-bottom: 20px;
        }

        .phase-card {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 15px;
          background: #f9fafb;
        }

        .phase-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }

        .phase-name {
          font-size: 16px;
          font-weight: 600;
          color: #1f2937;
        }

        .phase-days {
          font-size: 12px;
          color: #6b7280;
          background: #fff;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .phase-budget {
          font-size: 14px;
          font-weight: 600;
          color: #3b82f6;
          margin-bottom: 10px;
        }

        .phase-tasks {
          list-style: none;
          margin-top: 8px;
        }

        .phase-tasks li {
          font-size: 12px;
          color: #4b5563;
          padding: 4px 0;
          padding-left: 16px;
          position: relative;
        }

        .phase-tasks li:before {
          content: "•";
          position: absolute;
          left: 0;
          color: #3b82f6;
        }

        .timeline {
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 15px;
          font-size: 14px;
          color: #4b5563;
          margin-bottom: 20px;
        }

        .timeline-dates {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .timeline-date {
          font-weight: 600;
          color: #1f2937;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }

        .items-table thead {
          background: #f9fafb;
        }

        .items-table th {
          text-align: left;
          padding: 12px;
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          text-transform: uppercase;
          border-bottom: 2px solid #e5e7eb;
        }

        .items-table td {
          padding: 12px;
          font-size: 14px;
          border-bottom: 1px solid #e5e7eb;
        }

        .items-table tbody tr:hover {
          background: #f9fafb;
        }

        .text-right {
          text-align: right;
        }

        .item-description {
          font-weight: 500;
          color: #1f2937;
        }

        .item-calc {
          font-size: 12px;
          color: #6b7280;
        }

        .totals-section {
          margin-top: 20px;
          text-align: right;
        }

        .total-row {
          display: flex;
          justify-content: flex-end;
          padding: 8px 0;
          font-size: 14px;
        }

        .total-row.grand-total {
          border-top: 2px solid #3b82f6;
          margin-top: 10px;
          padding-top: 15px;
          font-size: 18px;
          font-weight: 700;
          color: #3b82f6;
        }

        .total-label {
          margin-right: 40px;
          min-width: 100px;
        }

        .total-amount {
          min-width: 120px;
          font-weight: 600;
        }

        .notes {
          margin-top: 30px;
          padding: 15px;
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          border-radius: 4px;
        }

        .notes-title {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          color: #92400e;
          margin-bottom: 8px;
        }

        .notes-text {
          font-size: 13px;
          color: #78350f;
          line-height: 1.6;
        }

        .footer {
          margin-top: 40px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
          font-size: 12px;
          color: #6b7280;
        }

        @media print {
          body {
            padding: 20px;
          }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📋 ESTIMATE</h1>
        <div class="estimate-number">${estimateNumber}</div>
        <div class="business-name">${businessName}</div>
      </div>

      <div class="info-section">
        <div class="info-block">
          <h3>Client</h3>
          <p><strong>${displayClientName}</strong></p>
          ${clientAddress ? `<p>${clientAddress}</p>` : ''}
          ${clientPhone ? `<p>${clientPhone}</p>` : ''}
          ${clientEmail ? `<p>${clientEmail}</p>` : ''}
        </div>

        <div class="info-block">
          <h3>Project</h3>
          <p><strong>${projectName || 'Unnamed Project'}</strong></p>
          <p>Date: ${date}</p>
        </div>
      </div>

      ${scope?.description ? `
        <div class="section">
          <h2 class="section-title">Scope</h2>
          <p class="scope-text">${scope.description}</p>
          ${scope.complexity ? `<span class="complexity">${scope.complexity} complexity</span>` : ''}
        </div>
      ` : ''}

      ${phases && phases.length > 0 ? `
        <div class="section">
          <h2 class="section-title">Project Phases</h2>
          <div class="phases-grid">
            ${phases.map(phase => `
              <div class="phase-card">
                <div class="phase-header">
                  <div class="phase-name">${phase.name}</div>
                  ${phase.plannedDays ? `<div class="phase-days">${phase.plannedDays} days</div>` : ''}
                </div>
                ${phase.budget ? `<div class="phase-budget">Budget: $${(typeof phase.budget === 'number' ? phase.budget : parseFloat(phase.budget) || 0).toLocaleString()}</div>` : ''}
                ${phase.tasks && phase.tasks.length > 0 ? `
                  <ul class="phase-tasks">
                    ${phase.tasks.map(task => `<li>${task.description || task.name}</li>`).join('')}
                  </ul>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${schedule?.startDate && schedule?.estimatedEndDate ? `
        <div class="section">
          <h2 class="section-title">Project Timeline</h2>
          <div class="timeline">
            <div class="timeline-dates">
              <div>
                Start: <span class="timeline-date">${new Date(schedule.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
              <div>→</div>
              <div>
                End: <span class="timeline-date">${new Date(schedule.estimatedEndDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
        </div>
      ` : ''}

      ${items && items.length > 0 ? `
        <div class="section">
          <h2 class="section-title">Services</h2>
          <table class="items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Description</th>
                <th class="text-right">Quantity</th>
                <th class="text-right">Unit Price</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => {
                const itemPrice = typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0);
                const itemTotal = typeof item.total === 'number' ? item.total : (parseFloat(item.total) || 0);
                return `
                  <tr>
                    <td>${item.index || ''}</td>
                    <td>
                      <div class="item-description">${item.description || ''}</div>
                      ${item.quantity && item.unit ? `<div class="item-calc">${item.quantity} ${item.unit}</div>` : ''}
                    </td>
                    <td class="text-right">${item.quantity || ''}</td>
                    <td class="text-right">$${itemPrice.toFixed(2)}</td>
                    <td class="text-right">$${itemTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      ` : ''}

      <div class="totals-section">
        ${subtotal && subtotal !== total ? `
          <div class="total-row">
            <div class="total-label">Subtotal:</div>
            <div class="total-amount">$${(typeof subtotal === 'number' ? subtotal : parseFloat(subtotal) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>
        ` : ''}
        <div class="total-row grand-total">
          <div class="total-label">TOTAL:</div>
          <div class="total-amount">$${(typeof total === 'number' ? total : parseFloat(total) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>

      ${notes ? `
        <div class="notes">
          <div class="notes-title">Notes</div>
          <div class="notes-text">${notes}</div>
        </div>
      ` : ''}

      <div class="footer">
        <p>This estimate is valid for 30 days from the date above.</p>
        <p>Thank you for your business!</p>
      </div>
    </body>
    </html>
  `;
};

/**
 * Generate PDF from estimate data
 */
export const generateEstimatePDF = async (estimateData) => {
  try {
    const html = generateEstimateHTML(estimateData);

    const { uri } = await Print.printToFileAsync({
      html,
      base64: false,
    });

    return uri;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw error;
  }
};

/**
 * Share estimate PDF
 */
export const shareEstimatePDF = async (estimateData) => {
  try {
    const pdfUri = await generateEstimatePDF(estimateData);

    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert('Error', 'Sharing is not available on this device');
      return;
    }

    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: `Estimate ${estimateData.estimateNumber || ''}`,
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    console.error('Error sharing PDF:', error);
    Alert.alert('Error', 'Failed to share estimate. Please try again.');
  }
};

/**
 * Send estimate PDF via email
 */
export const emailEstimatePDF = async (estimateData, recipientEmail) => {
  try {
    const pdfUri = await generateEstimatePDF(estimateData);

    const isAvailable = await MailComposer.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Error', 'Email is not configured on this device');
      return;
    }

    const clientName = estimateData.clientName ||
                       (typeof estimateData.client === 'string' ? estimateData.client : estimateData.client?.name) ||
                       'Client';

    await MailComposer.composeAsync({
      recipients: recipientEmail ? [recipientEmail] : [],
      subject: `Estimate ${estimateData.estimateNumber || ''} - ${estimateData.projectName || 'Your Project'}`,
      body: `Dear ${clientName},\n\nPlease find attached your estimate for ${estimateData.projectName || 'your project'}.\n\nTotal: $${(estimateData.total || 0).toLocaleString()}\n\nThank you for your business!\n\nBest regards,\n${estimateData.businessName || 'Your Business'}`,
      isHtml: false,
      attachments: [pdfUri],
    });
  } catch (error) {
    console.error('Error sending email:', error);
    Alert.alert('Error', 'Failed to send email. Please try again.');
  }
};

/**
 * Send estimate PDF via SMS/Text (shares the PDF)
 */
export const smsEstimatePDF = async (estimateData) => {
  try {
    // For SMS, we'll use the share functionality which allows sharing to messaging apps
    await shareEstimatePDF(estimateData);
  } catch (error) {
    console.error('Error sending via SMS:', error);
    Alert.alert('Error', 'Failed to send estimate. Please try again.');
  }
};
