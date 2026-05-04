// Plan verifier. After the executor finishes, this checks whether the
// agent's actual tool calls + final response match what the planner
// said it would do. Divergences get logged + emitted as SSE events;
// the eval harness can score plan-vs-actual alignment over time.
//
// Fail-open: an unparseable verifier response counts as "aligned" with
// severity none. We don't want a flaky verifier blocking real responses.

const logger = require('../utils/logger');

const ENABLED = process.env.AGENT_PLANNER_ENABLED !== 'false';
const MODEL = 'anthropic/claude-haiku-4.5';
const TIMEOUT_MS = parseInt(process.env.PLAN_VERIFIER_TIMEOUT_MS, 10) || 5000;

const SYSTEM_PROMPT = `You are the verifier stage of an AI agent. Compare the agent's PLAN with what it ACTUALLY did. Return ONLY this JSON:

{
  "aligned": true | false,
  "severity": "none" | "minor" | "major",
  "divergence_reason": "<one sentence if not aligned, else empty>"
}

DEFAULT TO NONE / MINOR. "Major" is RESERVED for genuine harm or zero action. The bar is HIGH because flagging major triggers a user-visible retry. False positives are FAR worse than false negatives.

SEVERITY GUIDE:
- **none**: actions broadly match the plan. The agent did the right kind of thing. (This should be ~80% of cases.)
- **minor**: agent took an extra read tool, asked a clarifying question instead of executing, or skipped a step. Acceptable. Not retryable.
- **major**: ONLY if ONE of these is unambiguously true:
  1. A destructive tool (delete_*, void_*) fired and the user did NOT explicitly confirm.
  2. The agent acted on the WRONG ENTITY (plan said Karen, agent operated on John — distinct identity error, not a typo).
  3. The agent COMPLETELY failed to act: no tool calls, no visual cards, no clarifying question, no meaningful response text. Pure dead air or unrelated content.

EXPLICIT ANTI-PATTERNS — these are NEVER major:
- ❌ Agent emitted the right card type (project-preview / service-plan-preview / estimate-preview / invoice-preview / change-order-preview) but missed an OPTIONAL field (phone, email, address, secondary detail). The UI lets the user fill those in. NOT MAJOR.
- ❌ Agent asked a clarifying question instead of acting. ALWAYS minor or none, never major.
- ❌ Agent called an extra read tool (search_*, get_*) the plan didn't list. Always minor or none.
- ❌ Agent's response text reworded the plan's intent. None.
- ❌ Agent didn't include EVERY phase the plan named in a preview card — some phases are implementation detail. Minor at most.
- ❌ Plan said "X with details A, B, C" and agent emitted X with only A and B. Minor.
- ❌ Agent confirmed a fact and waited for the user instead of charging forward. None.

When ANY doubt exists, return "none" or "minor". A false "major" wastes credits AND confuses the user. A false "minor"/"none" just misses a tiny improvement.

Return ONLY the JSON. No prose.`;

function defaultVerdict() {
  return { aligned: true, severity: 'none', divergence_reason: '', _fallback: true };
}

async function verifyPlanExecution({ plan, executedToolCalls = [], finalResponseText = '', emittedVisualElements = [], stepSummary = null }) {
  if (!ENABLED || !plan?.plan_text) return defaultVerdict();
  if (executedToolCalls.length === 0 && !finalResponseText && emittedVisualElements.length === 0) return defaultVerdict();

  const toolList = executedToolCalls.slice(0, 10).map(tc => {
    const name = tc.tool || tc.name || tc.function?.name || 'unknown';
    return `- ${name}`;
  }).join('\n');

  // Visual elements (project-preview, service-plan-preview, estimate-preview, change-order-preview,
  // invoice-preview cards) ARE the agent's action for creation flows. The
  // verifier MUST see these or it incorrectly flags "no creation tool was
  // called" when the agent correctly emitted the preview card.
  const visualList = emittedVisualElements.slice(0, 10).map(v => {
    const t = v?.type || 'unknown';
    return `- ${t}`;
  }).join('\n');

  // P2: for complex plans, the planner emits a step list and the agent
  // loop tracks per-step status. Surface that to the verifier so a turn
  // where steps 1-2 ran but step 3 silently went missing is catchable.
  // Empty / null when the plan didn't have steps.
  const stepLines = Array.isArray(stepSummary) && stepSummary.length
    ? stepSummary.map(s => `- ${s.id}. ${s.action} → ${s.status}`).join('\n')
    : '';
  const planStepsLines = Array.isArray(plan.steps) && plan.steps.length
    ? plan.steps.map(s => `- ${s.id}. ${s.action}`).join('\n')
    : '';

  const userPrompt = `PLAN: ${plan.plan_text}
INTENT: ${plan.intent_summary || '(none)'}
${planStepsLines ? `\nPLAN STEPS:\n${planStepsLines}\n` : ''}${stepLines ? `\nACTUAL STEP STATUS (from runtime tracking):\n${stepLines}\n` : ''}
TOOL CALLS THE AGENT MADE:
${toolList || '(none)'}

VISUAL CARDS THE AGENT EMITTED (these ARE the action for creation flows):
${visualList || '(none)'}

FINAL RESPONSE (first 500 chars):
${(finalResponseText || '').slice(0, 500)}

Important: emitting a project-preview / service-plan-preview / estimate-preview / invoice-preview / change-order-preview / draws-preview visual card IS the equivalent of "creating" — the user confirms the card in the UI which triggers the actual DB write. Do NOT flag "no creation tool called" if the agent emitted the appropriate card type.

Did the actions match the plan? Return JSON only.`;

  // P7: SDK-first with OpenRouter fallback. Same pattern as planner.js.
  const anthropicClient = require('./anthropicClient');
  let content = '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    if (anthropicClient.isAvailable()) {
      try {
        const out = await anthropicClient.callMessages({
          model: MODEL,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt,
          max_tokens: 200,
          temperature: 0,
          timeout_ms: TIMEOUT_MS,
        });
        content = out.text || '';
      } catch (e) {
        logger.warn(`[planVerifier] SDK path failed (${e.message}), falling back to OpenRouter`);
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
          model: MODEL,
          messages: [
            {
              role: 'system',
              content: [
                { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral', ttl: '1h' } },
              ],
            },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 200,
          temperature: 0,
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!resp.ok) {
        logger.warn(`[planVerifier] non-200 ${resp.status}, defaulting to aligned`);
        return defaultVerdict();
      }
      const json = await resp.json();
      content = json.choices?.[0]?.message?.content || '';
    } else {
      clearTimeout(timer);
    }
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      logger.warn(`[planVerifier] unparseable, defaulting to aligned: ${content.slice(0, 100)}`);
      return defaultVerdict();
    }
    const verdict = JSON.parse(match[0]);
    const safe = {
      aligned: verdict.aligned !== false,
      severity: ['none', 'minor', 'major'].includes(verdict.severity) ? verdict.severity : 'none',
      divergence_reason: typeof verdict.divergence_reason === 'string' ? verdict.divergence_reason.slice(0, 240) : '',
    };
    if (safe.severity === 'major') {
      logger.warn(`[planVerifier] MAJOR divergence: ${safe.divergence_reason}`);
    } else if (safe.severity === 'minor') {
      logger.info(`[planVerifier] minor divergence: ${safe.divergence_reason}`);
    }
    return safe;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      logger.debug(`[planVerifier] timed out after ${TIMEOUT_MS}ms, defaulting to aligned`);
    } else {
      logger.warn(`[planVerifier] error, defaulting to aligned: ${e.message}`);
    }
    return defaultVerdict();
  }
}

module.exports = { verifyPlanExecution, ENABLED };
