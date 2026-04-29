// Hard guard against destructive tool calls without explicit user
// confirmation. Anthropic's Evaluator-Optimizer pattern (week 12 of the
// SOTA roadmap) — even if the system prompt fails to make the agent ask
// first, this layer reads the conversation in real time and blocks the
// call when the user clearly hasn't consented in the same turn.
//
// Why a separate layer: prompt instructions are advisory; the LLM can and
// occasionally does ignore them under pressure. A second LLM call that
// only returns PROCEED|BLOCK is much cheaper to audit and can't be
// hijacked by a malicious user prompt without ALSO hijacking the verifier.
//
// Cost: one extra Haiku call per destructive tool invocation (~$0.001).
// Acceptable price for blocking a class of safety bugs we know exists.

const logger = require('../utils/logger');

const DESTRUCTIVE_TOOLS = new Set([
  'delete_project',
  'delete_expense',
  'void_invoice',
  'delete_service_plan',
  'delete_project_document',
]);

function isDestructive(toolName) {
  return DESTRUCTIVE_TOOLS.has(toolName);
}

// Build a compact context for the verifier: the user's most recent N
// messages plus the tool call we're about to fire. Verifier sees ONLY
// what's needed to decide proceed/block.
function lastTurns(messages, n = 4) {
  const out = [];
  for (let i = messages.length - 1; i >= 0 && out.length < n; i--) {
    const m = messages[i];
    if (m.role === 'user' || m.role === 'assistant') {
      const content = typeof m.content === 'string' ? m.content : '';
      if (content) out.unshift({ role: m.role, content: content.slice(0, 1000) });
    }
  }
  return out;
}

async function verifyDestructive(toolName, toolArgs, messages) {
  const transcript = lastTurns(messages, 4);
  const prompt = `You are a safety verifier for an AI assistant about to perform an IRREVERSIBLE action.

PROPOSED ACTION: \`${toolName}\` with arguments ${JSON.stringify(toolArgs).slice(0, 500)}

RECENT CONVERSATION (most recent last):
${transcript.map(t => `[${t.role.toUpperCase()}] ${t.content}`).join('\n\n')}

DECISION RULES:
- PROCEED only if the user has clearly confirmed THIS SPECIFIC destructive action in the LAST TURN. Examples of confirmation: "yes delete it", "yes, confirm", "go ahead", "do it" — said AFTER the assistant described what would be deleted.
- BLOCK if the user said "delete X" or "remove Y" but the assistant has NOT first described the consequences and waited for confirmation.
- BLOCK if the conversation is ambiguous about which item the user means.
- BLOCK if you are not certain the user gave informed consent in this turn.

When in doubt, BLOCK. False blocks are recoverable (assistant asks again); false proceeds destroy data.

Return ONLY a JSON object:
{"verdict":"PROCEED","reason":""} OR {"verdict":"BLOCK","reason":"<one sentence why>"}`;

  // P7: SDK-first with OpenRouter fallback. Different from planner /
  // verifier because this prompt has no separate system block — it's
  // all in the user message. Both paths still get the same content.
  const anthropicClient = require('./anthropicClient');
  let content = '';
  try {
    if (anthropicClient.isAvailable()) {
      try {
        const SDK = require('@anthropic-ai/sdk');
        const Anthropic = SDK.default || SDK.Anthropic || SDK;
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const resp = await client.messages.create({
          model: 'claude-haiku-4.5',
          max_tokens: 200,
          temperature: 0,
          messages: [{ role: 'user', content: prompt }],
        });
        content = (resp.content || [])
          .filter(b => b?.type === 'text')
          .map(b => b.text || '')
          .join('');
      } catch (e) {
        logger.warn(`[destructiveGuard] SDK path failed (${e.message}), falling back to OpenRouter`);
        content = '';
      }
    }
    if (!content) {
      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'anthropic/claude-haiku-4.5',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0,
        }),
      });
      const json = await resp.json();
      content = json.choices?.[0]?.message?.content || '';
    }
    const match = content.match(/\{[\s\S]*?\}/);
    if (!match) {
      logger.warn(`[destructiveGuard] unparseable verdict for ${toolName}, defaulting to BLOCK`);
      return { verdict: 'BLOCK', reason: 'Verifier returned an unparseable response — blocking by default.' };
    }
    const verdict = JSON.parse(match[0]);
    if (verdict.verdict === 'PROCEED') {
      logger.info(`[destructiveGuard] ✓ PROCEED ${toolName}`);
      return { verdict: 'PROCEED', reason: '' };
    }
    logger.warn(`[destructiveGuard] ✗ BLOCK ${toolName}: ${verdict.reason}`);
    return { verdict: 'BLOCK', reason: verdict.reason || 'Blocked by verifier.' };
  } catch (e) {
    // Fail-CLOSED on verifier errors — better to block a legit delete than
    // leak through a destructive call. The user can retry after confirming.
    logger.error('[destructiveGuard] verifier error, blocking by default:', e);
    return { verdict: 'BLOCK', reason: 'Safety verifier was unreachable. Please confirm explicitly and try again.' };
  }
}

// Result the agent loop substitutes in place of the destructive tool's
// real execution when the verifier blocks. The model sees this as a tool
// result and is expected to ask the user for explicit confirmation.
function blockedToolResult(toolName, reason) {
  return {
    blocked: true,
    error: 'Destructive action blocked — explicit confirmation required.',
    tool: toolName,
    verifier_reason: reason,
    next_step: 'Describe to the user EXACTLY what would be deleted (the specific name, amount, date, etc.) and ask "Are you sure? This cannot be undone." Wait for their explicit yes/confirm before retrying this tool.',
  };
}

module.exports = {
  isDestructive,
  verifyDestructive,
  blockedToolResult,
  DESTRUCTIVE_TOOLS,
};
