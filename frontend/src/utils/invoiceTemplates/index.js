// Template registry + dispatcher.
// Public surface used by pdfGenerator.js and the InvoiceTemplateScreen
// picker. Validates the style id, normalizes the upstream data shape,
// and routes to the right visual generator.

import { normalize } from './helpers';
import { generateModernHTML } from './modern';
import { generatePremiumHTML } from './premium';
import { generateCreativeHTML } from './creative';

// Display metadata for the 3-card picker UI.
// Keep `id` matching the DB `invoice_template.template_style` CHECK constraint.
export const TEMPLATE_STYLES = [
  {
    id: 'modern',
    name: 'Modern',
    tagline: 'Bold, structured, SaaS-grade.',
    description:
      'Big confident headers, a strong rule under the document title, and a tight items table. The classic professional look — Stripe-style.',
    swatchAccent: '#0F172A',
  },
  {
    id: 'premium',
    name: 'Premium',
    tagline: 'Refined, editorial, serif.',
    description:
      'Georgia serif body, soft cream paper, bronze accents. Reads more like stationery than a SaaS export. Use for high-touch clients.',
    swatchAccent: '#8B7355',
  },
  {
    id: 'creative',
    name: 'Creative',
    tagline: 'Modern, card-based, vibrant.',
    description:
      'Big display name, accent-bordered white cards on a soft gradient. Energy and color — for businesses that want to feel young and fresh.',
    swatchAccent: '#6366F1',
  },
];

const GENERATORS = {
  modern: generateModernHTML,
  premium: generatePremiumHTML,
  creative: generateCreativeHTML,
};

const DEFAULT_STYLE = 'modern';

export function isValidStyle(style) {
  return Object.prototype.hasOwnProperty.call(GENERATORS, style);
}

/**
 * Render a document (invoice or estimate) using the chosen template.
 *
 * @param {string} style                  - 'modern' | 'premium' | 'creative'
 * @param {object} invoiceData            - upstream invoice/estimate row
 * @param {object} businessInfo           - business info + template settings
 * @param {object} options                - { isEstimate, accentColor, fontStyle }
 * @returns {string}                       - complete HTML string
 */
export function generateHTML(style, invoiceData, businessInfo = {}, options = {}) {
  const safeStyle = isValidStyle(style) ? style : DEFAULT_STYLE;
  const normalized = normalize(invoiceData, businessInfo, options);
  const gen = GENERATORS[safeStyle];
  return gen(normalized);
}

/**
 * Build a representative sample document for use in the template
 * picker preview. Same business info / no real client data — just a
 * believable rendering so the user can see what each style looks like.
 */
export function buildSampleData({ business = {}, isEstimate = false } = {}) {
  const today = new Date().toISOString();
  const due = new Date(Date.now() + 30 * 86400000).toISOString();
  return {
    invoiceData: {
      type: isEstimate ? 'estimate' : 'invoice',
      [isEstimate ? 'estimate_number' : 'invoice_number']:
        isEstimate ? 'EST-2026-0042' : 'INV-2026-0042',
      issued_at: today,
      [isEstimate ? 'valid_until' : 'due_date']: due,
      client_name: 'Karen Chen',
      client_address: '8 Carroll Street',
      client_city: 'Brooklyn',
      client_state: 'NY',
      client_zip: '11231',
      client_email: 'karen.chen@example.com',
      project_name: 'Master Bathroom Renovation',
      items: [
        { description: 'Pipe installation and soldering', secondary: '3/4" copper supply lines',
          qty: 1, rate: 850, amount: 850 },
        { description: 'Fixture installation', secondary: 'Sink, faucet, and drain assembly',
          qty: 1, rate: 620, amount: 620 },
        { description: 'Tile work and waterproofing', secondary: 'Bathroom floor and walls',
          qty: 1, rate: 1200, amount: 1200 },
        { description: 'Labor', secondary: 'Installation and finishing',
          qty: 16, rate: 75, amount: 1200 },
        { description: 'Materials and supplies', secondary: 'Fixtures, fittings, sealant',
          qty: 1, rate: 450, amount: 450 },
        { description: 'Permit and inspection fees', secondary: 'City of Denver',
          qty: 1, rate: 150, amount: 150 },
      ],
      subtotal: 4470,
      tax_rate: 0.085,
      tax_amount: 379.95,
      total: 4849.95,
      notes: 'Final walk-through to be scheduled within 5 business days of substantial completion.',
      terms: 'Net 30. Payments via ACH (preferred), check, or card. 1.5%/mo on past-due balances.',
    },
    businessInfo: {
      business_name: business.name || business.business_name || 'Precision Plumbing',
      business_address: business.address || business.business_address || '123 Main Street',
      city: business.city || 'Denver',
      state: business.state || 'CO',
      zip: business.zip || '80202',
      business_phone: business.phone || business.business_phone || '(303) 555-0123',
      business_email: business.email || business.business_email || 'contact@precisionplumbing.com',
      website: business.website || '',
      license_number: business.license_number || 'PL-2024-8842',
      logo_url: business.logo_url || '',
      tagline: business.tagline || 'Est. 2015',
    },
  };
}

export default { generateHTML, buildSampleData, TEMPLATE_STYLES, isValidStyle };
