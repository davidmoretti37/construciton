/**
 * Conversation state container.
 *
 * Holds short-lived UI state that survives across chat turns: the most
 * recent project / estimate / service-plan preview the agent emitted, so
 * follow-up actions (Save Draft, Convert to Invoice, etc.) can resolve
 * "the project we were just looking at" without re-fetching.
 *
 * History: this used to be a 1000+ line orchestrator with regex routing,
 * planning, and worker-agent dispatch. That logic moved to the backend
 * (Foreman + sub-agents in backend/src/services/subAgents). Only the
 * state-container surface — `updateConversationState` and
 * `conversationState` — survived because ChatScreen and a couple of
 * action hooks still depend on it. Keep this thin.
 */
class ConversationState {
  constructor() {
    this.conversationState = {};
  }

  updateConversationState(updates) {
    this.conversationState = {
      ...this.conversationState,
      ...updates,
      lastUpdated: new Date().toISOString(),
    };
  }
}

export default new ConversationState();
