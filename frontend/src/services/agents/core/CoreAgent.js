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

import { buildInitialContext, fetchAgentSpecificContext } from './AgentContext';
import { executePlan } from './ExecutionEngine';
import { getCoreAgentPrompt } from '../prompts/coreAgentPrompt';
import { setVoiceMode } from '../../aiService';
import { checkDeterministicResponse } from './DeterministicResponder';
import { responseCache } from './CacheService';
import { memoryService } from './MemoryService';
import logger from '../../../utils/logger';

/**
 * FAST KEYWORD ROUTING
 * Skip AI planning for common, predictable requests.
 * Returns a route object if matched, null otherwise.
 *
 * This saves 500ms-2000ms on obvious requests by avoiding the planning AI call.
 */
const FAST_ROUTES = [
  // ==================== GREETINGS (standalone only) ====================
  { patterns: [/^(hello|hi|hey|good morning|good afternoon|good evening|what's up|howdy)[\s!?.]*$/i],
    route: { agent: 'DocumentAgent', task: 'answer_general_question' } },

  // ==================== ESTIMATES (CHECK BEFORE PROJECTS) ====================
  // Estimate LOOKUP first — "show/find/get estimate" should never be creation
  { patterns: [/\b(show|list|find|get|see|view)\b.*\bestimates?\b/i, /\bmy estimates\b/i],
    route: { agent: 'EstimateInvoiceAgent', task: 'find_estimates' } },
  // Estimate SEND
  { patterns: [/\b(send|email|share|text)\b.*\bestimate\b/i, /\bestimate\b.*\b(send|email|share)\b/i],
    route: { agent: 'EstimateInvoiceAgent', task: 'send_estimate' } },
  // Estimate CREATION — only explicit creation verbs (removed greedy "estimate.*for" pattern)
  { patterns: [
      /\b(create|new|make|generate|build)\b.*\bestimate\b/i,              // "create an estimate"
      /\b(create|new|make)\b.*\bquote\b/i,                                // "create a quote"
      /\bhow much\b.*\b(cost|charge|would it)\b/i,                        // "how much would it cost"
      /\bestimate\b.*\bcreate\b/i,                                        // "estimate create" (only matches "create", not "for")
    ],
    route: { agent: 'EstimateInvoiceAgent', task: 'create_estimate' } },

  // ==================== INVOICES ====================
  // Invoice LOOKUP first
  { patterns: [/\b(show|list|find|get|see|view)\b.*\binvoices?\b/i, /\bmy invoices\b/i],
    route: { agent: 'EstimateInvoiceAgent', task: 'find_invoices' } },
  // Invoice SEND
  { patterns: [/\b(send|email|share|text)\b.*\binvoice\b/i, /\binvoice\b.*\b(send|email|share)\b/i],
    route: { agent: 'EstimateInvoiceAgent', task: 'send_estimate' } },
  // Invoice CREATION
  { patterns: [/\b(create|new|make|generate)\b.*\binvoice\b/i, /\binvoice\b.*\bcreate\b/i],
    route: { agent: 'EstimateInvoiceAgent', task: 'create_invoice' } },

  // ==================== WORKERS (CHECK BEFORE PROJECT UPDATE) ====================
  // Worker management — must be before project update so "add worker to project" isn't stolen
  { patterns: [/\b(add|create|new|hire)\b.*\bworker\b/i, /\bworker\b.*\b(add|create|new)\b/i],
    route: { agent: 'WorkersSchedulingAgent', task: 'manage_worker' } },
  { patterns: [/\b(show|list|get|see|who)\b.*\bworkers?\b/i, /\bmy (workers|crew|team)\b/i],
    route: { agent: 'WorkersSchedulingAgent', task: 'query_workers' } },
  { patterns: [/\b(assign|send)\b.*\bworker\b/i, /\bworker\b.*\b(assign|send)\b/i],
    route: { agent: 'WorkersSchedulingAgent', task: 'assign_worker' } },
  // Worker status queries
  { patterns: [
      /\bis\s+\w+\s+working/i,                           // "is João working"
      /\b(who|anyone|anybody)\s+(is\s+)?(working|clocked|on.?site)/i,  // "who is working"
      /\b(who('s)?|anyone)\s+clocked\s+in/i,             // "who's clocked in"
      /\bworking\s+today\b/i,                            // "working today?"
      /\bclocked\s+in\s+today\b/i,                       // "clocked in today"
    ],
    route: { agent: 'WorkersSchedulingAgent', task: 'track_time' } },
  { patterns: [/\b(clock|punch)\s+(in|out)\b/i, /\bstart\s+(shift|work)\b/i],
    route: { agent: 'WorkersSchedulingAgent', task: 'track_time' } },

  // ==================== SCHEDULE ====================
  { patterns: [/\b(show|get|check|what('s)?)\b.*\b(schedule|calendar)\b/i, /\bmy (schedule|calendar)\b/i],
    route: { agent: 'WorkersSchedulingAgent', task: 'retrieve_schedule_events' } },
  { patterns: [/\b(add|create|schedule|update|change)\b.*\b(event|meeting|appointment)\b/i],
    route: { agent: 'WorkersSchedulingAgent', task: 'manage_schedule_event' } },

  // ==================== DAILY REPORTS ====================
  { patterns: [/\b(show|get|see|list|view)\b.*\bdaily\s*reports?\b/i, /\bdaily\s*reports?\b/i, /\breports?\s+today\b/i],
    route: { agent: 'WorkersSchedulingAgent', task: 'retrieve_daily_reports' } },

  // ==================== FINANCIAL ====================
  // Financial RECORDING — "record/log expense" (check before project update so "add expense" isn't stolen)
  { patterns: [
      /\b(record|log)\b.*\b(expense|payment|transaction|income)\b/i,       // "record expense", "log payment"
      /\b(add|record|log)\b.*\b(expense|payment|transaction)\b(?!.*\b(project|job)\b)/i,  // "add expense" but NOT "add expense to project"
    ],
    route: { agent: 'FinancialAgent', task: 'record_transaction' } },
  { patterns: [/\b(how much|total|sum)\b.*\b(income|earned|made|revenue)\b/i, /\b(income|earnings|revenue)\b.*\b(total|this|last)\b/i],
    route: { agent: 'FinancialAgent', task: 'analyze_financials' } },
  { patterns: [/\b(show|list|get)\b.*\b(expenses?|transactions?|payments?)\b/i],
    route: { agent: 'FinancialAgent', task: 'query_transactions' } },
  // Profit/financial analysis — require more context (bare "profit" alone is too broad)
  { patterns: [
      /\b(what('s)?|how much|total|show|my)\b.*\bprofit\b/i,               // "what's my profit", "how much profit"
      /\bhow.*(doing|going)\b.*\b(financially|money)\b/i,                  // "how am I doing financially"
      /\b(analyze|analysis|breakdown)\b.*\b(financ|money|budget)\b/i,      // "analyze finances"
    ],
    route: { agent: 'FinancialAgent', task: 'analyze_financials' } },

  // ==================== SETTINGS ====================
  // Profit MARGINS settings (must be before generic financial analysis)
  { patterns: [
      /\b(set|update|change|adjust|edit)\b.*\b(profit\s*)?margins?\b/i,    // "set profit margins", "change margins"
      /\bmargins?\b.*\b(set|update|change|adjust)\b/i,                     // "margins update"
    ],
    route: { agent: 'SettingsConfigAgent', task: 'manage_profit_margins' } },
  { patterns: [/\b(show|get|view)\b.*\b(settings?|preferences?)\b/i, /\bmy settings\b/i],
    route: { agent: 'SettingsConfigAgent', task: 'query_settings' } },
  { patterns: [/\b(update|change|edit)\b.*\b(settings?|preferences?)\b/i],
    route: { agent: 'SettingsConfigAgent', task: 'manage_business_settings' } },
  { patterns: [/\b(update|change|edit)\b.*\b(business|company)\b.*\b(info|name|details|address|phone|email|logo)\b/i],
    route: { agent: 'SettingsConfigAgent', task: 'manage_business_settings' } },
  { patterns: [/\b(service|pricing)\b.*\b(catalog|list|prices?)\b/i, /\bmy (services|prices)\b/i],
    route: { agent: 'SettingsConfigAgent', task: 'manage_service_catalog' } },

  // ==================== PROJECTS LOOKUP (CHECK BEFORE UPDATE/CREATION) ====================
  // Must be before creation so "show me the new project" matches lookup, not creation
  { patterns: [
      /\b(show|list|get|see|find|view)\b.*\b(projects?|jobs?)\b/i,         // "show my projects", "find the project"
      /\bmy (projects|jobs)\b/i,                                            // "my projects"
      /\b(active|current)\b.*\b(projects?|jobs?)\b/i,                      // "active projects"
    ],
    route: { agent: 'DocumentAgent', task: 'find_project' } },

  // ==================== PROJECT DELETE ====================
  { patterns: [/\b(delete|remove)\b.*\b(project|job)s?\b/i, /\b(project|job)s?\b.*\b(delete|remove)\b/i],
    route: { agent: 'DocumentAgent', task: 'delete_project' } },

  // ==================== PROJECT UPDATES ====================
  // Tighter patterns — only match when the verb directly applies to the project itself
  { patterns: [
      /\b(update|change|edit|modify)\b.*\b(the |my |this )?(project|job)\b/i,   // "update the project", "change my project"
      /\b(project|job)\b.*\b(update|change|edit|modify|needs?\s+update)\b/i,    // "project needs update"
      /\badd\b.*\b(details?|info|data|numbers?|budget|amount|phase|timeline)\b.*\b(to|for|in|on)\b.*\b(project|job)\b/i,  // "add details to the project" (specific nouns only)
      /\badd\b.*\b(to|into)\b.*\b(the |my |this )(project|job)\b(?!.*\bnew\b)/i,  // "add this to the project" (but not "add a new project")
    ],
    route: { agent: 'DocumentAgent', task: 'update_project' } },

  // ==================== PROJECT CREATION ====================
  { patterns: [
      /\b(create|new|start)\b.*\b(project|job)\b/i,                         // "create/new/start a project"
      /\bproject\b.*\b(create|new|start)\b/i,                               // "project create/new/start"
      /\b(got|have)\b.*\b(a |an )?(job|project)\b.*\b(to |for )/i,          // "I got a job to install..." (removed "need" — too ambiguous)
      /\b(install|replace|repair|fix)\b.*\b(toilet|faucet|sink|pipe|roof|floor|window|door|drywall)\b/i,  // Direct work descriptions
      /\bmake\b.*\b(a |an ).*\b(new )?(project|job)\b/i,                    // "make a new project" (requires "a/an")
      /\badd\b.*\b(a |an )\b.*\bnew\b.*\b(project|job)\b/i,                 // "add a new project" — explicit "new" = creation
    ],
    route: { agent: 'ProjectAgent', task: 'start_project_creation' } },

  // ==================== PHOTOS ====================
  { patterns: [
      /\b(show|get|see|view|find)\b.*\b(photos?|pictures?|images?)\b/i,    // "show me project photos"
      /\b(job\s*site|project)\b.*\b(photos?|pictures?)\b/i,                // "job site photos"
    ],
    route: { agent: 'WorkersSchedulingAgent', task: 'retrieve_photos' } },

  // ==================== WORKER PAYMENTS ====================
  { patterns: [
      /\b(how much|what)\b.*\b(owe|pay)\b.*\bworker\b/i,                  // "how much do I owe the worker"
      /\b(calculate|compute)\b.*\b(worker|crew)\b.*\bpay\b/i,             // "calculate worker pay"
      /\bworker\b.*\bpay(ment|roll)?\b/i,                                  // "worker payment"
    ],
    route: { agent: 'WorkersSchedulingAgent', task: 'query_worker_payment' } },

  // ==================== CONTRACTS ====================
  { patterns: [
      /\b(show|get|view|list)\b.*\bcontracts?\b/i,                        // "show my contracts"
      /\bmy contracts\b/i,
    ],
    route: { agent: 'DocumentAgent', task: 'list_contract_documents' } },

  // ==================== HELP & GENERAL (CHECKED LAST — fallback) ====================
  // Moved to end so "how do I create a project" matches project creation FIRST,
  // and only truly general help questions land here
  { patterns: [
      /^(help|what can you do|how do you work)[\s!?.]*$/i,                 // standalone help
      /\bcan\s+(i|the|a|my)\s+(supervisor|worker|owner)s?\b/i,     // role capability questions
      /\bwhat\s+(can|does)\s+(a|the|my)\s+(supervisor|worker|owner)s?\b/i,  // "what can my supervisor do"
      /\bpermissions?\b.*\b(supervisor|worker|owner)\b/i,           // "supervisor permissions" (tighter — requires role noun)
      /\btutorial\b/i,
      /\bguide\s+me\b/i,
      /\binstructions?\b/i,
      /\bhow\s+to\s+use\b/i,                                              // "how to use the app"
      /\bhow\s+does\b.*\b(app|feature|system)\b.*\bwork\b/i,              // "how does this feature work" (requires "app/feature/system")
    ],
    route: { agent: 'DocumentAgent', task: 'answer_general_question' } },
];

// ⛔ Agents that supervisors cannot access
const SUPERVISOR_RESTRICTED_AGENTS = ['ProjectAgent', 'EstimateInvoiceAgent'];

// Helper to get supervisor blocking response
const getSupervisorBlockingResponse = (attemptedAgent, attemptedTask) => {
  let actionType = 'that feature';
  if (attemptedAgent === 'ProjectAgent') actionType = 'creating projects';
  else if (attemptedTask?.includes('estimate')) actionType = 'creating estimates';
  else if (attemptedTask?.includes('invoice')) actionType = 'creating invoices';

  return {
    text: `As a supervisor, I can't help with ${actionType}. Only your owner can do that.\n\nI can help you with:\n• Viewing your assigned projects\n• Tracking worker hours and schedules\n• Submitting daily reports\n• Logging transactions\n\nWhat would you like help with?`,
    visualElements: [],
    actions: []
  };
};

/**
 * Attempts to route a message using keyword matching.
 * Returns { agent, task, user_input } for single intent,
 * or an array of routes for compound queries (multiple intents).
 */
const fastRouteMessage = (message) => {
  const trimmed = message.trim();

  // Skip fast routing for very short messages (likely confirmations)
  if (trimmed.length < 5) return null;

  // Skip fast routing for messages that look like follow-ups/confirmations
  if (/^(yes|no|ok|okay|sure|yeah|yep|nope|cancel|nevermind|thanks|thank you)$/i.test(trimmed)) {
    return null;
  }

  // Check for compound queries (multiple intents connected by "and", "also", etc.)
  const hasCompoundConnector = /\b(and|also|then|plus)\s+(show|get|see|list|give|tell|what|who|how)/i.test(message);

  if (hasCompoundConnector) {
    // Split on compound connectors, preserving the connector for context
    const parts = message.split(/\s+(?:and|also|then|plus)\s+/i).map(p => p.trim()).filter(p => p.length > 3);

    if (parts.length >= 2) {
      const routes = [];
      const matchedTasks = new Set(); // Avoid duplicate tasks

      for (const part of parts) {
        for (const { patterns, route } of FAST_ROUTES) {
          for (const pattern of patterns) {
            if (pattern.test(part) && !matchedTasks.has(route.task)) {
              logger.debug(`⚡ [FastRoute] Compound match: "${part}" -> ${route.agent} -> ${route.task}`);
              routes.push({
                ...route,
                user_input: part
              });
              matchedTasks.add(route.task);
              break; // Found a match for this part, move to next part
            }
          }
          if (matchedTasks.has(route.task)) break;
        }
      }

      // If we found multiple routes, return them as an array
      if (routes.length > 1) {
        logger.debug(`⚡ [FastRoute] Compound query detected with ${routes.length} intents`);
        return routes;
      }
    }
  }

  // Single intent matching (original logic)
  for (const { patterns, route } of FAST_ROUTES) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        logger.debug(`⚡ [FastRoute] Matched pattern for ${route.agent} -> ${route.task}`);
        return {
          ...route,
          user_input: message
        };
      }
    }
  }

  return null;
};

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
 * Helper: Check if user message is likely a new topic vs a response to agent's question
 * Uses message length + topic-switch keywords as language-agnostic heuristics
 */
const isNewTopicRequest = (message) => {
  const trimmed = message.trim().toLowerCase();

  // Check for explicit topic-switch keywords (works in EN/PT/ES)
  const topicSwitchKeywords = [
    'actually', 'nevermind', 'never mind', 'instead', 'wait', 'cancel',
    'na verdade', 'deixa', 'cancela', 'esquece',  // Portuguese
    'en realidad', 'mejor', 'cancela', 'olvida',   // Spanish
  ];

  if (topicSwitchKeywords.some(kw => trimmed.includes(kw))) {
    return true;
  }

  // Only treat very long messages as new topics (user likely asking something new)
  // Short-medium responses (even 100+ chars) are usually answers to agent questions
  return trimmed.length > 150;
};

class CoreAgent {
  constructor() {
    this.conversationState = {}; // In-memory state for the current conversation
  }

  /**
   * Main entry point for processing a user message with streaming.
   * OPTIMIZED: Now runs fast route check FIRST, then fetches only agent-specific data.
   *
   * @param {string} userMessage - The user's raw input.
   * @param {array} conversationHistory - The full chat history.
   * @param {function} onChunk - Callback for streaming text chunks to the UI.
   * @param {function} onComplete - Callback when the final, structured response is ready.
   * @param {function} onError - Callback for handling errors.
   * @param {function} onStatusChange - Callback for updating status message (e.g., "Creating project...")
   */
  async processStreaming(userMessage, conversationHistory, onChunk, onComplete, onError, onStatusChange) {
    try {
      logger.debug('🧠 [CoreAgent] Received message:', userMessage);
      const startTime = Date.now();

      // ⚡ OPTIMIZATION: Check fast routes FIRST (before any DB queries)
      // This can save 800-1200ms by avoiding full context fetch
      // Strip attachment context so fast routes only match user's actual text
      const userTextForRouting = userMessage.startsWith('[The user attached')
        ? userMessage.replace(/^\[The user attached[\s\S]*?\]\n\n/, '').trim()
        : userMessage;
      const fastRoute = fastRouteMessage(userTextForRouting);
      let fullContext;
      let plan;

      // Also check conversation continuity (no DB needed for this check)
      const hasContinuingConversation = this.conversationState.activeAgent &&
        this.conversationState.awaitingUserInput &&
        !isNewTopicRequest(userMessage);

      if (fastRoute) {
        // Check if this is a compound query (array of routes) or single route
        const isCompoundQuery = Array.isArray(fastRoute);
        const primaryRoute = isCompoundQuery ? fastRoute[0] : fastRoute;

        // ⚡ FAST PATH: We know the agent(s), fetch only required data
        if (isCompoundQuery) {
          logger.debug(`⚡ [CoreAgent] Compound query matched: ${fastRoute.length} intents`);
          fastRoute.forEach((r, i) => logger.debug(`  ${i + 1}. ${r.agent} -> ${r.task}`));
        } else {
          logger.debug(`⚡ [CoreAgent] Fast route matched: ${fastRoute.agent} -> ${fastRoute.task}`);
        }

        // ⛔ SUPERVISOR CHECK: Block restricted agents for supervisors
        const { getCurrentUserContext } = require('../../../utils/storage/auth');
        const userContext = await getCurrentUserContext();
        const isSupervisor = userContext?.role === 'supervisor';

        if (isSupervisor && SUPERVISOR_RESTRICTED_AGENTS.includes(primaryRoute.agent)) {
          logger.debug(`⛔ [CoreAgent] Blocking ${primaryRoute.agent} for supervisor`);
          const blockingResponse = getSupervisorBlockingResponse(primaryRoute.agent, primaryRoute.task);
          if (onChunk) onChunk(blockingResponse.text);
          if (onComplete) onComplete(blockingResponse);
          return;
        }

        // Fetch context for all agents involved in compound query
        if (isCompoundQuery) {
          const uniqueAgents = [...new Set(fastRoute.map(r => r.agent))];
          // Fetch context for each unique agent and merge
          const contextPromises = uniqueAgents.map(agent => fetchAgentSpecificContext(agent));
          const contexts = await Promise.all(contextPromises);
          fullContext = contexts.reduce((merged, ctx) => ({ ...merged, ...ctx }), {});
        } else {
          fullContext = await fetchAgentSpecificContext(primaryRoute.agent);
        }
        fullContext.conversation = this.conversationState;
        fullContext.lastProjectPreview = this.conversationState.lastProjectPreview || null;
        fullContext.lastEstimatePreview = this.conversationState.lastEstimatePreview || null;
        fullContext.lastServicePlanPreview = this.conversationState.lastServicePlanPreview || null;

        // ⚡⚡ DETERMINISTIC PATH: Only for single-intent queries (compound queries need full execution)
        if (!isCompoundQuery) {
          const deterministicResponse = checkDeterministicResponse(
            userMessage,
            fullContext,
            fastRoute.agent,
            fastRoute.task
          );

          if (deterministicResponse) {
            const deterministicLatency = Date.now() - startTime;
            logger.debug(`⚡⚡ [CoreAgent] Deterministic response in ${deterministicLatency}ms (no LLM!)`);

            // Convert deterministic format to UI-expected format
            const uiResponse = {
              text: deterministicResponse.response,
              visualElements: [],
              actions: [],
              _deterministic: true,
              _data: deterministicResponse.data
            };

            // Update conversation state
            this.conversationState.lastResponse = deterministicResponse;
            this.conversationState.activeAgent = fastRoute.agent;

            // Return immediately - no LLM call needed
            if (onChunk) onChunk(uiResponse.text);
            if (onComplete) onComplete(uiResponse);
            return;
          }

          // ⚡ Check cache before LLM call (deterministic missed, try cache)
          const cachedResponse = responseCache.get(userMessage, fastRoute.agent, fullContext);
          if (cachedResponse) {
            const cacheLatency = Date.now() - startTime;
            logger.debug(`⚡ [CoreAgent] Cache hit in ${cacheLatency}ms (no LLM!)`);

            // Update conversation state
            this.conversationState.lastResponse = cachedResponse;
            this.conversationState.activeAgent = fastRoute.agent;

            // Return cached response
            if (onChunk) onChunk(cachedResponse.text);
            if (onComplete) onComplete(cachedResponse);
            return;
          }
        }

        // Build execution plan (multi-step for compound, single-step for simple)
        plan = {
          reasoning: isCompoundQuery
            ? `Compound query routing (${fastRoute.length} intents detected - no LLM planning)`
            : "Fast keyword routing (optimized path - no LLM planning)",
          plan: isCompoundQuery ? fastRoute : [fastRoute]
        };

        const fastLatency = Date.now() - startTime;
        logger.debug(`⚡ [CoreAgent] Fast path completed in ${fastLatency}ms (LLM still needed for execution)`);

      } else if (hasContinuingConversation) {
        // ⚡ CONTINUATION PATH: Route back to active agent
        logger.debug(`🔄 [CoreAgent] Continuing with ${this.conversationState.activeAgent} (awaiting input)`);

        fullContext = await fetchAgentSpecificContext(this.conversationState.activeAgent);
        fullContext.conversation = this.conversationState;
        fullContext.lastProjectPreview = this.conversationState.lastProjectPreview || null;
        fullContext.lastEstimatePreview = this.conversationState.lastEstimatePreview || null;
        fullContext.lastServicePlanPreview = this.conversationState.lastServicePlanPreview || null;

        plan = {
          reasoning: "Continuing conversation with active agent who asked a question",
          plan: [{
            agent: this.conversationState.activeAgent,
            task: this.conversationState.activeTask,
            user_input: "FULL_MESSAGE"
          }]
        };

      } else {
        // SLOW PATH: Need full context for LLM planning
        logger.debug('🧠 [CoreAgent] No fast route match, using LLM planning...');

        // Step 1: Build the full context (initial data + conversational memory)
        fullContext = await this.buildDynamicContext(userMessage);
        logger.debug('🧠 [CoreAgent] Built full dynamic context.');

        // Step 2: Generate an execution plan using AI
        plan = await this.generateExecutionPlan(userMessage, conversationHistory, fullContext);

        const slowLatency = Date.now() - startTime;
        logger.debug(`🧠 [CoreAgent] Slow path (LLM planning) completed in ${slowLatency}ms`);
      }

      logger.debug('🧠 [CoreAgent] Generated execution plan:', plan);

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

        // Store preview data for cross-agent copying (Project↔Estimate↔ServicePlan)
        if (hasVisualElements) {
          const projectPreview = response.visualElements.find(v => v.type === 'project-preview')?.data;
          const estimatePreview = response.visualElements.find(v => v.type === 'estimate-preview')?.data;
          const servicePlanPreview = response.visualElements.find(v => v.type === 'service-plan-preview')?.data;

          if (projectPreview) {
            this.updateConversationState({ lastProjectPreview: projectPreview });
            logger.debug('📦 [CoreAgent] Stored project preview for cross-agent copying');
          }
          if (estimatePreview) {
            this.updateConversationState({ lastEstimatePreview: estimatePreview });
            logger.debug('📦 [CoreAgent] Stored estimate preview for cross-agent copying');
          }
          if (servicePlanPreview) {
            this.updateConversationState({ lastServicePlanPreview: servicePlanPreview });
            logger.debug('📦 [CoreAgent] Stored service plan preview for cross-agent copying');
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
          logger.debug(`⏸️ [CoreAgent] Paused with ${meta.pendingSteps.length} pending steps. Active: ${meta.currentAgent}`);
        } else if (taskComplete) {
          // Task completed - check if we should resume pending steps
          const pendingSteps = this.conversationState.pendingSteps;

          if (pendingSteps?.length > 0) {
            // Task done, but there are pending steps
            // Instead of auto-resuming (which causes confusion), suggest next actions
            logger.debug(`✅ [CoreAgent] Task completed with ${pendingSteps.length} pending step(s). Suggesting next actions.`);

            // Clear pending steps
            this.updateConversationState({
              activeAgent: null,
              activeTask: null,
              awaitingUserInput: false,
              pendingSteps: null,
              // Store original context for if user wants to continue
              originalRequest: this.conversationState.originalRequest,
            });

            // Call onComplete with the response
            if (onComplete) {
              onComplete(response);
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
            logger.debug('🧠 [CoreAgent] Task completed, cleared activeAgent');
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
          logger.debug(`🧠 [CoreAgent] ${activeAgent} is awaiting user input`);
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
          logger.debug(`🔀 [CoreAgent] Agent requested handoff to: ${handoffAgent}`);

          // ⛔ SUPERVISOR CHECK: Block handoff to restricted agents
          if (fullContext?.isSupervisorMode && SUPERVISOR_RESTRICTED_AGENTS.includes(handoffAgent)) {
            logger.debug(`⛔ [CoreAgent] Blocking handoff to ${handoffAgent} for supervisor`);
            const blockingResponse = getSupervisorBlockingResponse(handoffAgent, handoffTask);
            if (onComplete) onComplete(blockingResponse);
            return;
          }

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

        // ⚡ Cache the LLM response for future identical queries
        if (fastRoute && response && !response._deterministic) {
          responseCache.set(
            userMessage,
            fastRoute.agent,
            fullContext,
            response,
            fastRoute.task
          );
        }

        // 🧠 Extract and save facts from this conversation turn (long-term memory)
        try {
          const facts = memoryService.extractFacts(userMessage, response);
          if (facts.length > 0) {
            memoryService.saveFacts(facts);
            logger.debug(`🧠 [CoreAgent] Extracted ${facts.length} fact(s) from conversation`);
          }
        } catch (memoryError) {
          // Don't let memory errors break the main flow
          logger.warn('🧠 [CoreAgent] Memory extraction warning:', memoryError);
        }

        // Call original onComplete
        if (onComplete) {
          onComplete(response);
        }
      };

      // Step 4: Execute the plan and get the final result (pass onStatusChange)
      await executePlan(plan, userMessage, fullContext, this.conversationState, conversationHistory, onChunk, wrappedOnComplete, onError, onStatusChange);

    } catch (error) {
      logger.error('❌ [CoreAgent] Critical error:', error);
      if (onError) {
        onError(error);
      }
      // Provide a fallback response if the core fails
      const fallbackResponse = {
        text: "I'm sorry, I encountered a critical error and couldn't process your request. Please try again.",
        visualElements: [],
        actions: [],
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
  async buildDynamicContext(userMessage = '') {
    // Always fetch full context - the performance gain of skipping
    // is not worth the risk of missing data for legitimate queries
    const initialContext = await buildInitialContext();

    return {
      ...initialContext,
      conversation: this.conversationState,
      lastProjectPreview: this.conversationState.lastProjectPreview || null,
      lastEstimatePreview: this.conversationState.lastEstimatePreview || null,
      lastServicePlanPreview: this.conversationState.lastServicePlanPreview || null,
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
      // Draft project awareness for routing
      hasDraftProject: !!this.conversationState.lastProjectPreview,
      draftProjectName: this.conversationState.lastProjectPreview?.projectName || null,
      // Draft service plan awareness for routing
      hasDraftServicePlan: !!this.conversationState.lastServicePlanPreview,
      draftServicePlanName: this.conversationState.lastServicePlanPreview?.name || this.conversationState.lastServicePlanPreview?.planName || null,
    };
  }

  /**
   * Validates an execution plan structure
   * @param {object} plan - The plan object to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  validateExecutionPlan(plan) {
    if (!plan || typeof plan !== 'object') {
      logger.warn('⚠️ Plan validation failed: plan is not an object');
      return false;
    }

    if (!plan.plan || !Array.isArray(plan.plan)) {
      logger.warn('⚠️ Plan validation failed: plan.plan is not an array');
      return false;
    }

    if (plan.plan.length === 0) {
      logger.warn('⚠️ Plan validation failed: plan array is empty');
      return false;
    }

    // Validate each step
    const validAgents = ['ProjectAgent', 'FinancialAgent', 'WorkersSchedulingAgent', 'DocumentAgent', 'EstimateInvoiceAgent', 'SettingsConfigAgent'];

    for (let i = 0; i < plan.plan.length; i++) {
      const step = plan.plan[i];

      if (!step.agent || typeof step.agent !== 'string') {
        logger.warn(`⚠️ Plan validation failed: step ${i} missing or invalid agent`);
        return false;
      }

      if (!validAgents.includes(step.agent)) {
        logger.warn(`⚠️ Plan validation failed: step ${i} has unknown agent: ${step.agent}`);
        return false;
      }

      if (!step.task || typeof step.task !== 'string') {
        logger.warn(`⚠️ Plan validation failed: step ${i} missing or invalid task`);
        return false;
      }

      if (!step.user_input) {
        logger.warn(`⚠️ Plan validation failed: step ${i} missing user_input`);
        return false;
      }
    }

    logger.debug('✅ Plan validation passed');
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
    const { sendMessageToAI, sendPlanningRequest } = require('../../aiService');

    // CONVERSATION CONTINUITY: If an agent is waiting for a response, continue with them
    // unless the user is clearly starting a new topic
    if (this.conversationState.activeAgent &&
        this.conversationState.awaitingUserInput &&
        !isNewTopicRequest(userMessage)) {
      logger.debug(`🔄 [CoreAgent] Continuing with ${this.conversationState.activeAgent} (awaiting input)`);
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

      logger.debug(`▶️ [CoreAgent] Resuming ${pendingSteps.length} pending step(s)`);
      return {
        reasoning: "Resuming pending tasks after completing previous task",
        plan: pendingSteps
      };
    }

    // ⚡ FAST ROUTING: Try keyword matching first to skip AI planning call
    const fastRoute = fastRouteMessage(userMessage);
    if (fastRoute) {
      // ⛔ SUPERVISOR CHECK: Block restricted agents in planning
      if (context?.isSupervisorMode && SUPERVISOR_RESTRICTED_AGENTS.includes(fastRoute.agent)) {
        logger.debug(`⛔ [CoreAgent] Blocking ${fastRoute.agent} plan for supervisor`);
        return {
          reasoning: "Supervisor cannot access this feature",
          plan: [{
            agent: "DocumentAgent",
            task: "explain_supervisor_restriction",
            user_input: `User tried: ${fastRoute.task}`
          }]
        };
      }

      logger.debug(`⚡ [CoreAgent] Fast route matched - skipping AI planning`);
      return {
        reasoning: "Fast keyword routing (no AI planning needed)",
        plan: [fastRoute]
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
      // ⚡ Use fast planning endpoint (Groq or fast OpenRouter)
      // This is optimized for quick JSON plan generation
      const startTime = Date.now();
      const response = await sendPlanningRequest(planningMessage, systemPrompt);
      const planningLatency = Date.now() - startTime;
      logger.debug(`⚡ [CoreAgent] Planning completed in ${planningLatency}ms`);

      // Log the raw response for debugging
      logger.debug('🔍 [CoreAgent] Raw AI response type:', typeof response);
      logger.debug('🔍 [CoreAgent] Raw AI response:', JSON.stringify(response).substring(0, 200));

      // Handle both string and object response formats
      let planObject;

      if (response && typeof response === 'object' && response.plan) {
        // Response is already a parsed plan object (from sendPlanningRequest)
        planObject = response;
      } else {
        // Need to parse the response
        let responseText;
        if (typeof response === 'string') {
          responseText = response;
        } else if (response?.text) {
          responseText = response.text;
        } else if (response && typeof response === 'object') {
          responseText = JSON.stringify(response);
        } else {
          responseText = '';
        }

        if (!responseText) {
          logger.error('❌ [CoreAgent] AI returned empty response');
          logger.error('📋 Response object:', response);
          throw new Error('AI returned empty response');
        }

        // Try to parse JSON from response with robust error recovery
        try {
          // First attempt: Try to extract JSON from response
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            planObject = JSON.parse(jsonMatch[0]);
          } else {
            planObject = JSON.parse(responseText);
          }
        } catch (parseError) {
          logger.warn('⚠️ Initial JSON parse failed, attempting recovery...');

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
              logger.debug('✅ Successfully recovered plan from partial JSON');
            } catch (recoveryError) {
              logger.error('❌ Failed to recover plan JSON:', responseText.substring(0, 500));
              throw new Error('AI did not return valid JSON plan');
            }
          } else {
            logger.error('❌ Failed to parse plan JSON (no plan array found):', responseText.substring(0, 500));
            throw new Error('AI did not return valid JSON plan');
          }
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
          logger.debug(`🔄 Plan validation failed, retrying (attempt ${retryCount + 1}/2)...`);
          return this.generateExecutionPlan(userMessage, conversationHistory, context, retryCount + 1);
        }

        // If validation fails after retries, default to DocumentAgent
        logger.warn('⚠️ Plan validation failed after retries, falling back to DocumentAgent');
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
      logger.error('❌ [CoreAgent] Failed to generate execution plan:', error);

      // On rate limit (429) or provider error, disable voice mode to use standard model
      const errorMsg = error.message || '';
      if (errorMsg.includes('429') || errorMsg.includes('rate') || errorMsg.includes('Provider')) {
        logger.warn('⚠️ [CoreAgent] Rate limit detected, disabling voice mode for retry');
        setVoiceMode(false);
      }

      // Retry if we haven't exhausted attempts (with delay to avoid rate limits)
      if (retryCount < 2) {
        logger.debug(`🔄 Retrying plan generation (attempt ${retryCount + 1}/2)...`);
        // Add delay before retry to help with rate limits
        await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
        return this.generateExecutionPlan(userMessage, conversationHistory, context, retryCount + 1);
      }

      // Smart fallback: If we're in the middle of project creation, continue with ProjectAgent
      if (this.conversationState.inProgressProject &&
          Object.keys(this.conversationState.inProgressProject).length > 0) {
        logger.debug('🔄 [CoreAgent] Detected in-progress project, routing to ProjectAgent');
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
