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
   */
  async processStreaming(userMessage, conversationHistory, onChunk, onComplete, onError) {
    try {
      console.log('🧠 [CoreAgent] Received message:', userMessage);

      // Step 1: Build the full context (initial data + conversational memory)
      const fullContext = await this.buildDynamicContext();
      console.log('🧠 [CoreAgent] Built dynamic context.');

      // Step 2: Generate an execution plan using AI
      const plan = await this.generateExecutionPlan(userMessage, conversationHistory, fullContext);
      console.log('🧠 [CoreAgent] Generated execution plan:', plan);

      // Step 3: Update conversation state with the new plan
      this.updateConversationState({ lastPlan: plan });

      // Step 4: Execute the plan and get the final result
      await executePlan(plan, userMessage, fullContext, this.conversationState, conversationHistory, onChunk, onComplete, onError);

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
   * Builds the dynamic context for the current turn.
   * This combines the long-term data from the database with the short-term
   * memory of the current conversation.
   */
  async buildDynamicContext() {
    // Fetch the base data (projects, user profile, etc.)
    const initialContext = await buildInitialContext();

    // Combine with short-term conversational memory
    return {
      ...initialContext,
      conversation: this.conversationState,
    };
  }

  /**
   * Uses AI to analyze the user's message and create a structured execution plan.
   * @param {string} userMessage - The user's input.
   * @param {array} conversationHistory - The chat history.
   * @param {object} context - The full dynamic context.
   * @returns {Promise<object>} - A structured plan, e.g., { plan: [{ agent: '...', task: '...' }] }
   */
  async generateExecutionPlan(userMessage, conversationHistory, context) {
    const { sendMessageToAI } = require('../../aiService');

    const systemPrompt = getCoreAgentPrompt(context);

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

      // Try to parse JSON from response
      let planObject;
      try {
        // Try to extract JSON from response
        const jsonMatch = response.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          planObject = JSON.parse(jsonMatch[0]);
        } else {
          planObject = JSON.parse(response.text);
        }
      } catch (parseError) {
        console.error('❌ Failed to parse plan JSON:', response.text);
        throw new Error('AI did not return valid JSON plan');
      }

      if (!planObject || !planObject.plan) {
        throw new Error('AI did not return a valid execution plan.');
      }

      // Basic validation
      if (!Array.isArray(planObject.plan) || planObject.plan.length === 0) {
        // If plan is empty, default to a simple document search/answer
        return {
          reasoning: "No specific tool or agent matched. Defaulting to a general knowledge response.",
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
