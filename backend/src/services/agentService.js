/**
 * Agentic Loop Service — Real-Time Streaming
 *
 * Handles the tool-calling loop between Claude and our tools:
 * 1. Send user message + tools to Claude (streaming)
 * 2. If Claude returns tool calls → execute them, send results back
 * 3. Repeat until Claude returns final text response
 * 4. Stream final response token-by-token to frontend via SSE
 *
 * SSE Event Protocol:
 *   { type: 'thinking' }                          — AI reasoning round started
 *   { type: 'tool_start', tool, message }         — Before tool execution
 *   { type: 'tool_end', tool }                    — After tool execution
 *   { type: 'delta', content }                    — Clean text chunk (extracted from JSON "text" field)
 *   { type: 'metadata', visualElements, actions } — Structured data (sent once at stream end)
 *   { type: 'done' }                              — Stream complete
 *   { type: 'error', message }                    — On error
 */

const fetch = require('node-fetch');
const AbortController = require('abort-controller');
const logger = require('../utils/logger');
const { toolDefinitions, getToolStatusMessage } = require('./tools/definitions');
const { executeTool } = require('./tools/handlers');
const { buildSystemPrompt } = require('./tools/systemPrompt');
const { routeTools } = require('./toolRouter');
const { selectModel, trackUsage } = require('./modelRouter');
const memory = require('./requestMemory');

// Configuration
const MAX_TOOL_ROUNDS = 8;
const STREAM_TIMEOUT = 90000; // 90s per streaming call

/**
 * Send SSE event to client
 */
function sendSSE(res, data) {
  try {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (e) {
    // Client may have disconnected
  }
}

/**
 * Call Claude via OpenRouter with streaming.
 * Parses the SSE stream to detect tool_calls vs text content.
 * Text deltas are forwarded to the client in real-time.
 * Tool calls are accumulated and returned as a complete array.
 *
 * @returns {{ message: { content, tool_calls }, finishReason: string }}
 */
async function callClaudeStreaming(messages, tools, res, model = 'claude-haiku-4.5') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STREAM_TIMEOUT);

  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - Agent',
      },
      body: JSON.stringify({
        model: `anthropic/${model}`,
        messages,
        tools,
        max_tokens: 8000,
        temperature: 0.3,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error('Claude streaming request timed out');
      timeoutErr.isTimeout = true;
      throw timeoutErr;
    }
    throw err;
  }

  if (!response.ok) {
    clearTimeout(timeoutId);
    const errorText = await response.text();
    logger.error('Claude streaming API error:', errorText);
    throw new Error(`Claude API error: ${response.status}`);
  }

  // Parse the streaming SSE response
  // Instead of forwarding raw deltas, extract the "text" field and stream clean text.
  // At stream end, parse visualElements/actions and send as separate metadata event.
  return new Promise((resolve, reject) => {
    let lineBuffer = '';
    let contentBuffer = '';
    const toolCallBuffers = {}; // { index: { id, name, arguments } }
    let finishReason = null;
    let lastExtractedLength = 0; // Track how much text we've sent to client

    function unescapeJSON(s) {
      return s
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
    }

    // Keepalive: send heartbeat every 5s to prevent connection drops
    const keepaliveId = setInterval(() => {
      sendSSE(res, { type: 'heartbeat' });
    }, 5000);

    response.body.on('data', (chunk) => {
      lineBuffer += chunk.toString();

      // Process complete lines
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || ''; // Keep incomplete last line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta;
          const reason = parsed.choices?.[0]?.finish_reason;

          if (reason) finishReason = reason;

          // Text content — extract "text" field and stream only clean text
          if (delta?.content) {
            contentBuffer += delta.content;

            // Extract ONLY the "text" field value from accumulated JSON
            const match = contentBuffer.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)/);
            if (match) {
              const extracted = unescapeJSON(match[1]);
              if (extracted.length > lastExtractedLength) {
                sendSSE(res, { type: 'delta', content: extracted.substring(lastExtractedLength) });
                lastExtractedLength = extracted.length;
              }
            }
          }

          // Tool calls — accumulate incrementally
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (idx === undefined) continue;
              if (!toolCallBuffers[idx]) {
                toolCallBuffers[idx] = { id: '', name: '', arguments: '' };
              }
              if (tc.id) toolCallBuffers[idx].id = tc.id;
              if (tc.function?.name) toolCallBuffers[idx].name += tc.function.name;
              if (tc.function?.arguments) toolCallBuffers[idx].arguments += tc.function.arguments;
            }
          }
        } catch (e) {
          // Skip malformed chunks
        }
      }
    });

    response.body.on('end', () => {
      clearTimeout(timeoutId);
      clearInterval(keepaliveId);

      // Build tool_calls array if any were accumulated
      const toolCallEntries = Object.values(toolCallBuffers);
      const tool_calls = toolCallEntries.length > 0
        ? toolCallEntries.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.arguments },
          }))
        : undefined;

      // For final responses (no tool calls), parse and send metadata
      if (!tool_calls && contentBuffer) {
        let visualElements = [];
        let actions = [];

        try {
          let jsonStr = contentBuffer;
          // Extract from code blocks if present (handles text before/after ```json...```)
          const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/i);
          if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

          const firstBrace = jsonStr.indexOf('{');
          const lastBrace = jsonStr.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            const fullParsed = JSON.parse(jsonStr.substring(firstBrace, lastBrace + 1));
            visualElements = Array.isArray(fullParsed.visualElements) ? fullParsed.visualElements : [];
            actions = Array.isArray(fullParsed.actions) ? fullParsed.actions : [];
          }
        } catch (e) {
          logger.debug('Could not parse metadata from response:', e.message);
        }

        if (visualElements.length > 0 || actions.length > 0) {
          sendSSE(res, { type: 'metadata', visualElements, actions });
        }

        // Fallback: if no text was extracted during streaming, try once more
        if (lastExtractedLength === 0 && contentBuffer.trim()) {
          let fallbackText = contentBuffer.trim();
          fallbackText = fallbackText.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
          // Try complete text field match
          const textMatch = fallbackText.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
          if (textMatch) {
            sendSSE(res, { type: 'delta', content: unescapeJSON(textMatch[1]) });
          } else if (!fallbackText.startsWith('{')) {
            // Non-JSON response — send as plain text
            sendSSE(res, { type: 'delta', content: fallbackText });
          }
        }
      }

      resolve({
        message: {
          content: contentBuffer || null,
          tool_calls,
        },
        finishReason,
      });
    });

    response.body.on('error', (err) => {
      clearTimeout(timeoutId);
      clearInterval(keepaliveId);
      reject(err);
    });
  });
}

/**
 * Helper function to remember important tool results in memory
 * Stores entity details and search results for faster follow-up queries
 *
 * @param {string} userId - User ID
 * @param {string} toolName - Name of the tool that was executed
 * @param {object} args - Arguments passed to the tool
 * @param {*} result - Result returned by the tool
 */
function rememberToolResult(userId, toolName, args, result) {
  // Don't remember errors
  if (result.error) return;

  // Remember specific entity details
  if (toolName === 'get_project_details' && result.id) {
    memory.remember(userId, `project_${result.id}`, result, toolName);
  }
  if (toolName === 'get_worker_details' && result.id) {
    memory.remember(userId, `worker_${result.id}`, result, toolName);
  }
  if (toolName === 'get_estimate_details' && result.id) {
    memory.remember(userId, `estimate_${result.id}`, result, toolName);
  }
  if (toolName === 'get_invoice_details' && result.id) {
    memory.remember(userId, `invoice_${result.id}`, result, toolName);
  }

  // Remember search results (lists)
  if (toolName === 'search_projects' && Array.isArray(result)) {
    memory.remember(userId, 'recent_projects', result, toolName);
  }
  if (toolName === 'get_workers' && Array.isArray(result)) {
    memory.remember(userId, 'workers_list', result, toolName);
  }
}

/**
 * Main agentic loop — processes a user request with streaming tool calling
 *
 * @param {Array} userMessages - Conversation messages from frontend
 * @param {string} userId - Authenticated user ID
 * @param {object} userContext - User context (business info, preferences, etc.)
 * @param {object} res - Express response object for SSE streaming
 * @param {object} req - Express request object for disconnect detection
 */
async function processAgentRequest(userMessages, userId, userContext, res, req) {
  const startTime = Date.now();
  let clientDisconnected = false;

  if (req) {
    req.on('close', () => { clientDisconnected = true; });
  }

  // Get last user message for routing
  const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';

  // PHASE 1: Route tools based on intent (34 → 8-12 tools)
  const { intent, tools: filteredTools, toolCount } = routeTools(lastUserMsg, toolDefinitions);

  // PHASE 2: Select model based on tool count (10+ = Sonnet)
  const { model, reason } = selectModel(toolCount, userMessages);

  // PHASE 4: Add memory context to system prompt
  const memoryContext = memory.getContextForPrompt(userId);
  const systemPrompt = buildSystemPrompt(userContext) + memoryContext;

  // Log routing decisions
  logger.info(`🎯 Intent: ${intent} | Tools: ${toolCount}/34 | Model: ${model} (${reason})`);

  // Build initial messages array
  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history
  for (const msg of userMessages) {
    if (msg.role && msg.content) {
      messages.push({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      });
    }
  }

  logger.info(`🤖 Agent processing message for user ${userId.substring(0, 8)}...`);

  let toolRound = 0;
  const toolCallCache = new Map(); // Prevent redundant tool calls within a request

  while (toolRound < MAX_TOOL_ROUNDS) {
    if (clientDisconnected) {
      logger.info('⚠️ Client disconnected, aborting agent loop');
      return;
    }

    toolRound++;
    const roundStart = Date.now();
    logger.info(`🔄 Agent round ${toolRound}/${MAX_TOOL_ROUNDS}`);

    // Tell client we're thinking
    sendSSE(res, { type: 'thinking' });

    try {
      // Call Claude with filtered tools and selected model
      const { message, finishReason } = await callClaudeStreaming(
        messages,
        filteredTools, // Use filtered tools (8-12 instead of 34)
        res,
        model // Use smart model selection (Haiku or Sonnet)
      );

      // Check if Claude wants to call tools
      if (message.tool_calls && message.tool_calls.length > 0) {
        logger.info(`🔧 Claude wants to call ${message.tool_calls.length} tool(s): ${message.tool_calls.map(tc => tc.function.name).join(', ')}`);

        // Clear any intermediate text the model streamed during this tool call round
        // (e.g., "Let me search for your projects..." — not the final response)
        sendSSE(res, { type: 'clear' });

        // Add assistant message (with tool calls) to conversation
        messages.push({
          role: 'assistant',
          content: message.content || null,
          tool_calls: message.tool_calls,
        });

        // Execute all tool calls in PARALLEL for speed
        const toolResults = await Promise.all(message.tool_calls.map(async (toolCall) => {
          if (clientDisconnected) return null;

          const toolName = toolCall.function.name;
          let toolArgs = {};

          try {
            toolArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch (e) {
            logger.error(`Failed to parse tool args for ${toolName}:`, toolCall.function.arguments);
          }

          // Send tool_start event
          sendSSE(res, {
            type: 'tool_start',
            tool: toolName,
            message: getToolStatusMessage(toolName),
          });

          // Execute the tool (with duplicate detection)
          const cacheKey = `${toolName}:${JSON.stringify(toolArgs)}`;
          let result;
          if (toolCallCache.has(cacheKey)) {
            result = toolCallCache.get(cacheKey);
            logger.info(`📦 Tool ${toolName} returned cached result (duplicate call skipped)`);
          } else {
            result = await executeTool(toolName, toolArgs, userId);
            toolCallCache.set(cacheKey, result);

            // PHASE 4: Remember important results for future queries
            rememberToolResult(userId, toolName, toolArgs, result);

            logger.info(`📦 Tool ${toolName} returned ${JSON.stringify(result).length} chars${result?.error ? ` (ERROR: ${result.error})` : ''}`);
          }

          // Send tool_end event
          sendSSE(res, { type: 'tool_end', tool: toolName });

          return { toolCall, result };
        }));

        // Add all tool results to conversation
        for (const entry of toolResults) {
          if (!entry) continue;
          messages.push({
            role: 'tool',
            tool_call_id: entry.toolCall.id,
            content: JSON.stringify(entry.result),
          });
        }

        // Continue the loop — let Claude process tool results
        logger.info(`⏱️ Round ${toolRound} completed in ${Date.now() - roundStart}ms`);
        continue;
      }

      // No tool calls — this is the final response
      // Text was streamed and metadata sent by callClaudeStreaming
      const finalContent = message.content || '';

      if (toolRound === 1) {
        logger.warn(`⚠️ Agent responded WITHOUT calling any tools (round 1)`);
      }

      if (!finalContent) {
        // Empty response — send fallback
        logger.warn('Agent returned empty response');
        sendSSE(res, {
          type: 'delta',
          content: "I apologize, but I wasn't able to process that request. Could you try rephrasing it?",
        });
      }

      const totalTime = Date.now() - startTime;

      // Estimate tokens (chars / 4 is a rough approximation)
      const inputChars = messages.reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
      const outputChars = messages.filter(m => m.role === 'assistant').reduce((sum, m) => sum + (typeof m.content === 'string' ? m.content.length : 0), 0);
      const estInput = Math.round(inputChars / 4);
      const estOutput = Math.round(outputChars / 4);
      trackUsage(model, estInput, estOutput);

      logger.info(`📊 Agent: ${toolRound} rounds, model=${model.includes('haiku') ? 'haiku' : 'sonnet'}, ~${estInput}+${estOutput} tokens, ${totalTime}ms`);

      // Signal completion
      sendSSE(res, { type: 'done' });
      return;

    } catch (error) {
      logger.error(`Agent error in round ${toolRound}:`, error);

      if (toolRound >= MAX_TOOL_ROUNDS) {
        sendSSE(res, {
          type: 'delta',
          content: "I'm having trouble processing this request. Could you try again or rephrase your message?",
        });
        sendSSE(res, { type: 'done' });
        return;
      }

      // Try to recover on next round
      continue;
    }
  }

  // Hit max rounds
  logger.warn(`Agent hit max rounds (${MAX_TOOL_ROUNDS})`);
  sendSSE(res, {
    type: 'delta',
    content: "I've done extensive research but need a bit more direction. Could you be more specific about what you'd like me to do?",
  });
  sendSSE(res, { type: 'done' });
}

module.exports = { processAgentRequest };
