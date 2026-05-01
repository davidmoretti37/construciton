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

Reply with ONLY this JSON shape:

{
  "text": "the user-facing reply (1-3 sentences, plain language)",
  "visual_elements": [
    { "type": "change_order" | "estimate" | "invoice" | "project" | "draw" | "daily_report", "id": "<uuid-from-step-results>" }
  ]
}

RULES for text:
1. Lead with what got done, plain language. ("Created CO-004 on John Smith Bathroom Remodel for $1,600.")
2. Include specific numbers/IDs the user cares about (CO numbers, totals, counts) — pull these from step results.
3. If the user asked a question, ANSWER it directly using the data. Don't summarize the search process. ("You have 3 overdue invoices totaling $4,200.")
4. Do NOT explain how you did it ("I searched projects then created..."). The user cares about the result, not the process.
5. 1-3 sentences. No markdown headers or bullet lists unless data is genuinely tabular.
6. If a step failed but later succeeded after retry, describe the final outcome only.

RULES for visual_elements:
1. Include an entry for any entity that should render as a card (a CO that was created, an invoice that was found). Pull the id from the matching step result.
2. If no card is warranted (read-only summary, no entity changed), return an empty array.
3. NEVER invent ids — only use values that appear in step results.

Reply with ONLY the JSON object. No prose, no markdown.`;

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
        max_tokens: 500,
        temperature: 0.3,
        response_format: { type: 'json_object' },
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
    const parsed = parseJsonResponse(content);

    if (!parsed) {
      // Couldn't parse JSON — fall back to templated reply rather than ship
      // raw model output that might leak the JSON structure.
      logger.warn(`[PEV.responder] unparseable JSON, falling back: ${content.slice(0, 120)}`);
      return safeFallback('unparseable', plan, stepResults, t0);
    }

    return {
      text: parsed.text || templatedFallback(plan, stepResults),
      visualElements: parsed.visualElements,
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

const VALID_VISUAL_TYPES = new Set([
  'change_order', 'estimate', 'invoice', 'project', 'draw', 'daily_report',
]);

/**
 * Parse the responder's JSON output into { text, visualElements }.
 * Tolerant of:
 *   - Markdown fence wrappers (```json...```)
 *   - Extra prose around the JSON object
 *   - Slightly malformed visual_elements entries (filters bad ones, keeps good ones)
 * Returns null on hard parse failure so the caller can fall back.
 */
function parseJsonResponse(content) {
  if (!content) return null;
  // Strip optional markdown fences
  const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_) {
    // Try to extract the first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { parsed = JSON.parse(m[0]); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
  // Whitelist the visual_elements array. Anything malformed is dropped
  // silently — better to miss a card than to crash rendering.
  const visualElements = [];
  if (Array.isArray(parsed.visual_elements)) {
    for (const v of parsed.visual_elements) {
      if (!v || typeof v !== 'object') continue;
      const type = String(v.type || '').toLowerCase();
      const id = typeof v.id === 'string' ? v.id : null;
      if (!VALID_VISUAL_TYPES.has(type) || !id) continue;
      visualElements.push({ type, data: { id } });
    }
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
