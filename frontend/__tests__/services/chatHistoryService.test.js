/**
 * chatHistoryService Tests
 * Tests for CRUD operations on chat sessions and messages,
 * including auth header construction and error handling.
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
    },
  },
}));

// Mock sendMessageToAI (used by generateAITitle)
jest.mock('../../src/services/aiService', () => ({
  sendMessageToAI: jest.fn(),
}));

// Mock fetch globally
global.fetch = jest.fn();

// Import after mocks
import { chatHistoryService } from '../../src/services/chatHistoryService';
import { sendMessageToAI } from '../../src/services/aiService';
import { supabase } from '../../src/lib/supabase';

// Get reference to mock function
const mockGetSession = supabase.auth.getSession;

describe('chatHistoryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: authenticated session
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
      error: null,
    });
  });

  // ============================================================
  // getSessions
  // ============================================================
  describe('getSessions', () => {
    it('should fetch sessions with auth header', async () => {
      const sessions = [{ id: 's1', title: 'Chat 1' }, { id: 's2', title: 'Chat 2' }];
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions }),
      });

      const result = await chatHistoryService.getSessions();

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/sessions'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
      expect(result).toEqual(sessions);
    });

    it('should throw on HTTP error', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 401 });

      await expect(chatHistoryService.getSessions()).rejects.toThrow('Failed to fetch sessions: 401');
    });

    it('should work without auth token', async () => {
      mockGetSession.mockResolvedValue({ data: { session: null }, error: null });

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessions: [] }),
      });

      const result = await chatHistoryService.getSessions();

      // Should still make request but without Authorization header
      const headers = fetch.mock.calls[0][1].headers;
      expect(headers).not.toHaveProperty('Authorization');
      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // getSessionMessages
  // ============================================================
  describe('getSessionMessages', () => {
    it('should fetch messages for a specific session', async () => {
      const messages = [
        { id: 'm1', role: 'user', content: 'Hello' },
        { id: 'm2', role: 'assistant', content: 'Hi there' },
      ];
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages }),
      });

      const result = await chatHistoryService.getSessionMessages('session-123');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/sessions/session-123/messages'),
        expect.objectContaining({ method: 'GET' })
      );
      expect(result).toEqual(messages);
    });

    it('should throw on HTTP error', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(chatHistoryService.getSessionMessages('bad-id')).rejects.toThrow(
        'Failed to fetch messages: 404'
      );
    });
  });

  // ============================================================
  // createSession
  // ============================================================
  describe('createSession', () => {
    it('should create session with default title', async () => {
      const newSession = { id: 'new-1', title: 'New Chat' };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session: newSession }),
      });

      const result = await chatHistoryService.createSession();

      const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(sentBody.title).toBe('New Chat');
      expect(fetch.mock.calls[0][1].method).toBe('POST');
      expect(result).toEqual(newSession);
    });

    it('should create session with custom title', async () => {
      const newSession = { id: 'new-2', title: 'Kitchen Remodel' };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session: newSession }),
      });

      const result = await chatHistoryService.createSession('Kitchen Remodel');

      const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(sentBody.title).toBe('Kitchen Remodel');
      expect(result).toEqual(newSession);
    });

    it('should throw on HTTP error', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(chatHistoryService.createSession()).rejects.toThrow('Failed to create session: 500');
    });
  });

  // ============================================================
  // saveMessage
  // ============================================================
  describe('saveMessage', () => {
    it('should save message with correct payload', async () => {
      const message = { role: 'user', content: 'How much does a roof cost?' };
      const savedMessage = { id: 'msg-1', ...message };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: savedMessage }),
      });

      const result = await chatHistoryService.saveMessage('session-1', message);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/sessions/session-1/messages'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token',
          }),
        })
      );

      const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(sentBody.role).toBe('user');
      expect(sentBody.content).toBe('How much does a roof cost?');
      expect(result).toEqual(savedMessage);
    });

    it('should throw on HTTP error', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 400 });

      await expect(
        chatHistoryService.saveMessage('session-1', { role: 'user', content: 'test' })
      ).rejects.toThrow('Failed to save message: 400');
    });
  });

  // ============================================================
  // updateSessionTitle
  // ============================================================
  describe('updateSessionTitle', () => {
    it('should update session title with PATCH', async () => {
      const updated = { id: 'session-1', title: 'Updated Title' };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ session: updated }),
      });

      const result = await chatHistoryService.updateSessionTitle('session-1', 'Updated Title');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/sessions/session-1'),
        expect.objectContaining({ method: 'PATCH' })
      );

      const sentBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(sentBody.title).toBe('Updated Title');
      expect(result).toEqual(updated);
    });

    it('should throw on HTTP error', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 403 });

      await expect(
        chatHistoryService.updateSessionTitle('session-1', 'New')
      ).rejects.toThrow('Failed to update session: 403');
    });
  });

  // ============================================================
  // deleteSession
  // ============================================================
  describe('deleteSession', () => {
    it('should delete session with correct endpoint', async () => {
      fetch.mockResolvedValueOnce({ ok: true });

      await chatHistoryService.deleteSession('session-to-delete');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/sessions/session-to-delete'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should throw on HTTP error', async () => {
      fetch.mockResolvedValueOnce({ ok: false, status: 404 });

      await expect(chatHistoryService.deleteSession('bad-id')).rejects.toThrow(
        'Failed to delete session: 404'
      );
    });

    it('should include auth header in delete request', async () => {
      fetch.mockResolvedValueOnce({ ok: true });

      await chatHistoryService.deleteSession('session-1');

      const headers = fetch.mock.calls[0][1].headers;
      expect(headers.Authorization).toBe('Bearer test-token');
    });
  });

  // ============================================================
  // generateTitle (synchronous fallback)
  // ============================================================
  describe('generateTitle', () => {
    it('should return "New Chat" for empty message', () => {
      expect(chatHistoryService.generateTitle('')).toBe('New Chat');
      expect(chatHistoryService.generateTitle(null)).toBe('New Chat');
      expect(chatHistoryService.generateTitle(undefined)).toBe('New Chat');
    });

    it('should truncate long messages at word boundary', () => {
      const longMessage = 'How much would it cost to remodel a kitchen with new cabinets and countertops?';
      const title = chatHistoryService.generateTitle(longMessage);

      expect(title.length).toBeLessThanOrEqual(54); // 50 chars + "..."
      expect(title).toContain('...');
    });

    it('should truncate short messages without word boundary', () => {
      const shortMessage = 'Hello';
      const title = chatHistoryService.generateTitle(shortMessage);
      expect(title).toBe('Hello...');
    });
  });

  // ============================================================
  // generateAITitle (async, uses AI)
  // ============================================================
  describe('generateAITitle', () => {
    it('should return "New Chat" for empty message', async () => {
      const title = await chatHistoryService.generateAITitle('');
      expect(title).toBe('New Chat');
      expect(sendMessageToAI).not.toHaveBeenCalled();
    });

    it('should call sendMessageToAI with title generation prompt', async () => {
      sendMessageToAI.mockResolvedValueOnce({ text: 'Kitchen Remodel Budget' });

      const title = await chatHistoryService.generateAITitle('How much does a kitchen remodel cost?');

      expect(sendMessageToAI).toHaveBeenCalledWith(
        'How much does a kitchen remodel cost?',
        null,
        [],
        expect.stringContaining('title generator')
      );
      expect(title).toBe('Kitchen Remodel Budget');
    });

    it('should strip quotes from AI-generated titles', async () => {
      sendMessageToAI.mockResolvedValueOnce({ text: '"Kitchen Remodel"' });

      const title = await chatHistoryService.generateAITitle('test message');
      expect(title).toBe('Kitchen Remodel');
    });

    it('should truncate titles longer than 60 chars', async () => {
      sendMessageToAI.mockResolvedValueOnce({
        text: 'A Very Long Title That Goes On And On And Exceeds Sixty Characters In Total Length',
      });

      const title = await chatHistoryService.generateAITitle('test');
      expect(title.length).toBeLessThanOrEqual(60);
      expect(title).toContain('...');
    });

    it('should fall back to substring method on AI failure', async () => {
      sendMessageToAI.mockRejectedValueOnce(new Error('API error'));

      const title = await chatHistoryService.generateAITitle('How much does a kitchen remodel cost?');

      // Should use fallback (substring truncation)
      expect(title).toContain('...');
      expect(title.length).toBeLessThanOrEqual(54);
    });

    it('should handle string response from sendMessageToAI', async () => {
      sendMessageToAI.mockResolvedValueOnce('Simple Title');

      const title = await chatHistoryService.generateAITitle('test');
      expect(title).toBe('Simple Title');
    });
  });
});
