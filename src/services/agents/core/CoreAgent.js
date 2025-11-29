/**
 * CoreAgent.js - The Central Orchestrator
 *
 * Responsibilities:
 * 1. Understand user intent and break down complex requests.
 * 2. Maintain a short-term conversational memory ("Dynamic Context").
 * 3. Create a multi-step execution plan.
 * 4. Delegate tasks to specialized "worker" agents.
 * 5. Synthesize results from workers into a coherent response.
 */

import { buildInitialContext } from './AgentContext';
import { executePlan } from './ExecutionEngine';
import { getCoreAgentPrompt } from '../prompts/coreAgentPrompt';
import { setVoiceMode } from '../../aiService';

/**
 * Helper: Check if the AI response contains a question (awaiting user input)
 */
const responseHasQuestion = (response) => {
  const text = response?.text || '';
  // Check for question marks - universal across languages
  return text.includes('?') || text.includes('¿');
};

/**
 * Helper: Check if the AI response indicates task completion
 * This catches cases where the task is done but JSON parsing failed (no visualElements)
 */
const responseIndicatesCompletion = (response) => {
  const text = response?.text || '';
  // Check for universal success indicators (emojis work across all languages)
  return text.includes('✅') || text.includes('✓');
};

/**
 * Helper: Check if user message is likely a new topic vs a short confirmation/response
 * Uses message length as a language-agnostic heuristic
 */
const isNewTopicRequest = (message) => {
  // Longer messages (>30 chars) are likely new requests, not simple confirmations
  return message.trim().length > 30;
};

class CoreAgent {
  constructor() {
    this.conversationState = {}; // In-memory state for the current conversation
  }

  /**
   * Main entry point for processing a user message with streaming.
   * @param {string} userMessage - The user's raw input.
   * @param {array} conversationHistory - The full chat history.
   * @param {function} onChunk - Callback for streaming text chunks to the UI.
   * @param {function} onComplete - Callback when the final, structured response is ready.
   * @param {function} onError - Callback for handling errors.
   * @param {function} onStatusChange - Callback for updating status message (e.g., "Creating project...")
   */
  async processStreaming(userMessage, conversationHistory, onChunk, onComplete, onError, onStatusChange) {
    try {
      console.log('🧠 [CoreAgent] Received message:', userMessage);

      // Step 1: Build the full context (initial data + conversational memory)
      const fullContext = await this.buildDynamicContext(userMessage);
      console.log('🧠 [CoreAgent] Built dynamic context.');

      // Step 2: Generate an execution plan using AI
      const plan = await this.generateExecutionPlan(userMessage, conversationHistory, fullContext);
      console.log('🧠 [CoreAgent] Generated execution plan:', plan);

      // Step 3: Update conversation state with the new plan
      // Store original request for multi-step plans so we have context if needed later
      this.updateConversationState({
        lastPlan: plan,
        originalRequest: plan.plan?.length > 1 ? userMessage : this.conversationState.originalRequest,
      });

      // Wrap onComplete to track active agent state for conversation continuity
      const wrappedOnComplete = (response) => {
        // Check if execution was paused with pending steps (from ExecutionEngine)
        const meta = response?._meta;
        const hasQuestion = responseHasQuestion(response);
        const hasVisualElements = response?.visualElements?.length > 0;
        // Also check for completion indicators in text (catches cases where JSON parse failed)
        const indicatesCompletion = responseIndicatesCompletion(response);
        const taskComplete = hasVisualElements || (indicatesCompletion && !hasQuestion);

        // Store preview data for cross-agent copying (Project↔Estimate)
        if (hasVisualElements) {
          const projectPreview = response.visualElements.find(v => v.type === 'project-preview')?.data;
          const estimatePreview = response.visualElements.find(v => v.type === 'estimate-preview')?.data;

          if (projectPreview) {
            this.updateConversationState({ lastProjectPreview: projectPreview });
            console.log('📦 [CoreAgent] Stored project preview for cross-agent copying');
          }
          if (estimatePreview) {
            this.updateConversationState({ lastEstimatePreview: estimatePreview });
            console.log('📦 [CoreAgent] Stored estimate preview for cross-agent copying');
          }
        }

        if (meta?.paused && meta?.pendingSteps?.length > 0) {
          // PAUSED: Store pending steps and track current agent
          this.updateConversationState({
            activeAgent: meta.currentAgent,
            activeTask: meta.currentTask,
            pendingSteps: meta.pendingSteps,
            awaitingUserInput: true,
          });
          console.log(`⏸️ [CoreAgent] Paused with ${meta.pendingSteps.length} pending steps. Active: ${meta.currentAgent}`);
        } else if (taskComplete) {
          // Task completed - check if we should resume pending steps
          const pendingSteps = this.conversationState.pendingSteps;

          if (pendingSteps?.length > 0) {
            // Task done, but there are pending steps
            // Instead of auto-resuming (which causes confusion), suggest next actions
            console.log(`✅ [CoreAgent] Task completed with ${pendingSteps.length} pending step(s). Suggesting next actions.`);

            // Clear pending steps
            this.updateConversationState({
              activeAgent: null,
              activeTask: null,
              awaitingUserInput: false,
              pendingSteps: null,
              // Store original context for if user wants to continue
              originalRequest: this.conversationState.originalRequest,
            });

            // Add suggestions based on what was pending
            const suggestions = [];
            for (const step of pendingSteps) {
              if (step.agent === 'ProjectAgent') {
                suggestions.push('Create Project');
              } else if (step.agent === 'EstimateInvoiceAgent' && step.task === 'create_estimate') {
                suggestions.push('Create Estimate');
              } else if (step.agent === 'EstimateInvoiceAgent' && step.task === 'create_invoice') {
                suggestions.push('Create Invoice');
              }
            }

            // Call onComplete with added suggestions
            if (onComplete) {
              onComplete({
                ...response,
                quickSuggestions: [...(response.quickSuggestions || []), ...suggestions],
              });
            }
            return; // Don't call onComplete again below
          } else {
            // Task completed, no pending steps - clear everything
            this.updateConversationState({
              activeAgent: null,
              activeTask: null,
              awaitingUserInput: false,
              pendingSteps: null,
            });
            console.log('🧠 [CoreAgent] Task completed, cleared activeAgent');
          }
        } else if (hasQuestion) {
          // Agent is asking for more info - keep them active
          const activeAgent = meta?.currentAgent || plan.plan?.[0]?.agent;
          const activeTask = meta?.currentTask || plan.plan?.[0]?.task;
          this.updateConversationState({
            activeAgent,
            activeTask,
            awaitingUserInput: true,
          });
          console.log(`🧠 [CoreAgent] ${activeAgent} is awaiting user input`);
        } else {
          // No question, no visual elements - clear state
          this.updateConversationState({
            activeAgent: null,
            activeTask: null,
            awaitingUserInput: false,
          });
        }

        // Check if agent requested a handoff to another agent via nextSteps
        if (response?.nextSteps?.length > 0) {
          const handoffAgent = response.nextSteps[0]?.agent;
          const handoffTask = response.nextSteps[0]?.task;
          console.log(`🔀 [CoreAgent] Agent requested handoff to: ${handoffAgent}`);

          // CRITICAL: Set the handoff agent as active BEFORE executing
          // This ensures if the handoff agent asks a question, we route back to them
          this.updateConversationState({
            activeAgent: handoffAgent,
            activeTask: handoffTask,
            awaitingUserInput: false, // Will be set to true if handoff agent asks question
            handoffInProgress: true,
          });

          // Show current response to user first (without nextSteps field)
          if (onComplete) {
            onComplete({
              ...response,
              nextSteps: undefined, // Don't expose internal field to UI
            });
          }

          // Execute the handoff
          const handoffPlan = {
            reasoning: "Agent handoff",
            plan: response.nextSteps
          };

          executePlan(handoffPlan, userMessage, fullContext, this.conversationState, conversationHistory, onChunk, wrappedOnComplete, onError, onStatusChange);
          return; // Don't call onComplete again
        }

        // Call original onComplete
        if (onComplete) {
          onComplete(response);
        }
      };

      // Step 4: Execute the plan and get the final result (pass onStatusChange)
      await executePlan(plan, userMessage, fullContext, this.conversationState, conversationHistory, onChunk, wrappedOnComplete, onError, onStatusChange);

    } catch (error) {
      console.error('❌ [CoreAgent] Critical error:', error);
      if (onError) {
        onError(error);
      }
      // Provide a fallback response if the core fails
      const fallbackResponse = {
        text: "I'm sorry, I encountered a critical error and couldn't process your request. Please try again.",
        visualElements: [],
        actions: [],
        quickSuggestions: ["View my projects", "Check my finances"]
      };
      if (onComplete) {
        onComplete(fallbackResponse);
      }
    }
  }

  /**
   * Helper: Check if query is simple and doesn't need full context
   * Uses message length as a language-agnostic heuristic
   */
  isSimpleQuery(message) {
    // Short messages (<20 chars) are likely simple responses/confirmations
    return message.trim().length < 20;
  }

  /**
   * Builds the dynamic context for the current turn.
   * This combines the long-term data from the database with the short-term
   * memory of the current conversation.
   * Optimizes context size based on query complexity.
   */
  async buildDynamicContext(userMessage = '') {
    // For simple queries, use minimal context (huge speed boost)
    if (this.isSimpleQuery(userMessage)) {
      console.log('⚡ Simple query detected - using minimal context');
      const { getUserProfile } = require('../../../utils/storage');
      const userProfile = await getUserProfile();

      return {
        currentDate: new Date().toISOString(),
        businessInfo: userProfile.businessInfo || {},
        conversation: this.conversationState,
        // Include preview data for cross-agent copying even in minimal context
        lastProjectPreview: this.conversationState.lastProjectPreview || null,
        lastEstimatePreview: this.conversationState.lastEstimatePreview || null,
        // Skip projects, pricing, estimates, etc. for simple responses
      };
    }

    // For complex queries, fetch full context
    const initialContext = await buildInitialContext();

    // Combine with short-term conversational memory
    return {
      ...initialContext,
      conversation: this.conversationState,
      // Include preview data for cross-agent copying (Project↔Estimate)
      lastProjectPreview: this.conversationState.lastProjectPreview || null,
      lastEstimatePreview: this.conversationState.lastEstimatePreview || null,
    };
  }

  /**
   * Creates a lightweight context for routing decisions only.
   * CoreAgent doesn't need full data arrays - just summary stats.
   */
  buildRoutingContext(fullContext) {
    return {
      currentDate: fullContext.currentDate,
      businessInfo: fullContext.businessInfo,
      conversation: fullContext.conversation,
      // Just counts, not full arrays
      stats: fullContext.stats,
      hasProjects: fullContext.projects?.length > 0,
      hasEstimates: fullContext.estimates?.length > 0,
      hasInvoices: fullContext.invoices?.length > 0,
      hasWorkers: fullContext.workers?.length > 0,
      hasScheduleEvents: fullContext.scheduleEvents?.length > 0,
      // Add active agent info for context-aware routing
      activeAgent: this.conversationState.activeAgent,
      awaitingInput: this.conversationState.awaitingUserInput,
    };
  }

  /**
   * Validates an execution plan structure
   * @param {object} plan - The plan object to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  validateExecutionPlan(plan) {
    if (!plan || typeof plan !== 'object') {
      console.warn('⚠️ Plan validation failed: plan is not an object');
      return false;
    }

    if (!plan.plan || !Array.isArray(plan.plan)) {
      console.warn('⚠️ Plan validation failed: plan.plan is not an array');
      return false;
    }

    if (plan.plan.length === 0) {
      console.warn('⚠️ Plan validation failed: plan array is empty');
      return false;
    }

    // Validate each step
    const validAgents = ['ProjectAgent', 'FinancialAgent', 'WorkersSchedulingAgent', 'DocumentAgent', 'EstimateInvoiceAgent', 'SettingsConfigAgent'];

    for (let i = 0; i < plan.plan.length; i++) {
      const step = plan.plan[i];

      if (!step.agent || typeof step.agent !== 'string') {
        console.warn(`⚠️ Plan validation failed: step ${i} missing or invalid agent`);
        return false;
      }

      if (!validAgents.includes(step.agent)) {
        console.warn(`⚠️ Plan validation failed: step ${i} has unknown agent: ${step.agent}`);
        return false;
      }

      if (!step.task || typeof step.task !== 'string') {
        console.warn(`⚠️ Plan validation failed: step ${i} missing or invalid task`);
        return false;
      }

      if (!step.user_input) {
        console.warn(`⚠️ Plan validation failed: step ${i} missing user_input`);
        return false;
      }
    }

    console.log('✅ Plan validation passed');
    return true;
  }

  /**
   * Uses AI to analyze the user's message and create a structured execution plan.
   * @param {string} userMessage - The user's input.
   * @param {array} conversationHistory - The chat history.
   * @param {object} context - The full dynamic context.
   * @param {number} retryCount - Current retry attempt (for recursion)
   * @returns {Promise<object>} - A structured plan, e.g., { plan: [{ agent: '...', task: '...' }] }
   */
  async generateExecutionPlan(userMessage, conversationHistory, context, retryCount = 0) {
    const { sendMessageToAI } = require('../../aiService');

    // CONVERSATION CONTINUITY: If an agent is waiting for a response, continue with them
    // unless the user is clearly starting a new topic
    if (this.conversationState.activeAgent &&
        this.conversationState.awaitingUserInput &&
        !isNewTopicRequest(userMessage)) {
      console.log(`🔄 [CoreAgent] Continuing with ${this.conversationState.activeAgent} (awaiting input)`);
      return {
        reasoning: "Continuing conversation with active agent who asked a question",
        plan: [{
          agent: this.conversationState.activeAgent,
          task: this.conversationState.activeTask,
          user_input: "FULL_MESSAGE"
        }]
      };
    }

    // RESUME PENDING STEPS: If there are pending steps and no active agent awaiting input,
    // resume the pending steps (this happens after a paused task completes)
    if (this.conversationState.pendingSteps?.length > 0 &&
        !this.conversationState.awaitingUserInput) {
      const pendingSteps = this.conversationState.pendingSteps;
      // Clear pending steps so they don't run again
      this.updateConversationState({ pendingSteps: null });

      console.log(`▶️ [CoreAgent] Resuming ${pendingSteps.length} pending step(s)`);
      return {
        reasoning: "Resuming pending tasks after completing previous task",
        plan: pendingSteps
      };
    }

    // Use lightweight routing context to avoid overwhelming CoreAgent with data
    const routingContext = this.buildRoutingContext(context);
    const systemPrompt = getCoreAgentPrompt(routingContext);

    // We create a concise history for the planning stage
    const planningHistory = conversationHistory.slice(-5).map(msg => ({
      role: msg.role,
      content: msg.content.text || msg.content
    }));

    const planningMessage = `User message: "${userMessage}"\n\nConversation History:\n${JSON.stringify(planningHistory)}`;

    try {
      // This call to the AI does NOT stream. It returns a structured JSON plan.
      // Pass empty context and empty history, but provide custom system prompt
      const response = await sendMessageToAI(planningMessage, {}, [], systemPrompt);

      // Log the raw response for debugging
      if (__DEV__) {
        console.log('🔍 [CoreAgent] Raw AI response type:', typeof response);
        console.log('🔍 [CoreAgent] Raw AI response:', JSON.stringify(response).substring(0, 200));
      }

      // Handle both string and object response formats
      let responseText;
      if (typeof response === 'string') {
        responseText = response;
      } else if (response?.text) {
        responseText = response.text;
      } else if (response && typeof response === 'object') {
        // AI might have returned the plan directly without wrapping in text
        // Try to stringify and parse it
        responseText = JSON.stringify(response);
      } else {
        responseText = '';
      }

      if (!responseText) {
        console.error('❌ [CoreAgent] AI returned empty response');
        console.error('📋 Response object:', response);
        throw new Error('AI returned empty response');
      }

      // Try to parse JSON from response with robust error recovery
      let planObject;
      try {
        // First attempt: Try to extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          planObject = JSON.parse(jsonMatch[0]);
        } else {
          planObject = JSON.parse(responseText);
        }
      } catch (parseError) {
        console.warn('⚠️ Initial JSON parse failed, attempting recovery...');

        // Recovery attempt: Extract plan array and reasoning from partial response
        const planArrayMatch = responseText.match(/"plan"\s*:\s*\[([\s\S]*?)\]/);
        const reasoningMatch = responseText.match(/"reasoning"\s*:\s*"([^"]+)"/);


        if (planArrayMatch) {
          try {
            // Reconstruct valid JSON from extracted parts
            const planArrayStr = planArrayMatch[0].split(':', 1)[1]; // Get everything after "plan":
            const recoveredPlan = JSON.parse(`{"plan": ${planArrayStr}}`);
            planObject = {
              reasoning: reasoningMatch ? reasoningMatch[1] : "Recovered from partial response",
              plan: recoveredPlan.plan
            };
            console.log('✅ Successfully recovered plan from partial JSON');
          } catch (recoveryError) {
            console.error('❌ Failed to recover plan JSON:', responseText.substring(0, 500));
            throw new Error('AI did not return valid JSON plan');
          }
        } else {
          console.error('❌ Failed to parse plan JSON (no plan array found):', responseText.substring(0, 500));
          throw new Error('AI did not return valid JSON plan');
        }
      }

      // Accept plan with or without reasoning field
      if (!planObject || !planObject.plan) {
        throw new Error('AI did not return a valid execution plan.');
      }

      // Add default reasoning if missing (for logging purposes)
      if (!planObject.reasoning) {
        planObject.reasoning = "Plan generated";
      }

      // Validate the plan structure
      if (!this.validateExecutionPlan(planObject)) {
        // If validation fails and we haven't retried yet, try again
        if (retryCount < 2) {
          console.log(`🔄 Plan validation failed, retrying (attempt ${retryCount + 1}/2)...`);
          return this.generateExecutionPlan(userMessage, conversationHistory, context, retryCount + 1);
        }

        // If validation fails after retries, default to DocumentAgent
        console.warn('⚠️ Plan validation failed after retries, falling back to DocumentAgent');
        return {
          reasoning: "Plan validation failed. Defaulting to general response.",
          plan: [{
            agent: "DocumentAgent",
            task: "answer_general_question",
            user_input: userMessage
          }]
        };
      }

      return planObject;

    } catch (error) {
      console.error('❌ [CoreAgent] Failed to generate execution plan:', error);

      // On rate limit (429) or provider error, disable voice mode to use standard model
      const errorMsg = error.message || '';
      if (errorMsg.includes('429') || errorMsg.includes('rate') || errorMsg.includes('Provider')) {
        console.log('⚠️ [CoreAgent] Rate limit detected, disabling voice mode for retry');
        setVoiceMode(false);
      }

      // Retry if we haven't exhausted attempts (with delay to avoid rate limits)
      if (retryCount < 2) {
        console.log(`🔄 Retrying plan generation (attempt ${retryCount + 1}/2)...`);
        // Add delay before retry to help with rate limits
        await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
        return this.generateExecutionPlan(userMessage, conversationHistory, context, retryCount + 1);
      }

      // Smart fallback: If we're in the middle of project creation, continue with ProjectAgent
      if (this.conversationState.inProgressProject &&
          Object.keys(this.conversationState.inProgressProject).length > 0) {
        console.log('🔄 [CoreAgent] Detected in-progress project, routing to ProjectAgent');
        return {
          reasoning: "Continuing project creation flow despite planning error.",
          plan: [{
            agent: "ProjectAgent",
            task: "continue_project_creation",
            user_input: userMessage
          }]
        };
      }

      // Otherwise fallback to DocumentAgent
      return {
        reasoning: "Failed to generate a detailed plan. Falling back to a simple document search.",
        plan: [{
          agent: "DocumentAgent",
          task: "answer_general_question",
          user_input: userMessage
        }]
      };
    }
  }

  /**
   * Updates the internal state of the conversation.
   * @param {object} updates - The data to add to the conversation state.
   */
  updateConversationState(updates) {
    this.conversationState = {
      ...this.conversationState,
      ...updates,
      lastUpdated: new Date().toISOString(),
    };
  }
}

export default new CoreAgent();
