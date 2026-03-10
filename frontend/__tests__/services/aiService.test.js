/**
 * aiService Tests
 * Tests for auth token retrieval, model selection, planning requests,
 * task complexity mapping, and voice mode toggling.
 */

// Mock dependencies before imports
jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      refreshSession: jest.fn(),
    },
  },
}));

// Mock fetch globally
global.fetch = jest.fn();

// Import after mocks
import {
  getTaskComplexity,
  setVoiceMode,
  getVoiceMode,
  selectModel,
  getMaxTokens,
  sendPlanningRequest,
  sendMessageToAI,
  sendAgentMessage,
  pollAgentJob,
  fetchLatestAgentJob,
} from '../../src/services/aiService';
import { supabase } from '../../src/lib/supabase';

// Get references to mock functions
const mockGetSession = supabase.auth.getSession;
const mockRefreshSession = supabase.auth.refreshSession;

describe('aiService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setVoiceMode(false); // Reset voice mode between tests

    // Default: session available
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
      error: null,
    });
    mockRefreshSession.mockResolvedValue({
      data: { session: { access_token: 'refreshed-token' } },
      error: null,
    });
  });

  // ============================================================
  // getTaskComplexity
  // ============================================================
  describe('getTaskComplexity', () => {
    it('should return "simple" for lookup tasks', () => {
      expect(getTaskComplexity('track_time')).toBe('simple');
      expect(getTaskComplexity('query_workers')).toBe('simple');
      expect(getTaskComplexity('view_reports')).toBe('simple');
      expect(getTaskComplexity('query_project')).toBe('simple');
      expect(getTaskComplexity('query_estimates')).toBe('simple');
      expect(getTaskComplexity('query_invoices')).toBe('simple');
    });

    it('should return "medium" for moderate tasks', () => {
      expect(getTaskComplexity('assign_worker')).toBe('medium');
      expect(getTaskComplexity('manage_worker')).toBe('medium');
      expect(getTaskComplexity('record_transaction')).toBe('medium');
      expect(getTaskComplexity('update_project')).toBe('medium');
    });

    it('should return "complex" for creation/analysis tasks', () => {
      expect(getTaskComplexity('create_daily_report')).toBe('complex');
      expect(getTaskComplexity('generate_schedule')).toBe('complex');
      expect(getTaskComplexity('analyze')).toBe('complex');
      expect(getTaskComplexity('create_project')).toBe('complex');
      expect(getTaskComplexity('create_estimate')).toBe('complex');
      expect(getTaskComplexity('create_invoice')).toBe('complex');
    });

    it('should return "medium" for unknown tasks', () => {
      expect(getTaskComplexity('unknown_task')).toBe('medium');
      expect(getTaskComplexity('')).toBe('medium');
    });
  });

  // ============================================================
  // Voice mode
  // ============================================================
  describe('voice mode', () => {
    it('should default to disabled', () => {
      expect(getVoiceMode()).toBe(false);
    });

    it('should toggle voice mode on and off', () => {
      setVoiceMode(true);
      expect(getVoiceMode()).toBe(true);

      setVoiceMode(false);
      expect(getVoiceMode()).toBe(false);
    });
  });

  // ============================================================
  // selectModel
  // ============================================================
  describe('selectModel', () => {
    it('should return fast model for simple greetings', () => {
      const model = selectModel('hello');
      expect(model).toContain('haiku');
    });

    it('should return fast model for short acknowledgments', () => {
      const model = selectModel('thanks');
      expect(model).toContain('haiku');
    });

    it('should return fast model for simple list queries', () => {
      const model = selectModel('show my projects');
      expect(model).toContain('haiku');
    });

    it('should return powerful model for complex requests', () => {
      const model = selectModel('Create a detailed estimate for a kitchen remodel with cabinets, countertops, plumbing, and electrical work');
      expect(model).toContain('sonnet');
    });

    it('should always use fast model in voice mode', () => {
      setVoiceMode(true);
      const model = selectModel('Create a detailed estimate for a full house renovation project');
      expect(model).toContain('haiku');
    });
  });

  // ============================================================
  // getMaxTokens
  // ============================================================
  describe('getMaxTokens', () => {
    it('should return default tokens in normal mode', () => {
      expect(getMaxTokens()).toBe(4000);
      expect(getMaxTokens(8000)).toBe(8000);
    });

    it('should return reduced tokens in voice mode for simple tasks', () => {
      setVoiceMode(true);
      const tokens = getMaxTokens(4000, false);
      expect(tokens).toBeLessThan(4000);
    });

    it('should return full tokens in voice mode for complex tasks', () => {
      setVoiceMode(true);
      const tokens = getMaxTokens(4000, true);
      expect(tokens).toBe(4000);
    });
  });

  // ============================================================
  // getAuthToken (tested indirectly via sendPlanningRequest)
  // ============================================================
  describe('auth token retrieval', () => {
    it('should get token from session on first attempt', async () => {
      // sendPlanningRequest uses getAuthToken internally
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"plan":[]}' } }],
        }),
      });

      await sendPlanningRequest('test', 'system prompt');

      expect(mockGetSession).toHaveBeenCalled();
    });

    it('should retry and refresh when session is not available initially', async () => {
      // First 3 getSession calls return null, then refreshSession succeeds
      mockGetSession
        .mockResolvedValueOnce({ data: { session: null }, error: null })
        .mockResolvedValueOnce({ data: { session: null }, error: null })
        .mockResolvedValueOnce({ data: { session: null }, error: null });

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"plan":[]}' } }],
        }),
      });

      await sendPlanningRequest('test', 'system prompt');

      // Should have tried getSession 3 times, then refreshSession
      expect(mockGetSession).toHaveBeenCalledTimes(3);
      expect(mockRefreshSession).toHaveBeenCalled();
    });
  });

  // ============================================================
  // sendPlanningRequest
  // ============================================================
  describe('sendPlanningRequest', () => {
    it('should send planning request with correct payload', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"plan":[{"agent":"ProjectAgent","task":"create"}]}' } }],
        }),
      });

      const result = await sendPlanningRequest('create a project', 'You are a planner');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/planning'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token',
          }),
        })
      );

      // Verify payload structure
      const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(sentBody.messages).toHaveLength(2);
      expect(sentBody.messages[0].role).toBe('system');
      expect(sentBody.messages[1].role).toBe('user');
      expect(sentBody.max_tokens).toBe(1000);
      expect(sentBody.temperature).toBe(0.1);
    });

    it('should parse JSON response correctly', async () => {
      const planData = { plan: [{ agent: 'ProjectAgent', task: 'create' }] };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(planData) } }],
        }),
      });

      const result = await sendPlanningRequest('test', 'system');
      expect(result).toEqual(planData);
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const planData = { plan: [{ agent: 'DocumentAgent', task: 'answer' }] };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '```json\n' + JSON.stringify(planData) + '\n```' } }],
        }),
      });

      const result = await sendPlanningRequest('test', 'system');
      expect(result).toEqual(planData);
    });

    it('should fix trailing commas in JSON', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"plan":[{"agent":"ProjectAgent","task":"test",},]}' } }],
        }),
      });

      const result = await sendPlanningRequest('test', 'system');
      expect(result.plan[0].agent).toBe('ProjectAgent');
    });

    it('should throw on HTTP error', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Rate limit exceeded' } }),
      });

      await expect(sendPlanningRequest('test', 'system')).rejects.toThrow('Rate limit exceeded');
    });

    it('should throw when no choices in response', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      });

      await expect(sendPlanningRequest('test', 'system')).rejects.toThrow('No response from planning service');
    });
  });

  // ============================================================
  // sendMessageToAI
  // ============================================================
  describe('sendMessageToAI', () => {
    it('should send message with correct structure', async () => {
      const mockResponse = { text: 'Hello!', visualElements: [], actions: [] };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockResponse) } }],
        }),
      });

      await sendMessageToAI('hello', null, []);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
    });

    it('should include conversation history in messages', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"text":"response"}' } }],
        }),
      });

      const history = [
        { role: 'user', content: 'first message' },
        { role: 'assistant', content: 'first response' },
      ];

      await sendMessageToAI('second message', null, history);

      const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
      // system + 2 history + 1 new = 4 messages
      expect(sentBody.messages).toHaveLength(4);
      expect(sentBody.messages[0].role).toBe('system');
      expect(sentBody.messages[3].content).toBe('second message');
    });

    it('should use custom system prompt when provided', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"text":"ok"}' } }],
        }),
      });

      await sendMessageToAI('test', null, [], 'Custom agent prompt');

      const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(sentBody.messages[0].content).toBe('Custom agent prompt');
    });
  });

  // ============================================================
  // sendAgentMessage
  // ============================================================
  describe('sendAgentMessage', () => {
    it('should call onError when no auth token is available', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
      mockRefreshSession.mockResolvedValue({ data: { session: null }, error: null });

      const onError = jest.fn();
      const callbacks = { onError };

      await sendAgentMessage('user-123', [], 'hello', {}, [], callbacks);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('Not authenticated') })
      );
    });
  });

  // ============================================================
  // pollAgentJob
  // ============================================================
  describe('pollAgentJob', () => {
    it('should poll job endpoint with auth header', async () => {
      const jobData = { jobId: 'job-1', status: 'completed', accumulatedText: 'Done' };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => jobData,
      });

      const result = await pollAgentJob('job-1');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/agent/job-1'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
      expect(result).toEqual(jobData);
    });

    it('should throw on HTTP error', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(pollAgentJob('bad-id')).rejects.toThrow('Failed to poll job: 404');
    });

    it('should throw when not authenticated', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
      mockRefreshSession.mockResolvedValue({ data: { session: null }, error: null });

      await expect(pollAgentJob('job-1')).rejects.toThrow('Not authenticated');
    });
  });

  // ============================================================
  // fetchLatestAgentJob
  // ============================================================
  describe('fetchLatestAgentJob', () => {
    it('should fetch latest job', async () => {
      const jobData = { job: { jobId: 'job-latest', status: 'processing' } };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => jobData,
      });

      const result = await fetchLatestAgentJob();

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/agent-latest'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(jobData.job);
    });

    it('should return null when not authenticated', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
      mockRefreshSession.mockResolvedValue({ data: { session: null }, error: null });

      const result = await fetchLatestAgentJob();
      expect(result).toBeNull();
    });

    it('should return null on HTTP error', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await fetchLatestAgentJob();
      expect(result).toBeNull();
    });
  });
});
