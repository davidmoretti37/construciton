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
const TIMEOUT_MS = parseInt(process.env.PLAN_VERIFIER_TIMEOUT_MS, 10) || 2500;

const SYSTEM_PROMPT = `You are the verifier stage of an AI agent. Compare the agent's PLAN with what it ACTUALLY did. Return ONLY this JSON:

{
  "aligned": true | false,
  "severity": "none" | "minor" | "major",
  "divergence_reason": "<one sentence if not aligned, else empty>"
}

DEFAULT TO NONE / MINOR. Major is RARE and reserved for actual harm or completely wrong outcome. The bar for "major" is HIGH because flagging it triggers a costly retry that the user sees.

SEVERITY GUIDE:
- none: actions broadly match the plan. The agent did the right kind of thing. (Most cases.)
- minor: agent took an extra read tool, asked a clarifying question when it could have acted, or omitted some non-essential detail from a preview card. Acceptable, not retryable.
- major: ONE of the following must be true to qualify:
  1. A destructive tool (delete_*, void_*) fired and the user did NOT explicitly confirm in the same turn.
  2. The agent acted on the WRONG entity (plan said Karen, agent operated on John).
  3. The agent COMPLETELY failed to act — no tool calls AND no visual cards emitted AND no clarifying question asked, just dead air or unrelated text.

DO NOT flag major for:
- Asking a clarifying question instead of executing (that's minor at most).
- Emitting the right kind of visual card but missing some optional fields (phone, address). Those get filled in via the UI.
- Doing extra tool calls beyond the plan.
- Slight rewording of the plan's intent.

When in doubt, return minor or none. False positives trigger expensive retries. False negatives just miss a small improvement.

Return ONLY the JSON. No prose.`;

function defaultVerdict() {
  return { aligned: true, severity: 'none', divergence_reason: '', _fallback: true };
}

async function verifyPlanExecution({ plan, executedToolCalls = [], finalResponseText = '', emittedVisualElements = [] }) {
  if (!ENABLED || !plan?.plan_text) return defaultVerdict();
  if (executedToolCalls.length === 0 && !finalResponseText && emittedVisualElements.length === 0) return defaultVerdict();

  const toolList = executedToolCalls.slice(0, 10).map(tc => {
    const name = tc.tool || tc.name || tc.function?.name || 'unknown';
    return `- ${name}`;
  }).join('\n');

  // Visual elements (project-preview, service-plan-preview, estimate-preview,
  // invoice-preview cards) ARE the agent's action for creation flows. The
  // verifier MUST see these or it incorrectly flags "no creation tool was
  // called" when the agent correctly emitted the preview card.
  const visualList = emittedVisualElements.slice(0, 10).map(v => {
    const t = v?.type || 'unknown';
    return `- ${t}`;
  }).join('\n');

  const userPrompt = `PLAN: ${plan.plan_text}
INTENT: ${plan.intent_summary || '(none)'}

TOOL CALLS THE AGENT MADE:
${toolList || '(none)'}

VISUAL CARDS THE AGENT EMITTED (these ARE the action for creation flows):
${visualList || '(none)'}

FINAL RESPONSE (first 500 chars):
${(finalResponseText || '').slice(0, 500)}

Important: emitting a project-preview / service-plan-preview / estimate-preview / invoice-preview visual card IS the equivalent of "creating" — the user confirms the card in the UI which triggers the actual DB write. Do NOT flag "no creation tool called" if the agent emitted the appropriate card type.

Did the actions match the plan? Return JSON only.`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
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
    const content = json.choices?.[0]?.message?.content || '';
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
