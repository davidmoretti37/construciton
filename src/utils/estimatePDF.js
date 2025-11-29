import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import { Alert, Platform } from 'react-native';

/**
 * Generate HTML for estimate PDF - Professional minimalist design
 * Matching Atrium Construction style
 */
export const generateEstimateHTML = (estimateData) => {
  const {
    estimateNumber = '',
    businessName = '',
    businessAddress = '',
    businessCity = '',
    businessState = '',
    businessZip = '',
    businessEmail = '',
    businessPhone = '',
    businessLogo = '',
    client,
    clientName,
    clientAddress,
    clientCity,
    clientState,
    clientZip,
    // Ship to (job site) - can be different from billing
    shipToName,
    shipToAddress,
    shipToCity,
    shipToState,
    shipToZip,
    shipToCountry = '',
    projectName,
    date = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    items = [],
    total = 0,
    notes = '',
    // Accent color - default olive/green like Atrium
    accentColor = '#8B9A46',
  } = estimateData;

  // Extract client info - handle both string and object formats
  const displayClientName = clientName || (typeof client === 'string' ? client : client?.name) || '';
  const displayClientAddress = clientAddress || (typeof client === 'object' ? client?.address : '') || '';
  const displayClientCity = clientCity || (typeof client === 'object' ? client?.city : '') || '';
  const displayClientState = clientState || (typeof client === 'object' ? client?.state : '') || '';
  const displayClientZip = clientZip || (typeof client === 'object' ? client?.zip : '') || '';
  const displayClientEmail = (typeof client === 'object' ? client?.email : '') || '';
  const displayClientPhone = (typeof client === 'object' ? client?.phone : '') || '';

  // Ship to defaults to client info if not provided
  const displayShipToName = shipToName || displayClientName;
  const displayShipToAddress = shipToAddress || displayClientAddress;
  const displayShipToCity = shipToCity || displayClientCity;
  const displayShipToState = shipToState || displayClientState;
  const displayShipToZip = shipToZip || displayClientZip;

  // Format address lines
  const formatAddressLine = (city, state, zip, country = '') => {
    const parts = [city, state, zip].filter(Boolean).join(', ');
    return country ? `${parts} ${country}` : parts;
  };

  const billToAddressLine = formatAddressLine(displayClientCity, displayClientState, displayClientZip);
  const shipToAddressLine = formatAddressLine(displayShipToCity, displayShipToState, displayShipToZip, shipToCountry);

  // Generate line items HTML with multi-line description support
  const generateItemsHTML = () => {
    return items.map((item, index) => {
      const itemPrice = typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0);
      const itemTotal = typeof item.total === 'number' ? item.total : (parseFloat(item.total) || 0);
      const quantity = item.quantity || 1;

      // Handle multi-line descriptions (split by newline or bullet points)
      let description = item.description || '';
      let productName = item.productName || item.name || description.split('\n')[0] || '';
      let descriptionLines = [];

      // If description contains line breaks or "includes", format as multi-line
      if (description.includes('\n')) {
        const lines = description.split('\n');
        productName = lines[0];
        descriptionLines = lines.slice(1).filter(line => line.trim());
      } else if (description.toLowerCase().includes('includes')) {
        // Split on "includes" to create sub-items
        const parts = description.split(/includes/i);
        productName = parts[0].trim();
        descriptionLines = parts.slice(1).map(p => `includes ${p.trim()}`);
      }

      const descriptionHTML = descriptionLines.length > 0
        ? `<div class="item-description">${descriptionLines.map(line => `<div class="desc-line">${line}</div>`).join('')}</div>`
        : '';

      return `
        <tr>
          <td class="col-num">${index + 1}.</td>
          <td class="col-product"><strong>${productName}</strong></td>
          <td class="col-description">${descriptionLines.length > 0 ? descriptionLines.join('<br>') : (item.details || '')}</td>
          <td class="col-qty">${quantity}</td>
          <td class="col-rate">$${itemPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td class="col-amount">$${itemTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
      `;
    }).join('');
  };

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
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
          color: #333;
          line-height: 1.5;
          font-size: 14px;
          background: #fff;
        }

        .page {
          max-width: 800px;
          margin: 0 auto;
          padding: 0;
        }

        /* Header - Gray background bar */
        .header {
          background: #f5f5f5;
          padding: 25px 40px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .header-left {
          flex: 1;
        }

        .header-right {
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
        }

        .estimate-title {
          font-size: 28px;
          font-weight: 700;
          color: ${accentColor};
          margin-bottom: 12px;
          letter-spacing: 2px;
        }

        .business-info {
          margin-top: 4px;
        }

        .business-name {
          font-size: 16px;
          font-weight: 600;
          color: #333;
          margin-bottom: 4px;
        }

        .business-contact {
          font-size: 12px;
          color: #666;
          line-height: 1.6;
        }

        .business-contact-item {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 2px;
        }

        .logo {
          max-width: 120px;
          max-height: 80px;
        }

        .logo img {
          max-width: 100%;
          max-height: 80px;
          object-fit: contain;
        }

        /* Main content area */
        .content {
          padding: 30px 40px;
        }

        /* Project title bar */
        .project-title {
          color: ${accentColor};
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 15px;
          padding-bottom: 0;
        }

        /* Bill To / Ship To section */
        .addresses {
          display: flex;
          gap: 60px;
          margin-bottom: 25px;
          padding-bottom: 25px;
          border-bottom: 1px dashed #ddd;
        }

        .address-block {
          flex: 1;
        }

        .address-label {
          font-size: 11px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .address-name {
          font-size: 14px;
          color: #333;
          margin-bottom: 2px;
        }

        .address-line {
          font-size: 13px;
          color: #666;
          line-height: 1.5;
        }

        /* Estimate details */
        .estimate-details {
          margin-bottom: 30px;
        }

        .estimate-details-title {
          font-size: 13px;
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
        }

        .estimate-details-row {
          font-size: 13px;
          color: #666;
          margin-bottom: 3px;
        }

        /* Items table */
        .items-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 25px;
        }

        .items-table thead tr {
          border-bottom: 1px solid #ddd;
        }

        .items-table th {
          text-align: left;
          padding: 12px 8px;
          font-size: 12px;
          font-weight: 500;
          color: #666;
        }

        .items-table th.text-right {
          text-align: right;
        }

        .items-table td {
          padding: 15px 8px;
          font-size: 13px;
          color: #333;
          vertical-align: top;
          border-bottom: 1px solid #eee;
        }

        .items-table tbody tr:last-child td {
          border-bottom: 1px solid #ddd;
        }

        .col-num {
          width: 30px;
          color: #333;
        }

        .col-product {
          width: 160px;
        }

        .col-product strong {
          font-weight: 600;
          color: #333;
        }

        .col-description {
          color: #666;
          font-size: 12px;
          line-height: 1.6;
        }

        .col-qty {
          width: 50px;
          text-align: right;
        }

        .col-rate {
          width: 100px;
          text-align: right;
        }

        .col-amount {
          width: 100px;
          text-align: right;
          font-weight: 500;
        }

        /* Total section */
        .total-section {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 40px;
        }

        .total-row {
          display: flex;
          align-items: baseline;
          gap: 30px;
        }

        .total-label {
          font-size: 14px;
          color: #333;
        }

        .total-amount {
          font-size: 22px;
          font-weight: 700;
          color: #333;
        }

        /* Signature section */
        .signature-section {
          display: flex;
          gap: 80px;
          padding-top: 30px;
          border-top: 1px solid #ddd;
          margin-top: 40px;
        }

        .signature-block {
          flex: 1;
        }

        .signature-label {
          font-size: 12px;
          color: #666;
          margin-bottom: 30px;
        }

        .signature-line {
          border-bottom: 1px solid #ccc;
          min-width: 200px;
        }

        /* Notes section */
        .notes {
          margin-top: 30px;
          padding: 15px;
          background: #fafafa;
          border-left: 3px solid ${accentColor};
          font-size: 12px;
          color: #666;
          line-height: 1.6;
        }

        .notes-title {
          font-weight: 600;
          color: #333;
          margin-bottom: 5px;
        }

        /* Print styles */
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .page {
            max-width: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <!-- Header -->
        <div class="header">
          <div class="header-left">
            <div class="estimate-title">ESTIMATE</div>
            <div class="business-info">
              ${businessName ? `<div class="business-name">${businessName}</div>` : ''}
              <div class="business-contact">
                ${businessPhone ? `<div class="business-contact-item">${businessPhone}</div>` : ''}
                ${businessEmail ? `<div class="business-contact-item">${businessEmail}</div>` : ''}
                ${businessAddress ? `<div class="business-contact-item">${businessAddress}${businessCity || businessState || businessZip ? `, ${formatAddressLine(businessCity, businessState, businessZip)}` : ''}</div>` : ''}
              </div>
            </div>
          </div>
          <div class="header-right">
            ${businessLogo
              ? `<div class="logo"><img src="${businessLogo}" alt="Logo" /></div>`
              : ''
            }
          </div>
        </div>

        <!-- Content -->
        <div class="content">
          <!-- Project Title -->
          ${projectName || displayClientName ? `
            <div class="project-title">
              ${displayClientName}${projectName ? `:${projectName}` : ''}
            </div>
          ` : ''}

          <!-- Bill To / Ship To -->
          <div class="addresses">
            <div class="address-block">
              <div class="address-label">Bill to</div>
              <div class="address-name">${displayClientName}</div>
              ${displayClientAddress ? `<div class="address-line">${displayClientAddress}</div>` : ''}
              ${billToAddressLine ? `<div class="address-line">${billToAddressLine}</div>` : ''}
            </div>
            <div class="address-block">
              <div class="address-label">Ship to</div>
              <div class="address-name">${displayShipToName}</div>
              ${displayShipToAddress ? `<div class="address-line">${displayShipToAddress}</div>` : ''}
              ${shipToAddressLine ? `<div class="address-line">${shipToAddressLine}</div>` : ''}
            </div>
          </div>

          <!-- Estimate Details -->
          <div class="estimate-details">
            <div class="estimate-details-title">Estimate details</div>
            ${estimateNumber ? `<div class="estimate-details-row">Estimate no.: ${estimateNumber}</div>` : ''}
            <div class="estimate-details-row">Estimate date: ${date}</div>
          </div>

          <!-- Items Table -->
          <table class="items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Product or service</th>
                <th>Description</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Rate</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${generateItemsHTML()}
            </tbody>
          </table>

          <!-- Total -->
          <div class="total-section">
            <div class="total-row">
              <div class="total-label">Total</div>
              <div class="total-amount">$${(typeof total === 'number' ? total : parseFloat(total) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
          </div>

          <!-- Notes (if provided) -->
          ${notes ? `
            <div class="notes">
              <div class="notes-title">Notes</div>
              ${notes}
            </div>
          ` : ''}

          <!-- Signature Section -->
          <div class="signature-section">
            <div class="signature-block">
              <div class="signature-label">Accepted date</div>
              <div class="signature-line"></div>
            </div>
            <div class="signature-block">
              <div class="signature-label">Accepted by</div>
              <div class="signature-line"></div>
            </div>
          </div>
        </div>
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
