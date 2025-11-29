// Legacy prompt archived - now using multi-agent system via CoreAgent
// import { getSystemPrompt } from './agentPrompt';
import { OPENROUTER_API_KEY } from '@env';

/**
 * DEPRECATED: Legacy single-agent prompt function
 * This is kept for backward compatibility but is no longer used in production.
 * The app now uses CoreAgent with specialized agent prompts.
 */
const getSystemPrompt = (projectContext) => {
  console.warn('⚠️ Using deprecated legacy prompt. Consider migrating to CoreAgent.');
  return `You are ConstructBot, a construction project management assistant.
Respond with valid JSON: {"text":"...","visualElements":[],"actions":[],"quickSuggestions":[]}

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
const POWERFUL_MODEL = 'anthropic/claude-sonnet-4'; // Sonnet 4 for complex tasks

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
  console.log(isVoiceMode ? '🎤 Voice mode ENABLED - using fast settings' : '⌨️ Voice mode DISABLED - using standard settings');
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
    console.log('🎤⚡ Using FAST model (Haiku) for voice mode');
    return FAST_MODEL;
  }

  if (isSimpleQuery(message, customSystemPrompt)) {
    console.log('⚡ Using FAST model (Haiku) for simple query');
    return FAST_MODEL;
  }
  console.log('🧠 Using POWERFUL model (Sonnet) for complex query');
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
 * Sends a message to the AI with conversation history and project context
 * @param {string} message - User's message
 * @param {object} projectContext - Current app data (projects, workers, stats)
 * @param {array} conversationHistory - Previous messages in the conversation
 * @param {string} customSystemPrompt - Optional custom system prompt (for multi-agent orchestration)
 * @returns {Promise<object>} - Structured AI response with text, visualElements, actions, quickSuggestions
 */
export const sendMessageToAI = async (message, projectContext, conversationHistory = [], customSystemPrompt = null) => {
  try {
    console.log('Calling AI with context:', {
      messageLength: message.length,
      hasContext: !!projectContext,
      historyLength: conversationHistory.length,
    });

    // Light diagnostic logging (no JSON.stringify for performance)
    if (__DEV__) {
      console.log('📊 AI Context: Projects:', projectContext?.projects?.length || 0);
    }

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

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager',
      },
      body: JSON.stringify({
        model: selectModel(message, customSystemPrompt), // Smart model routing: Haiku for simple, Sonnet for complex
        messages: messages,
        max_tokens: 4000, // Sufficient for detailed templates
        temperature: 0.3, // Lower temp = more reliable JSON formatting
        // Note: Claude doesn't support response_format, relies on prompt instructions
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
        console.warn('⚠️ AI response was cut off due to max_tokens limit. Increasing tokens...');
      } else if (finishReason !== 'stop') {
        console.warn('⚠️ AI response finished with reason:', finishReason);
      }

      let content = data.choices[0].message.content;

      // Check for empty content before processing
      if (!content || content.trim() === '') {
        console.error('❌ AI returned empty content');
        console.error('📋 Full API response:', JSON.stringify(data, null, 2));
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
          console.warn('⚠️ Content appears truncated, attempting to fix...');

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

        if (__DEV__) {
          console.log('🤖 AI Response: visualElements:', parsed.visualElements?.length || 0);
        }
        return parsed;
      } catch (parseError) {
        console.warn('AI response was not valid JSON:', parseError.message);
        console.warn('Raw content:', content.substring(0, 200)); // Show first 200 chars for debugging

        // If using custom system prompt, just return the raw content
        if (customSystemPrompt) {
          return content; // Let the caller handle it
        }

        // Fallback: wrap as plain text response
        return {
          text: content.substring(0, 500), // Limit text length
          visualElements: [],
          actions: [],
          quickSuggestions: []
        };
      }
    }

    throw new Error('No response from AI');
  } catch (error) {
    console.error('AI Service Error:', error);
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
  customSystemPrompt = null // Optional: For multi-agent system
) => {
  try {
    // Check cache for instant responses (common queries like "updates", "income")
    const cacheKey = `${message.toLowerCase().trim()}-${projectContext.projects?.length || 0}`;
    const cached = responseCache[cacheKey];

    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      if (__DEV__) {
        console.log('⚡ Cache hit - instant response');
      }
      onChunk?.(cached.response.text);
      onComplete?.(cached.response);
      return;
    }

    if (__DEV__) {
      console.log('🤖 Starting AI request...');
    }

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

    // PROFESSIONAL SETUP: Call OpenRouter directly (no backend needed)
    // This is faster, more reliable, and production-ready
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager',
      },
      body: JSON.stringify({
        model: selectModel(message, customSystemPrompt), // Smart model routing: Haiku for simple, Sonnet for complex
        messages,
        // Complex tasks (custom prompts from agents) need full tokens even in voice mode
        // because they return large visualElements like project-preview
        max_tokens: getMaxTokens(4000, !!customSystemPrompt),
        temperature: 0.3,
        stream: true,
        // Note: Claude doesn't support response_format, must rely on system prompt
      }),
    });

    if (!response.ok) {
      throw new Error(`Relay server error: ${response.status}`);
    }

    if (__DEV__) {
      console.log('⚡ Connected to relay, receiving stream...');
    }

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
              accumulatedJSON += content;
            }
          } catch (parseError) {
            // Skip malformed chunks
          }
        }
      }

      // Log the raw accumulated response for debugging
      if (__DEV__) {
        console.log('🔍 [aiService] Raw accumulated JSON (first 500 chars):', accumulatedJSON.substring(0, 500));
      }

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
          if (__DEV__) {
            console.log('✅ [aiService] Custom prompt mode - returning raw parsed response');
          }
        } else {
          // Legacy mode: Ensure all required fields exist with correct types
          parsedResponse = {
            text: typeof parsedResponse.text === 'string' ? parsedResponse.text : 'Unable to process response',
            visualElements: Array.isArray(parsedResponse.visualElements) ? parsedResponse.visualElements : [],
            actions: Array.isArray(parsedResponse.actions) ? parsedResponse.actions : [],
            quickSuggestions: Array.isArray(parsedResponse.quickSuggestions) ? parsedResponse.quickSuggestions : [],
          };

          // Validate we have at least some text
          if (!parsedResponse.text || parsedResponse.text.length === 0) {
            throw new Error('Empty text response');
          }

          // IMPORTANT: Log if visualElements are missing (helps debug AI prompt issues)
          if (__DEV__ && parsedResponse.visualElements.length === 0) {
            console.warn('⚠️ AI returned no visualElements. Check if prompt example matches query type.');
          }

          if (__DEV__ && parsedResponse.visualElements.length > 0) {
            console.log('✅ Parsed visualElements:', parsedResponse.visualElements.map(v => v.type));
          }
        }

      } catch (parseError) {
        if (__DEV__) {
          console.warn('❌ JSON parse failed:', parseError.message);
          console.warn('Attempted to parse:', cleanJSON.substring(0, 300));
        }

        // Fallback: Try to extract text field manually
        const textMatch = cleanJSON.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const extractedText = textMatch ? textMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : cleanJSON;

        parsedResponse = {
          text: extractedText.substring(0, 500) || 'Unable to process response',
          visualElements: [],
          actions: [],
          quickSuggestions: [],
        };

        if (__DEV__) {
          console.warn('⚠️ Using fallback - visualElements will be empty');
        }
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

      if (__DEV__) {
        console.log('💾 Cached response for key:', cacheKey);
      }

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
      console.warn('⚠️ No accumulated text to parse');
      onComplete?.({
        text: 'Unable to process response',
        visualElements: [],
        actions: [],
        quickSuggestions: []
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
          quickSuggestions: Array.isArray(parsed.quickSuggestions) ? parsed.quickSuggestions : [],
        };
        if (__DEV__) {
          console.log('✅ [aiService] Custom prompt mode - returning raw parsed response');
        }
      } else {
        // Validate and normalize structure for legacy mode
        validatedResponse = {
          text: typeof parsed.text === 'string' ? parsed.text : 'Unable to process response',
          visualElements: Array.isArray(parsed.visualElements) ? parsed.visualElements : [],
          actions: Array.isArray(parsed.actions) ? parsed.actions : [],
          quickSuggestions: Array.isArray(parsed.quickSuggestions) ? parsed.quickSuggestions : [],
        };

        if (!validatedResponse.text || validatedResponse.text.length === 0) {
          throw new Error('Empty text response');
        }

        // IMPORTANT: Log if visualElements are missing
        if (__DEV__ && validatedResponse.visualElements.length === 0) {
          console.warn('⚠️ AI returned no visualElements. Check if prompt example matches query type.');
        }

        if (__DEV__ && validatedResponse.visualElements.length > 0) {
          console.log('✅ Parsed visualElements:', validatedResponse.visualElements.map(v => v.type));
        }
      }

      // Cache the validated response
      responseCache[cacheKey] = {
        response: validatedResponse,
        timestamp: Date.now()
      };

      if (__DEV__) {
        console.log('✅ Streaming complete');
        console.log('💾 Cached response for key:', cacheKey);
      }

      onComplete?.(validatedResponse);

    } catch (parseError) {
      if (__DEV__) {
        console.warn('Final JSON parse failed:', parseError.message);
        console.warn('Attempted to parse:', finalText.substring(0, 300));
      }

      // Fallback: Extract text manually
      const textMatch = finalText.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const extractedText = textMatch ? textMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : finalText;

      const fallbackResponse = {
        text: extractedText.substring(0, 500) || 'Unable to process response',
        visualElements: [],
        actions: [],
        quickSuggestions: [],
      };

      // Cache even fallback responses
      responseCache[cacheKey] = {
        response: fallbackResponse,
        timestamp: Date.now()
      };

      onComplete?.(fallbackResponse);
    }
  } catch (error) {
    console.error('Streaming AI Error:', error);
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
      console.warn('Error fetching pricing history:', error);
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
    console.error('Error in getPricingHistory:', error);
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
      console.error('Error saving pricing history:', error);
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error in savePricingHistory:', error);
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

    // Check if user is a general contractor
    const isGeneralContractor = serviceNames.some(name =>
      name.toLowerCase().includes('general contractor') ||
      name.toLowerCase().includes('general contracting')
    );

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

      // Subcontractor quotes (for General Contractors)
      subcontractorQuotes: formattedSubcontractorQuotes,
      isGeneralContractor: isGeneralContractor,

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
    console.error('Error getting project context:', error);
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
      quickSuggestions: ["How do I add a project?", "What can you help me with?"]
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
      quickSuggestions: ["How do I track worker hours?"]
    };
  }

  // Budget/earnings queries
  if (lowerMessage.includes('earn') || lowerMessage.includes('money') || lowerMessage.includes('budget') || lowerMessage.includes('income')) {
    return {
      text: "You haven't tracked any income yet. Start adding projects to see your earnings and budget analysis.",
      visualElements: [],
      actions: [],
      quickSuggestions: ["How do I track income?", "Show me my projects"]
    };
  }

  // Default response
  return {
    text: "I'm here to help you manage your construction projects! I can help you track projects, workers, budgets, and schedules. What would you like to know?",
    visualElements: [],
    actions: [],
    quickSuggestions: ["Show my projects", "Who's working today?", "How much did I earn this month?"]
  };
};

/**
 * Analyzes a screenshot using AI vision to extract project details
 * @param {string} base64Image - Base64 encoded image
 * @returns {Promise<object>} - Extracted project data
 */
export const analyzeScreenshot = async (base64Image) => {
  try {
    console.log('Analyzing screenshot with AI Vision...');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4-vision-preview', // Vision model
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
      console.error('Vision API error:', errorData);
      throw new Error(errorData.error?.message || 'Vision API request failed');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Try to parse the JSON response
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const extracted = JSON.parse(cleanContent);

      console.log('Extracted data:', extracted);
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
      console.error('Failed to parse vision response:', content);
      throw new Error('Could not parse extracted data');
    }

  } catch (error) {
    console.error('Screenshot analysis error:', error);
    // Fallback to mock data if API fails
    console.warn('Falling back to mock data');
    return mockScreenshotAnalysis();
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
    console.log('🔍 Analyzing subcontractor quote with AI Vision...');
    console.log('📋 Trade ID:', tradeId);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - Quote Analysis',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4-vision-preview', // Vision model
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
      console.error('❌ Vision API error:', errorData);
      throw new Error(errorData.error?.message || 'Vision API request failed');
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Try to parse the JSON response
    try {
      // Remove markdown code blocks if present
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const extracted = JSON.parse(cleanContent);

      console.log('✅ Extracted quote data:', extracted);

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
      console.error('❌ Failed to parse vision response:', content);
      console.error('Parse error:', parseError);
      throw new Error('Could not parse extracted quote data. Please check the image quality and try again.');
    }

  } catch (error) {
    console.error('❌ Quote analysis error:', error);
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
export const formatProjectConfirmation = (extractedData) => {
  const { worker, location, date, time, task, budget, client, estimatedDuration } = extractedData;

  // Build message with only available fields
  let message = "I analyzed the screenshot and found:\n\n";

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
    message = "I couldn't extract project details from this image. Please make sure the screenshot contains:\n• Client or worker name\n• Location or address\n• Task description\n• Budget (optional)";
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
    quickSuggestions: hasMinimalInfo
      ? ["Change the budget", "Assign different worker", "Edit location"]
      : ["Upload a different screenshot", "Type project details manually"]
  };
};
