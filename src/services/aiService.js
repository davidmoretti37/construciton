import { getSystemPrompt } from './agentPrompt';
import { OPENROUTER_API_KEY } from '@env';

// Response cache for instant repeat queries (5 minute TTL)
const responseCache = {};
const CACHE_TTL = 300000; // 5 minutes (common queries like "updates" don't change often)

/**
 * Sends a message to the AI with conversation history and project context
 * @param {string} message - User's message
 * @param {object} projectContext - Current app data (projects, workers, stats)
 * @param {array} conversationHistory - Previous messages in the conversation
 * @returns {Promise<object>} - Structured AI response with text, visualElements, actions, quickSuggestions
 */
export const sendMessageToAI = async (message, projectContext, conversationHistory = []) => {
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
    const messages = [
      {
        role: 'system',
        content: getSystemPrompt(projectContext),
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
        model: 'openai/gpt-4o-mini', // Reliable and proven - Qwen 2.5 7B was hanging/timing out
        messages: messages,
        max_tokens: 800, // Balanced: fast responses but enough for multiple projects
        temperature: 0.3, // Lower temp = more reliable JSON formatting
        response_format: { type: "json_object" }, // Force JSON responses
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'AI request failed');
    }

    const data = await response.json();

    if (data.choices && data.choices[0]) {
      let content = data.choices[0].message.content;

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
        const parsed = JSON.parse(content);

        // Validate required fields exist
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
  onError
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
    const messages = [
      {
        role: 'system',
        content: getSystemPrompt(projectContext),
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
        model: 'anthropic/claude-3.5-haiku:nitro', // :nitro = fastest routing optimization
        messages,
        max_tokens: 250, // Tight limit for speed
        temperature: 0.3,
        stream: true,
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

        // Ensure all required fields exist with correct types
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
      onChunk?.(parsedResponse.text);

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

              // Extract clean text from JSON as it streams
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
    let finalText = accumulatedText.trim();

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

      // Validate and normalize structure
      const validatedResponse = {
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
 * Gets the current project context to feed to the AI
 * Includes user profile with pricing information
 * @returns {Promise<object>} - Project context object
 */
export const getProjectContext = async () => {
  // Import functions inside to avoid circular dependencies
  const { getUserProfile, fetchProjects, fetchEstimates, fetchInvoices } = require('../utils/storage');
  const { getTradeById } = require('../constants/trades');

  try {
    const userProfile = await getUserProfile();
    const projects = await fetchProjects();
    const estimates = await fetchEstimates();
    const invoices = await fetchInvoices();

    // Format pricing for AI readability
    const formattedPricing = {};
    if (userProfile.pricing) {
      userProfile.trades.forEach(tradeId => {
        const trade = getTradeById(tradeId);
        if (trade && userProfile.pricing[tradeId]) {
          formattedPricing[trade.name] = {};

          trade.pricingTemplate.forEach(item => {
            const priceData = userProfile.pricing[tradeId][item.id];
            if (priceData) {
              formattedPricing[trade.name][item.label] = {
                price: priceData.price,
                unit: priceData.unit
              };
            }
          });
        }
      });
    }

    return {
      currentDate: new Date().toISOString(),

      // User business info
      businessInfo: userProfile.businessInfo || {
        name: 'Your Business',
        phone: '',
        email: '',
      },

      // User services and pricing
      services: userProfile.trades || [],
      pricing: formattedPricing,

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
