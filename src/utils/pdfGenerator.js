import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { supabase } from '../lib/supabase';

/**
 * Generates a professional HTML invoice template
 * @param {object} invoiceData - Invoice data
 * @param {object} businessInfo - Business information
 * @returns {string} - HTML string
 */
export const generateInvoiceHTML = (invoiceData, businessInfo) => {
  const {
    invoice_number,
    invoiceNumber,
    client_name,
    clientName,
    client_address,
    clientAddress,
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
  } = invoiceData;

  const invNumber = invoice_number || invoiceNumber || 'INV-DRAFT';
  const client = client_name || clientName || 'Client';
  const clientAddr = client_address || clientAddress || '';
  const project = project_name || projectName || '';
  const taxRateValue = tax_rate || taxRate || 0;
  const taxAmountValue = tax_amount || taxAmount || 0;
  const paidAmount = amount_paid || amountPaid || 0;
  const dueAmount = amount_due || amountDue || (total - paidAmount);
  const dueDateValue = due_date || dueDate || '';
  const terms = payment_terms || paymentTerms || 'Net 30';
  const invoiceDate = created_at || createdAt || new Date().toISOString();

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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invNumber}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #333;
      padding: 40px;
      background: #fff;
    }

    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      background: #fff;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #2563EB;
    }

    .company-info {
      flex: 1;
    }

    .company-name {
      font-size: 24px;
      font-weight: 700;
      color: #2563EB;
      margin-bottom: 8px;
    }

    .company-details {
      font-size: 11px;
      color: #666;
      line-height: 1.5;
    }

    .invoice-title {
      text-align: right;
    }

    .invoice-title h1 {
      font-size: 32px;
      font-weight: 700;
      color: #1F2937;
      margin-bottom: 8px;
    }

    .invoice-number {
      font-size: 14px;
      font-weight: 600;
      color: #2563EB;
    }

    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }

    .info-block {
      flex: 1;
    }

    .info-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      color: #6B7280;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }

    .info-content {
      font-size: 12px;
      color: #1F2937;
      line-height: 1.6;
    }

    .info-content strong {
      font-weight: 600;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }

    .items-table thead {
      background: #F3F4F6;
    }

    .items-table th {
      padding: 12px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      color: #374151;
      border-bottom: 2px solid #D1D5DB;
    }

    .items-table th:last-child,
    .items-table td:last-child {
      text-align: right;
    }

    .items-table tbody tr {
      border-bottom: 1px solid #E5E7EB;
    }

    .items-table td {
      padding: 12px;
      font-size: 12px;
      color: #1F2937;
    }

    .item-description {
      font-weight: 500;
      margin-bottom: 4px;
    }

    .item-details {
      font-size: 10px;
      color: #6B7280;
    }

    .totals-section {
      margin-left: auto;
      width: 300px;
      margin-bottom: 30px;
    }

    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 12px;
    }

    .totals-row.subtotal {
      color: #6B7280;
      border-bottom: 1px solid #E5E7EB;
      padding-bottom: 12px;
      margin-bottom: 8px;
    }

    .totals-row.total {
      font-size: 16px;
      font-weight: 700;
      color: #1F2937;
      border-top: 2px solid #2563EB;
      border-bottom: 2px solid #2563EB;
      padding: 12px 0;
      margin-top: 8px;
    }

    .totals-row.total .amount {
      color: #2563EB;
    }

    .totals-row.paid {
      color: #059669;
      font-weight: 600;
    }

    .totals-row.due {
      font-size: 14px;
      font-weight: 700;
      color: #DC2626;
      margin-top: 8px;
    }

    .payment-info {
      background: #F9FAFB;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      border-left: 4px solid #2563EB;
    }

    .payment-info h3 {
      font-size: 13px;
      font-weight: 600;
      color: #1F2937;
      margin-bottom: 12px;
    }

    .payment-info p {
      font-size: 11px;
      color: #4B5563;
      line-height: 1.6;
    }

    .notes {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #E5E7EB;
    }

    .notes h3 {
      font-size: 12px;
      font-weight: 600;
      color: #1F2937;
      margin-bottom: 8px;
    }

    .notes p {
      font-size: 11px;
      color: #6B7280;
      line-height: 1.6;
    }

    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #E5E7EB;
      text-align: center;
      font-size: 10px;
      color: #9CA3AF;
    }

    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .status-unpaid {
      background: #FEE2E2;
      color: #991B1B;
    }

    .status-paid {
      background: #D1FAE5;
      color: #065F46;
    }

    .status-partial {
      background: #FEF3C7;
      color: #92400E;
    }

    .status-overdue {
      background: #FEE2E2;
      color: #7F1D1D;
    }

    @media print {
      body {
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header -->
    <div class="header">
      <div class="company-info">
        <div class="company-name">${businessInfo?.name || 'Your Business'}</div>
        <div class="company-details">
          ${businessInfo?.phone ? `Phone: ${businessInfo.phone}<br>` : ''}
          ${businessInfo?.email ? `Email: ${businessInfo.email}<br>` : ''}
          ${businessInfo?.address ? `${businessInfo.address}` : ''}
        </div>
      </div>
      <div class="invoice-title">
        <h1>INVOICE</h1>
        <div class="invoice-number">${invNumber}</div>
      </div>
    </div>

    <!-- Invoice Info -->
    <div class="info-section">
      <div class="info-block">
        <div class="info-label">Bill To:</div>
        <div class="info-content">
          <strong>${client}</strong><br>
          ${clientAddr ? `${clientAddr}<br>` : ''}
        </div>
      </div>
      <div class="info-block">
        <div class="info-label">Invoice Details:</div>
        <div class="info-content">
          <strong>Date:</strong> ${formatDate(invoiceDate)}<br>
          ${dueDateValue ? `<strong>Due Date:</strong> ${formatDate(dueDateValue)}<br>` : ''}
          ${terms ? `<strong>Terms:</strong> ${terms}<br>` : ''}
          ${project ? `<strong>Project:</strong> ${project}` : ''}
        </div>
      </div>
    </div>

    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 50%;">Description</th>
          <th style="width: 15%;">Quantity</th>
          <th style="width: 15%;">Rate</th>
          <th style="width: 20%;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, index) => `
          <tr>
            <td>
              <div class="item-description">${item.description || `Item ${index + 1}`}</div>
              ${item.unit ? `<div class="item-details">Unit: ${item.unit}</div>` : ''}
            </td>
            <td>${item.quantity || 0}</td>
            <td>${formatCurrency(item.price || item.pricePerUnit || 0)}</td>
            <td>${formatCurrency(item.total || 0)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Totals -->
    <div class="totals-section">
      <div class="totals-row subtotal">
        <span>Subtotal:</span>
        <span>${formatCurrency(subtotal)}</span>
      </div>
      ${taxRateValue > 0 ? `
        <div class="totals-row">
          <span>Tax (${taxRateValue}%):</span>
          <span>${formatCurrency(taxAmountValue)}</span>
        </div>
      ` : ''}
      <div class="totals-row total">
        <span>TOTAL:</span>
        <span class="amount">${formatCurrency(total)}</span>
      </div>
      ${paidAmount > 0 ? `
        <div class="totals-row paid">
          <span>Amount Paid:</span>
          <span>-${formatCurrency(paidAmount)}</span>
        </div>
        <div class="totals-row due">
          <span>AMOUNT DUE:</span>
          <span>${formatCurrency(dueAmount)}</span>
        </div>
      ` : ''}
    </div>

    <!-- Payment Info -->
    ${terms || notes ? `
      <div class="payment-info">
        ${terms ? `
          <h3>Payment Terms</h3>
          <p>${terms}</p>
        ` : ''}
      </div>
    ` : ''}

    <!-- Notes -->
    ${notes ? `
      <div class="notes">
        <h3>Notes</h3>
        <p>${notes}</p>
      </div>
    ` : ''}

    <!-- Footer -->
    <div class="footer">
      Thank you for your business!<br>
      Generated on ${formatDate(new Date().toISOString())}
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
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert base64 to blob
    const fileName = `${invoiceNumber.replace(/\//g, '-')}_${Date.now()}.pdf`;
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

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
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
