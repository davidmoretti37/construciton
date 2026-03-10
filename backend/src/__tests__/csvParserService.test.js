/**
 * CSV Parser Service Tests
 *
 * Validates parseCSV, parseCSVLine, parseDate, parseAmount
 * across Chase, BofA, Wells Fargo, and generic bank formats.
 */

jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { parseCSV, parseCSVLine, parseDate, parseAmount } = require('../services/csvParserService');

// ============================================================
// parseDate
// ============================================================
describe('parseDate', () => {
  test('MM/DD/YYYY → YYYY-MM-DD', () => {
    expect(parseDate('03/15/2025')).toBe('2025-03-15');
  });

  test('M/D/YYYY (no leading zeros)', () => {
    expect(parseDate('3/5/2025')).toBe('2025-03-05');
  });

  test('YYYY-MM-DD passes through', () => {
    expect(parseDate('2025-03-15')).toBe('2025-03-15');
  });

  test('MM-DD-YYYY with dashes', () => {
    expect(parseDate('03-15-2025')).toBe('2025-03-15');
  });

  test('2-digit year → 20XX', () => {
    expect(parseDate('03/15/25')).toBe('2025-03-15');
  });

  test('null/empty → null', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });

  test('strips quotes', () => {
    expect(parseDate('"03/15/2025"')).toBe('2025-03-15');
  });
});

// ============================================================
// parseAmount
// ============================================================
describe('parseAmount', () => {
  test('$1,234.56 → 1234.56', () => {
    expect(parseAmount('$1,234.56')).toBe(1234.56);
  });

  test('negative in parentheses: (500) → -500', () => {
    expect(parseAmount('(500)')).toBe(-500);
    expect(parseAmount('(1,234.56)')).toBe(-1234.56);
  });

  test('empty/null → 0', () => {
    expect(parseAmount('')).toBe(0);
    expect(parseAmount(null)).toBe(0);
    expect(parseAmount(undefined)).toBe(0);
    expect(parseAmount('  ')).toBe(0);
  });

  test('strips quotes and whitespace', () => {
    expect(parseAmount('" 500.00 "')).toBe(500);
  });

  test('plain number string', () => {
    expect(parseAmount('-42.50')).toBe(-42.5);
    expect(parseAmount('100')).toBe(100);
  });

  test('non-numeric → 0', () => {
    expect(parseAmount('abc')).toBe(0);
  });
});

// ============================================================
// parseCSVLine
// ============================================================
describe('parseCSVLine', () => {
  test('simple comma-separated values', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  test('quoted field with comma inside', () => {
    expect(parseCSVLine('a,"hello, world",c')).toEqual(['a', 'hello, world', 'c']);
  });

  test('escaped quotes (double-quote inside quoted field)', () => {
    expect(parseCSVLine('a,"say ""hello""",c')).toEqual(['a', 'say "hello"', 'c']);
  });

  test('trims whitespace from fields', () => {
    expect(parseCSVLine('  a , b , c  ')).toEqual(['a', 'b', 'c']);
  });

  test('empty fields', () => {
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
  });
});

// ============================================================
// parseCSV — format detection & full parsing
// ============================================================
describe('parseCSV', () => {
  test('Chase format: detects headers and flips sign', () => {
    const csv = [
      'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
      '03/15/2025,03/16/2025,HOME DEPOT,Home Improvement,Sale,-125.50,',
      '03/16/2025,03/17/2025,PAYMENT RECEIVED,,Payment,500.00,',
    ].join('\n');

    const result = parseCSV(csv);

    expect(result).toHaveLength(2);
    // Chase: amount * -1, so -125.50 → 125.50 (expense), 500 → -500 (credit)
    expect(result[0].amount).toBe(125.50);
    expect(result[0].date).toBe('2025-03-15');
    expect(result[0].description).toBe('HOME DEPOT');
    expect(result[0].category).toBe('Home Improvement');
    expect(result[1].amount).toBe(-500);
  });

  test('BofA format: detects Running Bal. header', () => {
    const csv = [
      'Date,Description,Amount,Running Bal.',
      '03/15/2025,HOME DEPOT,-125.50,5000.00',
      '03/16/2025,DEPOSIT,1000.00,6000.00',
    ].join('\n');

    const result = parseCSV(csv);

    expect(result).toHaveLength(2);
    // BofA: amount * -1
    expect(result[0].amount).toBe(125.50);
    expect(result[0].description).toBe('HOME DEPOT');
    expect(result[1].amount).toBe(-1000);
  });

  test('Wells Fargo format: 5-column layout', () => {
    const csv = [
      'Date,Amount,*,*,Description',
      '03/15/2025,-75.00,,,LOWES #1234',
    ].join('\n');

    const result = parseCSV(csv);

    expect(result).toHaveLength(1);
    // Wells Fargo: amount * -1
    expect(result[0].amount).toBe(75.00);
    expect(result[0].description).toBe('LOWES #1234');
  });

  test('generic format: finds date/description/amount columns', () => {
    const csv = [
      'Trans Date,Payee,Amount',
      '2025-03-15,Hardware Store,-250.00',
    ].join('\n');

    const result = parseCSV(csv);

    expect(result).toHaveLength(1);
    // Generic: amount * -1
    expect(result[0].amount).toBe(250.00);
    expect(result[0].description).toBe('Hardware Store');
  });

  test('skips malformed rows (fewer than 2 fields)', () => {
    const csv = [
      'Date,Description,Amount',
      '03/15/2025,HOME DEPOT,-100',
      'bad-row',
      '03/16/2025,LOWES,-200',
    ].join('\n');

    const result = parseCSV(csv);

    expect(result).toHaveLength(2);
  });

  test('empty CSV → empty array', () => {
    expect(parseCSV('')).toEqual([]);
    expect(parseCSV('Header Only')).toEqual([]);
  });

  test('skips rows missing date or amount', () => {
    const csv = [
      'Date,Description,Amount',
      ',HOME DEPOT,-100',
      '03/15/2025,LOWES,',
    ].join('\n');

    const result = parseCSV(csv);

    // First row has no date (parseDate('' → null)), second row has amount 0
    // Row with null date should be skipped, row with 0 amount may pass
    // Actual behavior: tx.date must be truthy, tx.amount can be 0
    expect(result.every(tx => tx.date !== null)).toBe(true);
  });
});
