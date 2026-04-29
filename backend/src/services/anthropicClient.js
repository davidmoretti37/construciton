/**
 * Anthropic SDK client — Phase 7.
 *
 * Single source of truth for "is the SDK path available?" checks. Wraps
 * the official `@anthropic-ai/sdk` package and exposes a normalized
 * `callMessages()` helper that mirrors the shape we already use for
 * OpenRouter, so call sites can switch between SDK and OpenRouter with
 * a single conditional.
 *
 * The SDK never reads the API key from a file we write — only from
 * `process.env.ANTHROPIC_API_KEY`. If unset, `getClient()` returns null
 * and call sites fall back to OpenRouter.
 *
 * Migration scope (Phase 7):
 *   - planner.js, planVerifier.js, destructiveGuard.js — short single-shot
 *     calls. Easy to migrate, low risk.
 *
 * Out of scope (future phase):
 *   - The main streaming agent loop (`callClaudeStreaming`). That migration
 *     replaces ~350 lines of OpenRouter SSE parsing and unlocks
 *     `agent_thinking` events, but it's high-risk for a production
 *     agent and deserves its own careful phase with manual smoke tests.
 */

const logger = require('../utils/logger');

let _client = null;
let _checked = false;

function getClient() {
  if (_checked) return _client;
  _checked = true;
  if (!process.env.ANTHROPIC_API_KEY) {
    return null;
  }
  try {
    // The SDK exports the `Anthropic` class as both default and named.
    // Use require() to grab whichever is exported.
    const SDK = require('@anthropic-ai/sdk');
    const Anthropic = SDK.default || SDK.Anthropic || SDK;
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    logger.info('[anthropicClient] SDK initialized — using direct Anthropic API for short-shot calls');
    return _client;
  } catch (e) {
    logger.warn('[anthropicClient] SDK init failed, falling back to OpenRouter:', e.message);
    _client = null;
    return null;
  }
}

function isAvailable() {
  return !!getClient();
}

/**
 * Call Anthropic via the SDK with our standard prompt-cache pattern.
 * Mirrors the OpenRouter chat-completions shape so call sites can swap.
 *
 * @param {Object} args
 * @param {string} args.model           — e.g. 'claude-haiku-4.5'. The SDK uses
 *                                         bare model ids (no `anthropic/` prefix).
 * @param {string} args.systemPrompt    — text of the cached system block.
 * @param {string} args.userPrompt      — user message text.
 * @param {number} args.max_tokens
 * @param {number} args.temperature
 * @param {number} [args.timeout_ms]
 * @returns {Promise<{text: string, usage: object}>} or throws.
 */
// OpenRouter uses dotted model ids (claude-haiku-4.5); the Anthropic API
// uses hyphenated ones (claude-haiku-4-5-20251001). Single mapping table
// so SDK callers don't have to think about it.
const MODEL_ID_MAP = {
  'claude-haiku-4.5': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4.6': 'claude-sonnet-4-6',
  'claude-opus-4.7': 'claude-opus-4-7',
};

function normalizeModelForSDK(model) {
  const bare = String(model || '').replace(/^anthropic\//, '');
  return MODEL_ID_MAP[bare] || bare;
}

async function callMessages({ model, systemPrompt, userPrompt, max_tokens, temperature, timeout_ms }) {
  const client = getClient();
  if (!client) throw new Error('Anthropic SDK not available — set ANTHROPIC_API_KEY');

  const sdkModel = normalizeModelForSDK(model);

  // Build messages. The system prompt is a top-level field on the SDK
  // (not part of the messages array) and supports cache_control on
  // each block in array form.
  const params = {
    model: sdkModel,
    max_tokens,
    temperature,
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral', ttl: '1h' } },
    ],
    messages: [
      { role: 'user', content: userPrompt },
    ],
  };

  // The SDK accepts an `AbortSignal` via `signal` on the request init.
  // Build one if a timeout was requested.
  const ctrl = timeout_ms ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout_ms) : null;

  try {
    const resp = await client.messages.create(params, ctrl ? { signal: ctrl.signal } : undefined);
    if (timer) clearTimeout(timer);
    // Concatenate all `text` blocks the model returned. The SDK can also
    // return `tool_use` blocks but we don't ask for tools in these
    // short-shot calls — defensive collapse.
    const text = (resp.content || [])
      .filter(b => b?.type === 'text')
      .map(b => b.text || '')
      .join('');
    return { text, usage: resp.usage || null };
  } catch (e) {
    if (timer) clearTimeout(timer);
    throw e;
  }
}

module.exports = {
  getClient,
  isAvailable,
  callMessages,
  normalizeModelForSDK,
};
