/**
 * useEstimateActions Hook Tests
 * Tests for estimate action handlers
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
  fetchProjects: jest.fn(),
  saveEstimate: jest.fn(),
  updateEstimate: jest.fn(),
  fetchEstimates: jest.fn(),
  deleteEstimate: jest.fn(),
}));

jest.mock('../../src/utils/messaging', () => ({
  sendEstimateViaSMS: jest.fn(),
  sendEstimateViaWhatsApp: jest.fn(),
  isValidPhoneNumber: jest.fn((phone) => /^\d{10,}$/.test(phone)),
}));

jest.mock('../../src/utils/estimateFormatter', () => ({
  formatEstimate: jest.fn((estimate) => `Estimate: ${estimate?.total || 0}`),
}));

jest.mock('../../src/services/agents/core/CoreAgent', () => ({
  conversationState: {},
  updateConversationState: jest.fn(),
}));

import useEstimateActions from '../../src/hooks/actions/useEstimateActions';
import {
  fetchProjects,
  saveEstimate,
  updateEstimate,
  deleteEstimate,
  fetchEstimates,
} from '../../src/utils/storage';
import { sendEstimateViaSMS, sendEstimateViaWhatsApp } from '../../src/utils/messaging';
import logger from '../../src/utils/logger';

describe('useEstimateActions', () => {
  let mockAddMessage;
  let mockSetMessages;
  let mockMessages;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAddMessage = jest.fn();
    mockSetMessages = jest.fn();
    mockMessages = [];
  });

  const renderEstimateActionsHook = (messages = mockMessages) => {
    return renderHook(() =>
      useEstimateActions({
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        messages,
      })
    );
  };

  // ============================================================
  // handleSaveEstimate Tests
  // ============================================================
  describe('handleSaveEstimate', () => {
    it('should save estimate successfully', async () => {
      const mockEstimate = {
        id: 'est-123',
        estimate_number: 'EST-2024-001',
        total: 15000,
        client: 'John Doe',
      };
      saveEstimate.mockResolvedValue(mockEstimate);

      const { result } = renderEstimateActionsHook();

      let saved;
      await act(async () => {
        saved = await result.current.handleSaveEstimate({
          clientName: 'John Doe',
          total: 15000,
          items: [
            { description: 'Cabinets', quantity: 1, price: 5000 },
            { description: 'Labor', quantity: 40, price: 250 },
          ],
        });
      });

      expect(saveEstimate).toHaveBeenCalled();
      expect(saved).toEqual(mockEstimate);
      expect(Alert.alert).toHaveBeenCalledWith(
        'Success',
        expect.stringContaining('EST-2024-001')
      );
    });

    it('should resolve partial project ID to full UUID', async () => {
      const mockProjects = [
        { id: '12345678-1234-1234-1234-123456789012', name: 'Project A' },
      ];
      fetchProjects.mockResolvedValue(mockProjects);
      saveEstimate.mockResolvedValue({ id: 'est-1', estimate_number: 'EST-001' });

      const { result } = renderEstimateActionsHook();

      await act(async () => {
        await result.current.handleSaveEstimate({
          clientName: 'Test',
          projectId: '12345678', // partial ID
        });
      });

      expect(fetchProjects).toHaveBeenCalled();
      expect(saveEstimate).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: '12345678-1234-1234-1234-123456789012',
        })
      );
    });

    it('should normalize project_id to projectId (full 36-char UUID)', async () => {
      saveEstimate.mockResolvedValue({ id: 'est-1', estimate_number: 'EST-001' });

      const { result } = renderEstimateActionsHook();

      // Use a proper 36-character UUID format
      const fullUUID = '12345678-1234-1234-1234-123456789012';
      await act(async () => {
        await result.current.handleSaveEstimate({
          clientName: 'Test',
          project_id: fullUUID,
        });
      });

      expect(saveEstimate).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: fullUUID,
        })
      );
    });

    it('should handle save failure', async () => {
      saveEstimate.mockResolvedValue(null);

      const { result } = renderEstimateActionsHook();

      let saved;
      await act(async () => {
        saved = await result.current.handleSaveEstimate({
          clientName: 'Test',
        });
      });

      expect(saved).toBeNull();
    });

    it('should handle save error gracefully', async () => {
      const error = new Error('Database error');
      saveEstimate.mockRejectedValue(error);

      const { result } = renderEstimateActionsHook();

      let saved;
      await act(async () => {
        saved = await result.current.handleSaveEstimate({
          clientName: 'Test',
        });
      });

      expect(logger.error).toHaveBeenCalledWith('Error saving estimate:', error);
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to save estimate. Please try again.');
      expect(saved).toBeNull();
    });
  });

  // ============================================================
  // handleUpdateEstimate Tests
  // ============================================================
  describe('handleUpdateEstimate', () => {
    it('should update existing estimate in database', async () => {
      const mockUpdatedEstimate = {
        id: 'est-123',
        estimate_number: 'EST-2024-001',
        total: 20000,
      };
      updateEstimate.mockResolvedValue(mockUpdatedEstimate);

      const { result } = renderEstimateActionsHook();

      let updated;
      await act(async () => {
        updated = await result.current.handleUpdateEstimate({
          id: 'est-123',
          total: 20000,
        });
      });

      expect(updateEstimate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'est-123', total: 20000 })
      );
      expect(updated).toEqual(mockUpdatedEstimate);
      expect(Alert.alert).toHaveBeenCalledWith(
        'Success',
        'Estimate and linked project updated successfully!'
      );
    });

    it('should update unsaved estimate in chat (no ID)', async () => {
      const { result } = renderEstimateActionsHook();

      let updated;
      await act(async () => {
        updated = await result.current.handleUpdateEstimate({
          estimateNumber: 'EST-DRAFT',
          total: 5000,
          // no id - unsaved estimate
        });
      });

      // Should not call updateEstimate for unsaved
      expect(updateEstimate).not.toHaveBeenCalled();
      expect(mockSetMessages).toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'Success',
        expect.stringContaining('Save Estimate')
      );
    });

    it('should skip confirmation when skipConfirmation is true', async () => {
      updateEstimate.mockResolvedValue({ id: 'est-1' });

      const { result } = renderEstimateActionsHook();

      await act(async () => {
        await result.current.handleUpdateEstimate(
          { id: 'est-1', total: 10000 },
          { skipConfirmation: true }
        );
      });

      expect(Alert.alert).not.toHaveBeenCalled();
    });

    it('should handle update failure', async () => {
      updateEstimate.mockResolvedValue(null);

      const { result } = renderEstimateActionsHook();

      let updated;
      await act(async () => {
        updated = await result.current.handleUpdateEstimate({
          id: 'est-123',
          total: 20000,
        });
      });

      expect(updated).toBeNull();
    });

    it('should handle update error gracefully', async () => {
      const error = new Error('Update failed');
      updateEstimate.mockRejectedValue(error);

      const { result } = renderEstimateActionsHook();

      let updated;
      await act(async () => {
        updated = await result.current.handleUpdateEstimate({
          id: 'est-123',
          total: 20000,
        });
      });

      expect(logger.error).toHaveBeenCalledWith('Error updating estimate:', error);
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to update estimate. Please try again.');
      expect(updated).toBeNull();
    });
  });

  // ============================================================
  // handleSendEstimate Tests
  // ============================================================
  describe('handleSendEstimate', () => {
    it('should send estimate via SMS', async () => {
      sendEstimateViaSMS.mockResolvedValue(true);

      const { result } = renderEstimateActionsHook();

      let success;
      await act(async () => {
        success = await result.current.handleSendEstimate({
          data: {
            method: 'sms',
            phone: '5551234567',
            clientName: 'John Doe',
            estimate: { total: 5000 },
          },
        });
      });

      expect(sendEstimateViaSMS).toHaveBeenCalled();
      expect(success).toBe(true);
      expect(mockAddMessage).toHaveBeenCalledWith(
        expect.stringContaining('John Doe')
      );
    });

    it('should send estimate via WhatsApp', async () => {
      sendEstimateViaWhatsApp.mockResolvedValue(true);

      const { result } = renderEstimateActionsHook();

      let success;
      await act(async () => {
        success = await result.current.handleSendEstimate({
          data: {
            method: 'whatsapp',
            phone: '5551234567',
            clientName: 'Jane Doe',
            estimate: { total: 8000 },
          },
        });
      });

      expect(sendEstimateViaWhatsApp).toHaveBeenCalled();
      expect(success).toBe(true);
    });

    it('should reject invalid phone number', async () => {
      const { result } = renderEstimateActionsHook();

      let success;
      await act(async () => {
        success = await result.current.handleSendEstimate({
          data: {
            method: 'sms',
            phone: '123', // too short
            estimate: {},
          },
        });
      });

      expect(Alert.alert).toHaveBeenCalledWith('Invalid Phone', expect.any(String));
      expect(success).toBe(false);
    });
  });

  // ============================================================
  // handleDeleteAllEstimates Tests
  // ============================================================
  describe('handleDeleteAllEstimates', () => {
    it('should delete all estimates when confirmed', async () => {
      const mockEstimates = [
        { id: 'est-1' },
        { id: 'est-2' },
        { id: 'est-3' },
      ];
      fetchEstimates.mockResolvedValue(mockEstimates);
      deleteEstimate.mockResolvedValue(true);

      const { result } = renderEstimateActionsHook();

      let deleteResult;
      await act(async () => {
        deleteResult = await result.current.handleDeleteAllEstimates(
          { confirmed: true }
        );
      });

      expect(deleteEstimate).toHaveBeenCalledTimes(3);
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.count).toBe(3);
    });

    it('should handle no estimates to delete', async () => {
      fetchEstimates.mockResolvedValue([]);

      const { result } = renderEstimateActionsHook();

      let deleteResult;
      await act(async () => {
        deleteResult = await result.current.handleDeleteAllEstimates({});
      });

      expect(mockAddMessage).toHaveBeenCalledWith('You have no estimates to delete.');
      expect(deleteResult.success).toBe(true);
      expect(deleteResult.count).toBe(0);
    });

    it('should skip confirmation with skipConfirmation option', async () => {
      fetchEstimates.mockResolvedValue([{ id: 'est-1' }]);
      deleteEstimate.mockResolvedValue(true);

      const { result } = renderEstimateActionsHook();

      await act(async () => {
        await result.current.handleDeleteAllEstimates(
          {},
          { skipConfirmation: true }
        );
      });

      expect(deleteEstimate).toHaveBeenCalledWith('est-1');
    });
  });
});
