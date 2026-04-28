// Planner stage of the agent loop. Before tool selection runs, a small
// Haiku call reads the user's message + recent history + available tools
// and produces a structured plan. The plan is shown to the user (as a
// "thinking" line) and feeds back into model selection — simple turns
// stay on Haiku, complex/destructive turns route to Sonnet automatically.
//
// Why a separate stage: the agent today decides what to do AND does it
// in one shot, so when it picks the wrong tool there's no chance to
// catch it. With an explicit plan the verifier can compare actual to
// intended, and the user can see what the agent is trying to do.
//
// Failure mode: planner errors (timeout, parse failure, API outage) fall
// back to a default plan that mirrors today's behavior — never blocks
// the chat. Set AGENT_PLANNER_ENABLED=false to disable entirely.

const logger = require('../utils/logger');

const ENABLED = process.env.AGENT_PLANNER_ENABLED !== 'false';
const MODEL = 'anthropic/claude-haiku-4.5';
const TIMEOUT_MS = parseInt(process.env.PLANNER_TIMEOUT_MS, 10) || 2500;

const SYSTEM_PROMPT = `You are the planner stage of a service-business AI agent for construction, cleaning, lawn care, pest, pool, and HVAC service businesses. Read the user's last message + recent conversation. Write a SHORT plan and return ONLY this JSON object:

{
  "plan_text": "1-2 sentences in plain language: what you're going to do",
  "complexity": "simple" | "standard" | "complex",
  "recommended_model": "haiku" | "sonnet",
  "needs_verification": true | false,
  "intent_summary": "one phrase: the user's actual goal"
}

COMPLEXITY RULES:

DEFAULT to haiku. Only escalate to sonnet when one of the SONNET TRIGGERS below is unambiguously true. Haiku handles the vast majority of service-business turns well — creates, updates, searches, summaries, simple confirmations.

- simple: single read tool, no decisions ("what's overdue?", "show me the Smith project", "how is X doing?", "list this week's invoices"). recommended_model=haiku, needs_verification=false.
- standard: one mutation, a two-step lookup, or a creation flow with clear inputs ("create a project for X with these phases", "add an expense to Y", "assign Z to job", "send invoice for $500"). recommended_model=haiku. needs_verification=true if it touches money or a destructive tool, otherwise false.
- complex: ONLY when a SONNET TRIGGER fires. recommended_model=sonnet. needs_verification=true.

SONNET TRIGGERS (use sonnet ONLY if one fires):
1. Voice transcript with explicit self-correction ("create for John, no Karen", "um actually make it Tuesday, no Wednesday"). Filler words alone do NOT trigger sonnet — only an actual corrected referent.
2. Genuine multi-entity disambiguation that needs reasoning ("the bigger Smith project — wait, which one had the kitchen remodel?"). Two clients with the same name where the user gave NO disambiguating signal is "ask which one", which is haiku.
3. Irrevocable destructive action (delete, void, permanently cancel) — sonnet because the cost of being wrong is high, not because reasoning is needed.
4. Three or more chained operations in one turn ("create project, add three phases, assign two workers, generate estimate"). Two operations in one turn is haiku.

EVERYTHING ELSE IS HAIKU. Multi-step is fine on haiku as long as each step is straightforward. "Create project + emit preview" is one step. Ambiguity that can be resolved by asking the user one question is haiku. Voice transcripts without corrections are haiku.

VERIFICATION RULES (override complexity):
- needs_verification=true for ALL destructive intents: delete, void, remove, cancel-permanently. Always.
- needs_verification=true when the user said "yes" / "confirm" / "go ahead" — we want the verifier to confirm we acted on the right thing.

PLAN_TEXT RULES:
- The user SEES this. Make it useful, concrete, and action-oriented.
- Use concrete action verbs that match what the executor will do:
  - "Emitting a project-preview card with these phases…" (creation)
  - "Emitting a service-plan-preview card for the weekly cleaning…"
  - "Emitting an estimate-preview card with line items…"
  - "Calling get_profit_loss for Smith April–today and rendering the P&L card."
  - "Asking which Smith you mean — there are three."
  - "Looking up your unpaid invoices and summarizing what's overdue."
  - "Recording the \\$500 Home Depot expense on the Garcia project under Materials."
- AVOID abstract phrasing. Bad examples:
  - "Creating a project for X." (which tool? what shape?) — say "Emitting a project-preview card for X."
  - "Setting up the project with details." (vague) — say "Emitting a project-preview card showing the 6-week timeline, $45k contract, and Demo/Rough/Finish phases."
  - "I'll handle that." (no value) — name the action.
- For CREATE flows, ALWAYS use the word "emit" + the specific card type (\`project-preview\`, \`service-plan-preview\`, \`estimate-preview\`, \`invoice-preview\`). The executor reads this and knows to emit a visualElement, not stall on a search.
- For voice transcripts with self-corrections, name the LATEST referent — "create a project for John, no Karen" → plan_text mentions Karen, NOT John.
- For ambiguous requests, name the ambiguity: "Two clients named Smith — asking which one you mean."

Return ONLY the JSON. No prose, no markdown.`;

function defaultPlan(userMessage) {
  return {
    plan_text: '',
    complexity: 'standard',
    recommended_model: null,
    needs_verification: false,
    intent_summary: (userMessage || '').slice(0, 120),
    _fallback: true,
  };
}

function lastTurns(messages, n = 4) {
  const out = [];
  for (let i = messages.length - 1; i >= 0 && out.length < n; i--) {
    const m = messages[i];
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const content = typeof m.content === 'string' ? m.content : '';
    if (content) out.unshift({ role: m.role, content: content.slice(0, 800) });
  }
  return out;
}

async function generatePlan({ userMessage, conversationHistory = [], toolNames = [] }) {
  if (!ENABLED) return { ...defaultPlan(userMessage), _disabled: true };
  if (!userMessage || typeof userMessage !== 'string') return defaultPlan(userMessage);

  const recent = lastTurns(conversationHistory, 4);
  const userPrompt = `LAST USER MESSAGE: ${userMessage.slice(0, 2000)}

RECENT CONVERSATION:
${recent.map(t => `[${t.role.toUpperCase()}] ${t.content}`).join('\n')}

AVAILABLE TOOL NAMES (you don't pick the tool, just plan): ${toolNames.slice(0, 40).join(', ')}`;

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
          {
            role: 'system',
            content: [
              // Cache the static planner prompt: it never changes, fires every
              // turn, and is ~300 tokens. Free win — saves the cost of the
              // system block on every cached read.
              { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral', ttl: '1h' } },
            ],
          },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 250,
        temperature: 0.2,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      logger.warn(`[planner] non-200 ${resp.status}, falling back`);
      return defaultPlan(userMessage);
    }
    const json = await resp.json();
    const content = json.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      logger.warn(`[planner] unparseable response, falling back: ${content.slice(0, 200)}`);
      return defaultPlan(userMessage);
    }
    const plan = JSON.parse(match[0]);
    // Sanitize + clamp
    const safe = {
      plan_text: typeof plan.plan_text === 'string' ? plan.plan_text.slice(0, 300) : '',
      complexity: ['simple', 'standard', 'complex'].includes(plan.complexity) ? plan.complexity : 'standard',
      recommended_model: ['haiku', 'sonnet'].includes(plan.recommended_model) ? plan.recommended_model : null,
      needs_verification: !!plan.needs_verification,
      intent_summary: typeof plan.intent_summary === 'string' ? plan.intent_summary.slice(0, 200) : '',
    };
    logger.info(`[planner] ${safe.complexity}/${safe.recommended_model || 'auto'}/verify=${safe.needs_verification}: ${safe.plan_text.slice(0, 80)}`);
    return safe;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      logger.debug(`[planner] timed out after ${TIMEOUT_MS}ms, falling back`);
    } else {
      logger.warn(`[planner] error, falling back: ${e.message}`);
    }
    return defaultPlan(userMessage);
  }
}

// Translate the planner's recommended_model into the agentService model id.
function planToModelId(plan) {
  if (plan?.recommended_model === 'haiku') return 'claude-haiku-4.5';
  if (plan?.recommended_model === 'sonnet') return 'claude-sonnet-4.5';
  return null;
}

module.exports = {
  generatePlan,
  planToModelId,
  ENABLED,
};
