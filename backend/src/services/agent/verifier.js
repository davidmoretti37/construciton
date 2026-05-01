/**
 * Stage 3 — Verifier
 *
 * After the Executor finishes (or halts), the Verifier asks one focused
 * question: "Does the executed plan actually answer the user's request?"
 *
 * Output:
 *   { satisfied: bool, gap?: string, suggestion?: string, confidence: 0-1 }
 *
 * If satisfied → orchestrator emits the response.
 * If not satisfied AND gap is actionable → orchestrator can re-plan or
 *   continue with one more execution loop, capped to PEV_MAX_VERIFY_LOOPS
 *   (default 2) to prevent thrashing.
 *
 * Why a separate stage and not just trust the Executor:
 * - The Executor doesn't grade its own work — it only knows if tools
 *   succeeded. A successful tool call doesn't mean the user's intent
 *   was met (e.g. "create a CO" succeeded but the user wanted to send
 *   it to the client).
 * - Catches "confidently wrong" failures — the agent reports done when
 *   it actually skipped a step or misinterpreted scope.
 * - Cheap (Haiku, ~150-300ms). Worth running on every complex flow.
 */

const logger = require('../../utils/logger');

const VERIFIER_MODEL = process.env.PEV_VERIFIER_MODEL || 'anthropic/claude-haiku-4.5';
const VERIFIER_TIMEOUT_MS = parseInt(process.env.PEV_VERIFIER_TIMEOUT_MS, 10) || 5000;
const MAX_VERIFY_LOOPS = parseInt(process.env.PEV_MAX_VERIFY_LOOPS, 10) || 2;

const SYSTEM_PROMPT = `You are the VERIFIER stage of an agentic loop. You read a user's request, the plan that was made, and the actual tool results, then decide if the user's request was actually fulfilled.

Reply with ONLY this JSON:
{
  "satisfied": true | false,
  "gap": null | "one-sentence description of what's missing",
  "suggestion": null | "concrete next step to close the gap",
  "confidence": 0.0-1.0
}

JUDGEMENT RULES:

satisfied=true when:
  - All steps executed successfully AND the combined results address every part of the user's request
  - The user's request was a question and the data needed to answer it was retrieved
  - The user's request was an action and the action's success indicators are present in the results (id returned, success: true, etc.)

satisfied=false when:
  - Steps succeeded but a piece of the request wasn't addressed. Look for verbs/conjunctions in the user's request: "create X AND email/send Y", "find Z THEN do W". Each verb after AND/THEN/PLUS is its own deliverable. If the plan didn't include a step for it, satisfied=false.
  - Tool returned suggestions/ambiguous results that need user disambiguation
  - The plan never executed any of the steps the user actually wanted
  - **The execution VIOLATES a business rule** the user has set previously
    (visible in the optional KNOWN BUSINESS RULES section below). For
    example: rules say "Smith pays net-15" but the plan created an
    invoice for Smith with net-30. Or rules say "always charge 8.75% tax"
    but the plan used 0%. Surface as a gap so the user can review.

EXAMPLES:

User request: "create a change order for Smith for $1500 and email it to him"
Plan executed: create_change_order only
→ satisfied: false
→ gap: "Plan created the CO but did not email/send it to the client"
→ suggestion: "Run send_change_order to email it"

User request: "show me overdue invoices"
Plan executed: search_invoices(status=overdue) returning 3 results
→ satisfied: true (the data needed to answer is in the result)

User request: "create a CO for Smith bath tile, $1600"
Plan executed: search_projects(q=Smith) returning 1 result, create_change_order succeeded
→ satisfied: true

GAP MUST BE CONCRETE. Don't say "more might be needed" — say specifically what's missing. If satisfied=true, gap and suggestion must be null.

Reply with ONLY the JSON. No prose, no markdown.`;

/**
 * Verify whether an Execute pass satisfied the user's request AND
 * doesn't violate any business rules pulled from memory.
 *
 * @param {Object} input
 *   userMessage   — original user request
 *   plan          — { goal, steps, ... } from Planner
 *   executeResult — { ok, stepResults[], reachedSteps, stoppedReason? }
 *   memorySnapshot — optional string of durable user facts, used for
 *                    business rule checks (e.g., memory says "Smith
 *                    pays net-15" → flag invoice for Smith with net-30)
 * @returns {Promise<{satisfied, gap, suggestion, confidence, latencyMs, fallback, businessRuleViolations?}>}
 */
async function verify({ userMessage, plan, executeResult, memorySnapshot = '' }) {
  if (!process.env.OPENROUTER_API_KEY) {
    return safeFallback('no API key');
  }
  if (!userMessage || !plan || !executeResult) {
    return safeFallback('missing input');
  }

  // Short-circuit: if the executor already halted, we don't need the LLM
  // to tell us we're not satisfied. The Executor's own stoppedReason +
  // last step error are the ground truth. The LLM is reserved for the
  // judgment call: "execution succeeded — does it actually address the
  // user's request?"
  if (executeResult.ok === false) {
    const last = (executeResult.stepResults || []).slice(-1)[0];
    const failureMsg = executeResult.stoppedReason
      || last?.error?.message
      || 'execution halted';
    return {
      satisfied: false,
      gap: failureMsg,
      suggestion: last?.result?.suggestions
        ? 'Show the suggestions to the user and ask which to pick.'
        : 'Ask the user to clarify or adjust the request.',
      confidence: 0.9,
      latencyMs: 0,
      fallback: false,
      shortCircuit: true,
    };
  }

  const summary = buildExecutionSummary(plan, executeResult);

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFIER_TIMEOUT_MS);

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - PEV Verifier',
      },
      body: JSON.stringify({
        model: VERIFIER_MODEL,
        max_tokens: 350,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content:
              `USER REQUEST:\n${userMessage.slice(0, 1500)}\n\n` +
              `PLAN GOAL:\n${plan.goal}\n\n` +
              `EXECUTION:\n${summary}` +
              (memorySnapshot ? `\n\nKNOWN BUSINESS RULES (from memory):\n${memorySnapshot.slice(0, 1500)}` : '') },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      logger.warn(`[PEV.verifier] OpenRouter ${resp.status}`);
      return safeFallback(`http ${resp.status}`, t0);
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content || '';
    const parsed = parseJson(content);
    if (!parsed) return safeFallback('unparseable', t0);

    return {
      satisfied: parsed.satisfied === true,
      gap: parsed.satisfied ? null : (typeof parsed.gap === 'string' ? parsed.gap : null),
      suggestion: parsed.satisfied ? null : (typeof parsed.suggestion === 'string' ? parsed.suggestion : null),
      confidence: clamp01(parseFloat(parsed.confidence) || 0.5),
      latencyMs: Date.now() - t0,
      fallback: false,
    };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') return safeFallback('timeout', t0);
    logger.warn(`[PEV.verifier] error: ${e.message}`);
    return safeFallback(e.message, t0);
  }
}

/**
 * Compact, machine-readable summary of execution for the verifier.
 * We stringify the actual outputs but cap each so the prompt stays cheap.
 */
function buildExecutionSummary(plan, exec) {
  const lines = [];
  lines.push(`Overall: ok=${exec.ok}, reachedSteps=${exec.reachedSteps}/${plan.steps.length}`);
  if (exec.stoppedReason) lines.push(`Stopped: ${exec.stoppedReason}`);
  for (let i = 0; i < (exec.stepResults || []).length; i++) {
    const sr = exec.stepResults[i];
    const planStep = plan.steps[i];
    const why = planStep?.why ? ` (${planStep.why})` : '';
    if (sr.error) {
      lines.push(`step ${sr.id} ${sr.tool}${why}: ERROR (${sr.error.class}) ${sr.error.message}`);
    } else {
      const out = JSON.stringify(sr.result || {}).slice(0, 600);
      lines.push(`step ${sr.id} ${sr.tool}${why}: OK → ${out}`);
    }
  }
  return lines.join('\n');
}

function parseJson(content) {
  if (!content) return null;
  const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(cleaned); } catch (_) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function safeFallback(reason, t0 = null) {
  // When the verifier can't run, default to 'satisfied' so we don't block
  // the user's response. The orchestrator can decide to be more cautious
  // for write actions if it wants.
  return {
    satisfied: true,
    gap: null,
    suggestion: null,
    confidence: 0.5,
    latencyMs: t0 ? Date.now() - t0 : 0,
    fallback: true,
    fallbackReason: reason,
  };
}

module.exports = { verify, MAX_VERIFY_LOOPS };
