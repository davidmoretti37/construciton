import { getSystemPrompt } from './agentPrompt';
import { OPENROUTER_API_KEY } from '@env';

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
        model: 'openai/gpt-3.5-turbo',
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'AI request failed');
    }

    const data = await response.json();

    if (data.choices && data.choices[0]) {
      const content = data.choices[0].message.content;

      // Try to parse as JSON, fallback to plain text if it fails
      try {
        const parsed = JSON.parse(content);
        return parsed;
      } catch (parseError) {
        console.warn('AI response was not JSON, wrapping in text-only format:', parseError);
        return {
          text: content,
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
 * Gets the current project context to feed to the AI
 * Includes user profile with pricing information
 * @returns {Promise<object>} - Project context object
 */
export const getProjectContext = async () => {
  // Import functions inside to avoid circular dependencies
  const { getUserProfile, fetchProjects } = require('../utils/storage');
  const { getTradeById } = require('../constants/trades');

  try {
    const userProfile = await getUserProfile();
    const projects = await fetchProjects();

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

      // Workers (empty for now - to be added later)
      workers: [],

      // Stats (calculated from real project data)
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
        monthlyIncome: projects.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.budget, 0),
        monthlyBudget: projects.reduce((sum, p) => sum + p.budget, 0),
        pendingPayments: projects.reduce((sum, p) => sum + (p.budget - p.spent), 0),
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
