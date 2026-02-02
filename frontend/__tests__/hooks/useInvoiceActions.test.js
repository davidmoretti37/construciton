/**
 * useInvoiceActions Hook Tests
 * Tests for invoice action handlers including payment recording
 */

import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

// Mock dependencies
jest.mock('react-native', () => ({
  Alert: {
    alert: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/utils/storage', () => ({
  createInvoiceFromEstimate: jest.fn(),
  updateInvoice: jest.fn(),
  deleteInvoice: jest.fn(),
  recordInvoicePayment: jest.fn(),
  voidInvoice: jest.fn(),
  getInvoice: jest.fn(),
  updateInvoicePDF: jest.fn(),
  getUserProfile: jest.fn(() => Promise.resolve({ businessInfo: {} })),
}));

jest.mock('../../src/utils/pdfGenerator', () => ({
  generateInvoicePDF: jest.fn(() => Promise.resolve('file://test.pdf')),
  uploadInvoicePDF: jest.fn(() => Promise.resolve('https://example.com/test.pdf')),
  previewInvoicePDF: jest.fn(),
  shareInvoicePDF: jest.fn(),
}));

import useInvoiceActions from '../../src/hooks/actions/useInvoiceActions';
import {
  createInvoiceFromEstimate,
  updateInvoice,
  deleteInvoice,
  recordInvoicePayment,
  voidInvoice,
} from '../../src/utils/storage';
import logger from '../../src/utils/logger';

describe('useInvoiceActions', () => {
  let mockAddMessage;
  let mockSetMessages;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAddMessage = jest.fn();
    mockSetMessages = jest.fn();
  });

  const renderInvoiceActionsHook = () => {
    return renderHook(() =>
      useInvoiceActions({
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
      })
    );
  };

  // ============================================================
  // handleConvertToInvoice Tests
  // ============================================================
  describe('handleConvertToInvoice', () => {
    it('should create invoice from estimate successfully', async () => {
      const mockInvoice = {
        id: 'inv-123',
        invoice_number: 'INV-2024-001',
        total: 10000,
        amount_due: 10000,
      };
      createInvoiceFromEstimate.mockResolvedValue(mockInvoice);

      const { result } = renderInvoiceActionsHook();

      let invoice;
      await act(async () => {
        invoice = await result.current.handleConvertToInvoice({
          id: 'est-123',
        });
      });

      expect(createInvoiceFromEstimate).toHaveBeenCalledWith('est-123');
      expect(invoice).toEqual(mockInvoice);
      expect(Alert.alert).toHaveBeenCalledWith(
        'Invoice Created',
        expect.stringContaining('INV-2024-001'),
        expect.any(Array)
      );
    });

    it('should handle estimateId property', async () => {
      const mockInvoice = { id: 'inv-1', invoice_number: 'INV-001' };
      createInvoiceFromEstimate.mockResolvedValue(mockInvoice);

      const { result } = renderInvoiceActionsHook();

      await act(async () => {
        await result.current.handleConvertToInvoice({
          estimateId: 'est-456',
        });
      });

      expect(createInvoiceFromEstimate).toHaveBeenCalledWith('est-456');
    });

    it('should return null when conversion fails', async () => {
      createInvoiceFromEstimate.mockResolvedValue(null);

      const { result } = renderInvoiceActionsHook();

      let invoice;
      await act(async () => {
        invoice = await result.current.handleConvertToInvoice({
          id: 'est-123',
        });
      });

      expect(invoice).toBeNull();
    });

    it('should handle conversion error gracefully', async () => {
      const error = new Error('Database error');
      createInvoiceFromEstimate.mockRejectedValue(error);

      const { result } = renderInvoiceActionsHook();

      let invoice;
      await act(async () => {
        invoice = await result.current.handleConvertToInvoice({
          id: 'est-123',
        });
      });

      expect(logger.error).toHaveBeenCalledWith('Error converting to invoice:', error);
      expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
      expect(invoice).toBeNull();
    });
  });

  // ============================================================
  // handleRecordInvoicePayment Tests (CRITICAL - Money)
  // ============================================================
  describe('handleRecordInvoicePayment', () => {
    it('should record full payment successfully', async () => {
      const mockResult = {
        success: true,
        newBalance: 0,
        status: 'paid',
      };
      recordInvoicePayment.mockResolvedValue(mockResult);

      const { result } = renderInvoiceActionsHook();

      let paymentResult;
      await act(async () => {
        paymentResult = await result.current.handleRecordInvoicePayment({
          invoiceId: 'inv-123',
          paymentAmount: 5000,
          paymentMethod: 'check',
          clientName: 'John Doe',
        });
      });

      expect(recordInvoicePayment).toHaveBeenCalledWith(
        'inv-123',
        5000,
        'check',
        undefined
      );
      expect(paymentResult).toEqual(mockResult);
      expect(mockAddMessage).toHaveBeenCalledWith(
        expect.stringContaining('$5000')
      );
      expect(mockAddMessage).toHaveBeenCalledWith(
        expect.stringContaining('Invoice paid in full')
      );
    });

    it('should record partial payment and show remaining balance', async () => {
      const mockResult = {
        success: true,
        newBalance: 2500,
        status: 'partial',
      };
      recordInvoicePayment.mockResolvedValue(mockResult);

      const { result } = renderInvoiceActionsHook();

      let paymentResult;
      await act(async () => {
        paymentResult = await result.current.handleRecordInvoicePayment({
          invoiceId: 'inv-123',
          paymentAmount: 2500,
          paymentMethod: 'zelle',
        });
      });

      expect(recordInvoicePayment).toHaveBeenCalledWith(
        'inv-123',
        2500,
        'zelle',
        undefined
      );
      expect(paymentResult).toEqual(mockResult);
      expect(mockAddMessage).toHaveBeenCalledWith(
        expect.stringContaining('Remaining balance: $2500.00')
      );
    });

    it('should pass payment date when provided', async () => {
      recordInvoicePayment.mockResolvedValue({ success: true, newBalance: 0 });

      const { result } = renderInvoiceActionsHook();

      await act(async () => {
        await result.current.handleRecordInvoicePayment({
          invoiceId: 'inv-123',
          paymentAmount: 1000,
          paymentMethod: 'cash',
          paymentDate: '2024-01-15',
        });
      });

      expect(recordInvoicePayment).toHaveBeenCalledWith(
        'inv-123',
        1000,
        'cash',
        '2024-01-15'
      );
    });

    it('should handle payment failure', async () => {
      recordInvoicePayment.mockResolvedValue({ success: false });

      const { result } = renderInvoiceActionsHook();

      let paymentResult;
      await act(async () => {
        paymentResult = await result.current.handleRecordInvoicePayment({
          invoiceId: 'inv-123',
          paymentAmount: 5000,
        });
      });

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to record payment.');
      expect(paymentResult).toBeNull();
    });

    it('should handle payment error gracefully', async () => {
      const error = new Error('Payment processing failed');
      recordInvoicePayment.mockRejectedValue(error);

      const { result } = renderInvoiceActionsHook();

      let paymentResult;
      await act(async () => {
        paymentResult = await result.current.handleRecordInvoicePayment({
          invoiceId: 'inv-123',
          paymentAmount: 5000,
        });
      });

      expect(logger.error).toHaveBeenCalledWith('Error recording payment:', error);
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to record payment.');
      expect(paymentResult).toBeNull();
    });
  });

  // ============================================================
  // handleUpdateInvoice Tests
  // ============================================================
  describe('handleUpdateInvoice', () => {
    it('should update invoice successfully', async () => {
      updateInvoice.mockResolvedValue(true);

      const { result } = renderInvoiceActionsHook();

      let success;
      await act(async () => {
        success = await result.current.handleUpdateInvoice({
          invoiceId: 'inv-123',
          clientName: 'John Doe',
          total: 6000,
        });
      });

      expect(updateInvoice).toHaveBeenCalledWith('inv-123', { total: 6000 });
      expect(success).toBe(true);
      expect(mockAddMessage).toHaveBeenCalledWith(
        expect.stringContaining('Updated invoice')
      );
    });

    it('should handle update failure', async () => {
      updateInvoice.mockResolvedValue(false);

      const { result } = renderInvoiceActionsHook();

      let success;
      await act(async () => {
        success = await result.current.handleUpdateInvoice({
          invoiceId: 'inv-123',
          total: 6000,
        });
      });

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to update invoice.');
      expect(success).toBe(false);
    });
  });

  // ============================================================
  // handleDeleteInvoice Tests
  // ============================================================
  describe('handleDeleteInvoice', () => {
    it('should delete invoice successfully', async () => {
      deleteInvoice.mockResolvedValue(true);

      const { result } = renderInvoiceActionsHook();

      let success;
      await act(async () => {
        success = await result.current.handleDeleteInvoice({
          invoiceId: 'inv-123',
          invoiceNumber: 'INV-2024-001',
        });
      });

      expect(deleteInvoice).toHaveBeenCalledWith('inv-123');
      expect(success).toBe(true);
      expect(mockAddMessage).toHaveBeenCalledWith(
        expect.stringContaining('Deleted invoice INV-2024-001')
      );
    });

    it('should handle delete failure', async () => {
      deleteInvoice.mockResolvedValue(false);

      const { result } = renderInvoiceActionsHook();

      let success;
      await act(async () => {
        success = await result.current.handleDeleteInvoice({
          invoiceId: 'inv-123',
        });
      });

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to delete invoice.');
      expect(success).toBe(false);
    });
  });

  // ============================================================
  // handleVoidInvoice Tests
  // ============================================================
  describe('handleVoidInvoice', () => {
    it('should void invoice successfully', async () => {
      voidInvoice.mockResolvedValue(true);

      const { result } = renderInvoiceActionsHook();

      let success;
      await act(async () => {
        success = await result.current.handleVoidInvoice({
          invoiceId: 'inv-123',
          invoiceNumber: 'INV-2024-001',
        });
      });

      expect(voidInvoice).toHaveBeenCalledWith('inv-123');
      expect(success).toBe(true);
      expect(mockAddMessage).toHaveBeenCalledWith(
        expect.stringContaining('Voided invoice INV-2024-001')
      );
    });

    it('should handle void failure', async () => {
      voidInvoice.mockResolvedValue(false);

      const { result } = renderInvoiceActionsHook();

      let success;
      await act(async () => {
        success = await result.current.handleVoidInvoice({
          invoiceId: 'inv-123',
        });
      });

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to void invoice.');
      expect(success).toBe(false);
    });

    it('should handle void error gracefully', async () => {
      const error = new Error('Database error');
      voidInvoice.mockRejectedValue(error);

      const { result } = renderInvoiceActionsHook();

      let success;
      await act(async () => {
        success = await result.current.handleVoidInvoice({
          invoiceId: 'inv-123',
        });
      });

      expect(logger.error).toHaveBeenCalledWith('Error voiding invoice:', error);
      expect(success).toBe(false);
    });
  });
});
