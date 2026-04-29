// Legacy prompt archived - now using multi-agent system via CoreAgent
import logger from '../utils/logger';
import { supabase } from '../lib/supabase';
import { API_URL as BACKEND_URL } from '../config/api';

// File types that the vision API (GPT-4o) can actually process
const VISION_SUPPORTED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp'
]);

/**
 * Get the current Supabase auth token for authenticated API calls.
 * Retries if session isn't loaded yet (race condition with AsyncStorage).
 */
const getAuthToken = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    // Session not loaded yet — wait and retry
    if (i < retries - 1) {
      logger.debug(`🔑 [Auth] No session on attempt ${i + 1}, retrying in ${(i + 1) * 200}ms...`);
      await new Promise(r => setTimeout(r, (i + 1) * 200));
    }
  }
  // Final fallback: try refreshing the session explicitly
  try {
    const { data: { session } } = await supabase.auth.refreshSession();
    if (session?.access_token) {
      logger.debug('🔑 [Auth] Got token after explicit refresh');
      return session.access_token;
    }
  } catch (e) {
    logger.warn('🔑 [Auth] refreshSession failed:', e.message);
  }
  logger.warn('🔑 [Auth] Could not obtain auth token after retries');
  return null;
};

/**
 * DEPRECATED: Legacy single-agent prompt function
 * This is kept for backward compatibility but is no longer used in production.
 * The app now uses CoreAgent with specialized agent prompts.
 */
const getSystemPrompt = (projectContext) => {
  logger.warn('⚠️ Using deprecated legacy prompt. Consider migrating to CoreAgent.');
  return `You are Foreman, your AI construction assistant.
Respond with valid JSON: {"text":"...","visualElements":[],"actions":[]}

Current Context:
${JSON.stringify(projectContext, null, 2)}`;
};

// Response cache for instant repeat queries (5 minute TTL)
const responseCache = {};
const CACHE_TTL = 300000; // 5 minutes (common queries like "updates" don't change often)

/**
 * SMART MODEL ROUTING
 * Use faster/cheaper models for simple queries, powerful models for complex tasks
 *
 * Speed comparison (first token latency):
 * - claude-3-5-haiku: ~200-400ms ⚡⚡⚡
 * - gpt-4o-mini: ~200-300ms ⚡⚡⚡
 * - claude-3-5-sonnet: ~500-1000ms ⚡⚡
 * - gpt-4o: ~400-600ms ⚡⚡
 */
const FAST_MODEL = 'anthropic/claude-haiku-4.5'; // Haiku 4.5 for simple queries
const POWERFUL_MODEL = 'anthropic/claude-sonnet-4.5'; // Sonnet 4.5 for complex tasks (matches backend modelRouter)

/**
 * TASK COMPLEXITY MAPPING
 * Maps agent tasks to complexity levels for optimal model selection.
 * - 'simple': Use Haiku (fast, cheap) - lookups, status checks
 * - 'medium': Use auto-selection - moderate reasoning needed
 * - 'complex': Use Sonnet (powerful) - creation, analysis, generation
 */
const TASK_COMPLEXITY = {
  // WorkersSchedulingAgent tasks
  'track_time': 'simple',              // Who's working, clock in/out lookups
  'query_workers': 'simple',           // List workers, worker info
  'retrieve_schedule_events': 'simple', // Show schedule today
  'assign_worker': 'medium',           // Assign worker to project
  'manage_worker': 'medium',           // Add/edit worker
  'create_daily_report': 'complex',    // Generate daily report
  'generate_schedule': 'complex',      // Create new schedule

  // FinancialAgent tasks
  'view_reports': 'simple',            // Show financial data
  'record_transaction': 'medium',      // Record expense/income
  'analyze': 'complex',                // Financial analysis

  // ProjectAgent tasks
  'query_project': 'simple',           // Project info lookup
  'create_project': 'complex',         // Create new project
  'update_project': 'medium',          // Update project

  // EstimateInvoiceAgent tasks
  'create_estimate': 'complex',        // Needs reasoning for pricing
  'create_invoice': 'complex',         // Needs calculations
  'query_estimates': 'simple',         // Lookup
  'query_invoices': 'simple',          // Lookup

  // Default for unknown tasks
  'default': 'medium'
};

/**
 * Get the complexity level for a given task
 * @param {string} task - The task identifier
 * @returns {string} - 'simple' | 'medium' | 'complex'
 */
export function getTaskComplexity(task) {
  return TASK_COMPLEXITY[task] || TASK_COMPLEXITY['default'];
}

/**
 * Get model identifier by friendly name
 * @param {string} name - Model name: 'haiku' | 'sonnet' | 'groq' | 'groq-small'
 * @returns {string} - Full model identifier
 */
function getModelByName(name) {
  const models = {
    'haiku': 'anthropic/claude-haiku-4.5',
    'sonnet': 'anthropic/claude-sonnet-4.5',
    'groq': 'groq/llama-3.3-70b-versatile',
    'groq-small': 'groq/llama-3.1-8b-instant'
  };
  return models[name] || FAST_MODEL;
}

/**
 * VOICE MODE OPTIMIZATION
 * When isVoiceMode is true, we use:
 * 1. Faster model (Haiku)
 * 2. Lower max_tokens (shorter responses)
 * 3. Condensed system prompts
 */
let isVoiceMode = false;

export const setVoiceMode = (enabled) => {
  isVoiceMode = enabled;
  logger.debug(isVoiceMode ? '🎤 Voice mode ENABLED - using fast settings' : '⌨️ Voice mode DISABLED - using standard settings');
};

export const getVoiceMode = () => isVoiceMode;

/**
 * Determines if a query is simple and can use a faster model
 * @param {string} message - User's message
 * @param {string} customSystemPrompt - Custom system prompt (indicates agent routing)
 * @returns {boolean} - True if simple query
 */
const isSimpleQuery = (message, customSystemPrompt = null) => {
  // If using custom system prompt (multi-agent), let the agent decide complexity
  // But still use fast model for obvious simple responses
  const trimmed = message.trim().toLowerCase();

  // Very short confirmations/acknowledgments - always fast
  const simplePatterns = /^(thanks|thank you|ok|okay|yes|no|hello|hi|hey|cancel|nevermind|nope|yep|sure|cool|great|got it|alright|sounds good|perfect|nice|awesome|good|fine|bye|goodbye|see ya|later|k|thx|ty|np|no problem|you're welcome|welcome|what's up|how are you|good morning|good afternoon|good evening|morning|afternoon|evening)$/i;

  if (simplePatterns.test(trimmed)) {
    return true;
  }

  // Very short messages (< 20 chars) that are questions or simple requests
  if (trimmed.length < 20 && !customSystemPrompt) {
    return true;
  }

  // Simple status/list queries
  const simpleQueries = /^(show|list|get|what('s| is| are)?|how many|any)\s+(my\s+)?(projects?|estimates?|invoices?|workers?|updates?|tasks?|schedule)/i;
  if (simpleQueries.test(trimmed)) {
    return true;
  }

  return false;
};

/**
 * Selects the appropriate model based on query complexity and voice mode
 * @param {string} message - User's message
 * @param {string} customSystemPrompt - Custom system prompt
 * @returns {string} - Model identifier
 */
export const selectModel = (message, customSystemPrompt = null) => {
  // Voice mode always uses fast model for snappy responses
  if (isVoiceMode) {
    logger.debug('🎤⚡ Using FAST model (Haiku) for voice mode');
    return FAST_MODEL;
  }

  if (isSimpleQuery(message, customSystemPrompt)) {
    logger.debug('⚡ Using FAST model (Haiku) for simple query');
    return FAST_MODEL;
  }
  logger.debug('🧠 Using POWERFUL model (Sonnet) for complex query');
  return POWERFUL_MODEL;
};

/**
 * Gets optimized max_tokens based on mode and task complexity
 * Voice mode uses fewer tokens for simple queries, but complex tasks need more
 * @param {number} defaultTokens - Default token limit
 * @param {boolean} isComplexTask - Whether this is a complex agent task (project creation, estimates, etc.)
 */
export const getMaxTokens = (defaultTokens = 4000, isComplexTask = false) => {
  if (isVoiceMode) {
    // Complex tasks (project creation, estimates) need full tokens even in voice mode
    // because they return large visualElements like project-preview
    if (isComplexTask) {
      return 4000; // Full tokens for complex tasks
    }
    return 2500; // Increased from 1500 - agents need more room for proper JSON responses
  }
  return defaultTokens;
};

/**
 * ⚡ FAST PLANNING REQUEST
 * Uses Groq (or fast OpenRouter fallback) for ultra-fast agent routing.
 * This is specifically optimized for the CoreAgent's plan generation.
 *
 * @param {string} message - The planning prompt
 * @param {string} systemPrompt - System prompt for planning
 * @returns {Promise<object>} - The AI response
 */
export const sendPlanningRequest = async (message, systemPrompt) => {
  try {
    logger.debug('⚡ Sending fast planning request...');
    const startTime = Date.now();

    const messages = [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: message,
      },
    ];

    const token = await getAuthToken();
    const response = await fetch(`${BACKEND_URL}/api/chat/planning`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        messages,
        max_tokens: 1000, // Plans are small
        temperature: 0.1, // Low temperature for consistent routing
      }),
    });

    const latency = Date.now() - startTime;

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Planning request failed');
    }

    const data = await response.json();
    logger.debug(`⚡ Planning response received in ${latency}ms`);

    if (data.choices && data.choices[0]) {
      let content = data.choices[0].message.content;

      // Clean up response
      content = content.trim();
      if (content.startsWith('```json')) {
        content = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      } else if (content.startsWith('```')) {
        content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      // Fix common JSON issues (trailing commas from AI responses)
      const cleanJson = (str) => str
        .replace(/,\s*]/g, ']')   // Remove trailing commas in arrays
        .replace(/,\s*}/g, '}');  // Remove trailing commas in objects

      try {
        return JSON.parse(cleanJson(content));
      } catch (parseError) {
        // Try to extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(cleanJson(jsonMatch[0]));
        }
        // Also try array match
        const arrayMatch = content.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          return JSON.parse(cleanJson(arrayMatch[0]));
        }
        logger.warn('⚠️ Planning response was not valid JSON:', content.substring(0, 200));
        return content;
      }
    }

    throw new Error('No response from planning service');
  } catch (error) {
    logger.error('⚡ Planning request error:', error);
    throw error;
  }
};

/**
 * Sends a message to the AI with conversation history and project context
 * @param {string} message - User's message
 * @param {object} projectContext - Current app data (projects, workers, stats)
 * @param {array} conversationHistory - Previous messages in the conversation
 * @param {string} customSystemPrompt - Optional custom system prompt (for multi-agent orchestration)
 * @returns {Promise<object>} - Structured AI response with text, visualElements, actions
 */
export const sendMessageToAI = async (message, projectContext, conversationHistory = [], customSystemPrompt = null) => {
  try {
    logger.debug('Calling AI with context:', {
      messageLength: message.length,
      hasContext: !!projectContext,
      historyLength: conversationHistory.length,
    });

    // Light diagnostic logging (no JSON.stringify for performance)
    logger.debug('📊 AI Context: Projects:', projectContext?.projects?.length || 0);

    // Build messages array with system prompt, history, and new message
    const systemPromptContent = customSystemPrompt || getSystemPrompt(projectContext);

    const messages = [
      {
        role: 'system',
        content: systemPromptContent,
      },
      ...conversationHistory,
      {
        role: 'user',
        content: message,
      },
    ];

    const token = await getAuthToken();
    const response = await fetch(`${BACKEND_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: selectModel(message, customSystemPrompt), // Smart model routing: Haiku for simple, Sonnet for complex
        messages: messages,
        max_tokens: 4000, // Sufficient for detailed templates
        temperature: 0.3, // Lower temp = more reliable JSON formatting
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'AI request failed');
    }

    const data = await response.json();

    if (data.choices && data.choices[0]) {
      // Check why the response stopped
      const finishReason = data.choices[0].finish_reason;
      if (finishReason === 'length') {
        logger.warn('⚠️ AI response was cut off due to max_tokens limit. Increasing tokens...');
      } else if (finishReason !== 'stop') {
        logger.warn('⚠️ AI response finished with reason:', finishReason);
      }

      let content = data.choices[0].message.content;

      // Check for empty content before processing
      if (!content || content.trim() === '') {
        logger.error('❌ AI returned empty content');
        logger.error('📋 Full API response:', JSON.stringify(data, null, 2));
        throw new Error('AI returned empty content');
      }

      // Clean up common JSON formatting issues from AI
      content = content.trim();

      // Remove markdown code blocks if AI wrapped it
      if (content.startsWith('```json')) {
        content = content.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      } else if (content.startsWith('```')) {
        content = content.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      // Try to parse as JSON, with robust error handling
      try {
        // If content seems truncated (doesn't end with }), try to fix it
        if (!content.endsWith('}') && !content.endsWith(']}')) {
          logger.warn('⚠️ Content appears truncated, attempting to fix...');

          // Count opening and closing braces
          const openBraces = (content.match(/\{/g) || []).length;
          const closeBraces = (content.match(/\}/g) || []).length;

          // Add missing closing braces
          if (openBraces > closeBraces) {
            content += '}'.repeat(openBraces - closeBraces);
          }

          // Remove trailing commas that might be invalid
          content = content.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        }

        const parsed = JSON.parse(content);

        // For custom system prompts (like template generation), return as-is
        if (customSystemPrompt) {
          return parsed;
        }

        // For default prompts, validate required fields
        if (!parsed.text || !Array.isArray(parsed.visualElements)) {
          throw new Error('Missing required fields in AI response');
        }

        logger.debug('🤖 AI Response: visualElements:', parsed.visualElements?.length || 0);
        return parsed;
      } catch (parseError) {
        logger.warn('AI response was not valid JSON:', parseError.message);
        logger.warn('Raw content:', content.substring(0, 200)); // Show first 200 chars for debugging

        // If using custom system prompt, just return the raw content
        if (customSystemPrompt) {
          return content; // Let the caller handle it
        }

        // Fallback: wrap as plain text response
        return {
          text: content.substring(0, 500), // Limit text length
          visualElements: [],
          actions: [],
        };
      }
    }

    throw new Error('No response from AI');
  } catch (error) {
    logger.error('AI Service Error:', error);
    throw error;
  }
};

/**
 * Sends a message to the AI with TRUE STREAMING via relay server
 * This provides real-time word-by-word responses with minimal latency
 * @param {string} message - User's message
 * @param {object} projectContext - Current app data (projects, workers, stats)
 * @param {array} conversationHistory - Previous messages in the conversation
 * @param {function} onChunk - Callback for each text chunk: (accumulatedText) => void
 * @param {function} onComplete - Callback when done: (parsedResponse) => void
 * @param {function} onError - Callback on error: (error) => void
 * @returns {Promise<void>}
 */
export const sendMessageToAIStreaming = async (
  message,
  projectContext,
  conversationHistory = [],
  onChunk,
  onComplete,
  onError,
  customSystemPrompt = null, // Optional: For multi-agent system
  options = {} // Optional: { forceModel, taskComplexity }
) => {
  const { forceModel = null, taskComplexity = 'auto' } = options;
  const startTime = Date.now();
  let firstTokenTime = null;

  try {
    // Check cache for instant responses (common queries like "updates", "income")
    const cacheKey = `${message.toLowerCase().trim()}-${projectContext.projects?.length || 0}`;
    const cached = responseCache[cacheKey];

    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      logger.debug('⚡ Cache hit - instant response');
      onChunk?.(cached.response.text);
      onComplete?.(cached.response);
      return;
    }

    // Model selection with task complexity override
    let selectedModel;
    if (forceModel) {
      selectedModel = getModelByName(forceModel);
      logger.debug(`⚡ [AI] Forced model: ${selectedModel}`);
    } else if (taskComplexity === 'simple') {
      selectedModel = FAST_MODEL;
      logger.debug(`⚡ [AI] Using FAST model (Haiku) for simple task`);
    } else if (taskComplexity === 'complex') {
      selectedModel = POWERFUL_MODEL;
      logger.debug(`🧠 [AI] Using POWERFUL model (Sonnet) for complex task`);
    } else {
      selectedModel = selectModel(message, customSystemPrompt);
    }

    logger.debug(`⚡ [AI] Model: ${selectedModel} (complexity: ${taskComplexity})`);

    // Build messages array with system prompt, history, and new message
    // OPTIMIZATION: Enable prompt caching to reduce latency + costs by 75%
    const systemPromptContent = customSystemPrompt || getSystemPrompt(projectContext);

    const messages = [
      {
        role: 'system',
        content: systemPromptContent,
        cache_control: { type: 'ephemeral' }, // Cache system prompt for 5 min
      },
      ...conversationHistory,
      {
        role: 'user',
        content: message,
      },
    ];

    // DEBUG: Log request details
    logger.debug(`🔍 [AI] BACKEND_URL: ${BACKEND_URL}`);
    logger.debug(`🔍 [AI] System prompt length: ${systemPromptContent?.length || 0} chars`);
    logger.debug(`🔍 [AI] Messages count: ${messages.length}`);
    logger.debug(`🔍 [AI] Sending request to: ${BACKEND_URL}/api/chat/stream`);

    // Route through backend for security (API key stays on server)
    const token = await getAuthToken();
    const response = await fetch(`${BACKEND_URL}/api/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: selectedModel, // Task-based model selection (set above)
        messages,
        // Complex tasks (custom prompts from agents) need full tokens even in voice mode
        // because they return large visualElements like project-preview
        max_tokens: getMaxTokens(4000, !!customSystemPrompt),
        temperature: 0.3,
      }),
    });

    logger.debug(`🔍 [AI] Response received! Status: ${response.status}`);

    if (!response.ok) {
      throw new Error(`Relay server error: ${response.status}`);
    }

    logger.debug('⚡ Connected to relay, receiving stream...');

    // TRUE STREAMING: Read chunks as they arrive in real-time
    const reader = response.body?.getReader();

    if (!reader) {
      // Fallback: React Native doesn't support streaming
      // Download full response then simulate word-by-word typing
      const fullText = await response.text();
      const lines = fullText.split('\n');
      let accumulatedJSON = '';

      // Collect all chunks first
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              // Track first token time (in fallback mode this is when first chunk is processed)
              if (!firstTokenTime) {
                firstTokenTime = Date.now();
                logger.debug(`⚡ [AI] First token (fallback): ${firstTokenTime - startTime}ms`);
              }
              accumulatedJSON += content;
            }
          } catch (parseError) {
            // Skip malformed chunks
          }
        }
      }

      // Log the raw accumulated response for debugging
      logger.debug('🔍 [aiService] Raw accumulated JSON (first 500 chars):', accumulatedJSON.substring(0, 500));

      // ROBUST JSON CLEANUP - handle all AI formatting mistakes
      let cleanJSON = accumulatedJSON.trim();

      // Remove markdown code blocks
      cleanJSON = cleanJSON.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '');

      // Find the first { and last } - extract only the JSON part
      const firstBrace = cleanJSON.indexOf('{');
      let lastBrace = cleanJSON.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleanJSON = cleanJSON.substring(firstBrace, lastBrace + 1);
      }

      // Fix literal newlines and tabs in ALL string values (not just "text" field)
      // Replace literal newlines/tabs with escaped versions
      cleanJSON = cleanJSON.replace(/"([^"]+)":\s*"([^"]*(?:\n|\r|\t)[^"]*)*"/g, (match, key, value) => {
        // Safety check for undefined value
        if (value === undefined) {
          return `"${key}": ""`;
        }
        const escaped = value
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t');
        return `"${key}": "${escaped}"`;
      });

      // Remove duplicate closing braces (count and remove extras)
      const openCount = (cleanJSON.match(/\{/g) || []).length;
      const closeCount = (cleanJSON.match(/\}/g) || []).length;

      if (closeCount > openCount) {
        const extraBraces = closeCount - openCount;
        for (let i = 0; i < extraBraces; i++) {
          const lastCloseBrace = cleanJSON.lastIndexOf('}');
          if (lastCloseBrace !== -1) {
            cleanJSON = cleanJSON.substring(0, lastCloseBrace) + cleanJSON.substring(lastCloseBrace + 1);
          }
        }
      } else if (openCount > closeCount) {
        // Add missing closing braces
        const missingBraces = openCount - closeCount;
        cleanJSON += '}'.repeat(missingBraces);
      }

      // Remove trailing commas (invalid JSON)
      cleanJSON = cleanJSON.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

      // Parse and validate the complete response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(cleanJSON);

        // Validate and normalize the response structure
        if (typeof parsedResponse !== 'object' || parsedResponse === null) {
          throw new Error('Response is not an object');
        }

        // IMPORTANT: If using a custom system prompt (multi-agent system),
        // DO NOT normalize the structure - let the agent handle its own format
        if (customSystemPrompt) {
          // Just validate it's valid JSON and return as-is
          logger.debug('✅ [aiService] Custom prompt mode - returning raw parsed response');
        } else {
          // Legacy mode: Ensure all required fields exist with correct types
          parsedResponse = {
            text: typeof parsedResponse.text === 'string' ? parsedResponse.text : 'Unable to process response',
            visualElements: Array.isArray(parsedResponse.visualElements) ? parsedResponse.visualElements : [],
            actions: Array.isArray(parsedResponse.actions) ? parsedResponse.actions : [],
          };

          // Validate we have at least some text
          if (!parsedResponse.text || parsedResponse.text.length === 0) {
            throw new Error('Empty text response');
          }

          // IMPORTANT: Log if visualElements are missing (helps debug AI prompt issues)
          if (parsedResponse.visualElements.length === 0) {
            logger.warn('⚠️ AI returned no visualElements. Check if prompt example matches query type.');
          }

          if (parsedResponse.visualElements.length > 0) {
            logger.debug('✅ Parsed visualElements:', parsedResponse.visualElements.map(v => v.type));
          }
        }

      } catch (parseError) {
        logger.warn('❌ JSON parse failed:', parseError.message);
        logger.warn('Attempted to parse:', cleanJSON.substring(0, 300));

        // Fallback: Try to extract text field manually
        const textMatch = cleanJSON.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const extractedText = textMatch ? textMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : cleanJSON;

        parsedResponse = {
          text: extractedText.substring(0, 500) || 'Unable to process response',
          visualElements: [],
          actions: [],
        };

        logger.warn('⚠️ Using fallback - visualElements will be empty');
      }

      // Show text immediately - no animation delay
      // (Speed is more important than aesthetics for contractors)
      // Call onChunk with the text for UI display
      if (parsedResponse.text) {
        onChunk?.(parsedResponse.text);
      }

      // Cache the response for instant repeat queries
      responseCache[cacheKey] = {
        response: parsedResponse,
        timestamp: Date.now()
      };

      logger.debug('💾 Cached response for key:', cacheKey);

      // Performance logging
      const endTime = Date.now();
      logger.debug(`⚡ [AI] Total time (fallback path): ${endTime - startTime}ms`);

      // Send final complete response with visual elements immediately
      onComplete?.(parsedResponse);
      return;
    }

    // TRUE STREAMING PATH: Process chunks as they arrive
    const decoder = new TextDecoder();
    let accumulatedText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode chunk
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines from buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') break;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;

            if (content) {
              // Track first token time
              if (!firstTokenTime) {
                firstTokenTime = Date.now();
                logger.debug(`⚡ [AI] First token: ${firstTokenTime - startTime}ms`);
              }

              accumulatedText += content;

              // Extract clean text from JSON as it streams (for all agents)
              const textMatch = accumulatedText.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
              if (textMatch && textMatch[1]) {
                const cleanText = textMatch[1]
                  .replace(/\\"/g, '"')
                  .replace(/\\n/g, '\n')
                  .replace(/\\t/g, '\t')
                  .replace(/\\\\/g, '\\');

                // Send to UI IMMEDIATELY (no artificial delays)
                onChunk?.(cleanText);
              }
            }
          } catch (parseError) {
            // Skip malformed chunks
          }
        }
      }
    }

    // Parse final JSON response with robust cleanup
    let finalText = (accumulatedText || '').trim();

    // Safety check
    if (!finalText) {
      logger.warn('⚠️ No accumulated text to parse');
      onComplete?.({
        text: 'Unable to process response',
        visualElements: [],
        actions: [],
      });
      return;
    }

    // Remove markdown code blocks
    finalText = finalText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/g, '');

    // Apply same cleanup as fallback path
    const firstBrace = finalText.indexOf('{');
    const lastBrace = finalText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      finalText = finalText.substring(firstBrace, lastBrace + 1);
    }

    // Fix literal newlines/tabs in string values
    finalText = finalText.replace(/"([^"]+)":\s*"([^"]*(?:\n|\r|\t)[^"]*)*"/g, (match, key, value) => {
      // Safety check for undefined value
      if (value === undefined) {
        return `"${key}": ""`;
      }
      const escaped = value
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
      return `"${key}": "${escaped}"`;
    });

    // Balance braces
    const openCount = (finalText.match(/\{/g) || []).length;
    const closeCount = (finalText.match(/\}/g) || []).length;
    if (closeCount > openCount) {
      const extraBraces = closeCount - openCount;
      for (let i = 0; i < extraBraces; i++) {
        const lastCloseBrace = finalText.lastIndexOf('}');
        if (lastCloseBrace !== -1) {
          finalText = finalText.substring(0, lastCloseBrace) + finalText.substring(lastCloseBrace + 1);
        }
      }
    } else if (openCount > closeCount) {
      finalText += '}'.repeat(openCount - closeCount);
    }

    // Remove trailing commas
    finalText = finalText.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');

    try {
      const parsed = JSON.parse(finalText);

      let validatedResponse;

      // IMPORTANT: If using custom system prompt (multi-agent), still ensure required arrays exist
      if (customSystemPrompt) {
        // Ensure required array fields exist to prevent crashes
        validatedResponse = {
          text: parsed.text || '',
          visualElements: Array.isArray(parsed.visualElements) ? parsed.visualElements : [],
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        };
        logger.debug('✅ [aiService] Custom prompt mode - returning raw parsed response');
      } else {
        // Validate and normalize structure for legacy mode
        validatedResponse = {
          text: typeof parsed.text === 'string' ? parsed.text : 'Unable to process response',
          visualElements: Array.isArray(parsed.visualElements) ? parsed.visualElements : [],
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
        };

        if (!validatedResponse.text || validatedResponse.text.length === 0) {
          throw new Error('Empty text response');
        }

        // IMPORTANT: Log if visualElements are missing
        if (validatedResponse.visualElements.length === 0) {
          logger.warn('⚠️ AI returned no visualElements. Check if prompt example matches query type.');
        }

        if (validatedResponse.visualElements.length > 0) {
          logger.debug('✅ Parsed visualElements:', validatedResponse.visualElements.map(v => v.type));
        }
      }

      // Cache the validated response
      responseCache[cacheKey] = {
        response: validatedResponse,
        timestamp: Date.now()
      };

      // Performance logging
      const endTime = Date.now();
      logger.debug(`⚡ [AI] Total time (streaming): ${endTime - startTime}ms`);
      logger.debug('✅ Streaming complete');
      logger.debug('💾 Cached response for key:', cacheKey);

      onComplete?.(validatedResponse);

    } catch (parseError) {
      logger.warn('Final JSON parse failed:', parseError.message);
      logger.warn('Attempted to parse:', finalText.substring(0, 300));

      // Fallback: Extract text manually
      const textMatch = finalText.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const extractedText = textMatch ? textMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : finalText;

      const fallbackResponse = {
        text: extractedText.substring(0, 500) || 'Unable to process response',
        visualElements: [],
        actions: [],
      };

      // Cache even fallback responses
      responseCache[cacheKey] = {
        response: fallbackResponse,
        timestamp: Date.now()
      };

      // Performance logging for fallback
      const endTime = Date.now();
      logger.debug(`⚡ [AI] Total time (streaming fallback): ${endTime - startTime}ms`);

      onComplete?.(fallbackResponse);
    }
  } catch (error) {
    logger.error('Streaming AI Error:', error);
    onError?.(error);
    throw error;
  }
};

/**
 * Fetches pricing history for AI learning
 * Returns recent pricing decisions with corrections weighted higher
 * @param {string} userId - User's ID
 * @param {string} serviceType - Optional filter by service type
 * @returns {Promise<object>} - Pricing history organized for AI consumption
 */
export const getPricingHistory = async (userId, serviceType = null) => {
  const { supabase } = require('../lib/supabase');

  try {
    let query = supabase
      .from('pricing_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (serviceType) {
      query = query.eq('service_type', serviceType);
    }

    const { data, error } = await query;

    if (error) {
      logger.warn('Error fetching pricing history:', error);
      return { recentJobs: [], byService: {}, corrections: [] };
    }

    // Organize data for AI consumption
    const recentJobs = (data || []).slice(0, 20);
    const corrections = (data || []).filter(item => item.is_correction);

    // Group by service type
    const byService = {};
    (data || []).forEach(item => {
      if (!byService[item.service_type]) {
        byService[item.service_type] = [];
      }
      byService[item.service_type].push(item);
    });

    return {
      recentJobs,
      byService,
      corrections,
      totalEntries: (data || []).length,
    };
  } catch (error) {
    logger.error('Error in getPricingHistory:', error);
    return { recentJobs: [], byService: {}, corrections: [] };
  }
};

/**
 * Saves a pricing entry to history for AI learning
 * @param {object} pricingData - Pricing data to save
 * @returns {Promise<object>} - Saved entry or error
 */
export const savePricingHistory = async (pricingData) => {
  const { supabase } = require('../lib/supabase');
  const { getCurrentUserId } = require('../utils/storage');

  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const entry = {
      user_id: userId,
      service_type: pricingData.serviceType,
      work_description: pricingData.workDescription,
      quantity: pricingData.quantity || null,
      unit: pricingData.unit || null,
      price_per_unit: pricingData.pricePerUnit || null,
      total_amount: pricingData.totalAmount,
      scope_keywords: pricingData.scopeKeywords || [],
      square_footage: pricingData.squareFootage || null,
      complexity: pricingData.complexity || null,
      source_type: pricingData.sourceType, // 'project', 'estimate', 'invoice', 'correction'
      source_id: pricingData.sourceId || null,
      project_name: pricingData.projectName || null,
      is_correction: pricingData.isCorrection || false,
      confidence_weight: pricingData.isCorrection ? 1.5 : 1.0,
      work_date: pricingData.workDate || new Date().toISOString().split('T')[0],
    };

    const { data, error } = await supabase
      .from('pricing_history')
      .insert(entry)
      .select()
      .single();

    if (error) {
      logger.error('Error saving pricing history:', error);
      throw error;
    }

    return data;
  } catch (error) {
    logger.error('Error in savePricingHistory:', error);
    throw error;
  }
};

/**
 * Gets the current project context to feed to the AI
 * Includes user profile with pricing information and pricing history for learning
 * @returns {Promise<object>} - Project context object
 */
export const getProjectContext = async () => {
  // Import functions inside to avoid circular dependencies
  const { getUserProfile, getUserServices, fetchProjects, fetchEstimates, fetchInvoices, getSubcontractorQuotesGroupedByTrade, getCurrentUserId } = require('../utils/storage');
  const { getTradeById } = require('../constants/trades');

  try {
    const userProfile = await getUserProfile();
    const userServices = await getUserServices();
    const projects = await fetchProjects();
    const estimates = await fetchEstimates();
    const invoices = await fetchInvoices();
    const subcontractorQuotes = await getSubcontractorQuotesGroupedByTrade();

    // Fetch pricing history for AI learning
    const userId = await getCurrentUserId();
    const pricingHistory = userId ? await getPricingHistory(userId) : { recentJobs: [], byService: {}, corrections: [] };

    // Format pricing for AI readability from new user_services system
    const formattedPricing = {};
    const serviceNames = [];

    userServices.forEach(service => {
      const categoryName = service.service_categories?.name || 'Unknown Service';
      serviceNames.push(categoryName);

      if (service.pricing && Object.keys(service.pricing).length > 0) {
        formattedPricing[categoryName] = {};

        Object.entries(service.pricing).forEach(([itemId, itemData]) => {
          const itemName = itemData.name || itemId;
          formattedPricing[categoryName][itemName] = {
            price: itemData.price,
            unit: itemData.unit
          };
        });
      }
    });

    // Format subcontractor quotes for AI
    const formattedSubcontractorQuotes = {};
    Object.keys(subcontractorQuotes).forEach(tradeId => {
      const trade = getTradeById(tradeId);
      const quotes = subcontractorQuotes[tradeId];

      if (trade && quotes && quotes.length > 0) {
        formattedSubcontractorQuotes[trade.name] = quotes.map(quote => ({
          contractor: quote.subcontractor_name,
          contactPhone: quote.contact_phone,
          isPreferred: quote.is_preferred,
          services: quote.services.map(service => ({
            description: service.description,
            unit: service.unit,
            pricePerUnit: service.pricePerUnit || service.price_per_unit,
          })),
        }));
      }
    });

    return {
      currentDate: new Date().toISOString(),

      // User business info
      businessInfo: userProfile.businessInfo || {
        name: 'Your Business',
        phone: '',
        email: '',
      },

      // User services and pricing (from new system)
      services: serviceNames,
      pricing: formattedPricing,

      // Pricing history for AI learning (actual prices charged on past jobs)
      // AI should weight corrections (is_correction=true) 1.5x higher
      pricingHistory: pricingHistory,

      // Subcontractor contacts (for reference, not used in estimate calculations)
      subcontractorQuotes: formattedSubcontractorQuotes,

      // Projects (fetched from database)
      projects: projects || [],

      // Estimates (fetched from database)
      estimates: estimates || [],

      // Invoices (fetched from database)
      invoices: invoices || [],

      // Workers (empty for now - to be added later)
      workers: [],

      // Stats (calculated from real project data using new financial model)
      stats: {
        activeProjects: projects.filter(p => ['active', 'on-track', 'behind', 'over-budget'].includes(p.status)).length,
        completedThisMonth: projects.filter(p => {
          if (p.status !== 'completed') return false;
          const completedDate = new Date(p.updatedAt);
          const now = new Date();
          return completedDate.getMonth() === now.getMonth() && completedDate.getFullYear() === now.getFullYear();
        }).length,
        totalWorkers: 0, // To be implemented when workers feature is added
        workersOnSiteToday: 0, // To be implemented when workers feature is added

        // New financial model calculations
        totalIncomeCollected: projects.reduce((sum, p) => sum + (p.incomeCollected || 0), 0),
        totalExpenses: projects.reduce((sum, p) => sum + (p.expenses || 0), 0),
        totalProfit: projects.reduce((sum, p) => sum + ((p.incomeCollected || 0) - (p.expenses || 0)), 0),
        totalContractValue: projects.reduce((sum, p) => sum + (p.contractAmount || p.budget || 0), 0),
        pendingCollection: projects.reduce((sum, p) => sum + ((p.contractAmount || p.budget || 0) - (p.incomeCollected || 0)), 0),

        // Legacy fields (for backward compatibility)
        monthlyIncome: projects.reduce((sum, p) => sum + (p.incomeCollected || 0), 0),
        monthlyBudget: projects.reduce((sum, p) => sum + (p.contractAmount || p.budget || 0), 0),
        pendingPayments: projects.reduce((sum, p) => sum + ((p.contractAmount || p.budget || 0) - (p.incomeCollected || 0)), 0),
        hoursThisMonth: 0, // To be implemented when time tracking is added
      },

      // Alerts
      alerts: [],
    };
  } catch (error) {
    logger.error('Error getting project context:', error);
    // Return minimal context if error
    return {
      currentDate: new Date().toISOString(),
      businessInfo: { name: 'Your Business', phone: '', email: '' },
      services: [],
      pricing: {},
      pricingHistory: { recentJobs: [], byService: {}, corrections: [] },
      projects: [],
      estimates: [],
      invoices: [],
      workers: [],
      stats: {},
      alerts: [],
    };
  }
};

/**
 * Mock AI response for testing without API key
 * @param {string} message - User's message
 * @param {object} projectContext - Current app data
 * @returns {object} - Mock structured response
 */
export const mockAIResponse = (message, projectContext) => {
  const lowerMessage = message.toLowerCase();

  // Project-related queries
  if (lowerMessage.includes('project') || lowerMessage.includes('martinez') || lowerMessage.includes('status')) {
    return {
      text: "I don't have any active projects in the system yet. Once you add projects, I'll be able to show you their status, budget, and progress here.",
      visualElements: [],
      actions: [
        { label: "Create Project", type: "create-project", data: {} }
      ],
    };
  }

  // Worker-related queries
  if (lowerMessage.includes('worker') || lowerMessage.includes('working') || lowerMessage.includes('who')) {
    return {
      text: "You don't have any workers registered yet. Add workers to track their hours and assignments.",
      visualElements: [],
      actions: [
        { label: "Add Worker", type: "add-worker", data: {} }
      ],
    };
  }

  // Budget/earnings queries
  if (lowerMessage.includes('earn') || lowerMessage.includes('money') || lowerMessage.includes('budget') || lowerMessage.includes('income')) {
    return {
      text: "You haven't tracked any income yet. Start adding projects to see your earnings and budget analysis.",
      visualElements: [],
      actions: [],
    };
  }

  // Default response
  return {
    text: "I'm here to help you manage your construction projects! I can help you track projects, workers, budgets, and schedules. What would you like to know?",
    visualElements: [],
    actions: [],
  };
};

/**
 * Analyzes a screenshot using AI vision to extract project details
 * @param {string} base64Image - Base64 encoded image
 * @returns {Promise<object>} - Extracted project data
 */
export const analyzeScreenshot = async (base64Image) => {
  try {
    logger.debug('Analyzing screenshot with AI Vision...');

    const token = await getAuthToken();
    const response = await fetch(`${BACKEND_URL}/api/chat/vision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini', // Vision model
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this screenshot of a conversation with a client. Extract the following information and return ONLY valid JSON (no markdown, no extra text):

{
  "worker": "worker name if mentioned",
  "location": "address or location",
  "date": "date in YYYY-MM-DD format",
  "time": "time if mentioned",
  "task": "description of work to be done",
  "budget": estimated budget as a number (no $ sign),
  "client": "client name",
  "estimatedDuration": "estimated time like '2 days' or '1 week'"
}

If any field is not found in the image, use null. Be accurate and only extract what you actually see.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.3, // Lower temperature for more accurate extraction
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('Vision API error:', errorData);
      throw new Error(errorData.error?.message || 'Vision API request failed');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Try to parse the JSON response
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const extracted = JSON.parse(cleanContent);

      logger.debug('Extracted data:', extracted);
      return {
        worker: extracted.worker || null,
        location: extracted.location || null,
        date: extracted.date || new Date().toISOString().split('T')[0],
        time: extracted.time || null,
        task: extracted.task || null,
        budget: extracted.budget || 0,
        client: extracted.client || null,
        estimatedDuration: extracted.estimatedDuration || null,
        confidence: 0.85
      };
    } catch (parseError) {
      logger.error('Failed to parse vision response:', content);
      throw new Error('Could not parse extracted data');
    }

  } catch (error) {
    logger.error('Screenshot analysis error:', error);
    // Fallback to mock data if API fails
    logger.warn('Falling back to mock data');
    return mockScreenshotAnalysis();
  }
};

/**
 * Analyzes a document (PDF, Word, etc.) using AI to extract project details
 * Uses the text-based chat endpoint for better document understanding
 * @param {string} base64Content - Base64 encoded file content
 * @param {string} fileName - Original file name for context
 * @returns {Promise<object>} - Extracted project data (same shape as analyzeScreenshot)
 */
export const analyzeDocument = async (base64Content, fileName) => {
  try {
    logger.debug('Analyzing document with AI...', fileName);

    const fileExt = fileName?.split('.').pop()?.toLowerCase() || 'pdf';
    const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(fileExt);

    // For images, use the vision endpoint directly
    if (isImage) {
      return await analyzeScreenshot(base64Content);
    }

    // For PDFs, use the vision endpoint with the document as an image
    // GPT-4o-mini can read PDF pages rendered as images
    const token = await getAuthToken();
    const response = await fetch(`${BACKEND_URL}/api/chat/vision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this document (${fileName || 'uploaded file'}). This is a construction-related document. Extract the following information and return ONLY valid JSON (no markdown, no extra text):

{
  "worker": "worker name if mentioned",
  "location": "address or location",
  "date": "date in YYYY-MM-DD format",
  "time": "time if mentioned",
  "task": "description of work to be done or project scope",
  "budget": estimated budget or contract amount as a number (no $ sign),
  "client": "client name or company",
  "estimatedDuration": "estimated time like '2 days' or '1 week'"
}

If any field is not found in the document, use null. Be accurate and only extract what you actually see.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:application/pdf;base64,${base64Content}`
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('Document analysis API error:', errorData);
      throw new Error(errorData.error?.message || 'Document analysis failed');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const extracted = JSON.parse(cleanContent);

      logger.debug('Extracted document data:', extracted);
      return {
        worker: extracted.worker || null,
        location: extracted.location || null,
        date: extracted.date || new Date().toISOString().split('T')[0],
        time: extracted.time || null,
        task: extracted.task || null,
        budget: extracted.budget || 0,
        client: extracted.client || null,
        estimatedDuration: extracted.estimatedDuration || null,
        confidence: 0.80
      };
    } catch (parseError) {
      logger.error('Failed to parse document analysis response:', content);
      throw new Error('Could not parse extracted data from document');
    }

  } catch (error) {
    logger.error('Document analysis error:', error);
    logger.warn('Falling back to mock data');
    return mockScreenshotAnalysis();
  }
};

/**
 * Describes multiple attachments using AI Vision for use as context in agent messages.
 * Returns a formatted string that can be prepended to the user's message.
 * @param {Array} attachments - Array of { uri, name, mimeType, base64? }
 * @returns {Promise<string>} - Formatted description of all attachments
 */
export const describeAttachments = async (attachments) => {
  if (!attachments || attachments.length === 0) return '';

  const descriptions = [];
  const MAX_DOC_CHARS = 40000; // ~10k tokens — fits large SOWs and contracts
  const token = await getAuthToken();

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];
    const isImage = att.mimeType?.startsWith('image/');
    const isPDF = att.mimeType === 'application/pdf' || att.name?.toLowerCase().endsWith('.pdf');

    try {
      // Read base64 if not already available
      const base64 = att.base64 || await (async () => {
        const FileSystem = require('expo-file-system/legacy');
        return FileSystem.readAsStringAsync(att.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      })();

      // PDFs: extract text directly on the backend (much more reliable than vision)
      if (isPDF) {
        let pdfScanned = false;
        try {
          logger.debug(`📄 [Attachments] Sending PDF to text extraction: ${att.name} (${(base64.length / 1024).toFixed(0)}KB base64)`);
          const extractResponse = await fetch(`${BACKEND_URL}/api/documents/extract-text`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ base64, fileName: att.name }),
          });

          if (extractResponse.ok) {
            const result = await extractResponse.json();
            const extractedText = result.text;
            pdfScanned = result.scanned;
            logger.debug(`📄 [Attachments] PDF extraction result: ${extractedText?.length || 0} chars, scanned=${pdfScanned}`);
            if (extractedText && extractedText.trim().length > 50) {
              const pdfTruncated = extractedText.length > MAX_DOC_CHARS;
              const pdfText = pdfTruncated ? extractedText.substring(0, MAX_DOC_CHARS) : extractedText;
              const pdfNote = pdfTruncated
                ? ` — showing first ${MAX_DOC_CHARS.toLocaleString()} of ${extractedText.length.toLocaleString()} characters. If you need content from later in the document, ask the user to paste the specific section.`
                : '';
              descriptions.push(`${i + 1}. "${att.name}" (PDF document — ${extractedText.length.toLocaleString()} characters extracted${pdfNote}):\n---\n${pdfText}\n---`);
              if (pdfTruncated) {
                logger.warn(`📄 [Attachments] PDF truncated for AI context: ${att.name} — ${extractedText.length} chars → ${MAX_DOC_CHARS}`);
              }
              continue;
            }
            logger.debug(`📄 [Attachments] PDF has insufficient text`);
          } else {
            logger.warn(`📄 [Attachments] PDF extraction HTTP error: ${extractResponse.status}`);
          }
        } catch (pdfError) {
          logger.warn(`📄 [Attachments] PDF text extraction failed for ${att.name}:`, pdfError.message);
        }

        // PDFs that failed text extraction: don't send to vision (GPT-4o can't process PDF binary)
        if (pdfScanned === true) {
          descriptions.push(`${i + 1}. "${att.name}" (PDF document — this appears to be a scanned document. The text content cannot be extracted automatically.)`);
        } else {
          descriptions.push(`${i + 1}. "${att.name}" (PDF document — text extraction failed.)`);
        }
        continue;
      }

      // DOCX/DOC: extract text server-side
      const isDOCX = att.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        || att.mimeType === 'application/msword'
        || att.name?.toLowerCase().endsWith('.docx')
        || att.name?.toLowerCase().endsWith('.doc');

      if (isDOCX) {
        try {
          logger.debug(`📄 [Attachments] Sending DOCX to text extraction: ${att.name}`);
          const docxResponse = await fetch(`${BACKEND_URL}/api/documents/extract-text-docx`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ base64, filename: att.name }),
          });

          if (docxResponse.ok) {
            const result = await docxResponse.json();
            if (result.success && result.text && result.text.length > 50) {
              const docxTruncated = result.text.length > MAX_DOC_CHARS;
              const docxText = docxTruncated ? result.text.substring(0, MAX_DOC_CHARS) : result.text;
              const docxNote = docxTruncated
                ? ` — showing first ${MAX_DOC_CHARS.toLocaleString()} of ${result.text.length.toLocaleString()} characters. If you need content from later in the document, ask the user to paste the specific section.`
                : '';
              descriptions.push(`${i + 1}. "${att.name}" (Word document — ${result.text.length.toLocaleString()} characters extracted${docxNote}):\n---\n${docxText}\n---`);
              if (docxTruncated) {
                logger.warn(`📄 [Attachments] DOCX truncated for AI context: ${att.name} — ${result.text.length} chars → ${MAX_DOC_CHARS}`);
              }
              continue;
            }
          }
        } catch (docxError) {
          logger.warn(`📄 [Attachments] DOCX text extraction failed for ${att.name}:`, docxError.message);
        }
        // Extraction failed or text too short
        descriptions.push(`${i + 1}. "${att.name}" (Word document — unable to extract text. This may be a complex document format.)`);
        continue;
      }

      // Guard: only send supported image types to the vision API
      if (!VISION_SUPPORTED_MIME_TYPES.has(att.mimeType)) {
        console.warn('[describeAttachments] Unsupported file type for vision API, skipping:', att.mimeType, att.name);
        descriptions.push(`${i + 1}. "${att.name}" (unsupported file type — cannot extract content from this file format)`);
        continue;
      }

      // Images only: use vision API (GPT-4o supports PNG/JPEG/GIF/WebP)
      const response = await fetch(`${BACKEND_URL}/api/chat/vision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this image thoroughly. Extract ALL readable text exactly as written. If this is a receipt, invoice, or bill, extract specifically: TOTAL amount charged, vendor/store name, date, payment method, and list each line item with its price. For any other image: describe text, numbers, names, addresses, amounts, dates, materials, measurements, brands, labels, handwriting, diagrams, floor plans, or any construction/project details. Be thorough and precise with numbers and amounts.`
              },
              {
                type: 'image_url',
                image_url: { url: `data:${att.mimeType || 'image/jpeg'};base64,${base64}` }
              }
            ]
          }],
          max_tokens: 1500,
          temperature: 0.2,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const description = data.choices?.[0]?.message?.content || 'Could not read this file.';
        logger.debug(`📄 [Attachments] Vision success for ${att.name}: ${description.substring(0, 100)}...`);
        descriptions.push(`${i + 1}. "${att.name}" (image) - ${description}`);
      } else {
        const errBody = await response.text().catch(() => '');
        logger.warn(`📄 [Attachments] Vision API HTTP error for ${att.name}: ${response.status} - ${errBody.substring(0, 200)}`);
        descriptions.push(`${i + 1}. "${att.name}" - (Image analysis temporarily unavailable — the file was attached but could not be processed. The user can see the file on their device.)`);
      }
    } catch (error) {
      logger.error(`📄 [Attachments] Error describing attachment ${att.name}:`, error.message || error);
      descriptions.push(`${i + 1}. "${att.name}" - (Error reading file — the file could not be processed. The user may need to re-attach it.)`);
    }
  }

  return `[The user attached ${attachments.length} file(s):\n${descriptions.join('\n')}\n]\n\n`;
};

/**
 * Analyze receipt image using AI Vision to extract expense details
 * Used by workers to submit expenses with automatic data extraction
 * @param {string} base64Image - Base64 encoded image of the receipt
 * @returns {Promise<object>} - Extracted expense data
 */
export const analyzeReceipt = async (base64Image) => {
  try {
    logger.debug('Analyzing receipt with AI Vision...');

    const token = await getAuthToken();
    const response = await fetch(`${BACKEND_URL}/api/chat/vision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this receipt image and extract expense information for a construction project.

Return ONLY valid JSON (no markdown, no extra text) in this EXACT format:

{
  "totalAmount": 0.00,
  "description": "Brief description of purchase (e.g., 'Home Depot - Building materials')",
  "category": "materials",
  "subcategory": "lumber",
  "vendor": "Store or vendor name",
  "date": "YYYY-MM-DD",
  "lineItems": [
    {
      "description": "Item description",
      "quantity": 1,
      "unitPrice": 0.00,
      "total": 0.00
    }
  ],
  "paymentMethod": "card",
  "taxAmount": 0.00
}

CATEGORY RULES (pick the most appropriate):
- "materials": Building materials, supplies, lumber, concrete, paint, hardware, nails, screws, drywall
- "equipment": Tool rentals, machinery, power tools, equipment purchases
- "permits": Government permits, inspection fees, licenses, filing fees
- "subcontractor": Payments to other contractors, specialty services
- "misc": Fuel, gas, food for crew, office supplies, delivery fees, other expenses

SUBCATEGORY RULES (pick based on category):
- materials: "lumber", "concrete_cement", "plumbing_supplies", "electrical_supplies", "drywall", "paint", "hardware", "roofing", "flooring", "fixtures", "materials_other"
- equipment: "rental", "purchase", "fuel_gas", "maintenance_repair", "small_tools", "equipment_other"
- permits: "building_permit", "inspection_fee", "impact_fee", "utility_connection", "permits_other"
- subcontractor: "sub_plumbing", "sub_electrical", "sub_hvac", "sub_painting", "sub_concrete", "sub_framing", "sub_roofing", "sub_landscaping", "sub_demolition", "sub_other"
- misc: "office_supplies", "vehicle_transport", "insurance", "cleanup_disposal", "professional_fees", "misc_other"

EXTRACTION RULES:
1. Extract the TOTAL amount including tax
2. Extract ALL visible line items with their prices
3. If date is not visible, use null
4. Identify the vendor/store name from the receipt header
5. Guess the payment method from receipt (card, cash, check) or use "card" as default
6. For description, combine vendor name + general category of items
7. Be accurate with numbers - double check totals
8. Pick the most specific subcategory based on the items purchased`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 1500,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('Vision API error:', errorData);
      throw new Error(errorData.error?.message || 'Vision API request failed');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const extracted = JSON.parse(cleanContent);

      logger.debug('Extracted receipt data:', extracted);

      // Validate and structure the response
      return {
        totalAmount: parseFloat(extracted.totalAmount) || 0,
        description: extracted.description || 'Expense',
        category: ['materials', 'equipment', 'permits', 'subcontractor', 'misc'].includes(extracted.category)
          ? extracted.category
          : 'misc',
        subcategory: extracted.subcategory || null,
        vendor: extracted.vendor || null,
        date: extracted.date || new Date().toISOString().split('T')[0],
        lineItems: Array.isArray(extracted.lineItems)
          ? extracted.lineItems.map(item => ({
              description: item.description || 'Item',
              quantity: parseFloat(item.quantity) || 1,
              unitPrice: parseFloat(item.unitPrice) || 0,
              total: parseFloat(item.total) || 0,
            }))
          : [],
        paymentMethod: extracted.paymentMethod || 'card',
        taxAmount: parseFloat(extracted.taxAmount) || 0,
        confidence: 0.85,
      };
    } catch (parseError) {
      logger.error('Failed to parse receipt vision response:', content);
      throw new Error('Could not parse receipt data. Please try again with a clearer image.');
    }

  } catch (error) {
    logger.error('Receipt analysis error:', error);
    throw error;
  }
};

/**
 * Analyze subcontractor quote document using AI Vision
 * Extracts pricing information, subcontractor details, and service line items
 * @param {string} base64Image - Base64 encoded image of the quote document
 * @param {string} tradeId - Trade ID (e.g., 'drywall', 'electrical') for context
 * @returns {Promise<object>} - Extracted quote data
 */
export const analyzeSubcontractorQuote = async (base64Image, tradeId = null) => {
  try {
    logger.debug('🔍 Analyzing subcontractor quote with AI Vision...');
    logger.debug('📋 Trade ID:', tradeId);

    const token = await getAuthToken();
    const response = await fetch(`${BACKEND_URL}/api/chat/vision`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini', // Vision model
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this subcontractor quote/estimate document${tradeId ? ` for ${tradeId} services` : ''}. Extract ALL pricing information and company details.

Return ONLY valid JSON (no markdown, no extra text) in this EXACT format:

{
  "subcontractorName": "Company name from document",
  "contactPhone": "Phone number if visible",
  "contactEmail": "Email if visible",
  "services": [
    {
      "description": "Service or item description",
      "quantity": null,
      "unit": "sq ft | linear ft | unit | hour | job | day",
      "pricePerUnit": 0.00,
      "total": 0.00,
      "notes": "Any special terms or conditions"
    }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "totalAmount": 0.00,
  "validUntil": "Date if mentioned (YYYY-MM-DD format)",
  "paymentTerms": "Payment terms if mentioned",
  "notes": "Any additional notes or terms"
}

IMPORTANT EXTRACTION RULES:
1. Extract ALL line items you can find in the pricing table
2. For "unit", use standard construction units: "sq ft", "linear ft", "unit", "hour", "job", "day"
3. If a service has "per sq ft" pricing, extract just the number for pricePerUnit
4. If you see "$2.50/sq ft", extract: pricePerUnit: 2.50, unit: "sq ft"
5. Calculate totals if they're not shown: total = quantity × pricePerUnit
6. If quantity is not shown but price per unit is, set quantity: null
7. If a field is not visible, use null (except services array which should have at least one entry)
8. Look for company name in header, footer, or letterhead
9. Extract ALL phone numbers and emails you see

Be thorough and accurate. Extract every line item you can identify.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 2000, // More tokens for detailed pricing tables
        temperature: 0.2, // Lower temperature for more accurate extraction
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      logger.error('❌ Vision API error:', errorData);
      throw new Error(errorData.error?.message || 'Vision API request failed');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Try to parse the JSON response
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const extracted = JSON.parse(cleanContent);

      logger.debug('✅ Extracted quote data:', extracted);

      // Validate and structure the response
      return {
        subcontractorName: extracted.subcontractorName || 'Unknown Contractor',
        contactPhone: extracted.contactPhone || null,
        contactEmail: extracted.contactEmail || null,
        services: Array.isArray(extracted.services) && extracted.services.length > 0
          ? extracted.services.map(service => ({
              description: service.description || 'Service',
              quantity: service.quantity || null,
              unit: service.unit || 'unit',
              pricePerUnit: parseFloat(service.pricePerUnit) || 0,
              total: parseFloat(service.total) || 0,
              notes: service.notes || null,
            }))
          : [{
              description: 'Extracted service',
              quantity: null,
              unit: 'unit',
              pricePerUnit: 0,
              total: 0,
              notes: 'Could not extract detailed pricing',
            }],
        subtotal: parseFloat(extracted.subtotal) || 0,
        tax: parseFloat(extracted.tax) || 0,
        totalAmount: parseFloat(extracted.totalAmount) || 0,
        validUntil: extracted.validUntil || null,
        paymentTerms: extracted.paymentTerms || null,
        notes: extracted.notes || null,
        confidence: 0.85,
        extractedAt: new Date().toISOString(),
      };
    } catch (parseError) {
      logger.error('❌ Failed to parse vision response:', content);
      logger.error('Parse error:', parseError);
      throw new Error('Could not parse extracted quote data. Please check the image quality and try again.');
    }

  } catch (error) {
    logger.error('❌ Quote analysis error:', error);
    throw error; // Re-throw to let caller handle it
  }
};

/**
 * Mock screenshot analysis for testing
 * @returns {object} - Mock extracted data
 */
export const mockScreenshotAnalysis = () => {
  return {
    worker: "José Martinez",
    location: "123 Main St, Apartment 4B",
    date: new Date().toISOString().split('T')[0],
    time: "9:00 AM",
    task: "Install kitchen cabinets and connect plumbing",
    budget: 2500,
    client: "Smith Family",
    estimatedDuration: "2 days",
    confidence: 0.85
  };
};

/**
 * Formats extracted screenshot data into a confirmation message
 * @param {object} extractedData - Data from screenshot analysis
 * @returns {object} - Formatted response for display
 */
export const formatProjectConfirmation = (extractedData, source = 'screenshot') => {
  const { worker, location, date, time, task, budget, client, estimatedDuration } = extractedData;

  const sourceLabel = source === 'document' ? 'document' : 'screenshot';

  // Build message with only available fields
  let message = `I analyzed the ${sourceLabel} and found:\n\n`;

  if (client) message += `👥 Client: ${client}\n`;
  if (worker) message += `👤 Worker: ${worker}\n`;
  if (location) message += `📍 Location: ${location}\n`;
  if (date) message += `📅 Date: ${date}${time ? ` at ${time}` : ''}\n`;
  if (task) message += `💼 Task: ${task}\n`;
  if (budget) message += `💰 Budget: $${budget.toLocaleString()}\n`;
  if (estimatedDuration) message += `⏱️ Duration: ${estimatedDuration}\n`;

  // Check if we found minimal info
  const hasMinimalInfo = client || worker || location || task;

  if (!hasMinimalInfo) {
    message = `I couldn't extract project details from this ${sourceLabel}. Please make sure it contains:\n• Client or worker name\n• Location or address\n• Task description\n• Budget (optional)`;
  }

  return {
    text: message.trim(),
    visualElements: [],
    actions: hasMinimalInfo ? [
      {
        label: "Create Project",
        type: "create-project-from-screenshot",
        data: extractedData
      },
      {
        label: "Edit Details",
        type: "edit-screenshot-data",
        data: extractedData
      }
    ] : [
      {
        label: "Try Again",
        type: "upload-screenshot",
        data: {}
      }
    ],
  };
};

// ==================== UNIFIED AGENT (Tool-Calling) ====================

/**
 * Sends a message to the unified agent endpoint with real-time streaming.
 * Uses XMLHttpRequest + onprogress for SSE processing (React Native compatible).
 * The backend streams thinking/tool_start/tool_end/delta/done events.
 *
 * @param {string} userId - Authenticated user's Supabase ID
 * @param {Array} conversationHistory - Previous messages [{role, content}]
 * @param {string} userMessage - Current user message
 * @param {object} context - User context (business info, preferences, etc.)
 * @param {object} callbacks - { onChunk, onComplete, onError, onStatus }
 */
export const sendAgentMessage = async (
  userId,
  conversationHistory,
  userMessage,
  context,
  images = [],
  callbacks,
  rawAttachments = [],
  sessionId = null
) => {
  const { onChunk, onComplete, onError, onStatus, onJobId, onMetadata, onPlan, onPlanVerified, onPlanDiverged, onPendingApproval, onStep, onTool, onRetrying, onAbortRef } = callbacks;
  const startTime = Date.now();

  // Build the last user message — multipart if images are attached
  const lastMessage = images && images.length > 0
    ? {
        role: 'user',
        content: [
          ...images.map(img => ({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
          })),
          { type: 'text', text: userMessage }
        ]
      }
    : { role: 'user', content: userMessage };

  const messages = [
    ...conversationHistory,
    lastMessage
  ];

  logger.debug(`🤖 [Agent] Sending to ${BACKEND_URL}/api/chat/agent`);
  logger.debug(`🤖 [Agent] Messages: ${messages.length}, userId: ${userId?.substring(0, 8)}`);

  // Get auth token before starting XHR (with retries for session loading race condition)
  const authToken = await getAuthToken(3);
  if (!authToken) {
    logger.error('🤖 [Agent] No auth token available — cannot send request');
    onError?.(new Error('Not authenticated. Please restart the app and try again.'));
    return;
  }

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let lastProcessedIndex = 0;
    let lineBuffer = '';
    let firstTokenTime = null;
    let displayedText = '';           // Full clean text received so far
    let sentLength = 0;               // How many chars we've drip-fed to UI
    let animationTimer = null;        // setInterval ID for typing animation
    let streamDone = false;           // True when 'done' event received
    let completionCalled = false;     // Prevents double onComplete
    let completionData = null;        // Parsed response for deferred onComplete
    let pendingVisualElements = [];   // From backend metadata event
    let pendingActions = [];          // From backend metadata event
    let pendingToolContext = '';       // Condensed tool context for conversation memory
    let serverError = '';              // Last error event from backend, surfaced if no text streamed
    let toolsAttempted = [];           // Names of tools the agent ran — used for a context-aware empty fallback

    /**
     * Drip-feed text to UI at a smooth pace (adaptive 3-15 chars per 20ms tick).
     */
    function startAnimation() {
      if (animationTimer) return;
      animationTimer = setInterval(() => {
        if (sentLength < displayedText.length) {
          const remaining = displayedText.length - sentLength;
          const charsPerTick = Math.max(3, Math.min(15, Math.ceil(remaining / 10)));
          const end = Math.min(sentLength + charsPerTick, displayedText.length);
          const chunk = displayedText.substring(sentLength, end);
          sentLength = end;
          onChunk?.(chunk);
        } else if (streamDone) {
          clearInterval(animationTimer);
          animationTimer = null;
          handleCompletion();
        }
      }, 20);
    }

    /**
     * Flush all remaining text to UI immediately (called before onComplete).
     */
    function flushAnimation() {
      if (animationTimer) {
        clearInterval(animationTimer);
        animationTimer = null;
      }
      if (sentLength < displayedText.length) {
        onChunk?.(displayedText.substring(sentLength));
        sentLength = displayedText.length;
      }
    }

    /**
     * Trigger onComplete exactly once, after animation finishes.
     */
    function handleCompletion() {
      if (completionCalled) return;
      completionCalled = true;
      flushAnimation();
      if (completionData) {
        onComplete?.(completionData);
      }
      resolve();
    }

    /**
     * Process new SSE data from the stream.
     * Delta events contain CLEAN TEXT (backend extracts from JSON).
     * Metadata events contain visualElements/actions as structured data.
     */
    function processNewData(newData) {
      lineBuffer += newData;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);

          switch (event.type) {
            case 'job_id':
              // Backend sends job ID for resume/polling on disconnect
              onJobId?.(event.jobId);
              break;
            case 'thinking':
              onStatus?.('Thinking...');
              break;
            case 'tool_start':
              onStatus?.(event.message || `Using ${event.tool}...`);
              if (event.tool) toolsAttempted.push(event.tool);
              // P3: forward enriched tool start (category, risk_level,
              // args_summary) so the reasoning trail UI can render the
              // tool with the right icon + tint as it fires.
              onTool?.({
                event: 'started',
                tool: event.tool,
                message: event.message,
                category: event.category,
                risk_level: event.risk_level,
                args_summary: event.args_summary,
              });
              break;
            case 'tool_end':
              // P3: forward duration + ok flag so the trail can show
              // "✓ in 240ms" / "✗ failed in 3.4s" without inferring.
              onTool?.({
                event: 'ended',
                tool: event.tool,
                duration_ms: event.duration_ms,
                ok: event.ok,
              });
              break;
            case 'clear':
              // Backend says: discard text from tool call round, it's not the final response
              displayedText = '';
              sentLength = 0;
              pendingVisualElements = [];
              pendingActions = [];
              if (animationTimer) {
                clearInterval(animationTimer);
                animationTimer = null;
              }
              break;
            case 'delta':
              // Content is already clean text (backend extracted from JSON "text" field)
              if (event.content) {
                if (!firstTokenTime) {
                  firstTokenTime = Date.now();
                  logger.debug(`⚡ [Agent] First token: ${firstTokenTime - startTime}ms`);
                }
                displayedText += event.content;
                startAnimation();
              }
              break;
            case 'metadata':
              // Structured data from backend (visualElements, actions)
              pendingVisualElements = event.visualElements || [];
              pendingActions = event.actions || [];
              logger.debug(`📦 [Agent] Metadata: ${pendingVisualElements.length} visualElements, ${pendingActions.length} actions`);
              // Notify UI early so it can show a loading skeleton for incoming cards
              if (pendingVisualElements.length > 0) {
                onMetadata?.({ visualElements: pendingVisualElements });
              }
              break;
            case 'tool_context':
              pendingToolContext = event.context || '';
              break;
            case 'plan':
              // Planner stage: a brief intent line shown above the response
              // ("Looking up Smith's invoices, then summarizing what's
              // overdue."). Older clients ignore this event.
              onPlan?.({
                plan_text: event.plan_text,
                complexity: event.complexity,
                recommended_model: event.recommended_model,
              });
              break;
            case 'plan_verified':
              onPlanVerified?.({ severity: event.severity });
              break;
            case 'plan_diverged':
              onPlanDiverged?.({ severity: event.severity, reason: event.reason });
              break;
            case 'tool_blocked':
              // Approval gate refused the tool call. The agent will
              // respond with an "ask the user to confirm" message; we
              // surface a status hint so the chat UI can render a small
              // pending-confirm indicator while the assistant text streams.
              onStatus?.('Awaiting your confirmation…');
              break;
            case 'pending_approval':
              // Inline confirm card payload: tool, args, action_summary,
              // risk_level. Frontend renders an "Approve / Cancel" card
              // above the assistant's response. Tap-Approve sends
              // "yes, confirm" as the next user message; tap-Cancel
              // sends "no, cancel that".
              onPendingApproval?.({
                tool: event.tool,
                args: event.args,
                action_summary: event.action_summary,
                risk_level: event.risk_level,
                reason: event.reason,
              });
              break;
            case 'step_started':
            case 'step_completed':
            case 'step_failed':
              // P2: step lifecycle events for complex multi-step plans.
              // Frontend rendering is deferred to P3 — capture only here
              // so the wire format is stable and history can record state.
              onStep?.({
                event: event.type,
                step_id: event.step_id,
                action: event.action,
                reason: event.reason,
              });
              break;
            case 'retrying':
              // Self-correcting agent: the verifier caught a major
              // divergence and the agent is retrying. Frontend should
              // show a brief "let me try that again" indicator and
              // expect the displayed text to be replaced.
              onRetrying?.({ attempt: event.attempt, reason: event.reason });
              break;
            case 'done':
              streamDone = true;
              break;
            case 'error':
              logger.error('🤖 [Agent] Server error:', event.message);
              if (event.message) serverError = event.message;
              break;
            case 'status':
              onStatus?.(event.message);
              break;
            default:
              break;
          }
        } catch (parseError) {
          // Skip malformed chunks
        }
      }
    }

    // Process SSE events as they arrive (real-time streaming)
    xhr.onprogress = () => {
      const newData = xhr.responseText.substring(lastProcessedIndex);
      lastProcessedIndex = xhr.responseText.length;
      if (newData) processNewData(newData);
    };

    // Final processing when request completes
    xhr.onload = () => {
      const remaining = xhr.responseText.substring(lastProcessedIndex);
      if (remaining) processNewData(remaining);
      // Flush any remaining line in the buffer (SSE line not terminated by \n)
      if (lineBuffer.trim()) {
        processNewData('\n');
      }
      streamDone = true;

      const totalTime = Date.now() - startTime;
      logger.debug(`✅ [Agent] Complete in ${totalTime}ms`);

      // Pick a fallback message that actually tells the user what happened
      // when the model streamed no visible text. Generic "Unable to process
      // response" was useless — see screenshot 2026-04-28.
      const fallbackText = (() => {
        if (displayedText) return displayedText;
        if (serverError) return `I hit an error: ${serverError}. Try again or rephrase.`;
        if (toolsAttempted.length > 0) {
          const lastTool = toolsAttempted[toolsAttempted.length - 1];
          return `I started looking that up (using ${lastTool}) but didn't finish composing a response. Try asking again, or break the request into smaller parts.`;
        }
        return "I didn't get a response back. Could be a connection hiccup — try resending.";
      })();

      completionData = {
        text: fallbackText,
        visualElements: pendingVisualElements,
        actions: pendingActions,
        toolContext: pendingToolContext,
      };

      // If no animation running, complete immediately
      if (!animationTimer) {
        handleCompletion();
        return;
      }

      // Animation is draining — safety: force complete after 3 seconds max
      setTimeout(() => {
        if (!completionCalled) {
          flushAnimation();
          handleCompletion();
        }
      }, 3000);
    };

    xhr.onerror = () => {
      if (completionCalled) { resolve(); return; } // Intentional abort — silently resolve
      flushAnimation();
      completionCalled = true;
      logger.error('🤖 [Agent] XHR error');
      onError?.(new Error('Network error'));
      resolve();
    };

    xhr.ontimeout = () => {
      if (completionCalled) { resolve(); return; } // Intentional abort — silently resolve
      flushAnimation();
      completionCalled = true;
      logger.error('🤖 [Agent] XHR timeout');
      onError?.(new Error('Request timed out'));
      resolve();
    };

    xhr.timeout = 120000; // 2 minutes

    // Expose abort capability so caller can kill XHR on session switch
    onAbortRef?.({
      abort: () => {
        completionCalled = true; // Prevent onComplete/onError from firing
        if (animationTimer) { clearInterval(animationTimer); animationTimer = null; }
        xhr.abort();
        resolve();
      }
    });

    xhr.open('POST', `${BACKEND_URL}/api/chat/agent`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);

    xhr.send(JSON.stringify({
      messages,
      user_id: userId,
      context: context || {},
      attachments: rawAttachments.length > 0 ? rawAttachments : undefined,
      sessionId: sessionId || undefined,
    }));
  });
};

/**
 * Poll an agent job for results (used when resuming after app was backgrounded).
 * Returns the job state: status, accumulated text, visual elements, actions.
 *
 * @param {string} jobId - The agent job ID received from the job_id SSE event
 * @returns {{ jobId, status, accumulatedText, visualElements, actions, error, createdAt, completedAt }}
 */
export const pollAgentJob = async (jobId) => {
  const authToken = await getAuthToken(3);
  if (!authToken) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(`${BACKEND_URL}/api/chat/agent/${jobId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to poll job: ${response.status}`);
  }

  return response.json();
};

/**
 * Fetch the user's most recent active agent job.
 * Used as a fallback when the app was backgrounded before the jobId was received via SSE.
 */
export const fetchLatestAgentJob = async () => {
  const authToken = await getAuthToken(3);
  if (!authToken) return null;

  try {
    const response = await fetch(`${BACKEND_URL}/api/chat/agent-latest`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
    });

    if (!response.ok) return null;
    const data = await response.json();
    return data.job || null;
  } catch (e) {
    logger.error('Failed to fetch latest agent job:', e.message);
    return null;
  }
};
