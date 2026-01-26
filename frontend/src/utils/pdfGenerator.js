import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
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
    client_contact_person,
    clientContactPerson,
    client_address,
    clientAddress,
    client_email,
    clientEmail,
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
  const clientContact = client_contact_person || clientContactPerson || '';
  const clientAddr = client_address || clientAddress || '';
  const clientEmailAddr = client_email || clientEmail || '';
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
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.6;
      color: #000;
      padding: 60px 80px;
      background: #fff;
    }

    .invoice-container {
      max-width: 100%;
      margin: 0 auto;
      background: #fff;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 50px;
      padding-bottom: 0;
      border-bottom: none;
    }

    .company-info {
      flex: 1;
    }

    .company-name {
      font-size: 28px;
      font-weight: 700;
      color: #000;
      margin-bottom: 4px;
      letter-spacing: -0.5px;
    }

    .company-details {
      font-size: 10px;
      color: #000;
      line-height: 1.4;
    }

    .invoice-title {
      text-align: right;
    }

    .invoice-title h1 {
      font-size: 36px;
      font-weight: 700;
      color: #000;
      margin-bottom: 12px;
      letter-spacing: -0.5px;
    }

    .invoice-meta {
      font-size: 10px;
      color: #000;
      text-align: right;
      line-height: 1.6;
    }

    .invoice-meta strong {
      font-weight: 600;
    }

    .section-header {
      font-size: 13px;
      font-weight: 700;
      color: #000;
      text-transform: uppercase;
      margin-top: 30px;
      margin-bottom: 10px;
      letter-spacing: 0.3px;
    }

    .info-section {
      margin-bottom: 25px;
    }

    .info-block {
      margin-bottom: 15px;
    }

    .info-block strong {
      font-weight: 600;
    }

    .info-content {
      font-size: 10px;
      color: #000;
      line-height: 1.5;
    }

    .description-section {
      margin-bottom: 30px;
    }

    .work-item {
      margin-bottom: 18px;
    }

    .work-item-title {
      font-size: 11px;
      font-weight: 700;
      color: #000;
      margin-bottom: 6px;
    }

    .work-item-details {
      font-size: 10px;
      color: #000;
      line-height: 1.7;
      padding-left: 12px;
    }

    .work-item-details li {
      margin-bottom: 3px;
      list-style-type: disc;
    }

    .totals-section {
      margin-top: 30px;
      margin-bottom: 30px;
      border-top: 2px solid #000;
      border-bottom: 2px solid #000;
      padding: 10px 0;
    }

    .subtotal-row {
      display: flex;
      justify-content: flex-end;
      padding: 6px 0;
      font-size: 10px;
      color: #000;
    }

    .subtotal-row .label {
      margin-right: 100px;
    }

    .total-row {
      display: flex;
      justify-content: flex-end;
      padding: 8px 0;
      font-size: 12px;
      font-weight: 700;
      color: #000;
    }

    .total-row .label {
      margin-right: 80px;
    }

    .total-row .amount {
      font-weight: 700;
    }

    .payment-info {
      margin-bottom: 25px;
    }

    .payment-info p {
      font-size: 10px;
      color: #000;
      line-height: 1.6;
      margin-bottom: 4px;
    }

    .payment-method {
      margin-bottom: 15px;
    }

    .payment-method strong {
      font-weight: 700;
    }

    .notes {
      margin-top: 25px;
    }

    .notes p {
      font-size: 10px;
      color: #000;
      line-height: 1.7;
      margin-bottom: 8px;
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
    <!-- Header: Company Logo/Name on Left, INVOICE Title on Right -->
    <div class="header">
      <div class="company-info">
        ${businessInfo?.logoUrl ? `
          <img src="${businessInfo.logoUrl}" alt="Business Logo" style="width: 80px; height: 80px; object-fit: contain; margin-bottom: 8px;" />
        ` : `
          <div class="company-name">${businessInfo?.name || 'YOUR COMPANY NAME'}</div>
        `}
        <div class="company-details">
          ${businessInfo?.logoUrl ? `<strong>${businessInfo?.name || ''}</strong><br>` : ''}
          ${businessInfo?.contactName || businessInfo?.owner || ''}${(businessInfo?.contactName || businessInfo?.owner) ? '<br>' : ''}
          ${businessInfo?.email || ''}${businessInfo?.email ? '<br>' : ''}
          ${businessInfo?.address || ''}
        </div>
      </div>
      <div class="invoice-title">
        <h1>INVOICE</h1>
        <div class="invoice-meta">
          <strong>Invoice No.:</strong> ${invNumber}<br>
          <strong>Date Issued:</strong> ${formatDate(invoiceDate)}
        </div>
      </div>
    </div>

    <!-- BILL TO Section -->
    <div class="section-header">BILL TO:</div>
    <div class="info-section">
      <div class="info-content">
        <strong>${client}</strong><br>
        ${clientContact ? `Attn: ${clientContact}<br>` : ''}
        ${clientEmailAddr ? `${clientEmailAddr}<br>` : ''}
        ${clientAddr ? `${clientAddr}` : ''}
      </div>
    </div>

    <!-- PROJECT Section (if exists) -->
    ${project ? `
      <div class="section-header">PROJECT:</div>
      <div class="info-section">
        <div class="info-content">${project}</div>
      </div>
    ` : ''}

    <!-- DESCRIPTION OF WORK Section -->
    <div class="section-header">DESCRIPTION OF WORK:</div>
    <div class="description-section">
      ${items.map((item, index) => `
        <div class="work-item">
          <div class="work-item-title">${index + 1}. ${item.description || `Service ${index + 1}`}</div>
          <div class="work-item-details">
            ${item.quantity} ${item.unit || 'unit'}${item.quantity > 1 ? 's' : ''} × ${formatCurrency(item.price || item.pricePerUnit || 0)} = ${formatCurrency(item.total || 0)}
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Totals Section -->
    <div class="subtotal-row">
      <span class="label">Subtotal:</span>
      <span>${formatCurrency(subtotal)}</span>
    </div>

    <div class="totals-section">
      <div class="total-row">
        <span class="label">TOTAL DUE:</span>
        <span class="amount">${formatCurrency(total)} USD</span>
      </div>
    </div>

    <!-- PAYMENT INFORMATION Section -->
    ${businessInfo?.paymentInfo ? `
      <div class="section-header">PAYMENT INFORMATION:</div>
      <div class="payment-info">
        ${businessInfo.paymentInfo.split('\n').map(line => `<p>${line}</p>`).join('')}
      </div>
    ` : ''}

    <!-- NOTES Section (if exists) -->
    ${notes ? `
      <div class="section-header">NOTES:</div>
      <div class="notes">
        ${notes.split('\n').map(line => `<p>${line}</p>`).join('')}
      </div>
    ` : ''}
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
