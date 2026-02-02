/**
 * useWorkerActions Hook Tests
 * Tests for critical worker action handlers
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
  createWorker: jest.fn(),
  updateWorker: jest.fn(),
  deleteWorker: jest.fn(),
  clockIn: jest.fn(),
  clockOut: jest.fn(),
  getActiveClockIn: jest.fn(),
  fetchWorkers: jest.fn(),
  calculateWorkerPaymentForPeriod: jest.fn(),
}));

jest.mock('../../src/utils/storage/projects', () => ({
  fetchProjects: jest.fn(() => Promise.resolve([])),
  addProjectTransaction: jest.fn(),
}));

jest.mock('../../src/services/agents/core/CacheService', () => ({
  responseCache: {
    invalidateAll: jest.fn(),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => key,
  }),
}));

import useWorkerActions from '../../src/hooks/actions/useWorkerActions';
import {
  createWorker,
  updateWorker,
  deleteWorker,
  clockIn,
  clockOut,
  getActiveClockIn,
  calculateWorkerPaymentForPeriod,
  fetchWorkers,
} from '../../src/utils/storage';
import logger from '../../src/utils/logger';

describe('useWorkerActions', () => {
  let mockAddMessage;
  let mockSetMessages;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAddMessage = jest.fn();
    mockSetMessages = jest.fn();
  });

  const renderWorkerActionsHook = () => {
    return renderHook(() =>
      useWorkerActions({
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
      })
    );
  };

  // ============================================================
  // handleCreateWorker Tests
  // ============================================================
  describe('handleCreateWorker', () => {
    it('should create worker and return data on success', async () => {
      const mockWorker = {
        id: 'worker-123',
        full_name: 'John Doe',
        email: 'john@example.com',
        trade: 'Electrician',
      };
      createWorker.mockResolvedValue(mockWorker);

      const { result } = renderWorkerActionsHook();

      let worker;
      await act(async () => {
        worker = await result.current.handleCreateWorker({
          full_name: 'John Doe',
          email: 'john@example.com',
          trade: 'Electrician',
        });
      });

      expect(createWorker).toHaveBeenCalledWith({
        full_name: 'John Doe',
        email: 'john@example.com',
        trade: 'Electrician',
      });
      expect(worker).toEqual(mockWorker);
    });

    it('should show alert and return null when creation fails', async () => {
      createWorker.mockResolvedValue(null);

      const { result } = renderWorkerActionsHook();

      let worker;
      await act(async () => {
        worker = await result.current.handleCreateWorker({
          full_name: 'John Doe',
        });
      });

      expect(Alert.alert).toHaveBeenCalled();
      expect(worker).toBeNull();
    });

    it('should handle exceptions and alert user', async () => {
      const error = new Error('Network error');
      createWorker.mockRejectedValue(error);

      const { result } = renderWorkerActionsHook();

      let worker;
      await act(async () => {
        worker = await result.current.handleCreateWorker({
          full_name: 'John Doe',
        });
      });

      expect(logger.error).toHaveBeenCalledWith('Error creating worker:', error);
      expect(Alert.alert).toHaveBeenCalled();
      expect(worker).toBeNull();
    });
  });

  // ============================================================
  // handleUpdateWorker Tests
  // ============================================================
  describe('handleUpdateWorker', () => {
    it('should update worker successfully', async () => {
      // Use full 36-char UUID to skip partial ID resolution
      const fullUUID = '12345678-1234-1234-1234-123456789012';
      updateWorker.mockResolvedValue(true);

      const { result } = renderWorkerActionsHook();

      let updated;
      await act(async () => {
        updated = await result.current.handleUpdateWorker({
          id: fullUUID,
          full_name: 'John Updated',
        });
      });

      expect(updateWorker).toHaveBeenCalledWith(fullUUID, { full_name: 'John Updated' });
      expect(updated).toBe(true);
    });

    it('should handle update failure', async () => {
      const fullUUID = '12345678-1234-1234-1234-123456789012';
      updateWorker.mockResolvedValue(false);

      const { result } = renderWorkerActionsHook();

      let updated;
      await act(async () => {
        updated = await result.current.handleUpdateWorker({
          id: fullUUID,
          hourly_rate: 50,
        });
      });

      expect(Alert.alert).toHaveBeenCalled();
      expect(updated).toBe(false);
    });
  });

  // ============================================================
  // handleDeleteWorker Tests
  // ============================================================
  describe('handleDeleteWorker', () => {
    it('should delete worker successfully', async () => {
      // Use full 36-char UUID to skip partial ID resolution
      const fullUUID = '12345678-1234-1234-1234-123456789012';
      deleteWorker.mockResolvedValue(true);

      const { result } = renderWorkerActionsHook();

      let deleted;
      await act(async () => {
        deleted = await result.current.handleDeleteWorker({
          workerId: fullUUID,
        });
      });

      expect(deleteWorker).toHaveBeenCalledWith(fullUUID);
      expect(deleted).toBe(true);
    });

    it('should handle delete failure', async () => {
      deleteWorker.mockResolvedValue(false);

      const { result } = renderWorkerActionsHook();

      let deleted;
      await act(async () => {
        deleted = await result.current.handleDeleteWorker({
          workerId: 'worker-123',
        });
      });

      expect(Alert.alert).toHaveBeenCalled();
      expect(deleted).toBe(false);
    });
  });

  // ============================================================
  // handleClockInWorker Tests
  // ============================================================
  describe('handleClockInWorker', () => {
    it('should clock in worker successfully', async () => {
      const mockTimeEntry = {
        id: 'entry-123',
        worker_id: 'worker-123',
        project_id: 'project-456',
        clock_in: '2024-01-15T09:00:00Z',
      };
      clockIn.mockResolvedValue(mockTimeEntry);

      const { result } = renderWorkerActionsHook();

      let entry;
      await act(async () => {
        entry = await result.current.handleClockInWorker({
          worker_id: 'worker-123',
          project_id: 'project-456',
        });
      });

      expect(clockIn).toHaveBeenCalled();
      expect(entry).toEqual(mockTimeEntry);
    });

    it('should handle clock in failure', async () => {
      clockIn.mockResolvedValue(null);

      const { result } = renderWorkerActionsHook();

      let entry;
      await act(async () => {
        entry = await result.current.handleClockInWorker({
          worker_id: 'worker-123',
          project_id: 'project-456',
        });
      });

      expect(Alert.alert).toHaveBeenCalled();
      expect(entry).toBeNull();
    });
  });

  // ============================================================
  // handleClockOutWorker Tests
  // ============================================================
  describe('handleClockOutWorker', () => {
    it('should clock out worker successfully', async () => {
      // Mock the active clock-in record
      const mockActiveRecord = {
        id: 'entry-123',
        worker_id: 'worker-123',
        clock_in: '2024-01-15T09:00:00Z',
      };
      getActiveClockIn.mockResolvedValue(mockActiveRecord);
      clockOut.mockResolvedValue(true);

      const { result } = renderWorkerActionsHook();

      let entry;
      await act(async () => {
        entry = await result.current.handleClockOutWorker({
          workerId: 'worker-123',
          workerName: 'John Doe',
        });
      });

      expect(getActiveClockIn).toHaveBeenCalledWith('worker-123');
      expect(clockOut).toHaveBeenCalled();
      expect(entry).toHaveProperty('hoursWorked');
    });

    it('should handle clock out failure', async () => {
      getActiveClockIn.mockResolvedValue({ id: 'entry-123', clock_in: '2024-01-15T09:00:00Z' });
      clockOut.mockResolvedValue(false);

      const { result } = renderWorkerActionsHook();

      let entry;
      await act(async () => {
        entry = await result.current.handleClockOutWorker({
          workerId: 'worker-123',
          workerName: 'John Doe',
        });
      });

      expect(Alert.alert).toHaveBeenCalled();
      expect(entry).toBeNull();
    });
  });

  // ============================================================
  // handleGetWorkerPayment Tests (CRITICAL - Money calculations)
  // ============================================================
  describe('handleGetWorkerPayment', () => {
    it('should calculate payment for worker', async () => {
      const mockPayment = {
        workerId: 'worker-123',
        workerName: 'John Doe',
        totalAmount: 1600,
        totalHours: 40,
        paymentType: 'hourly',
        rate: { hourly: 40 },
        byProject: [
          { projectId: 'p1', projectName: 'Project A', hours: 40, amount: 1600 }
        ],
        byDate: [],
      };
      calculateWorkerPaymentForPeriod.mockResolvedValue(mockPayment);
      fetchWorkers.mockResolvedValue([
        { id: 'worker-123', full_name: 'John Doe' }
      ]);

      const { result } = renderWorkerActionsHook();

      await act(async () => {
        await result.current.handleGetWorkerPayment({
          data: {
            workerName: 'John',
            period: 'this_week',
          }
        });
      });

      expect(calculateWorkerPaymentForPeriod).toHaveBeenCalled();
      // Function uses setMessages to display payment cards, not addMessage
      expect(mockSetMessages).toHaveBeenCalled();
    });

    it('should handle payment calculation failure', async () => {
      calculateWorkerPaymentForPeriod.mockResolvedValue(null);
      fetchWorkers.mockResolvedValue([
        { id: 'worker-123', full_name: 'John Doe' }
      ]);

      const { result } = renderWorkerActionsHook();

      await act(async () => {
        await result.current.handleGetWorkerPayment({
          data: {
            workerName: 'John',
            period: 'this_week',
          }
        });
      });

      // Should still add a message (with error info)
      expect(mockAddMessage).toHaveBeenCalled();
    });

    it('should handle exception during payment calculation', async () => {
      const error = new Error('Database error');
      calculateWorkerPaymentForPeriod.mockRejectedValue(error);
      fetchWorkers.mockResolvedValue([
        { id: 'worker-123', full_name: 'John Doe' }
      ]);

      const { result } = renderWorkerActionsHook();

      await act(async () => {
        await result.current.handleGetWorkerPayment({
          data: {
            workerName: 'John',
            period: 'this_week',
          }
        });
      });

      expect(logger.error).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Edge Cases
  // ============================================================
  describe('Edge Cases', () => {
    it('should handle missing worker data gracefully', async () => {
      const { result } = renderWorkerActionsHook();

      await act(async () => {
        await result.current.handleCreateWorker(null);
      });

      // Should not crash
      expect(createWorker).toHaveBeenCalledWith(null);
    });

    it('should handle empty worker ID for delete', async () => {
      const { result } = renderWorkerActionsHook();

      await act(async () => {
        await result.current.handleDeleteWorker({});
      });

      // Should call with undefined but not crash
      expect(deleteWorker).toHaveBeenCalled();
    });
  });
});
