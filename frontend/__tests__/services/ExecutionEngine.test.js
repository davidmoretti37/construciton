/**
 * ExecutionEngine Tests
 * Tests for plan execution, multi-step handling, and error tracking
 */

// Mock the agent imports before requiring ExecutionEngine
jest.mock('../../src/services/agents/ProjectAgent', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    processStreaming: jest.fn()
  }))
}));

jest.mock('../../src/services/agents/FinancialAgent', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    processStreaming: jest.fn()
  }))
}));

jest.mock('../../src/services/agents/EstimateInvoiceAgent', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    processStreaming: jest.fn()
  }))
}));

jest.mock('../../src/services/agents/DocumentAgent', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    processStreaming: jest.fn()
  }))
}));

jest.mock('../../src/services/agents/WorkersSchedulingAgent', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    processStreaming: jest.fn()
  }))
}));

jest.mock('../../src/services/agents/SettingsConfigAgent', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    processStreaming: jest.fn()
  }))
}));

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/i18n', () => ({
  t: jest.fn((key) => key)
}));

// Import after mocks are set up
import { executePlan } from '../../src/services/agents/core/ExecutionEngine';
import ProjectAgent from '../../src/services/agents/ProjectAgent';
import DocumentAgent from '../../src/services/agents/DocumentAgent';

describe('ExecutionEngine', () => {
  let mockOnChunk;
  let mockOnComplete;
  let mockOnError;
  let mockOnStatusChange;
  let mockContext;
  let mockConversationState;
  let mockConversationHistory;

  beforeEach(() => {
    jest.clearAllMocks();

    mockOnChunk = jest.fn();
    mockOnComplete = jest.fn();
    mockOnError = jest.fn();
    mockOnStatusChange = jest.fn();
    mockContext = { currentDate: '2024-01-15' };
    mockConversationState = {};
    mockConversationHistory = [];
  });

  describe('Empty Plan Handling', () => {
    it('should handle empty plan gracefully', async () => {
      const planObject = { plan: [] };

      await executePlan(
        planObject,
        'test message',
        mockContext,
        mockConversationState,
        mockConversationHistory,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        mockOnStatusChange
      );

      expect(mockOnComplete).toHaveBeenCalledWith({
        text: "Is there anything else I can help with?",
        visualElements: [],
        actions: [],
      });
    });

    it('should handle null plan', async () => {
      const planObject = { plan: null };

      await executePlan(
        planObject,
        'test message',
        mockContext,
        mockConversationState,
        mockConversationHistory,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        mockOnStatusChange
      );

      expect(mockOnComplete).toHaveBeenCalled();
    });
  });

  describe('Single Step Execution', () => {
    it('should execute single step successfully', async () => {
      const planObject = {
        plan: [{
          agent: 'DocumentAgent',
          task: 'answer_general_question',
          user_input: 'test'
        }]
      };

      // Get mock instance and set up processStreaming
      const mockAgent = DocumentAgent.mock.results[0]?.value || { processStreaming: jest.fn() };
      mockAgent.processStreaming = jest.fn((task, input, ctx, state, history, onChunk, onComplete, onError) => {
        onComplete({
          text: 'Test response',
          visualElements: [],
          actions: []
        });
      });

      // Create new instance for this test
      DocumentAgent.mockImplementation(() => mockAgent);

      await executePlan(
        planObject,
        'test message',
        mockContext,
        mockConversationState,
        mockConversationHistory,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        mockOnStatusChange
      );

      expect(mockOnStatusChange).toHaveBeenCalled();
    });

    it('should handle missing agent in single step', async () => {
      const planObject = {
        plan: [{
          agent: 'NonExistentAgent',
          task: 'test',
          user_input: 'test'
        }]
      };

      await executePlan(
        planObject,
        'test message',
        mockContext,
        mockConversationState,
        mockConversationHistory,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        mockOnStatusChange
      );

      expect(mockOnError).toHaveBeenCalled();
      expect(mockOnError.mock.calls[0][0].message).toContain('not found');
    });

    it('should use FULL_MESSAGE when specified', async () => {
      const planObject = {
        plan: [{
          agent: 'DocumentAgent',
          task: 'test',
          user_input: 'FULL_MESSAGE'
        }]
      };

      const capturedInput = [];
      const mockAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete) => {
          capturedInput.push(input);
          onComplete({ text: 'Done', visualElements: [], actions: [] });
        })
      };
      DocumentAgent.mockImplementation(() => mockAgent);

      await executePlan(
        planObject,
        'Original user message',
        mockContext,
        mockConversationState,
        mockConversationHistory,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        mockOnStatusChange
      );

      // When user_input is 'FULL_MESSAGE', it should use the originalUserMessage
      expect(capturedInput[0]).toBe('Original user message');
    });
  });

  describe('Multi-Step Execution', () => {
    it('should execute multiple steps in sequence', async () => {
      const planObject = {
        plan: [
          { agent: 'ProjectAgent', task: 'step1', user_input: 'test1' },
          { agent: 'DocumentAgent', task: 'step2', user_input: 'test2' }
        ]
      };

      const executionOrder = [];

      const mockProjectAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete) => {
          executionOrder.push('ProjectAgent');
          onComplete({ text: 'Step 1 done', visualElements: [], actions: [] });
        })
      };

      const mockDocumentAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete) => {
          executionOrder.push('DocumentAgent');
          onComplete({ text: 'Step 2 done', visualElements: [{ type: 'test' }], actions: [] });
        })
      };

      ProjectAgent.mockImplementation(() => mockProjectAgent);
      DocumentAgent.mockImplementation(() => mockDocumentAgent);

      await executePlan(
        planObject,
        'test message',
        mockContext,
        mockConversationState,
        mockConversationHistory,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        mockOnStatusChange
      );

      expect(executionOrder).toEqual(['ProjectAgent', 'DocumentAgent']);
      expect(mockOnComplete).toHaveBeenCalled();
    });

    it('should accumulate visual elements from all steps', async () => {
      const planObject = {
        plan: [
          { agent: 'ProjectAgent', task: 'step1', user_input: 'test1' },
          { agent: 'DocumentAgent', task: 'step2', user_input: 'test2' }
        ]
      };

      const mockProjectAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete) => {
          onComplete({
            text: 'Step 1',
            visualElements: [{ type: 'project-card', data: {} }],
            actions: []
          });
        })
      };

      const mockDocumentAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete) => {
          onComplete({
            text: 'Step 2',
            visualElements: [{ type: 'document-card', data: {} }],
            actions: []
          });
        })
      };

      ProjectAgent.mockImplementation(() => mockProjectAgent);
      DocumentAgent.mockImplementation(() => mockDocumentAgent);

      await executePlan(
        planObject,
        'test message',
        mockContext,
        mockConversationState,
        mockConversationHistory,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        mockOnStatusChange
      );

      const result = mockOnComplete.mock.calls[0][0];
      expect(result.visualElements).toHaveLength(2);
      expect(result.visualElements[0].type).toBe('project-card');
      expect(result.visualElements[1].type).toBe('document-card');
    });

    it('should track errors when agent not found in multi-step', async () => {
      const planObject = {
        plan: [
          { agent: 'NonExistentAgent', task: 'test', user_input: 'test' },
          { agent: 'DocumentAgent', task: 'step2', user_input: 'test2' }
        ]
      };

      const mockDocumentAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete) => {
          onComplete({ text: 'Step 2 done', visualElements: [], actions: [] });
        })
      };
      DocumentAgent.mockImplementation(() => mockDocumentAgent);

      await executePlan(
        planObject,
        'test message',
        mockContext,
        mockConversationState,
        mockConversationHistory,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        mockOnStatusChange
      );

      const result = mockOnComplete.mock.calls[0][0];
      // Should have completed (second step ran)
      expect(result.text).toContain('Step 2');
      // Should have error metadata
      expect(result._meta).toBeDefined();
      expect(result._meta.executionErrors).toBeDefined();
      expect(result._meta.executionErrors.length).toBeGreaterThan(0);
    });

    it('should track errors when step fails', async () => {
      const planObject = {
        plan: [
          { agent: 'ProjectAgent', task: 'failing_task', user_input: 'test' },
          { agent: 'DocumentAgent', task: 'step2', user_input: 'test2' }
        ]
      };

      const mockProjectAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete, onError) => {
          onError(new Error('Step 1 failed'));
        })
      };

      const mockDocumentAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete) => {
          onComplete({ text: 'Step 2 done', visualElements: [], actions: [] });
        })
      };

      ProjectAgent.mockImplementation(() => mockProjectAgent);
      DocumentAgent.mockImplementation(() => mockDocumentAgent);

      await executePlan(
        planObject,
        'test message',
        mockContext,
        mockConversationState,
        mockConversationHistory,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        mockOnStatusChange
      );

      const result = mockOnComplete.mock.calls[0][0];
      // Execution should continue to step 2
      expect(result.text).toContain('Step 2');
      // Should have error metadata
      expect(result._meta).toBeDefined();
      expect(result._meta.executionErrors).toHaveLength(1);
      expect(result._meta.executionErrors[0].error).toBe('Step 1 failed');
    });

    it('should indicate partial success when some steps fail', async () => {
      const planObject = {
        plan: [
          { agent: 'ProjectAgent', task: 'failing_task', user_input: 'test' },
          { agent: 'DocumentAgent', task: 'step2', user_input: 'test2' }
        ]
      };

      const mockProjectAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete, onError) => {
          onError(new Error('Failed'));
        })
      };

      const mockDocumentAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete) => {
          onComplete({ text: 'Success', visualElements: [], actions: [] });
        })
      };

      ProjectAgent.mockImplementation(() => mockProjectAgent);
      DocumentAgent.mockImplementation(() => mockDocumentAgent);

      await executePlan(
        planObject,
        'test message',
        mockContext,
        mockConversationState,
        mockConversationHistory,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        mockOnStatusChange
      );

      const result = mockOnComplete.mock.calls[0][0];
      expect(result._meta.partialSuccess).toBe(true);
    });
  });

  describe('Pause on Question', () => {
    it('should pause execution when step asks question', async () => {
      const planObject = {
        plan: [
          { agent: 'ProjectAgent', task: 'step1', user_input: 'test1' },
          { agent: 'DocumentAgent', task: 'step2', user_input: 'test2' }
        ]
      };

      const mockProjectAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete) => {
          // Returns a question with no visualElements - should pause
          onComplete({
            text: 'What is the project name?',
            visualElements: [],
            actions: []
          });
        })
      };

      ProjectAgent.mockImplementation(() => mockProjectAgent);

      await executePlan(
        planObject,
        'test message',
        mockContext,
        mockConversationState,
        mockConversationHistory,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        mockOnStatusChange
      );

      const result = mockOnComplete.mock.calls[0][0];
      expect(result._meta.paused).toBe(true);
      expect(result._meta.pendingSteps).toHaveLength(1);
      expect(result._meta.currentAgent).toBe('ProjectAgent');
    });

    it('should not pause on last step even with question', async () => {
      const planObject = {
        plan: [
          { agent: 'ProjectAgent', task: 'only_step', user_input: 'test' }
        ]
      };

      const mockProjectAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete) => {
          onComplete({
            text: 'Is there anything else?',
            visualElements: [],
            actions: []
          });
        })
      };

      ProjectAgent.mockImplementation(() => mockProjectAgent);

      await executePlan(
        planObject,
        'test message',
        mockContext,
        mockConversationState,
        mockConversationHistory,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        mockOnStatusChange
      );

      // Single step execution path - no _meta.paused
      expect(mockOnComplete).toHaveBeenCalled();
    });
  });

  describe('Status Updates', () => {
    it('should call onStatusChange for each step', async () => {
      const planObject = {
        plan: [
          { agent: 'ProjectAgent', task: 'start_project_creation', user_input: 'test1' },
          { agent: 'DocumentAgent', task: 'answer_general_question', user_input: 'test2' }
        ]
      };

      const mockProjectAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete) => {
          onComplete({ text: 'Done', visualElements: [{ type: 'test' }], actions: [] });
        })
      };

      const mockDocumentAgent = {
        processStreaming: jest.fn((task, input, ctx, state, history, onChunk, onComplete) => {
          onComplete({ text: 'Done', visualElements: [], actions: [] });
        })
      };

      ProjectAgent.mockImplementation(() => mockProjectAgent);
      DocumentAgent.mockImplementation(() => mockDocumentAgent);

      await executePlan(
        planObject,
        'test message',
        mockContext,
        mockConversationState,
        mockConversationHistory,
        mockOnChunk,
        mockOnComplete,
        mockOnError,
        mockOnStatusChange
      );

      // Should be called twice, once per step
      expect(mockOnStatusChange).toHaveBeenCalledTimes(2);
    });
  });
});
