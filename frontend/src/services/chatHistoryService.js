import { EXPO_PUBLIC_BACKEND_URL } from '@env';
import { getCurrentUserId } from '../utils/storage';
import { sendMessageToAI } from './aiService';

const BACKEND_URL = EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

export const chatHistoryService = {
  // List all sessions
  async getSessions() {
    const userId = await getCurrentUserId();
    const response = await fetch(`${BACKEND_URL}/api/chat/sessions?userId=${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch sessions: ${response.status}`);
    }

    const data = await response.json();
    return data.sessions;
  },

  // Get messages for a session
  async getSessionMessages(sessionId) {
    const userId = await getCurrentUserId();
    const response = await fetch(`${BACKEND_URL}/api/chat/sessions/${sessionId}/messages?userId=${userId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch messages: ${response.status}`);
    }

    const data = await response.json();
    return data.messages;
  },

  // Create new session
  async createSession(title = 'New Chat') {
    const userId = await getCurrentUserId();
    const response = await fetch(`${BACKEND_URL}/api/chat/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, title }),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.status}`);
    }

    const data = await response.json();
    return data.session;
  },

  // Save message
  async saveMessage(sessionId, message) {
    const userId = await getCurrentUserId();
    const response = await fetch(`${BACKEND_URL}/api/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, ...message }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save message: ${response.status}`);
    }

    const data = await response.json();
    return data.message;
  },

  // Update session title
  async updateSessionTitle(sessionId, title) {
    const userId = await getCurrentUserId();
    const response = await fetch(`${BACKEND_URL}/api/chat/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId, title }),
    });

    if (!response.ok) {
      throw new Error(`Failed to update session: ${response.status}`);
    }

    const data = await response.json();
    return data.session;
  },

  // Delete session
  async deleteSession(sessionId) {
    const userId = await getCurrentUserId();
    const response = await fetch(`${BACKEND_URL}/api/chat/sessions/${sessionId}?userId=${userId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.status}`);
    }
  },

  // AI-powered title generation from first message
  async generateAITitle(firstMessage) {
    if (!firstMessage) return 'New Chat';

    try {
      console.log('🤖 Generating AI title for:', firstMessage.substring(0, 100));

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

      // Extract the title from the response
      let title = response.trim();

      // Remove quotes if AI added them
      title = title.replace(/^["']|["']$/g, '');

      // Limit to 60 characters max
      if (title.length > 60) {
        title = title.substring(0, 57) + '...';
      }

      console.log('✅ AI-generated title:', title);
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
