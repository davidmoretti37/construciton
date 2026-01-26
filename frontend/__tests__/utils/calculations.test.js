/**
 * Financial Calculation Tests
 * Tests for invoice, payment, and estimate calculations
 */

import {
  calculateAmountDue,
  calculateBalance,
  calculateLineItemTotal,
  calculateSubtotal,
  calculateTax,
  calculateTotalWithTax,
  calculatePartialPayment,
  calculateRemainingBalance,
  calculateWorkerPayment,
  calculateOvertimePay,
  formatCurrency,
  roundCurrency,
} from '../../src/utils/calculations';

describe('Invoice Calculations', () => {
  describe('calculateAmountDue', () => {
    it('should return amountDue if explicitly set', () => {
      const invoice = { amountDue: 500, total: 1000, amountPaid: 200 };
      expect(calculateAmountDue(invoice)).toBe(500);
    });

    it('should calculate from total - amountPaid if amountDue not set', () => {
      const invoice = { total: 1000, amountPaid: 300 };
      expect(calculateAmountDue(invoice)).toBe(700);
    });

    it('should return total if no payments made', () => {
      const invoice = { total: 1000 };
      expect(calculateAmountDue(invoice)).toBe(1000);
    });

    it('should handle null/undefined invoice', () => {
      expect(calculateAmountDue(null)).toBe(0);
      expect(calculateAmountDue(undefined)).toBe(0);
    });

    it('should handle amountDue of 0 correctly', () => {
      const invoice = { amountDue: 0, total: 1000 };
      expect(calculateAmountDue(invoice)).toBe(0);
    });
  });

  describe('calculateBalance', () => {
    it('should calculate remaining balance', () => {
      expect(calculateBalance(1000, 300)).toBe(700);
    });

    it('should return 0 if overpaid', () => {
      expect(calculateBalance(1000, 1500)).toBe(0);
    });

    it('should handle null values', () => {
      expect(calculateBalance(null, null)).toBe(0);
      expect(calculateBalance(1000, null)).toBe(1000);
      expect(calculateBalance(null, 500)).toBe(0);
    });
  });

  describe('calculateLineItemTotal', () => {
    it('should multiply quantity by price', () => {
      expect(calculateLineItemTotal(5, 100)).toBe(500);
    });

    it('should handle decimal quantities', () => {
      expect(calculateLineItemTotal(2.5, 100)).toBe(250);
    });

    it('should handle decimal prices', () => {
      expect(calculateLineItemTotal(3, 99.99)).toBeCloseTo(299.97);
    });

    it('should return 0 for null/undefined values', () => {
      expect(calculateLineItemTotal(null, 100)).toBe(0);
      expect(calculateLineItemTotal(5, null)).toBe(0);
      expect(calculateLineItemTotal(null, null)).toBe(0);
    });
  });

  describe('calculateSubtotal', () => {
    it('should sum all line item totals', () => {
      const items = [
        { quantity: 2, price: 100, total: 200 },
        { quantity: 3, price: 50, total: 150 },
      ];
      expect(calculateSubtotal(items)).toBe(350);
    });

    it('should calculate totals if not provided', () => {
      const items = [
        { quantity: 2, price: 100 },
        { quantity: 3, price: 50 },
      ];
      expect(calculateSubtotal(items)).toBe(350);
    });

    it('should return 0 for empty array', () => {
      expect(calculateSubtotal([])).toBe(0);
    });

    it('should return 0 for non-array', () => {
      expect(calculateSubtotal(null)).toBe(0);
      expect(calculateSubtotal(undefined)).toBe(0);
      expect(calculateSubtotal('not an array')).toBe(0);
    });
  });

  describe('calculateTax', () => {
    it('should calculate tax at given rate', () => {
      expect(calculateTax(1000, 8.5)).toBe(85);
    });

    it('should handle 0 tax rate', () => {
      expect(calculateTax(1000, 0)).toBe(0);
    });

    it('should return 0 for null values', () => {
      expect(calculateTax(null, 8.5)).toBe(0);
      expect(calculateTax(1000, null)).toBe(0);
    });
  });

  describe('calculateTotalWithTax', () => {
    it('should add tax to subtotal', () => {
      expect(calculateTotalWithTax(1000, 10)).toBe(1100);
    });

    it('should handle 0 tax rate', () => {
      expect(calculateTotalWithTax(1000, 0)).toBe(1000);
    });
  });

  describe('calculatePartialPayment', () => {
    it('should calculate percentage of contract total', () => {
      expect(calculatePartialPayment(10000, 25)).toBe(2500);
      expect(calculatePartialPayment(10000, 50)).toBe(5000);
    });

    it('should handle decimal percentages', () => {
      expect(calculatePartialPayment(10000, 33.33)).toBeCloseTo(3333);
    });

    it('should return 0 for null values', () => {
      expect(calculatePartialPayment(null, 25)).toBe(0);
      expect(calculatePartialPayment(10000, null)).toBe(0);
    });
  });

  describe('calculateRemainingBalance', () => {
    it('should calculate remaining after payments', () => {
      expect(calculateRemainingBalance(10000, 2500, 2500)).toBe(5000);
    });

    it('should return 0 if fully paid', () => {
      expect(calculateRemainingBalance(10000, 10000, 0)).toBe(0);
    });

    it('should return 0 if overpaid', () => {
      expect(calculateRemainingBalance(10000, 8000, 5000)).toBe(0);
    });

    it('should handle missing parameters', () => {
      expect(calculateRemainingBalance(10000)).toBe(10000);
      expect(calculateRemainingBalance(10000, 5000)).toBe(5000);
    });
  });
});

describe('Worker Payment Calculations', () => {
  describe('calculateWorkerPayment', () => {
    it('should calculate hourly payment', () => {
      expect(calculateWorkerPayment(40, 25, 'hourly')).toBe(1000);
    });

    it('should calculate daily payment', () => {
      expect(calculateWorkerPayment(0, 200, 'daily', 5)).toBe(1000);
    });

    it('should calculate weekly payment', () => {
      // 7 days = 2 weeks (rounded up)
      expect(calculateWorkerPayment(0, 1000, 'weekly', 7)).toBe(2000);
    });

    it('should return fixed rate for project-based', () => {
      expect(calculateWorkerPayment(100, 5000, 'project')).toBe(5000);
    });

    it('should default to hourly if unknown type', () => {
      expect(calculateWorkerPayment(40, 25, 'unknown')).toBe(1000);
    });

    it('should return 0 if no rate', () => {
      expect(calculateWorkerPayment(40, 0, 'hourly')).toBe(0);
      expect(calculateWorkerPayment(40, null, 'hourly')).toBe(0);
    });
  });

  describe('calculateOvertimePay', () => {
    it('should calculate regular pay only under 40 hours', () => {
      const result = calculateOvertimePay(35, 20);
      expect(result.regularHours).toBe(35);
      expect(result.overtimeHours).toBe(0);
      expect(result.regularPay).toBe(700);
      expect(result.overtimePay).toBe(0);
      expect(result.totalPay).toBe(700);
    });

    it('should calculate overtime at 1.5x after 40 hours', () => {
      const result = calculateOvertimePay(50, 20);
      expect(result.regularHours).toBe(40);
      expect(result.overtimeHours).toBe(10);
      expect(result.regularPay).toBe(800);
      expect(result.overtimePay).toBe(300); // 10 * 20 * 1.5
      expect(result.totalPay).toBe(1100);
    });

    it('should use custom overtime multiplier', () => {
      const result = calculateOvertimePay(50, 20, 40, 2);
      expect(result.overtimePay).toBe(400); // 10 * 20 * 2
    });

    it('should use custom regular hours limit', () => {
      const result = calculateOvertimePay(50, 20, 45);
      expect(result.regularHours).toBe(45);
      expect(result.overtimeHours).toBe(5);
    });

    it('should handle exactly 40 hours', () => {
      const result = calculateOvertimePay(40, 20);
      expect(result.regularHours).toBe(40);
      expect(result.overtimeHours).toBe(0);
      expect(result.totalPay).toBe(800);
    });
  });
});

describe('Formatting Utilities', () => {
  describe('formatCurrency', () => {
    it('should format as USD by default', () => {
      expect(formatCurrency(1234.56)).toBe('$1,234.56');
    });

    it('should handle whole numbers', () => {
      expect(formatCurrency(1000)).toBe('$1,000.00');
    });

    it('should handle null/undefined', () => {
      expect(formatCurrency(null)).toBe('$0.00');
      expect(formatCurrency(undefined)).toBe('$0.00');
    });

    it('should handle negative amounts', () => {
      expect(formatCurrency(-500)).toBe('-$500.00');
    });
  });

  describe('roundCurrency', () => {
    it('should round to 2 decimal places', () => {
      expect(roundCurrency(10.555)).toBe(10.56);
      expect(roundCurrency(10.554)).toBe(10.55);
    });

    it('should handle whole numbers', () => {
      expect(roundCurrency(100)).toBe(100);
    });

    it('should handle null/undefined', () => {
      expect(roundCurrency(null)).toBe(0);
      expect(roundCurrency(undefined)).toBe(0);
    });
  });
});
