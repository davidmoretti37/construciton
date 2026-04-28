// Shared helpers used by every invoice/estimate template.
// Normalizes the upstream invoiceData + businessInfo + options shape into a
// flat object the visual templates can consume without re-doing field-name
// reconciliation. Centralizes currency / date / escape so the three
// templates stay focused on layout.

const FONT_STACKS = {
  modern: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  classic: "Georgia, 'Times New Roman', Times, serif",
  clean: "'Helvetica Neue', Helvetica, Arial, sans-serif",
};

export const escape = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
};

export const formatCurrency = (amount) => {
  try {
    // Locale-aware (matches existing pdfGenerator behavior). USD by default.
    let locale = 'en-US';
    let currency = 'USD';
    try {
      const { getAppLocale } = require('../calculations');
      locale = getAppLocale();
      currency = locale === 'pt-BR' ? 'BRL' : 'USD';
    } catch { /* calculations module optional */ }
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(amount) || 0);
  } catch {
    return `$${(Number(amount) || 0).toFixed(2)}`;
  }
};

export const formatQty = (q) => {
  const n = Number(q);
  if (!Number.isFinite(n)) return '';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

export const fontFamily = (key) => FONT_STACKS[key] || FONT_STACKS.modern;

// Convert an arbitrary item shape into a common normalized line.
// Upstream uses { description, price | pricePerUnit, quantity, unit, total }.
// Templates expect { description, secondary, qty, rate, amount }.
function normalizeItem(it, idx) {
  const description = it.description || `Service ${idx + 1}`;
  const secondary = it.secondary || it.note || it.detail || '';
  const qty = it.qty != null ? it.qty : (it.quantity != null ? it.quantity : 1);
  const rate = (typeof it.rate === 'number' ? it.rate : null)
    ?? (typeof it.price === 'number' ? it.price : null)
    ?? parseFloat(it.price)
    ?? parseFloat(it.pricePerUnit)
    ?? 0;
  const amount = (typeof it.amount === 'number' ? it.amount : null)
    ?? (typeof it.total === 'number' ? it.total : null)
    ?? parseFloat(it.total)
    ?? (Number(qty) * Number(rate))
    ?? 0;
  return { description, secondary, qty, rate, amount };
}

/**
 * Normalize the upstream (invoiceData, businessInfo, options) call shape
 * into a single flat object that templates can render without ambiguity.
 */
export function normalize(invoiceData = {}, businessInfo = {}, options = {}) {
  const isEstimate = invoiceData.type === 'estimate' || options.isEstimate === true;

  // Document number — fall back across known field names.
  const number = invoiceData.invoice_number || invoiceData.invoiceNumber
    || invoiceData.estimate_number || invoiceData.estimateNumber
    || invoiceData.number
    || (isEstimate ? 'EST-DRAFT' : 'INV-DRAFT');

  // Dates
  const issuedAt = invoiceData.issued_at || invoiceData.issuedAt
    || invoiceData.created_at || invoiceData.createdAt
    || invoiceData.date || new Date().toISOString();
  const dueAt = invoiceData.due_date || invoiceData.dueDate || invoiceData.due_at;
  const validUntil = invoiceData.valid_until || invoiceData.validUntil || invoiceData.expiresAt;

  // Parties
  const business = {
    name: businessInfo.business_name || businessInfo.name || invoiceData.business_name || '',
    address: businessInfo.business_address || businessInfo.address || '',
    city: businessInfo.city || '',
    state: businessInfo.state || '',
    zip: businessInfo.zip || '',
    phone: businessInfo.business_phone || businessInfo.phone || '',
    email: businessInfo.business_email || businessInfo.email || '',
    website: businessInfo.website || '',
    license_number: businessInfo.license_number || businessInfo.licenseNumber || '',
    logo_url: businessInfo.logo_url || businessInfo.logoUrl || '',
    tagline: businessInfo.tagline || '',
  };

  const client = {
    name: invoiceData.client_name || invoiceData.clientName || 'Client',
    contact_person: invoiceData.client_contact_person || invoiceData.clientContactPerson || '',
    address: invoiceData.client_address || invoiceData.clientAddress || '',
    city: invoiceData.client_city || invoiceData.clientCity || '',
    state: invoiceData.client_state || invoiceData.clientState || '',
    zip: invoiceData.client_zip || invoiceData.clientZip || '',
    email: invoiceData.client_email || invoiceData.clientEmail || '',
    phone: invoiceData.client_phone || invoiceData.clientPhone || '',
  };

  // Items
  const items = (Array.isArray(invoiceData.items) ? invoiceData.items : []).map(normalizeItem);

  // Money
  const subtotal = Number(invoiceData.subtotal) || items.reduce((s, i) => s + Number(i.amount || 0), 0);
  const taxRate = Number(invoiceData.tax_rate ?? invoiceData.taxRate) || 0;
  const taxAmount = Number(invoiceData.tax_amount ?? invoiceData.taxAmount) || 0;
  const discountAmount = Number(invoiceData.discount_amount ?? invoiceData.discountAmount) || 0;
  const total = Number(invoiceData.total) || (subtotal - discountAmount + taxAmount);
  const amountPaid = Number(invoiceData.amount_paid ?? invoiceData.amountPaid) || 0;
  const amountDue = Number(invoiceData.amount_due ?? invoiceData.amountDue) || (total - amountPaid);

  // Customization knobs
  const accentColor = (options.accentColor || options.accent_color
    || businessInfo.accentColor || businessInfo.accent_color
    || invoiceData.accent_color || '#2563EB').toString();
  const fontStyle = options.fontStyle || businessInfo.fontStyle || invoiceData.font_style || 'modern';
  const status = invoiceData.status || null;

  // Copy
  const projectName = invoiceData.project_name || invoiceData.projectName || '';
  const notes = invoiceData.notes || '';
  // Pull payment terms from invoiceData first (per-doc override), then fall
  // back to the user's saved invoice_template.payment_terms (set in
  // settings). Without this fallback, a user's saved "Net 30" was being
  // dropped on every invoice because invoiceData rarely carries it.
  const terms = invoiceData.terms
    || invoiceData.payment_terms
    || invoiceData.paymentTerms
    || businessInfo.payment_terms
    || businessInfo.paymentTerms
    || '';
  const footerText = businessInfo.footer_text || businessInfo.footerText
    || invoiceData.footer_text || (isEstimate
      ? 'This estimate is valid for 30 days unless otherwise noted.'
      : 'Thank you for your business.');

  return {
    isEstimate,
    docTypeLabel: isEstimate ? 'Estimate' : 'Invoice',
    number,
    issuedAt, dueAt, validUntil,
    status,
    business, client, projectName,
    items,
    subtotal, taxRate, taxAmount, discountAmount, total, amountPaid, amountDue,
    notes, terms, footerText,
    accentColor, fontStyle,
    fontFamily: fontFamily(fontStyle),
  };
}

// Hex → rgba helper used by templates that derive tint variants
export function hexToRgba(hex, a) {
  const h = String(hex || '#2563EB').replace('#', '').padStart(6, '0').slice(0, 6);
  const r = parseInt(h.slice(0, 2), 16) || 0;
  const g = parseInt(h.slice(2, 4), 16) || 0;
  const b = parseInt(h.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
