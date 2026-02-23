/**
 * CSV Parser Service
 * Parses bank statement CSV files from common formats.
 * Supports Chase, Bank of America, Wells Fargo, and generic formats.
 */

const logger = require('../utils/logger');

/**
 * Parse a CSV bank statement string into normalized transactions.
 *
 * @param {string} csvContent - Raw CSV string
 * @returns {Array<{ date: string, description: string, amount: number, merchant_name: string|null, category: string|null }>}
 */
function parseCSV(csvContent) {
  const lines = csvContent.trim().split('\n').map(line => line.trim()).filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine).map(h => h.toLowerCase().trim());

  // Detect format
  const format = detectFormat(headers);
  logger.info(`CSV format detected: ${format}`);

  const transactions = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < 2) continue;

    try {
      const tx = parseRow(format, headers, values);
      if (tx && tx.date && tx.amount !== null && tx.amount !== undefined) {
        transactions.push(tx);
      }
    } catch (err) {
      logger.warn(`Skipping CSV row ${i + 1}: ${err.message}`);
    }
  }

  logger.info(`Parsed ${transactions.length} transactions from CSV`);
  return transactions;
}

/**
 * Detect CSV format from headers.
 */
function detectFormat(headers) {
  const joined = headers.join(',');

  // Chase: Transaction Date,Post Date,Description,Category,Type,Amount,Memo
  if (joined.includes('transaction date') && joined.includes('post date') && joined.includes('category')) {
    return 'chase';
  }

  // Bank of America: Date,Description,Amount,Running Bal.
  if (joined.includes('running bal')) {
    return 'bofa';
  }

  // Wells Fargo: often no header or "Date","Amount","*","*","Description"
  if (headers.length === 5 && headers[0] === 'date' && headers[1] === 'amount') {
    return 'wellsfargo';
  }

  // Generic: look for common column names
  return 'generic';
}

/**
 * Parse a single row based on detected format.
 */
function parseRow(format, headers, values) {
  switch (format) {
    case 'chase':
      return parseChaseRow(headers, values);
    case 'bofa':
      return parseBofARow(headers, values);
    case 'wellsfargo':
      return parseWellsFargoRow(headers, values);
    default:
      return parseGenericRow(headers, values);
  }
}

function parseChaseRow(headers, values) {
  const dateIdx = headers.indexOf('transaction date');
  const descIdx = headers.indexOf('description');
  const amountIdx = headers.indexOf('amount');
  const categoryIdx = headers.indexOf('category');

  if (dateIdx === -1 || amountIdx === -1) return null;

  const amount = parseAmount(values[amountIdx]);
  // Chase: negative = purchase/debit, positive = credit/payment
  // We want positive = expense (debit), negative = credit
  const normalizedAmount = amount * -1;

  return {
    date: parseDate(values[dateIdx]),
    description: values[descIdx] || 'Unknown',
    amount: normalizedAmount,
    merchant_name: values[descIdx] || null,
    category: categoryIdx >= 0 ? values[categoryIdx] : null,
  };
}

function parseBofARow(headers, values) {
  const dateIdx = headers.indexOf('date');
  const descIdx = headers.indexOf('description');
  const amountIdx = headers.indexOf('amount');

  if (dateIdx === -1 || amountIdx === -1) return null;

  const amount = parseAmount(values[amountIdx]);
  // BofA: negative = debit, positive = credit
  const normalizedAmount = amount * -1;

  return {
    date: parseDate(values[dateIdx]),
    description: values[descIdx >= 0 ? descIdx : 1] || 'Unknown',
    amount: normalizedAmount,
    merchant_name: null,
    category: null,
  };
}

function parseWellsFargoRow(headers, values) {
  const amount = parseAmount(values[1]);
  // Wells Fargo: negative = debit, positive = credit
  const normalizedAmount = amount * -1;

  return {
    date: parseDate(values[0]),
    description: values[4] || values[2] || 'Unknown',
    amount: normalizedAmount,
    merchant_name: null,
    category: null,
  };
}

function parseGenericRow(headers, values) {
  // Find date column
  const dateIdx = findColumnIndex(headers, ['date', 'transaction date', 'trans date', 'posted date', 'post date']);
  // Find description column
  const descIdx = findColumnIndex(headers, ['description', 'payee', 'merchant', 'name', 'memo', 'details']);
  // Find amount column(s)
  const amountIdx = findColumnIndex(headers, ['amount', 'total']);
  const debitIdx = findColumnIndex(headers, ['debit', 'withdrawal', 'charge']);
  const creditIdx = findColumnIndex(headers, ['credit', 'deposit', 'payment']);

  if (dateIdx === -1) return null;

  let amount;
  if (amountIdx >= 0) {
    amount = parseAmount(values[amountIdx]);
    // Assume negative = expense, positive = income (standard banking)
    // Normalize: positive = expense (debit)
    amount = amount * -1;
  } else if (debitIdx >= 0) {
    const debit = parseAmount(values[debitIdx]);
    const credit = creditIdx >= 0 ? parseAmount(values[creditIdx]) : 0;
    amount = debit > 0 ? debit : -credit;
  } else {
    return null;
  }

  return {
    date: parseDate(values[dateIdx]),
    description: descIdx >= 0 ? values[descIdx] : 'Unknown',
    amount,
    merchant_name: null,
    category: null,
  };
}

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Parse a CSV line handling quoted fields with commas.
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

/**
 * Parse a date string into YYYY-MM-DD format.
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  const cleaned = dateStr.replace(/['"]/g, '').trim();

  // Try MM/DD/YYYY or M/D/YYYY
  const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, '0');
    const day = slashMatch[2].padStart(2, '0');
    let year = slashMatch[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }

  // Try YYYY-MM-DD (already correct format)
  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // Try MM-DD-YYYY
  const dashMatch = cleaned.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    return `${dashMatch[3]}-${dashMatch[1].padStart(2, '0')}-${dashMatch[2].padStart(2, '0')}`;
  }

  // Fallback: try native Date parsing
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Parse an amount string into a number.
 */
function parseAmount(amountStr) {
  if (!amountStr || amountStr.trim() === '') return 0;

  const cleaned = amountStr
    .replace(/['"$\s]/g, '')
    .replace(/,/g, '')
    .replace(/\((.+)\)/, '-$1'); // Handle (123.45) = -123.45

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Find the index of a column by checking multiple possible names.
 */
function findColumnIndex(headers, possibleNames) {
  for (const name of possibleNames) {
    const idx = headers.indexOf(name);
    if (idx >= 0) return idx;
  }
  // Partial match
  for (const name of possibleNames) {
    const idx = headers.findIndex(h => h.includes(name));
    if (idx >= 0) return idx;
  }
  return -1;
}

module.exports = { parseCSV, parseCSVLine, parseDate, parseAmount };
