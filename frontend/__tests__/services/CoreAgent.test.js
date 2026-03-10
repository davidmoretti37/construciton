/**
 * CoreAgent Tests
 * Tests for fast keyword routing patterns, conversation state management,
 * supervisor access control, and agent delegation flow.
 */

// Mock all dependencies before imports
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/services/agents/core/AgentContext', () => ({
  buildInitialContext: jest.fn().mockResolvedValue({ projects: [], workers: [] }),
  fetchAgentSpecificContext: jest.fn().mockResolvedValue({ projects: [], workers: [] }),
}));

jest.mock('../../src/services/agents/core/ExecutionEngine', () => ({
  executePlan: jest.fn(),
}));

jest.mock('../../src/services/agents/prompts/coreAgentPrompt', () => ({
  getCoreAgentPrompt: jest.fn().mockReturnValue('mock system prompt'),
}));

jest.mock('../../src/services/aiService', () => ({
  setVoiceMode: jest.fn(),
  sendPlanningRequest: jest.fn(),
}));

jest.mock('../../src/services/agents/core/DeterministicResponder', () => ({
  checkDeterministicResponse: jest.fn().mockReturnValue(null),
}));

jest.mock('../../src/services/agents/core/CacheService', () => ({
  responseCache: {
    get: jest.fn().mockReturnValue(null),
    set: jest.fn(),
  },
}));

jest.mock('../../src/services/agents/core/MemoryService', () => ({
  memoryService: {
    getRelevantMemory: jest.fn().mockReturnValue(null),
    saveMemory: jest.fn(),
  },
}));

jest.mock('../../src/utils/storage/auth', () => ({
  getCurrentUserContext: jest.fn().mockResolvedValue({ role: 'owner' }),
  getCurrentUserId: jest.fn().mockResolvedValue('user-123'),
}));

jest.mock('../../src/i18n', () => ({
  t: jest.fn((key) => key),
}));

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } }, error: null }),
    },
  },
}));

// Import after all mocks
import CoreAgent from '../../src/services/agents/core/CoreAgent';
import { executePlan } from '../../src/services/agents/core/ExecutionEngine';
import { fetchAgentSpecificContext } from '../../src/services/agents/core/AgentContext';
import { getCurrentUserContext } from '../../src/utils/storage/auth';

describe('CoreAgent', () => {
  let onChunk, onComplete, onError, onStatusChange;

  beforeEach(() => {
    jest.clearAllMocks();
    onChunk = jest.fn();
    onComplete = jest.fn();
    onError = jest.fn();
    onStatusChange = jest.fn();

    // Reset conversation state
    CoreAgent.updateConversationState({
      activeAgent: null,
      awaitingUserInput: false,
      pendingSteps: null,
      lastPlan: null,
      lastProjectPreview: null,
      lastEstimatePreview: null,
    });

    // Default: owner role (no restrictions)
    getCurrentUserContext.mockResolvedValue({ role: 'owner' });

    // Default: executePlan calls onComplete
    executePlan.mockImplementation(
      (plan, msg, ctx, state, history, chunk, complete, error, status) => {
        complete({ text: 'Done', visualElements: [], actions: [] });
      }
    );
  });

  // ============================================================
  // Fast Route Matching - Greetings
  // ============================================================
  describe('fast route: greetings', () => {
    it.each([
      'hello', 'hi', 'hey', 'good morning', 'good afternoon',
      'good evening', 'howdy', 'Hello!', 'Hi!',
    ])('should route "%s" to DocumentAgent/answer_general_question', async (greeting) => {
      await CoreAgent.processStreaming(greeting, [], onChunk, onComplete, onError, onStatusChange);

      expect(executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: [expect.objectContaining({
            agent: 'DocumentAgent',
            task: 'answer_general_question',
          })],
        }),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(Array),
        onChunk,
        expect.any(Function),
        onError,
        onStatusChange
      );
    });
  });

  // ============================================================
  // Fast Route Matching - Projects
  // ============================================================
  describe('fast route: projects', () => {
    it.each([
      ['show my projects', 'DocumentAgent', 'find_project'],
      ['list all projects', 'DocumentAgent', 'find_project'],
      ['view projects', 'DocumentAgent', 'find_project'],
      ['my projects', 'DocumentAgent', 'find_project'],
      ['active projects', 'DocumentAgent', 'find_project'],
    ])('should route "%s" to %s/%s', async (message, expectedAgent, expectedTask) => {
      await CoreAgent.processStreaming(message, [], onChunk, onComplete, onError, onStatusChange);

      expect(executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: [expect.objectContaining({
            agent: expectedAgent,
            task: expectedTask,
          })],
        }),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(Array),
        onChunk,
        expect.any(Function),
        onError,
        onStatusChange
      );
    });

    it.each([
      ['create a new project', 'ProjectAgent', 'start_project_creation'],
      ['start a new project', 'ProjectAgent', 'start_project_creation'],
      ['new project', 'ProjectAgent', 'start_project_creation'],
      ['install a new toilet', 'ProjectAgent', 'start_project_creation'],
    ])('should route "%s" to %s/%s', async (message, expectedAgent, expectedTask) => {
      await CoreAgent.processStreaming(message, [], onChunk, onComplete, onError, onStatusChange);

      expect(executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: [expect.objectContaining({
            agent: expectedAgent,
            task: expectedTask,
          })],
        }),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(Array),
        onChunk,
        expect.any(Function),
        onError,
        onStatusChange
      );
    });

    it('should route "delete project" to DocumentAgent/delete_project', async () => {
      await CoreAgent.processStreaming('delete the project', [], onChunk, onComplete, onError, onStatusChange);

      expect(executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: [expect.objectContaining({
            agent: 'DocumentAgent',
            task: 'delete_project',
          })],
        }),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(Array),
        onChunk,
        expect.any(Function),
        onError,
        onStatusChange
      );
    });
  });

  // ============================================================
  // Fast Route Matching - Estimates & Invoices
  // ============================================================
  describe('fast route: estimates and invoices', () => {
    it.each([
      ['show my estimates', 'EstimateInvoiceAgent', 'find_estimates'],
      ['list estimates', 'EstimateInvoiceAgent', 'find_estimates'],
      ['my estimates', 'EstimateInvoiceAgent', 'find_estimates'],
    ])('should route "%s" to %s/%s (lookup)', async (message, agent, task) => {
      await CoreAgent.processStreaming(message, [], onChunk, onComplete, onError, onStatusChange);

      expect(executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: [expect.objectContaining({ agent, task })],
        }),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(Array),
        onChunk,
        expect.any(Function),
        onError,
        onStatusChange
      );
    });

    it.each([
      ['create an estimate', 'EstimateInvoiceAgent', 'create_estimate'],
      ['make a new estimate', 'EstimateInvoiceAgent', 'create_estimate'],
      ['how much would it cost', 'EstimateInvoiceAgent', 'create_estimate'],
    ])('should route "%s" to %s/%s (creation)', async (message, agent, task) => {
      await CoreAgent.processStreaming(message, [], onChunk, onComplete, onError, onStatusChange);

      expect(executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: [expect.objectContaining({ agent, task })],
        }),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(Array),
        onChunk,
        expect.any(Function),
        onError,
        onStatusChange
      );
    });

    it.each([
      ['show my invoices', 'EstimateInvoiceAgent', 'find_invoices'],
      ['create an invoice', 'EstimateInvoiceAgent', 'create_invoice'],
    ])('should route "%s" to %s/%s', async (message, agent, task) => {
      await CoreAgent.processStreaming(message, [], onChunk, onComplete, onError, onStatusChange);

      expect(executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: [expect.objectContaining({ agent, task })],
        }),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(Array),
        onChunk,
        expect.any(Function),
        onError,
        onStatusChange
      );
    });
  });

  // ============================================================
  // Fast Route Matching - Workers & Schedule
  // ============================================================
  describe('fast route: workers and schedule', () => {
    it.each([
      ['show my workers', 'WorkersSchedulingAgent', 'query_workers'],
      ['list workers', 'WorkersSchedulingAgent', 'query_workers'],
      ['my crew', 'WorkersSchedulingAgent', 'query_workers'],
      ['add a worker', 'WorkersSchedulingAgent', 'manage_worker'],
      ['who is working today', 'WorkersSchedulingAgent', 'track_time'],
      ['clock in', 'WorkersSchedulingAgent', 'track_time'],
      ['show my schedule', 'WorkersSchedulingAgent', 'retrieve_schedule_events'],
      ['check schedule', 'WorkersSchedulingAgent', 'retrieve_schedule_events'],
    ])('should route "%s" to %s/%s', async (message, agent, task) => {
      await CoreAgent.processStreaming(message, [], onChunk, onComplete, onError, onStatusChange);

      expect(executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: [expect.objectContaining({ agent, task })],
        }),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(Array),
        onChunk,
        expect.any(Function),
        onError,
        onStatusChange
      );
    });
  });

  // ============================================================
  // Fast Route Matching - Financial
  // ============================================================
  describe('fast route: financial', () => {
    it.each([
      ['record an expense', 'FinancialAgent', 'record_transaction'],
      ['log a payment', 'FinancialAgent', 'record_transaction'],
      ['how much income this month', 'FinancialAgent', 'analyze_financials'],
      ['show expenses', 'FinancialAgent', 'query_transactions'],
      ["what's my profit", 'FinancialAgent', 'analyze_financials'],
    ])('should route "%s" to %s/%s', async (message, agent, task) => {
      await CoreAgent.processStreaming(message, [], onChunk, onComplete, onError, onStatusChange);

      expect(executePlan).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: [expect.objectContaining({ agent, task })],
        }),
        expect.any(String),
        expect.any(Object),
        expect.any(Object),
        expect.any(Array),
        onChunk,
        expect.any(Function),
        onError,
        onStatusChange
      );
    });
  });

  // ============================================================
  // Fast Route Matching - Fallthrough to AI planning
  // ============================================================
  describe('fallthrough to AI planning', () => {
    it('should use LLM planning for ambiguous messages', async () => {
      const { sendPlanningRequest } = require('../../src/services/aiService');
      sendPlanningRequest.mockResolvedValueOnce({
        plan: [{ agent: 'DocumentAgent', task: 'answer_general_question', user_input: 'FULL_MESSAGE' }],
      });

      await CoreAgent.processStreaming(
        'I need some help figuring out what to do next with the renovation',
        [],
        onChunk,
        onComplete,
        onError,
        onStatusChange
      );

      // Should have called LLM planning since no fast route matches
      expect(sendPlanningRequest).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Supervisor Access Control
  // ============================================================
  describe('supervisor restrictions', () => {
    beforeEach(() => {
      getCurrentUserContext.mockResolvedValue({ role: 'supervisor' });
    });

    it('should block supervisor from creating projects', async () => {
      await CoreAgent.processStreaming('create a new project', [], onChunk, onComplete, onError, onStatusChange);

      // Should NOT call executePlan - should return blocking response directly
      expect(executePlan).not.toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('supervisor'),
        })
      );
    });

    it('should block supervisor from creating estimates', async () => {
      await CoreAgent.processStreaming('create an estimate', [], onChunk, onComplete, onError, onStatusChange);

      expect(executePlan).not.toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining('supervisor'),
        })
      );
    });

    it('should allow supervisor to view workers', async () => {
      await CoreAgent.processStreaming('show my workers', [], onChunk, onComplete, onError, onStatusChange);

      // WorkersSchedulingAgent is not restricted - executePlan should be called
      expect(executePlan).toHaveBeenCalled();
    });

    it('should allow supervisor to check schedule', async () => {
      await CoreAgent.processStreaming('show my schedule', [], onChunk, onComplete, onError, onStatusChange);

      expect(executePlan).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Conversation State Management
  // ============================================================
  describe('conversation state', () => {
    it('should update conversation state', () => {
      CoreAgent.updateConversationState({ activeAgent: 'ProjectAgent', activeTask: 'create' });

      expect(CoreAgent.conversationState.activeAgent).toBe('ProjectAgent');
      expect(CoreAgent.conversationState.activeTask).toBe('create');
      expect(CoreAgent.conversationState.lastUpdated).toBeDefined();
    });

    it('should merge state updates without losing existing data', () => {
      CoreAgent.updateConversationState({ activeAgent: 'ProjectAgent' });
      CoreAgent.updateConversationState({ activeTask: 'create' });

      expect(CoreAgent.conversationState.activeAgent).toBe('ProjectAgent');
      expect(CoreAgent.conversationState.activeTask).toBe('create');
    });
  });

  // ============================================================
  // Short message bypass
  // ============================================================
  describe('short message handling', () => {
    it('should not fast-route very short confirmations (< 5 chars)', async () => {
      const { sendPlanningRequest } = require('../../src/services/aiService');
      sendPlanningRequest.mockResolvedValueOnce({
        plan: [{ agent: 'DocumentAgent', task: 'answer_general_question', user_input: 'FULL_MESSAGE' }],
      });

      // "yes" is < 5 chars and matches the confirmation pattern
      // so fastRouteMessage returns null, triggering LLM planning
      await CoreAgent.processStreaming('yes', [], onChunk, onComplete, onError, onStatusChange);

      expect(sendPlanningRequest).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Agent-specific context fetch
  // ============================================================
  describe('context fetching', () => {
    it('should fetch agent-specific context for fast routes', async () => {
      await CoreAgent.processStreaming('show my projects', [], onChunk, onComplete, onError, onStatusChange);

      // Fast route should trigger fetchAgentSpecificContext for the matched agent
      expect(fetchAgentSpecificContext).toHaveBeenCalledWith('DocumentAgent');
    });
  });
});
