/**
 * Sub-agent runner — Phase 5.
 *
 * Spawns an isolated, focused agent loop for a single sub-task. The
 * runner is a STRIPPED DOWN version of the main agentService loop —
 * it intentionally omits the planner, the verifier, the multi-step
 * tracker, and the visual-element machinery. Sub-agents return text
 * + tool call breadcrumbs to the orchestrator, who decides what to do
 * with them.
 *
 * Why a separate loop instead of recursing into processAgentRequest:
 *   - smaller context (only the task brief, not the parent's history)
 *   - bounded iteration cap that the parent enforces, not the child
 *   - the approval gate still applies, but the parent sees the
 *     blocked result so it can present the confirmation UI to the user
 *     in the parent's chat thread
 *
 * Public API:
 *   runSubAgent({ kind, task, parentContext, userId, writer }) →
 *     { kind, summary, toolCalls, blockedApprovals, error? }
 *
 * SSE events the runner emits via the parent's `writer`:
 *   { type: 'subagent_started',   kind, task }
 *   { type: 'subagent_completed', kind, summary, tool_count }
 *   { type: 'subagent_failed',    kind, error }
 */

const logger = require('../../utils/logger');
const { getSpecialist, getToolsForSpecialist } = require('./specialists');
const { toolDefinitions } = require('../tools/definitions');
const { executeTool } = require('../tools/handlers');
const approvalGate = require('../approvalGate');
const toolRegistry = require('../tools/registry');

const MODEL_IDS = {
  haiku: 'anthropic/claude-haiku-4.5',
  sonnet: 'anthropic/claude-sonnet-4.6',
};
const SUB_AGENT_TIMEOUT_MS = parseInt(process.env.SUB_AGENT_TIMEOUT_MS, 10) || 45_000;

/**
 * @param {Object} args
 * @param {string} args.kind          — specialist kind ('researcher' | 'builder' | 'bookkeeper' | 'communicator')
 * @param {string} args.task          — natural-language brief from the orchestrator
 * @param {Object} [args.parentContext] — anything from the parent the sub-agent should know
 *                                        (e.g. { project_id, client_name }). Stringified into the user message.
 * @param {string} args.userId        — auth user id (for tool execution)
 * @param {Object} [args.writer]      — agentService writer for SSE events; optional
 * @returns {Promise<{kind, summary, toolCalls, blockedApprovals, error?}>}
 */
async function runSubAgent({ kind, task, parentContext = {}, userId, writer = null }) {
  const spec = getSpecialist(kind);
  if (!spec) {
    return { kind, summary: '', toolCalls: [], blockedApprovals: [], error: `Unknown sub-agent kind: ${kind}` };
  }
  if (!task || typeof task !== 'string' || !task.trim()) {
    return { kind, summary: '', toolCalls: [], blockedApprovals: [], error: 'Task brief is empty' };
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return { kind, summary: '', toolCalls: [], blockedApprovals: [], error: 'OPENROUTER_API_KEY not configured' };
  }

  const tools = getToolsForSpecialist(spec, toolDefinitions);
  const model = MODEL_IDS[spec.model] || MODEL_IDS.haiku;

  const contextLine = parentContext && Object.keys(parentContext).length
    ? `\n\nContext from parent: ${JSON.stringify(parentContext).slice(0, 800)}`
    : '';

  const messages = [
    {
      role: 'system',
      content: [
        // Cache the specialist prompt — fires every time this kind is
        // dispatched. Same caching pattern as the planner / verifier.
        { type: 'text', text: spec.systemPrompt, cache_control: { type: 'ephemeral', ttl: '1h' } },
      ],
    },
    {
      role: 'user',
      content: `TASK BRIEF: ${task.trim()}${contextLine}\n\nYou have ${tools.length} tools available. Use the minimum needed. Return your answer as plain text — the orchestrator will surface it to the user.`,
    },
  ];

  writer?.emit?.({ type: 'subagent_started', kind, task: task.slice(0, 200) });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SUB_AGENT_TIMEOUT_MS);
  const startedAt = Date.now();

  const toolCalls = [];
  const blockedApprovals = [];
  let summary = '';
  let iterations = 0;

  try {
    while (iterations < spec.maxIterations) {
      iterations++;
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages,
          tools,
          max_tokens: 800,
          temperature: 0.2,
        }),
        signal: ctrl.signal,
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
      const json = await resp.json();
      const message = json.choices?.[0]?.message;
      if (!message) break;

      // If the LLM produced text + no tool calls, we're done.
      if ((!message.tool_calls || message.tool_calls.length === 0) && message.content) {
        summary = String(message.content).trim();
        break;
      }
      // No tool calls and no content — degenerate, exit.
      if (!message.tool_calls || message.tool_calls.length === 0) {
        break;
      }

      // Add the assistant turn to the conversation.
      messages.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.tool_calls,
      });

      // Execute each tool. The approval gate still fires — the parent
      // is the one who'll handle the confirm UX, so we record blocked
      // calls and exit early so the parent can route to the user.
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function?.name;
        let args = {};
        try { args = JSON.parse(toolCall.function?.arguments || '{}'); } catch (_) { /* keep empty */ }

        const meta = toolRegistry.getMetadata(toolName);
        // Belt-and-braces: the LLM should only see allowed tools, but
        // if it hallucinates one the runner refuses cleanly.
        if (!meta || !spec.riskAllowList.has(meta.risk_level)) {
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `Tool "${toolName}" not allowed for sub-agent ${spec.kind}` }),
          });
          toolCalls.push({ name: toolName, blocked_reason: 'not_in_allow_list' });
          continue;
        }

        const gate = await approvalGate.check({
          toolName,
          toolArgs: args,
          messages, // gate sees the runner's local convo, NOT parent's
        });

        if (gate.verdict === 'BLOCK') {
          // Don't actually call the tool. Record it so the parent can
          // surface a confirm UX to the user.
          blockedApprovals.push({
            tool: toolName,
            args,
            risk_level: gate.risk_level,
            action_summary: gate.action_summary,
            reason: gate.reason,
          });
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(approvalGate.blockedToolResult(toolName, gate)),
          });
          toolCalls.push({ name: toolName, blocked: true });
          continue;
        }

        // Execute.
        const result = await executeTool(toolName, args, userId);
        toolCalls.push({ name: toolName, ok: !result?.error });
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ tool: toolName, data: result }),
        });
      }
      // Loop back so the LLM can continue with the tool results.
    }
    clearTimeout(timer);
  } catch (err) {
    clearTimeout(timer);
    const msg = err?.name === 'AbortError'
      ? `timeout after ${SUB_AGENT_TIMEOUT_MS}ms`
      : err?.message || String(err);
    logger.warn(`[subAgent:${kind}] failed: ${msg}`);
    writer?.emit?.({ type: 'subagent_failed', kind, error: msg });
    return { kind, summary: '', toolCalls, blockedApprovals, error: msg };
  }

  const durationMs = Date.now() - startedAt;
  writer?.emit?.({
    type: 'subagent_completed',
    kind,
    tool_count: toolCalls.length,
    duration_ms: durationMs,
    summary_preview: summary.slice(0, 120),
  });

  logger.info(`[subAgent:${kind}] done in ${durationMs}ms, ${iterations} rounds, ${toolCalls.length} tools, ${blockedApprovals.length} blocked`);

  return {
    kind,
    summary: summary || '(sub-agent produced no summary)',
    toolCalls,
    blockedApprovals,
  };
}

module.exports = { runSubAgent };
