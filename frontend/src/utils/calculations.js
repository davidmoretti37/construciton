/**
 * Financial Calculation Utilities
 * Pure functions for invoice, payment, and estimate calculations
 */

/**
 * Calculate invoice amount due
 * @param {Object} invoice - Invoice data
 * @returns {number} Amount due
 */
export const calculateAmountDue = (invoice) => {
  const { amountDue, total = 0, amountPaid = 0 } = invoice || {};
  return amountDue !== undefined ? amountDue : (total - amountPaid);
};

/**
 * Calculate invoice balance
 * @param {number} total - Total invoice amount
 * @param {number} amountPaid - Amount already paid
 * @returns {number} Remaining balance
 */
export const calculateBalance = (total, amountPaid) => {
  return Math.max(0, (total || 0) - (amountPaid || 0));
};

/**
 * Calculate line item total
 * @param {number} quantity - Item quantity
 * @param {number} price - Unit price
 * @returns {number} Line item total
 */
export const calculateLineItemTotal = (quantity, price) => {
  return (quantity || 0) * (price || 0);
};

/**
 * Calculate invoice subtotal from line items
 * @param {Array} items - Array of line items with quantity and price
 * @returns {number} Subtotal
 */
export const calculateSubtotal = (items) => {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const itemTotal = item.total ?? calculateLineItemTotal(item.quantity, item.price);
    return sum + (itemTotal || 0);
  }, 0);
};

/**
 * Calculate tax amount
 * @param {number} subtotal - Subtotal amount
 * @param {number} taxRate - Tax rate as percentage (e.g., 8.5 for 8.5%)
 * @returns {number} Tax amount
 */
export const calculateTax = (subtotal, taxRate) => {
  if (!subtotal || !taxRate) return 0;
  return (subtotal * taxRate) / 100;
};

/**
 * Calculate invoice total with tax
 * @param {number} subtotal - Subtotal amount
 * @param {number} taxRate - Tax rate as percentage
 * @returns {number} Total with tax
 */
export const calculateTotalWithTax = (subtotal, taxRate) => {
  const tax = calculateTax(subtotal, taxRate);
  return (subtotal || 0) + tax;
};

/**
 * Calculate partial payment amount
 * @param {number} contractTotal - Total contract value
 * @param {number} percentage - Payment percentage
 * @returns {number} Payment amount
 */
export const calculatePartialPayment = (contractTotal, percentage) => {
  if (!contractTotal || !percentage) return 0;
  return (contractTotal * percentage) / 100;
};

/**
 * Calculate remaining balance after partial payments
 * @param {number} contractTotal - Total contract value
 * @param {number} previousPayments - Sum of previous payments
 * @param {number} currentPayment - Current payment amount
 * @returns {number} Remaining balance
 */
export const calculateRemainingBalance = (contractTotal, previousPayments = 0, currentPayment = 0) => {
  return Math.max(0, (contractTotal || 0) - (previousPayments || 0) - (currentPayment || 0));
};

/**
 * Calculate worker payment based on payment type
 * @param {number} hours - Hours worked
 * @param {number} rate - Payment rate
 * @param {string} paymentType - 'hourly', 'daily', 'weekly', 'project'
 * @param {number} days - Days worked (for daily rate)
 * @returns {number} Total payment
 */
export const calculateWorkerPayment = (hours, rate, paymentType, days = 0) => {
  if (!rate) return 0;

  switch (paymentType) {
    case 'hourly':
      return (hours || 0) * rate;
    case 'daily':
      return (days || 0) * rate;
    case 'weekly':
      // Assume 5-day work week
      return Math.ceil((days || 0) / 5) * rate;
    case 'project':
      return rate; // Fixed project rate
    default:
      return (hours || 0) * rate; // Default to hourly
  }
};

/**
 * Calculate overtime pay
 * @param {number} totalHours - Total hours worked
 * @param {number} regularHoursLimit - Regular hours limit (default 40)
 * @param {number} hourlyRate - Regular hourly rate
 * @param {number} overtimeMultiplier - Overtime multiplier (default 1.5)
 * @returns {Object} { regularPay, overtimePay, totalPay, overtimeHours }
 */
export const calculateOvertimePay = (
  totalHours,
  hourlyRate,
  regularHoursLimit = 40,
  overtimeMultiplier = 1.5
) => {
  const regularHours = Math.min(totalHours || 0, regularHoursLimit);
  const overtimeHours = Math.max(0, (totalHours || 0) - regularHoursLimit);

  const regularPay = regularHours * (hourlyRate || 0);
  const overtimePay = overtimeHours * (hourlyRate || 0) * overtimeMultiplier;
  const totalPay = regularPay + overtimePay;

  return {
    regularHours,
    overtimeHours,
    regularPay,
    overtimePay,
    totalPay,
  };
};

/**
 * Get the locale string for Intl formatting based on the current app language.
 * @returns {string} Locale code (e.g. 'en-US', 'es', 'pt-BR')
 */
export const getAppLocale = () => {
  try {
    const i18n = require('../i18n').default;
    const lang = i18n.language || 'en';
    if (lang === 'pt-BR') return 'pt-BR';
    if (lang.startsWith('es')) return 'es';
    return 'en-US';
  } catch {
    return 'en-US';
  }
};

/**
 * Get the currency code from i18n settings (USD, BRL, etc.)
 * @returns {string} Currency code
 */
const getAppCurrency = () => {
  try {
    const i18n = require('../i18n').default;
    return i18n.t('currency.code', { ns: 'common', defaultValue: 'USD' });
  } catch {
    return 'USD';
  }
};

/**
 * Format currency for display — locale and currency-aware.
 * Uses the app's current language to determine locale and currency.
 * @param {number} amount - Amount to format
 * @param {string} [currency] - Currency code override (defaults to i18n currency)
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (amount, currency) => {
  const currencyCode = currency || getAppCurrency();
  const locale = getAppLocale();
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount || 0);
};

/**
 * Round to 2 decimal places (for currency)
 * @param {number} value - Value to round
 * @returns {number} Rounded value
 */
export const roundCurrency = (value) => {
  return Math.round((value || 0) * 100) / 100;
};

/**
 * Format decimal hours to hours and minutes (e.g., 8.5 -> "8h 30m")
 * @param {number} decimalHours - Hours as decimal (e.g., 8.5)
 * @param {Object} options - Formatting options
 * @param {boolean} options.short - Use short format without spaces (e.g., "8h30m")
 * @param {boolean} options.showZeroMinutes - Show "0m" when minutes are zero
 * @returns {string} Formatted time string
 */
export const formatHoursMinutes = (decimalHours, options = {}) => {
  const { short = false, showZeroMinutes = false } = options;

  if (decimalHours === null || decimalHours === undefined || isNaN(decimalHours)) {
    return '--';
  }

  const totalMinutes = Math.round(decimalHours * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0 && minutes === 0) {
    return '0m';
  }

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0 && !showZeroMinutes) {
    return `${hours}h`;
  }

  return short ? `${hours}h${minutes}m` : `${hours}h ${minutes}m`;
};

/**
 * Get the current local date string (YYYY-MM-DD) in user's timezone
 * Use this when storing dates that should reflect the user's local date
 * @returns {string} Local date string (YYYY-MM-DD)
 */
export const getLocalDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get local ISO timestamp that preserves local time when stored
 * This ensures the stored time reflects what the user sees on their clock
 * @returns {string} ISO-like timestamp with local time
 */
export const getLocalTimestamp = () => {
  // Use ISO string which includes UTC timezone (Z suffix)
  // This ensures consistent storage and retrieval
  return new Date().toISOString();
};

/**
 * Get start and end of "today" in local timezone for database queries
 * Returns proper UTC ISO strings so database queries match the user's local day
 * @returns {Object} { startOfDay: string, endOfDay: string }
 */
export const getLocalDayBounds = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed for Date constructor
  const day = now.getDate();

  // Create Date objects for local midnight and end of day
  // These will be converted to UTC when calling toISOString()
  const startOfDay = new Date(year, month, day, 0, 0, 0, 0);
  const endOfDay = new Date(year, month, day, 23, 59, 59, 999);

  return {
    startOfDay: startOfDay.toISOString(),
    endOfDay: endOfDay.toISOString(),
  };
};

/**
 * Get UTC bounds for a date range (for database queries)
 * Converts YYYY-MM-DD date strings to proper UTC ISO strings
 * @param {string} fromDate - Start date in YYYY-MM-DD format
 * @param {string} toDate - End date in YYYY-MM-DD format
 * @returns {Object} { startOfRange: string, endOfRange: string }
 */
export const getDateRangeBoundsUTC = (fromDate, toDate) => {
  // Parse the date strings
  const [fromYear, fromMonth, fromDay] = fromDate.split('-').map(Number);
  const [toYear, toMonth, toDay] = toDate.split('-').map(Number);

  // Create Date objects for local start and end of range
  // Month is 0-indexed in Date constructor
  const startOfRange = new Date(fromYear, fromMonth - 1, fromDay, 0, 0, 0, 0);
  const endOfRange = new Date(toYear, toMonth - 1, toDay, 23, 59, 59, 999);

  return {
    startOfRange: startOfRange.toISOString(),
    endOfRange: endOfRange.toISOString(),
  };
};

/**
 * Convert a date to local date string (YYYY-MM-DD)
 * @param {Date|string} date - Date to convert
 * @returns {string} Local date string (YYYY-MM-DD)
 */
export const toLocalDateString = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
