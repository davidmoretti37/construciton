/**
 * BaseWorkerAgent.js - A new base class for specialized worker agents.
 */

import { sendMessageToAIStreaming, getTaskComplexity } from '../../aiService';
import logger from '../../../utils/logger';

export class BaseWorkerAgent {
  constructor(agentName, systemPromptProvider) {
    if (!agentName || !systemPromptProvider) {
      throw new Error("Agent name and system prompt provider are required.");
    }
    this.name = agentName;
    this.systemPromptProvider = systemPromptProvider;
  }

  /**
   * Main processing function for a worker agent.
   * @param {string} task - The specific task from the execution plan.
   * @param {string} userInput - The user's original message for this task.
   * @param {object} context - The full dynamic context.
   * @param {object} conversationState - The current conversation state.
   * @param {array} conversationHistory - The conversation history (messages).
   * @param {function} onChunk - Callback for streaming text chunks.
   * @param {function} onComplete - Callback for the final structured response.
   * @param {function} onError - Callback for errors.
   */
  async processStreaming(task, userInput, context, conversationState, conversationHistory, onChunk, onComplete, onError) {
    // Get task complexity for optimal model selection
    const taskComplexity = getTaskComplexity(task);
    logger.debug(`🤖 [${this.name}] Processing task: ${task} (complexity: ${taskComplexity})`);

    try {
      // Get the specific system prompt for this agent, including the context.
      const systemPrompt = this.systemPromptProvider(context);

      // Construct a message for the AI that includes the specific task.
      const messageForAI = `User Input: "${userInput}"\nTask: "${task}"`;

      // Use the last 10 messages for context (to keep token count reasonable)
      const recentHistory = (conversationHistory || []).slice(-10);

      // Call the AI service with streaming, conversation history, and task complexity
      await sendMessageToAIStreaming(
        messageForAI,
        context,
        recentHistory, // Pass conversation history so AI remembers context
        onChunk,
        onComplete,
        onError,
        systemPrompt,
        { taskComplexity } // Pass task complexity for optimal model selection
      );

    } catch (error) {
      logger.error(`❌ [${this.name}] Error:`, error);
      if (onError) {
        onError(error);
      }
    }
  }
}
