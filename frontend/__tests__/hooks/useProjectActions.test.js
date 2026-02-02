/**
 * useProjectActions Hook Tests
 * Tests for project action handlers including financial updates
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

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
    })),
  },
}));

jest.mock('../../src/utils/storage', () => ({
  fetchProjects: jest.fn(),
  saveProject: jest.fn(),
  getProject: jest.fn(),
  deleteProject: jest.fn(),
  transformScreenshotToProject: jest.fn(),
  updatePhaseProgress: jest.fn(),
  extendPhaseTimeline: jest.fn(),
  startPhase: jest.fn(),
  completePhase: jest.fn(),
  fetchProjectPhases: jest.fn(),
  addTaskToPhase: jest.fn(),
  savePhasePaymentAmount: jest.fn(),
  createProjectFromEstimate: jest.fn(),
  createWorkerTasksFromPhases: jest.fn(),
  redistributeAllTasksWithAI: jest.fn(),
}));

jest.mock('../../src/utils/storage/auth', () => ({
  getCurrentUserId: jest.fn(() => Promise.resolve('user-123')),
}));

jest.mock('../../src/utils/storage/transactions', () => ({
  addProjectTransaction: jest.fn(),
}));

jest.mock('../../src/services/agents/core/CoreAgent', () => ({
  updateConversationState: jest.fn(),
}));

import useProjectActions from '../../src/hooks/actions/useProjectActions';
import {
  saveProject,
  getProject,
  deleteProject,
  transformScreenshotToProject,
} from '../../src/utils/storage';
import { addProjectTransaction } from '../../src/utils/storage/transactions';
import logger from '../../src/utils/logger';

describe('useProjectActions', () => {
  let mockAddMessage;
  let mockSetMessages;
  let mockNavigation;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAddMessage = jest.fn();
    mockSetMessages = jest.fn();
    mockNavigation = { navigate: jest.fn() };
  });

  const renderProjectActionsHook = () => {
    return renderHook(() =>
      useProjectActions({
        addMessage: mockAddMessage,
        setMessages: mockSetMessages,
        navigation: mockNavigation,
      })
    );
  };

  // ============================================================
  // handleUpdateProjectFinances Tests
  // ============================================================
  describe('handleUpdateProjectFinances', () => {
    it('should add income transaction correctly (new format)', async () => {
      const mockTransaction = { id: 'tx-123', type: 'income', amount: 5000 };
      const mockProject = {
        id: 'p1',
        name: 'Test Project',
        incomeCollected: 10000,
        expenses: 3000,
      };
      addProjectTransaction.mockResolvedValue(mockTransaction);
      getProject.mockResolvedValue(mockProject);

      const { result } = renderProjectActionsHook();

      let updatedProject;
      await act(async () => {
        updatedProject = await result.current.handleUpdateProjectFinances({
          projectId: 'p1',
          projectName: 'Test Project',
          transactionType: 'income',
          amount: 5000,
          paymentMethod: 'check',
        });
      });

      expect(addProjectTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'p1',
          type: 'income',
          amount: 5000,
          payment_method: 'check',
        })
      );
      expect(updatedProject).toEqual(mockProject);
    });

    it('should add expense transaction correctly', async () => {
      const mockTransaction = { id: 'tx-124', type: 'expense', amount: 2000 };
      const mockProject = { id: 'p1', name: 'Test Project' };
      addProjectTransaction.mockResolvedValue(mockTransaction);
      getProject.mockResolvedValue(mockProject);

      const { result } = renderProjectActionsHook();

      await act(async () => {
        await result.current.handleUpdateProjectFinances({
          projectId: 'p1',
          projectName: 'Test Project',
          transactionType: 'expense',
          amount: 2000,
          category: 'materials',
        });
      });

      expect(addProjectTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          project_id: 'p1',
          type: 'expense',
          amount: 2000,
          category: 'materials',
        })
      );
    });

    it('should support old format (incomeCollected property)', async () => {
      addProjectTransaction.mockResolvedValue({ id: 'tx-1' });
      getProject.mockResolvedValue({ id: 'p1' });

      const { result } = renderProjectActionsHook();

      await act(async () => {
        await result.current.handleUpdateProjectFinances({
          projectId: 'p1',
          projectName: 'Test Project',
          incomeCollected: 3000, // old format
        });
      });

      expect(addProjectTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'income',
          amount: 3000,
        })
      );
    });

    it('should support old format (expenses property)', async () => {
      addProjectTransaction.mockResolvedValue({ id: 'tx-1' });
      getProject.mockResolvedValue({ id: 'p1' });

      const { result } = renderProjectActionsHook();

      await act(async () => {
        await result.current.handleUpdateProjectFinances({
          projectId: 'p1',
          projectName: 'Test Project',
          expenses: 1500, // old format
        });
      });

      expect(addProjectTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'expense',
          amount: 1500,
        })
      );
    });

    it('should handle transaction failure', async () => {
      addProjectTransaction.mockResolvedValue(null);

      const { result } = renderProjectActionsHook();

      let updated;
      await act(async () => {
        updated = await result.current.handleUpdateProjectFinances({
          projectId: 'p1',
          projectName: 'Test Project',
          transactionType: 'income',
          amount: 5000,
        });
      });

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to save transaction to database.');
      expect(updated).toBeNull();
    });

    it('should handle missing transaction data', async () => {
      const { result } = renderProjectActionsHook();

      let updated;
      await act(async () => {
        updated = await result.current.handleUpdateProjectFinances({
          projectId: 'p1',
          projectName: 'Test Project',
          // No transactionType or amount
        });
      });

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Invalid transaction data.');
      expect(updated).toBeNull();
    });
  });

  // ============================================================
  // handleSaveProject Tests
  // ============================================================
  describe('handleSaveProject', () => {
    it('should save project successfully', async () => {
      const mockSavedProject = {
        id: 'project-123',
        name: 'Kitchen Remodel',
        client: 'John Doe',
      };
      saveProject.mockResolvedValue(mockSavedProject);

      const { result } = renderProjectActionsHook();

      let savedProject;
      await act(async () => {
        savedProject = await result.current.handleSaveProject({
          projectName: 'Kitchen Remodel',
          client: 'John Doe',
          contractAmount: 50000,
        });
      });

      expect(saveProject).toHaveBeenCalled();
      expect(savedProject).toEqual(mockSavedProject);
      expect(Alert.alert).toHaveBeenCalledWith(
        'Success',
        expect.stringContaining('Kitchen Remodel')
      );
    });

    it('should return null when save fails', async () => {
      saveProject.mockResolvedValue(null);

      const { result } = renderProjectActionsHook();

      let savedProject;
      await act(async () => {
        savedProject = await result.current.handleSaveProject({
          projectName: 'Test Project',
        });
      });

      expect(savedProject).toBeNull();
    });

    it('should handle save error gracefully', async () => {
      const error = new Error('Database error');
      saveProject.mockRejectedValue(error);

      const { result } = renderProjectActionsHook();

      let savedProject;
      await act(async () => {
        savedProject = await result.current.handleSaveProject({
          projectName: 'Test Project',
        });
      });

      expect(logger.error).toHaveBeenCalledWith('Error saving project:', error);
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to save project. Please try again.');
      expect(savedProject).toBeNull();
    });

    it('should prevent duplicate saves within 5 seconds', async () => {
      const mockSavedProject = { id: 'p1', name: 'Test Project' };
      saveProject.mockResolvedValue(mockSavedProject);

      const { result } = renderProjectActionsHook();

      // First save
      await act(async () => {
        await result.current.handleSaveProject({
          projectName: 'Test Project',
        });
      });

      // Second save with same name (should be skipped)
      let secondResult;
      await act(async () => {
        secondResult = await result.current.handleSaveProject({
          projectName: 'Test Project',
        });
      });

      // saveProject should only be called once
      expect(saveProject).toHaveBeenCalledTimes(1);
      expect(secondResult).toBeNull();
    });
  });

  // ============================================================
  // handleDeleteProject Tests
  // ============================================================
  describe('handleDeleteProject', () => {
    it('should delete project with skipConfirmation', async () => {
      deleteProject.mockResolvedValue(true);

      const { result } = renderProjectActionsHook();

      let deleted;
      await act(async () => {
        deleted = await result.current.handleDeleteProject(
          { projectId: 'p1', projectName: 'Test Project' },
          { skipConfirmation: true }
        );
      });

      expect(deleteProject).toHaveBeenCalledWith('p1');
      expect(deleted).toBe(true);
      expect(mockSetMessages).toHaveBeenCalled();
    });

    it('should handle delete failure', async () => {
      deleteProject.mockResolvedValue(false);

      const { result } = renderProjectActionsHook();

      let deleted;
      await act(async () => {
        deleted = await result.current.handleDeleteProject(
          { projectId: 'p1', projectName: 'Test Project' },
          { skipConfirmation: true }
        );
      });

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to delete project');
      expect(deleted).toBe(false);
    });

    it('should handle missing project ID', async () => {
      const { result } = renderProjectActionsHook();

      let deleted;
      await act(async () => {
        deleted = await result.current.handleDeleteProject(
          { projectName: 'Test Project' }, // no projectId
          { skipConfirmation: true }
        );
      });

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Project ID not found');
      expect(deleted).toBe(false);
    });
  });

  // ============================================================
  // handleCreateProjectFromScreenshot Tests
  // ============================================================
  describe('handleCreateProjectFromScreenshot', () => {
    it('should create project from screenshot data', async () => {
      const mockProjectData = { name: 'Screenshot Project', client: 'Client A' };
      const mockSavedProject = { id: 'p1', ...mockProjectData };

      transformScreenshotToProject.mockReturnValue(mockProjectData);
      saveProject.mockResolvedValue(mockSavedProject);

      const { result } = renderProjectActionsHook();

      let project;
      await act(async () => {
        project = await result.current.handleCreateProjectFromScreenshot({
          // screenshot data
        });
      });

      expect(transformScreenshotToProject).toHaveBeenCalled();
      expect(saveProject).toHaveBeenCalledWith(mockProjectData);
      expect(project).toEqual(mockSavedProject);
      expect(Alert.alert).toHaveBeenCalledWith('Success', 'Project created from screenshot!');
    });

    it('should handle screenshot project creation failure', async () => {
      transformScreenshotToProject.mockReturnValue({ name: 'Test' });
      saveProject.mockResolvedValue(null);

      const { result } = renderProjectActionsHook();

      let project;
      await act(async () => {
        project = await result.current.handleCreateProjectFromScreenshot({});
      });

      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to create project. Please try again.');
      expect(project).toBeNull();
    });
  });
});
