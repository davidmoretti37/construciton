/**
 * Stage 5 — Responder
 *
 * Composes the user-facing reply directly from plan + executed steps.
 * Replaces the previous "inject synthetic assistant msg and let Foreman
 * compose" path which round-tripped through a second LLM call.
 *
 * Why a dedicated stage:
 * - Foreman has 700+ lines of system prompt geared toward open-ended
 *   tool-calling. For a "summarize what we just did" task that prompt
 *   is overkill and causes Foreman to sometimes re-call tools.
 * - The Responder has full structured access to plan goal + each step's
 *   tool + result, so it can produce a precise summary without inferring.
 * - Cheap (Haiku, ~300-600ms) and the prompt is tight (no tool catalog,
 *   no business context bloat).
 *
 * Output is plain text (streamed as deltas to the SSE writer), plus an
 * optional list of visualElements when a step result looks like one
 * (e.g. CO created → return a 'change-order-preview' card hint).
 */

const logger = require('../../utils/logger');

const RESPONDER_MODEL = process.env.PEV_RESPONDER_MODEL || 'anthropic/claude-haiku-4.5';
const RESPONDER_TIMEOUT_MS = parseInt(process.env.PEV_RESPONDER_TIMEOUT_MS, 10) || 6000;

const SYSTEM_PROMPT = `You are the RESPONDER stage of an agentic pipeline. You receive:
  • The user's original request
  • The plan that was executed (goal + steps)
  • The actual outputs from each step

Write the user-facing reply. Be brief, natural, and concrete.

RULES:
1. Lead with what got done, in plain language. ("Created CO-004 on John Smith Bathroom Remodel for $1,600.")
2. Mention any specific numbers/IDs the user cares about (CO numbers, totals, counts) — these come from step results.
3. If a step returned an entity that should be shown in the UI as a card (estimate, invoice, change_order, project), end your reply with: VISUAL: <type> <id>  on its own line. The frontend will hydrate the card. Types: estimate, invoice, change_order, project, draw, daily_report.
4. If the user asked a question, ANSWER it directly using the data — don't summarize the search process. ("You have 3 overdue invoices totaling $4,200.")
5. Do NOT explain how you did it ("I searched projects then created..."). The user doesn't care about the process — they care about the result.
6. 1-3 sentences. No markdown headers or bullet lists unless data is genuinely tabular.
7. If a step failed but later succeeded after retry, just describe the final outcome — don't mention the retry.

Reply with PLAIN TEXT only (with the optional VISUAL: line at the end).`;

/**
 * Compose the user-facing reply.
 *
 * @param {Object} input
 *   userMessage  — original user request
 *   plan         — { goal, steps, ... }
 *   stepResults  — array of { id, tool, args, result, ms }
 * @returns {Promise<{ text: string, visualElements: Array, latencyMs, fallback }>}
 */
async function respond({ userMessage, plan, stepResults }) {
  if (!process.env.OPENROUTER_API_KEY) {
    return safeFallback('no API key', plan, stepResults);
  }
  if (!userMessage || !plan || !Array.isArray(stepResults)) {
    return safeFallback('missing input', plan, stepResults);
  }

  const summary = buildSummary(plan, stepResults);

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESPONDER_TIMEOUT_MS);

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - PEV Responder',
      },
      body: JSON.stringify({
        model: RESPONDER_MODEL,
        max_tokens: 400,
        temperature: 0.3,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content:
              `USER REQUEST:\n${userMessage.slice(0, 1500)}\n\n` +
              `PLAN GOAL: ${plan.goal}\n\n` +
              `STEPS:\n${summary}` },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      logger.warn(`[PEV.responder] OpenRouter ${resp.status}`);
      return safeFallback(`http ${resp.status}`, plan, stepResults, t0);
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content || '';
    const { text, visualElements } = parseResponse(content);

    return {
      text: text || templatedFallback(plan, stepResults),
      visualElements,
      latencyMs: Date.now() - t0,
      fallback: false,
    };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') return safeFallback('timeout', plan, stepResults, t0);
    logger.warn(`[PEV.responder] error: ${e.message}`);
    return safeFallback(e.message, plan, stepResults, t0);
  }
}

/**
 * Compact, machine-readable view of plan execution for the responder LLM.
 * Includes step number, tool, key result fields. Truncates to keep cost low.
 */
function buildSummary(plan, stepResults) {
  return stepResults.map((sr, i) => {
    const planStep = plan.steps[i] || {};
    const why = planStep.why ? ` (${planStep.why})` : '';
    if (sr.error) {
      return `${i + 1}. ${sr.tool}${why} → ERROR: ${sr.error.message}`;
    }
    const out = compactResult(sr.result);
    return `${i + 1}. ${sr.tool}${why} → ${out}`;
  }).join('\n');
}

function compactResult(r) {
  if (r == null) return 'null';
  if (typeof r !== 'object') return String(r).slice(0, 200);
  // Trim to the most-likely-relevant top-level fields and stringify
  const cleaned = {};
  for (const k of Object.keys(r).slice(0, 8)) {
    let v = r[k];
    if (typeof v === 'string') v = v.slice(0, 240);
    else if (Array.isArray(v)) v = `[${v.length} items]`;
    else if (typeof v === 'object' && v !== null) v = JSON.stringify(v).slice(0, 240);
    cleaned[k] = v;
  }
  return JSON.stringify(cleaned).slice(0, 500);
}

const VISUAL_LINE_RE = /^\s*VISUAL:\s*(\w+)\s+([\w-]+)\s*$/im;

function parseResponse(content) {
  const visualElements = [];
  let text = content || '';
  // Pull out any "VISUAL: <type> <id>" lines
  let m;
  while ((m = text.match(VISUAL_LINE_RE)) !== null) {
    visualElements.push({ type: m[1], data: { id: m[2] } });
    text = text.replace(m[0], '').trim();
  }
  return { text, visualElements };
}

/**
 * Templated fallback so the user always sees SOMETHING when the
 * Responder LLM is unavailable. Inspects the last successful step.
 */
function templatedFallback(plan, stepResults) {
  if (!stepResults || stepResults.length === 0) {
    return plan?.goal ? `Done: ${plan.goal}.` : 'Done.';
  }
  const last = stepResults[stepResults.length - 1];
  if (last.error) {
    return `I hit an issue on step ${last.id} (${last.tool}): ${last.error.message}`;
  }
  if (last.result?.success === true) return `Done.`;
  if (typeof last.result?.count === 'number') return `Found ${last.result.count}.`;
  return plan?.goal ? `Done: ${plan.goal}.` : 'Done.';
}

function safeFallback(reason, plan, stepResults, t0 = null) {
  return {
    text: templatedFallback(plan, stepResults),
    visualElements: [],
    latencyMs: t0 ? Date.now() - t0 : 0,
    fallback: true,
    fallbackReason: reason,
  };
}

module.exports = { respond };
