import { sendMessageToAI } from './aiService';
import { supabase } from '../lib/supabase';
import { API_URL as BACKEND_URL } from '../config/api';

const getAuthHeaders = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

export const chatHistoryService = {
  // List all sessions
  async getSessions() {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/api/chat/sessions`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sessions: ${response.status}`);
    }

    const data = await response.json();
    return data.sessions;
  },

  // Get messages for a session
  async getSessionMessages(sessionId) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/api/chat/sessions/${sessionId}/messages`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch messages: ${response.status}`);
    }

    const data = await response.json();
    return data.messages;
  },

  // Create new session
  async createSession(title = 'New Chat') {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/api/chat/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.status}`);
    }

    const data = await response.json();
    return data.session;
  },

  // Save message
  async saveMessage(sessionId, message) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Failed to save message: ${response.status}`);
    }

    const data = await response.json();
    return data.message;
  },

  // Update session title
  async updateSessionTitle(sessionId, title) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/api/chat/sessions/${sessionId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update session: ${response.status}`);
    }

    const data = await response.json();
    return data.session;
  },

  // Delete session
  async deleteSession(sessionId) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${BACKEND_URL}/api/chat/sessions/${sessionId}`, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.status}`);
    }
  },

  // AI-powered title generation from first message
  async generateAITitle(firstMessage) {
    if (!firstMessage) return 'New Chat';

    try {
      // Call AI to generate a concise title
      const systemPrompt = `You are a title generator. Generate a concise, descriptive 3-6 word title that summarizes the user's message.
Rules:
- Use title case (capitalize important words)
- Be specific and descriptive
- No quotes, no punctuation at the end
- Examples: "Kitchen Remodel Budget", "Concrete Material Costs", "Worker Scheduling Help"

Respond with ONLY the title, nothing else.`;

      const response = await sendMessageToAI(
        firstMessage,
        null, // no project context needed
        [], // no conversation history
        systemPrompt
      );

      // Extract the title from the response (may be string or {text, visualElements, actions})
      let title = (typeof response === 'string' ? response : response?.text || '').trim();

      // Remove quotes if AI added them
      title = title.replace(/^["']|["']$/g, '');

      // Limit to 60 characters max
      if (title.length > 60) {
        title = title.substring(0, 57) + '...';
      }

      return title;

    } catch (error) {
      console.error('❌ AI title generation failed, using fallback:', error);

      // Fallback to simple substring method
      const preview = firstMessage.substring(0, 50);
      const lastSpace = preview.lastIndexOf(' ');
      return lastSpace > 0
        ? preview.substring(0, lastSpace) + '...'
        : preview + '...';
    }
  },

  // Simple fallback title generation (kept for backwards compatibility)
  generateTitle(firstMessage) {
    if (!firstMessage) return 'New Chat';

    // Take first 50 chars and truncate at word boundary
    const preview = firstMessage.substring(0, 50);
    const lastSpace = preview.lastIndexOf(' ');
    return lastSpace > 0
      ? preview.substring(0, lastSpace) + '...'
      : preview + '...';
  }
};
