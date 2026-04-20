import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';

/**
 * Generates a professional HTML invoice template
 * Matching the estimate PDF design language
 * @param {object} invoiceData - Invoice data
 * @param {object} businessInfo - Business information
 * @returns {string} - HTML string
 */
export const generateInvoiceHTML = (invoiceData, businessInfo, options = {}) => {
  // Get styling options from businessInfo or options override
  const accentColor = options.accentColor || businessInfo?.accentColor || '#2563EB';
  const fontStyleId = options.fontStyle || businessInfo?.fontStyle || 'modern';
  const fontFamily = fontStyleId === 'classic'
    ? 'Georgia, Times, serif'
    : fontStyleId === 'clean'
    ? "'Helvetica Neue', Arial, sans-serif"
    : "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

  const {
    invoice_number,
    invoiceNumber,
    client_name,
    clientName,
    client_contact_person,
    clientContactPerson,
    client_address,
    clientAddress,
    client_city,
    clientCity,
    client_state,
    clientState,
    client_zip,
    clientZip,
    client_email,
    clientEmail,
    client_phone,
    clientPhone,
    project_name,
    projectName,
    items = [],
    subtotal = 0,
    tax_rate,
    taxRate,
    tax_amount,
    taxAmount,
    total = 0,
    amount_paid,
    amountPaid,
    amount_due,
    amountDue,
    due_date,
    dueDate,
    payment_terms,
    paymentTerms,
    notes,
    created_at,
    createdAt,
    // Partial payment fields
    contractTotal,
    paymentType,
    paymentPercentage,
    previousPayments = 0,
    remainingBalance,
  } = invoiceData;

  const invNumber = invoice_number || invoiceNumber || 'INV-DRAFT';
  const client = client_name || clientName || 'Client';
  const clientContact = client_contact_person || clientContactPerson || '';
  const clientAddr = client_address || clientAddress || '';
  const clientCityVal = client_city || clientCity || '';
  const clientStateVal = client_state || clientState || '';
  const clientZipVal = client_zip || clientZip || '';
  const clientEmailAddr = client_email || clientEmail || '';
  const clientPhoneVal = client_phone || clientPhone || '';
  const project = project_name || projectName || '';
  const taxRateValue = tax_rate || taxRate || 0;
  const taxAmountValue = tax_amount || taxAmount || 0;
  const paidAmount = amount_paid || amountPaid || 0;
  const dueAmount = amount_due || amountDue || (total - paidAmount);
  const dueDateValue = due_date || dueDate || '';
  const terms = payment_terms || paymentTerms || 'Net 30';
  const invoiceDate = created_at || createdAt || new Date().toISOString();

  // Partial payment detection
  const isPartialPayment = paymentType && paymentType !== 'full' && paymentType !== 'final' && paymentPercentage && paymentPercentage < 100;
  const displayContractTotal = contractTotal || total;

  // Format address line
  const addressLine = [clientCityVal, clientStateVal, clientZipVal].filter(Boolean).join(', ');

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    const { getAppLocale } = require('./calculations');
    const locale = getAppLocale();
    const currency = locale === 'pt-BR' ? 'BRL' : 'USD';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(amount || 0);
  };

  // Generate table rows for items
  const generateItemsHTML = () => {
    return items.map((item, index) => {
      const itemPrice = typeof item.price === 'number' ? item.price : (parseFloat(item.price) || parseFloat(item.pricePerUnit) || 0);
      const itemTotal = typeof item.total === 'number' ? item.total : (parseFloat(item.total) || 0);
      const quantity = item.quantity || 1;
      const unit = item.unit || 'unit';

      return `
        <tr>
          <td class="col-num">${index + 1}.</td>
          <td class="col-description"><strong>${item.description || `Service ${index + 1}`}</strong></td>
          <td class="col-qty">${quantity} ${unit}${quantity > 1 ? 's' : ''}</td>
          <td class="col-rate">${formatCurrency(itemPrice)}</td>
          <td class="col-amount">${formatCurrency(itemTotal)}</td>
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
  <title>Invoice ${invNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: ${fontFamily};
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

    .invoice-title {
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

    /* Bill To section */
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
      font-weight: 600;
      margin-bottom: 2px;
    }

    .address-line {
      font-size: 13px;
      color: #666;
      line-height: 1.5;
    }

    /* Invoice details */
    .invoice-details {
      margin-bottom: 30px;
    }

    .invoice-details-title {
      font-size: 13px;
      font-weight: 600;
      color: #333;
      margin-bottom: 8px;
    }

    .invoice-details-row {
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

    .col-description {
      width: auto;
    }

    .col-description strong {
      font-weight: 600;
      color: #333;
    }

    .col-qty {
      width: 100px;
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

    /* Totals section */
    .totals-section {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      margin-bottom: 40px;
    }

    .totals-table {
      width: 280px;
    }

    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 13px;
      color: #666;
    }

    .totals-row.subtotal {
      border-bottom: 1px solid #eee;
      padding-bottom: 10px;
      margin-bottom: 6px;
    }

    .totals-row.tax {
      font-size: 12px;
    }

    .totals-row.total {
      border-top: 2px solid #333;
      margin-top: 6px;
      padding-top: 10px;
    }

    .totals-row.total .totals-label,
    .totals-row.total .totals-value {
      font-size: 14px;
      font-weight: 700;
      color: #333;
    }

    .amount-due-bar {
      margin-top: 12px;
      background: ${accentColor}10;
      border: 2px solid ${accentColor};
      border-radius: 6px;
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      width: 280px;
    }

    .amount-due-label {
      font-size: 13px;
      font-weight: 700;
      color: ${accentColor};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .amount-due-value {
      font-size: 22px;
      font-weight: 700;
      color: ${accentColor};
    }

    .partial-info {
      font-size: 12px;
      color: #666;
      padding: 4px 0;
    }

    /* Payment info section */
    .payment-info {
      margin-bottom: 30px;
      padding: 15px;
      background: #fafafa;
      border-left: 3px solid ${accentColor};
      font-size: 12px;
      color: #666;
      line-height: 1.6;
    }

    .payment-info-title {
      font-weight: 600;
      color: #333;
      margin-bottom: 5px;
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
        <div class="invoice-title">INVOICE</div>
        <div class="business-info">
          ${businessInfo?.name ? `<div class="business-name">${businessInfo.name}</div>` : ''}
          <div class="business-contact">
            ${businessInfo?.phone ? `<div class="business-contact-item">${businessInfo.phone}</div>` : ''}
            ${businessInfo?.email ? `<div class="business-contact-item">${businessInfo.email}</div>` : ''}
            ${businessInfo?.address ? `<div class="business-contact-item">${businessInfo.address}</div>` : ''}
          </div>
        </div>
      </div>
      <div class="header-right">
        ${businessInfo?.logoUrl
          ? `<div class="logo"><img src="${businessInfo.logoUrl}" alt="Logo" /></div>`
          : ''
        }
      </div>
    </div>

    <!-- Content -->
    <div class="content">
      <!-- Project Title -->
      ${client || project ? `
        <div class="project-title">
          ${client}${project ? `: ${project}` : ''}
        </div>
      ` : ''}

      <!-- Bill To -->
      <div class="addresses">
        <div class="address-block">
          <div class="address-label">Bill to</div>
          <div class="address-name">${client}</div>
          ${clientContact ? `<div class="address-line">${clientContact}</div>` : ''}
          ${clientPhoneVal ? `<div class="address-line">${clientPhoneVal}</div>` : ''}
          ${clientEmailAddr ? `<div class="address-line">${clientEmailAddr}</div>` : ''}
          ${clientAddr ? `<div class="address-line">${clientAddr}</div>` : ''}
          ${addressLine ? `<div class="address-line">${addressLine}</div>` : ''}
        </div>
        <div class="address-block">
          <div class="address-label">Invoice details</div>
          <div class="address-line"><strong>Invoice no.:</strong> ${invNumber}</div>
          <div class="address-line"><strong>Date issued:</strong> ${formatDate(invoiceDate)}</div>
          ${dueDateValue ? `<div class="address-line"><strong>Due date:</strong> ${formatDate(dueDateValue)}</div>` : ''}
          <div class="address-line"><strong>Payment terms:</strong> ${terms}</div>
        </div>
      </div>

      <!-- Items Table -->
      <table class="items-table">
        <thead>
          <tr>
            <th>#</th>
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

      <!-- Totals -->
      <div class="totals-section">
        <div class="totals-table">
          ${isPartialPayment ? `
            <div class="totals-row subtotal">
              <span class="totals-label">Contract Total</span>
              <span class="totals-value">${formatCurrency(displayContractTotal)}</span>
            </div>
            <div class="totals-row partial-info">
              <span class="totals-label">This Invoice (${paymentPercentage}% ${paymentType === 'down_payment' ? 'Down Payment' : paymentType === 'progress' ? 'Progress Payment' : 'Payment'})</span>
              <span class="totals-value">${formatCurrency(dueAmount)}</span>
            </div>
            ${previousPayments > 0 ? `
              <div class="totals-row">
                <span class="totals-label">Previous Payments</span>
                <span class="totals-value">-${formatCurrency(previousPayments)}</span>
              </div>
            ` : ''}
          ` : `
            <div class="totals-row subtotal">
              <span class="totals-label">Subtotal</span>
              <span class="totals-value">${formatCurrency(subtotal)}</span>
            </div>
            ${taxAmountValue > 0 ? `
              <div class="totals-row tax">
                <span class="totals-label">Tax (${(taxRateValue * 100).toFixed(1)}%)</span>
                <span class="totals-value">${formatCurrency(taxAmountValue)}</span>
              </div>
            ` : ''}
            <div class="totals-row total">
              <span class="totals-label">Total</span>
              <span class="totals-value">${formatCurrency(total)}</span>
            </div>
            ${paidAmount > 0 ? `
              <div class="totals-row">
                <span class="totals-label" style="color: #22C55E;">Paid</span>
                <span class="totals-value" style="color: #22C55E;">-${formatCurrency(paidAmount)}</span>
              </div>
            ` : ''}
          `}
        </div>

        <!-- Amount Due highlight -->
        <div class="amount-due-bar">
          <span class="amount-due-label">Amount Due</span>
          <span class="amount-due-value">${formatCurrency(dueAmount)}</span>
        </div>
      </div>

      <!-- Payment Information -->
      ${businessInfo?.paymentInfo ? `
        <div class="payment-info">
          <div class="payment-info-title">Payment Information</div>
          ${businessInfo.paymentInfo.split('\\n').map(line => line.trim()).filter(Boolean).join('<br>')}
        </div>
      ` : ''}

      <!-- Notes -->
      ${notes ? `
        <div class="notes">
          <div class="notes-title">Notes</div>
          ${notes.split('\\n').map(line => line.trim()).filter(Boolean).join('<br>')}
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
  `.trim();
};

/**
 * Generates and saves invoice PDF
 * @param {object} invoiceData - Invoice data
 * @param {object} businessInfo - Business information
 * @returns {Promise<string>} - Local file path to PDF
 */
export const generateInvoicePDF = async (invoiceData, businessInfo) => {
  try {
    const html = generateInvoiceHTML(invoiceData, businessInfo);

    const { uri } = await Print.printToFileAsync({
      html,
      width: 612,
      height: 792,
    });

    return uri;
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Failed to generate PDF');
  }
};

/**
 * Uploads PDF to Supabase storage
 * @param {string} localUri - Local file path to PDF
 * @param {string} invoiceNumber - Invoice number for filename
 * @returns {Promise<string>} - Public URL of uploaded PDF
 */
export const uploadInvoicePDF = async (localUri, invoiceNumber) => {
  try {
    // Get current user ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Read the file as base64
    const fileData = await FileSystem.readAsStringAsync(localUri, {
      encoding: 'base64',
    });

    // Convert base64 to blob
    const safeInvoiceNumber = invoiceNumber ? invoiceNumber.replace(/\//g, '-') : `invoice_${Date.now()}`;
    const fileName = `${safeInvoiceNumber}_${Date.now()}.pdf`;
    const filePath = `${user.id}/invoices/${fileName}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, decode(fileData), {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (error) {
      throw error;
    }

    // Get signed URL (expires in 1 hour for security)
    // This creates a temporary, secure URL that expires
    const { data: signedUrlData, error: signedError } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 3600); // 3600 seconds = 1 hour

    if (signedError) {
      console.error('Error creating signed URL:', signedError);
      // Fallback to public URL if signed URL fails
      const { data: publicUrlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);
      return publicUrlData.publicUrl;
    }

    return signedUrlData.signedUrl;
  } catch (error) {
    console.error('Error uploading PDF:', error);
    throw new Error('Failed to upload PDF to storage');
  }
};

/**
 * Helper to decode base64 to ArrayBuffer
 */
function decode(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Opens invoice PDF for preview/share
 * Uses expo-sharing to open the local PDF file in system share sheet
 * This prevents exposing signed URLs to the user/client
 * @param {string} pdfUri - Local PDF URI (file:// path)
 * @param {string} invoiceNumber - Invoice number for share title
 */
export const previewInvoicePDF = async (pdfUri, invoiceNumber) => {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Sharing is not available on this device');
    }

    // Use expo-sharing to preview/share the local PDF
    // This opens the system share sheet where user can:
    // - Preview the PDF
    // - Share to WhatsApp, Email, etc.
    // No signed URL is exposed - only the PDF file itself
    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: `Invoice ${invoiceNumber}`,
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    console.error('Error previewing PDF:', error);
    throw new Error('Failed to preview PDF');
  }
};

/**
 * Uploads a logo image to Supabase storage
 * @param {string} localUri - Local file path to the image (file:// URI)
 * @returns {Promise<string>} - Public URL of uploaded logo
 */
export const uploadLogoToStorage = async (localUri) => {
  try {
    // Get current user ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User not authenticated');
    }

    // Read the file as base64
    const fileData = await FileSystem.readAsStringAsync(localUri, {
      encoding: 'base64',
    });

    // Determine file extension from URI
    const extension = localUri.split('.').pop()?.toLowerCase() || 'png';
    const mimeType = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : 'image/png';

    // Generate unique filename
    const fileName = `logo_${Date.now()}.${extension}`;
    const filePath = `${user.id}/logos/${fileName}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, decode(fileData), {
        contentType: mimeType,
        upsert: true, // Replace existing logo
      });

    if (error) {
      throw error;
    }

    // Get public URL for the logo
    const { data: publicUrlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('Error uploading logo:', error);
    throw new Error('Failed to upload logo to storage');
  }
};

/**
 * Shares invoice PDF with system share dialog
 * @param {string} pdfUri - Local or remote PDF URI
 * @param {string} invoiceNumber - Invoice number for share title
 */
export const shareInvoicePDF = async (pdfUri, invoiceNumber) => {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Sharing is not available on this device');
    }

    await Sharing.shareAsync(pdfUri, {
      mimeType: 'application/pdf',
      dialogTitle: `Share Invoice ${invoiceNumber}`,
      UTI: 'com.adobe.pdf',
    });
  } catch (error) {
    console.error('Error sharing PDF:', error);
    throw new Error('Failed to share PDF');
  }
};
