/**
 * Stage 5 — Responder
 *
 * The SINGLE source of user-facing text from the PEV pipeline. Every
 * outcome (success, ask-for-input, pending-approval) goes through the
 * Responder so the user never sees raw internal pipeline state like
 * "step s1 (search_projects) returned error: Something went wrong".
 *
 * Why centralize text generation:
 *   - Without this, agentService's gate emitted pevResult.question,
 *     pevResult.suggestion, or technical strings directly. Bug class:
 *     internal text leaked to user.
 *   - With this, the Responder ALWAYS rewrites for humans. Keeps tone
 *     consistent. Handles errors gracefully. One place to tune voice.
 *
 * Three outcome kinds (the orchestrator picks one):
 *   'success'     — plan executed, write a "what got done" reply
 *   'ask'         — agent needs more info, write a clear ONE question
 *   'approval'    — agent wants to do X, ask the user to confirm
 *
 * Cost: Haiku, ~300-600ms, ~$0.001 per call. Always-on now.
 */

const logger = require('../../utils/logger');

const RESPONDER_MODEL = process.env.PEV_RESPONDER_MODEL || 'anthropic/claude-haiku-4.5';
const RESPONDER_TIMEOUT_MS = parseInt(process.env.PEV_RESPONDER_TIMEOUT_MS, 10) || 6000;

const SYSTEM_PROMPT = `You are the RESPONDER stage of an agentic pipeline. You are the ONLY voice the user hears. You receive structured pipeline state and write a human, decisive, one-paragraph reply.

Reply with ONLY this JSON shape:

{
  "text": "the user-facing reply (1-3 sentences, plain language)",
  "visual_elements": [
    { "type": "change_order" | "estimate" | "invoice" | "project" | "draw" | "daily_report", "id": "<uuid-from-step-results>" }
  ]
}

OUTCOME KIND will be marked at the top of the user payload as OUTCOME: <kind>.

# OUTCOME = success
The plan executed. Write what got done.
1. Lead with the result, plain language. ("Created CO-004 on John Smith Bathroom Remodel for $1,600.")
2. Include numbers/IDs the user cares about (CO numbers, totals, counts) — pull from step results.
3. If the user asked a question, ANSWER it directly using the data. ("You have 3 overdue invoices totaling $4,200.")
4. Do NOT explain how you did it ("I searched projects then created..."). Result, not process.
5. NEVER hedge: forbidden phrasings — "After I retrieve...", "I'll need you to...", "Let me know if...". By the time you're writing, the action HAPPENED.
6. 1-3 sentences. No markdown headers/bullets unless data is genuinely tabular.

# OUTCOME = ask
The agent needs ONE concrete piece of info from the user to proceed. The pipeline gives you the planner/verifier's gap message which is often technical — REWRITE IT for humans.
1. NEVER include technical phrases: "step s1 (search_projects) returned error", "Something went wrong with that action", "Ask the user to clarify". Strip ALL of these and rewrite.
2. ONE question, ONE sentence. Concrete, not vague.
3. If the underlying issue is a tool error (project not found, ambiguous match), translate to plain English: "I can't find a 'John' project — is the project name something different?" not "step s1 returned error".
4. If the executor reached suggestions (e.g., "Multiple matches: Smith Bathroom, Smith Kitchen"), present those as options inline.
5. NEVER apologize or pad. ("Could you tell me which one?" not "I'm sorry, I'd need to know which one to delete...").
6. visual_elements: empty.

# OUTCOME = approval
The agent has a plan ready but needs the user's go-ahead before running a destructive/external action (send email, delete, mirror to QBO). The pipeline gives you the action_summary.
1. State the action AND the consequences in one sentence: "About to email Smith asking for the $4,200 — go ahead?"
2. Include the dollar amount, recipient, or count — whatever makes the consequence concrete.
3. Don't add caveats ("if you're sure"). The approval card itself is the confirm UI; the text just states the action.
4. visual_elements: empty.

# Visual_elements (success path only)
1. Include an entry for any entity that should render as a card (a CO that was created, an invoice that was found). Pull the id from the matching step result.
2. If no card is warranted, return an empty array.
3. NEVER invent ids — only use values that appear in step results.

Reply with ONLY the JSON object. No prose, no markdown.`;

/**
 * Compose the user-facing reply for ANY pipeline outcome.
 *
 * @param {Object} input
 *   userMessage     — original user request (string)
 *   outcome         — 'success' | 'ask' | 'approval'
 *   plan            — { goal, steps, ... } (optional for approval)
 *   stepResults     — array of {id, tool, args, result, error?, ms} (optional for ask if plan never ran)
 *   gap             — string (verifier or executor stoppedReason — for ask)
 *   suggestion      — string (verifier suggestion — for ask)
 *   pendingApproval — { tool, action_summary, risk_level, reason } — for approval
 * @returns {Promise<{ text, visualElements, latencyMs, fallback }>}
 */
async function respond(input) {
  const { userMessage, outcome = 'success' } = input;
  if (!process.env.OPENROUTER_API_KEY) {
    return safeFallback('no API key', input);
  }
  if (!userMessage) {
    return safeFallback('missing userMessage', input);
  }

  const userPayload = buildUserPayload(input);

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
          { role: 'user', content: userPayload },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      logger.warn(`[PEV.responder] OpenRouter ${resp.status}`);
      return safeFallback(`http ${resp.status}`, input, t0);
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content || '';
    const parsed = parseJsonResponse(content);

    if (!parsed) {
      logger.warn(`[PEV.responder] unparseable JSON, falling back: ${content.slice(0, 120)}`);
      return safeFallback('unparseable', input, t0);
    }

    return {
      text: parsed.text || templatedFallback(input),
      visualElements: outcome === 'success' ? parsed.visualElements : [],
      latencyMs: Date.now() - t0,
      fallback: false,
    };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') return safeFallback('timeout', input, t0);
    logger.warn(`[PEV.responder] error: ${e.message}`);
    return safeFallback(e.message, input, t0);
  }
}

/**
 * Build the user-payload string for the Responder LLM. Layout depends on
 * outcome; in all cases starts with OUTCOME: <kind> so the LLM picks
 * the right section of the system prompt.
 */
function buildUserPayload(input) {
  const { userMessage, outcome, plan, stepResults, gap, suggestion, pendingApproval } = input;
  const parts = [`OUTCOME: ${outcome}`, ``, `USER REQUEST:`, userMessage.slice(0, 1500)];

  if (plan?.goal) {
    parts.push(``, `PLAN GOAL: ${plan.goal}`);
  }

  if (Array.isArray(stepResults) && stepResults.length > 0) {
    parts.push(``, `STEPS:`, buildStepSummary(plan, stepResults));
  }

  if (outcome === 'ask') {
    if (gap) parts.push(``, `GAP (technical — REWRITE for user):`, String(gap).slice(0, 600));
    if (suggestion) parts.push(``, `SUGGESTION (technical — translate):`, String(suggestion).slice(0, 600));
    // If a step returned suggestions, surface them so the LLM can offer choices
    const last = stepResults?.[stepResults.length - 1];
    if (last?.result?.suggestions) {
      parts.push(``, `OPTIONS to offer:`, JSON.stringify(last.result.suggestions).slice(0, 400));
    }
  } else if (outcome === 'approval') {
    parts.push(``, `PENDING APPROVAL:`);
    if (pendingApproval?.tool) parts.push(`  tool: ${pendingApproval.tool}`);
    if (pendingApproval?.action_summary) parts.push(`  action: ${pendingApproval.action_summary}`);
    if (pendingApproval?.risk_level) parts.push(`  risk: ${pendingApproval.risk_level}`);
    if (pendingApproval?.reason) parts.push(`  reason: ${pendingApproval.reason}`);
  }

  return parts.join('\n');
}

function buildStepSummary(plan, stepResults) {
  return stepResults.map((sr, i) => {
    const planStep = plan?.steps?.[i] || {};
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

function parseJsonResponse(content) {
  if (!content) return null;
  const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { parsed = JSON.parse(m[0]); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
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
 * Outcome-specific templated fallback so the user always sees SOMETHING
 * sensible when the Responder LLM is unavailable. Crucially: never leaks
 * raw technical strings even in fallback mode.
 */
function templatedFallback(input) {
  const { outcome, plan, stepResults, pendingApproval } = input;

  if (outcome === 'approval') {
    const summary = pendingApproval?.action_summary || 'this action';
    return `Want me to go ahead with ${summary}?`;
  }

  if (outcome === 'ask') {
    // Keep this generic — leaking the raw gap was the original bug.
    return `I need a bit more info to do that. Can you tell me more about what you want?`;
  }

  // success path
  if (!stepResults || stepResults.length === 0) {
    return plan?.goal ? `Done: ${plan.goal}.` : 'Done.';
  }
  const last = stepResults[stepResults.length - 1];
  if (last.error) {
    return `That didn't work — let me know if you want me to try again with different details.`;
  }
  if (last.result?.success === true) return 'Done.';
  if (typeof last.result?.count === 'number') return `Found ${last.result.count}.`;
  return plan?.goal ? `Done: ${plan.goal}.` : 'Done.';
}

function safeFallback(reason, input, t0 = null) {
  return {
    text: templatedFallback(input || {}),
    visualElements: [],
    latencyMs: t0 ? Date.now() - t0 : 0,
    fallback: true,
    fallbackReason: reason,
  };
}

module.exports = { respond };
