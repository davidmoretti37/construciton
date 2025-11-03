/**
 * Format estimate data into a text message suitable for SMS/WhatsApp
 * @param {object} estimateData - Estimate data object
 * @param {object} businessInfo - Business information from user profile
 * @returns {string} Formatted estimate text
 */
export const formatEstimate = (estimateData, businessInfo = {}) => {
  const {
    client = 'Valued Customer',
    projectName = 'Construction Project',
    items = [],
    notes = '',
    validDays = 30,
  } = estimateData;

  const { name: businessName = 'Your Business', phone = '', email = '' } = businessInfo;

  // Header
  let estimate = `📋 ESTIMATE - ${businessName}\n\n`;

  // Client and project info
  estimate += `Client: ${client}\n`;
  if (projectName) {
    estimate += `Project: ${projectName}\n`;
  }
  estimate += `Date: ${new Date().toLocaleDateString()}\n`;

  // Separator
  const separator = '─'.repeat(30);
  estimate += `${separator}\n\n`;

  // Line items
  if (items.length > 0) {
    estimate += 'SERVICES:\n';

    let subtotal = 0;

    items.forEach((item, index) => {
      const itemTotal = item.quantity * item.price;
      subtotal += itemTotal;

      estimate += `${index + 1}. ${item.description}\n`;

      if (item.quantity !== 1 || item.unit) {
        estimate += `   ${item.quantity} ${item.unit || 'unit'}${
          item.quantity > 1 ? 's' : ''
        } × $${item.price.toFixed(2)} = $${itemTotal.toFixed(2)}\n`;
      } else {
        estimate += `   $${itemTotal.toFixed(2)}\n`;
      }
    });

    // Total
    estimate += `\n${separator}\n`;
    estimate += `TOTAL: $${subtotal.toFixed(2)}\n`;
    estimate += `${separator}\n\n`;
  }

  // Notes
  if (notes) {
    estimate += `Notes: ${notes}\n\n`;
  }

  // Contact info
  if (phone || email) {
    estimate += 'Contact:\n';
    if (phone) estimate += `📞 ${phone}\n`;
    if (email) estimate += `📧 ${email}\n`;
    estimate += '\n';
  }

  // Footer
  estimate += `Valid for ${validDays} days\n`;
  estimate += `Reply to accept or request changes.`;

  return estimate;
};

/**
 * Format simple estimate (quick estimate without full details)
 * @param {string} client - Client name
 * @param {number} total - Total amount
 * @param {string} description - Brief description
 * @param {object} businessInfo - Business information
 * @returns {string} Formatted estimate text
 */
export const formatSimpleEstimate = (client, total, description, businessInfo = {}) => {
  const { name: businessName = 'Your Business', phone = '' } = businessInfo;

  let estimate = `📋 ESTIMATE - ${businessName}\n\n`;
  estimate += `Client: ${client}\n`;
  estimate += `Date: ${new Date().toLocaleDateString()}\n\n`;
  estimate += `${description}\n\n`;
  estimate += `TOTAL: $${total.toFixed(2)}\n\n`;

  if (phone) {
    estimate += `Contact: ${phone}\n`;
  }

  estimate += `\nReply to accept!`;

  return estimate;
};

/**
 * Preview estimate formatting (returns object with formatted sections)
 * @param {object} estimateData - Estimate data object
 * @param {object} businessInfo - Business information
 * @returns {object} Formatted sections
 */
export const getEstimatePreview = (estimateData, businessInfo = {}) => {
  const {
    client = 'Valued Customer',
    projectName = '',
    items = [],
  } = estimateData;

  let subtotal = 0;
  const formattedItems = items.map((item, index) => {
    const itemTotal = item.quantity * item.price;
    subtotal += itemTotal;

    return {
      index: index + 1,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      price: item.price,
      total: itemTotal,
    };
  });

  return {
    client,
    projectName,
    date: new Date().toLocaleDateString(),
    items: formattedItems,
    subtotal,
    total: subtotal,
    businessName: businessInfo.name || 'Your Business',
  };
};

/**
 * Calculate estimate totals
 * @param {Array} items - Array of line items
 * @returns {object} Totals object { subtotal, tax, total }
 */
export const calculateEstimateTotals = (items, taxRate = 0) => {
  const subtotal = items.reduce((sum, item) => {
    return sum + item.quantity * item.price;
  }, 0);

  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  return {
    subtotal,
    tax,
    total,
  };
};

/**
 * Validate estimate data
 * @param {object} estimateData - Estimate data to validate
 * @returns {object} { valid: boolean, errors: string[] }
 */
export const validateEstimate = (estimateData) => {
  const errors = [];

  if (!estimateData.client || estimateData.client.trim() === '') {
    errors.push('Client name is required');
  }

  if (!estimateData.items || estimateData.items.length === 0) {
    errors.push('At least one line item is required');
  }

  if (estimateData.items) {
    estimateData.items.forEach((item, index) => {
      if (!item.description || item.description.trim() === '') {
        errors.push(`Item ${index + 1}: Description is required`);
      }
      if (!item.quantity || item.quantity <= 0) {
        errors.push(`Item ${index + 1}: Quantity must be greater than 0`);
      }
      if (!item.price || item.price < 0) {
        errors.push(`Item ${index + 1}: Price must be 0 or greater`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
