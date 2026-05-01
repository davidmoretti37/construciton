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

const crypto = require('crypto');

const ENABLED = process.env.AGENT_PLANNER_ENABLED !== 'false';
const MODEL = 'anthropic/claude-haiku-4.5';
const TIMEOUT_MS = parseInt(process.env.PLANNER_TIMEOUT_MS, 10) || 5000;

// P6: in-memory LRU cache of planner outputs. Keyed by hash of the
// user's last message + the prior 2 turns + the sorted tool name set.
// Hits return a cached plan with `_cached: true`, skipping the Haiku
// call entirely. Saves ~$0.0005 per repeat-shape turn.
//
// Cache is process-local — fine for a single-Railway-instance backend.
// If we scale horizontally we'd swap this for Redis (the API stays the
// same).
const PLAN_CACHE_MAX = 200;
const PLAN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const _planCache = new Map(); // key → { plan, expiresAt }

function planCacheKey(userMessage, recentTurns, toolNames) {
  const h = crypto.createHash('sha1');
  h.update(String(userMessage || '').slice(0, 800));
  h.update('|');
  for (const t of recentTurns.slice(-2)) {
    h.update(`${t.role}:${(t.content || '').slice(0, 400)}|`);
  }
  h.update(toolNames.slice().sort().join(','));
  return h.digest('hex').slice(0, 16);
}

function planCacheGet(key) {
  const hit = _planCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    _planCache.delete(key);
    return null;
  }
  // Touch — move to end (LRU).
  _planCache.delete(key);
  _planCache.set(key, hit);
  return hit.plan;
}

function planCacheSet(key, plan) {
  if (_planCache.size >= PLAN_CACHE_MAX) {
    // evict oldest (LRU)
    const oldest = _planCache.keys().next().value;
    if (oldest) _planCache.delete(oldest);
  }
  _planCache.set(key, { plan, expiresAt: Date.now() + PLAN_CACHE_TTL_MS });
}

function planCacheStats() {
  return { size: _planCache.size, max: PLAN_CACHE_MAX, ttl_ms: PLAN_CACHE_TTL_MS };
}

const SYSTEM_PROMPT = `You are the planner stage of a service-business AI agent for construction, cleaning, lawn care, pest, pool, and HVAC service businesses. Read the user's last message + recent conversation. Write a SHORT plan and return ONLY this JSON object:

{
  "plan_text": "1-2 sentences in plain language: what you're going to do",
  "complexity": "simple" | "standard" | "complex",
  "recommended_model": "haiku" | "sonnet",
  "needs_verification": true | false,
  "intent_summary": "one phrase: the user's actual goal",
  "steps": [
    { "id": 1, "action": "<short imperative action>", "tools_likely": ["<tool_name>", ...], "depends_on": [<prior step ids>] }
  ]
}

The "steps" array is OPTIONAL and ONLY included for complex turns (see COMPLEXITY RULES). For simple/standard turns, OMIT the steps key entirely. When you include it, cap at 5 steps; each "action" is a 4-12 word imperative ("Create the service plan", "Email the welcome packet"). "tools_likely" lists tool names the orchestrator probably needs (use names from AVAILABLE TOOL NAMES below; empty array is fine if you don't know). "depends_on" is optional and references prior step ids that must complete first.

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

WHEN COMPLEX, ALSO EMIT STEPS:
- 1-5 steps. Each step is a discrete action the orchestrator will take.
- Use specific actions tied to the cards/tools the executor will run ("Emit project-preview card", "Call assign_worker for Jose", "Email welcome packet via share_document").
- Order matters. Use depends_on if step 3 must wait for step 1 to land.
- For simple/standard plans: DO NOT include the steps key. The executor handles them as single-shot actions.

EVERYTHING ELSE IS HAIKU. Multi-step is fine on haiku as long as each step is straightforward. "Create project + emit preview" is one step. Ambiguity that can be resolved by asking the user one question is haiku. Voice transcripts without corrections are haiku.

VERIFICATION RULES (override complexity):
- needs_verification=true for ALL destructive intents: delete, void, remove, cancel-permanently. Always.
- needs_verification=true when the user said "yes" / "confirm" / "go ahead" — we want the verifier to confirm we acted on the right thing.

PLAN_TEXT RULES:
- The user SEES this — write it for THEM, not for the runtime. Plain language. No internal jargon.
- **NEVER mention internal tool / function names.** Tool names like \`get_daily_briefing\`, \`search_projects\`, \`record_expense\`, \`assign_worker\`, \`get_profit_loss\` etc. MUST NOT appear in plan_text. The user doesn't know or care which function the runtime calls. Use natural language for what's happening, not what's being invoked.
  - BAD: "Calling get_daily_briefing to pull your company snapshot..."
  - GOOD: "Pulling your daily snapshot — active projects, revenue, expenses, and key metrics — then rendering a summary card."
  - BAD: "Calling get_profit_loss for Smith April–today and rendering the P&L card."
  - GOOD: "Pulling Smith's P&L for April through today and rendering the report card."
- Use concrete action verbs:
  - "Emitting a project-preview card with these phases…" (creation)
  - "Emitting a service-plan-preview card for the weekly cleaning…"
  - "Emitting an estimate-preview card with line items…"
  - "Emitting a change-order-preview card with the new line items and schedule impact…"
  - "Looking up your unpaid invoices and summarizing what's overdue."
  - "Recording the \\$500 Home Depot expense on the Garcia project under Materials."
  - "Asking which Smith you mean — there are three."
- AVOID abstract phrasing. Bad examples:
  - "Creating a project for X." (vague) — say "Emitting a project-preview card for X."
  - "Setting up the project with details." (vague) — say "Emitting a project-preview card showing the 6-week timeline, $45k contract, and Demo/Rough/Finish phases."
  - "I'll handle that." (no value) — name the action.
- For CREATE flows, ALWAYS use the word "emit" + the specific card type (\`project-preview\`, \`service-plan-preview\`, \`estimate-preview\`, \`invoice-preview\`, \`change-order-preview\`). Those are USER-FACING card names — they're fine to use. Tool names are NOT.
- For voice transcripts with self-corrections, name the LATEST referent — "create a project for John, no Karen" → plan_text mentions Karen, NOT John.
- For ambiguous requests, name the ambiguity: "Two clients named Smith — asking which one you mean."

Return ONLY the JSON. No prose, no markdown.`;

/**
 * Strip leaked tool names from plan_text. The system prompt tells the
 * planner not to mention internal function names; this is a backstop
 * for when the LLM drifts. Replaces patterns like
 *   "Calling get_daily_briefing to pull X"
 *   "via search_projects"
 * with natural-language equivalents. Surgical — preserves the rest of
 * the sentence.
 */
function sanitizePlanText(text) {
  if (!text || typeof text !== 'string') return text || '';
  let s = text;
  const verbPrefixes = '(?:get|search|update|delete|create|void|assign|unassign|share|record|setup|clock|complete|generate|convert|dispatch|invoke|read|list|add|remove|cancel|check|calculate|upload)';

  // Pattern A: "Calling/Using/Invoking <verb>_<word>+ to" → drop the
  // calling preamble, keep the rest with a clean "I'll" or capitalized verb
  s = s.replace(
    new RegExp(`\\b(?:Calling|Using|Invoking)(?: the)?\\s+${verbPrefixes}_[a-z_]+(?:\\s+(?:tool|function))?\\s+to\\s+`, 'gi'),
    ''
  );
  // Pattern B: "Calling/Using <verb>_<word>+ for X" → "Looking at X"
  s = s.replace(
    new RegExp(`\\b(?:Calling|Using|Invoking)(?: the)?\\s+${verbPrefixes}_[a-z_]+(?:\\s+(?:tool|function))?\\s+for\\s+`, 'gi'),
    'Looking at '
  );
  // Pattern C: any remaining bare tool name token — strip it
  s = s.replace(
    new RegExp(`\\b${verbPrefixes}_[a-z_]{2,}\\b`, 'gi'),
    ''
  );
  // Cleanup: collapse double spaces, trim spaces before punctuation,
  // ensure first character is uppercase if we lopped the head off.
  s = s.replace(/\s+/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
  if (s && /^[a-z]/.test(s)) {
    s = s[0].toUpperCase() + s.slice(1);
  }
  return s;
}

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

  // P6: check the in-memory plan cache before paying for the Haiku call.
  // Same user message + same recent context + same tool set → identical
  // plan with high probability, so it's safe to reuse for the cache TTL.
  const cacheKey = planCacheKey(userMessage, recent, toolNames);
  const cached = planCacheGet(cacheKey);
  if (cached) {
    logger.info(`[planner] cache hit (${cacheKey}) — skipping Haiku call`);
    return { ...cached, _cached: true };
  }
  const userPrompt = `LAST USER MESSAGE: ${userMessage.slice(0, 2000)}

RECENT CONVERSATION:
${recent.map(t => `[${t.role.toUpperCase()}] ${t.content}`).join('\n')}

AVAILABLE TOOL NAMES (you don't pick the tool, just plan): ${toolNames.slice(0, 40).join(', ')}`;

  // P7: prefer the Anthropic SDK when ANTHROPIC_API_KEY is set; else
  // fall back to OpenRouter. Both paths use the same prompt-cache
  // pattern and the same model id (modulo the SDK stripping the
  // 'anthropic/' prefix internally).
  const anthropicClient = require('./anthropicClient');
  let content = '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    if (anthropicClient.isAvailable()) {
      try {
        const out = await anthropicClient.callMessages({
          model: MODEL, // SDK strips the 'anthropic/' prefix internally
          systemPrompt: SYSTEM_PROMPT,
          userPrompt,
          max_tokens: 400,
          temperature: 0.2,
          timeout_ms: TIMEOUT_MS,
        });
        content = out.text || '';
      } catch (e) {
        logger.warn(`[planner] SDK path failed (${e.message}), falling back to OpenRouter`);
        content = '';
      }
    }
    // OpenRouter fallback when SDK unavailable OR SDK call failed
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
                // Cache the static planner prompt: it never changes, fires every
                // turn, and is ~300 tokens. Free win — saves the cost of the
                // system block on every cached read.
                { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral', ttl: '1h' } },
              ],
            },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 400,
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
      content = json.choices?.[0]?.message?.content || '';
    } else {
      clearTimeout(timer);
    }
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      logger.warn(`[planner] unparseable response, falling back: ${content.slice(0, 200)}`);
      return defaultPlan(userMessage);
    }
    const plan = JSON.parse(match[0]);
    // Sanitize + clamp
    const rawPlanText = typeof plan.plan_text === 'string' ? plan.plan_text.slice(0, 300) : '';
    const safe = {
      // Strip leaked internal tool names — the user shouldn't see e.g.
      // "Calling get_daily_briefing to pull..." (snake_case function
      // identifiers are runtime detail). The planner's system prompt
      // forbids this; sanitizePlanText is the backstop.
      plan_text: sanitizePlanText(rawPlanText),
      complexity: ['simple', 'standard', 'complex'].includes(plan.complexity) ? plan.complexity : 'standard',
      recommended_model: ['haiku', 'sonnet'].includes(plan.recommended_model) ? plan.recommended_model : null,
      needs_verification: !!plan.needs_verification,
      intent_summary: typeof plan.intent_summary === 'string' ? plan.intent_summary.slice(0, 200) : '',
    };

    // Steps — only retained for complex plans. The agent loop tracks them
    // via the step tracker (agentService.js). Cap at 5 to prevent runaway
    // plans; clamp action length and tools_likely shape.
    if (safe.complexity === 'complex' && Array.isArray(plan.steps)) {
      const steps = plan.steps
        .slice(0, 5)
        .map((s, i) => {
          const id = Number.isFinite(Number(s.id)) ? Number(s.id) : i + 1;
          const action = typeof s.action === 'string' && s.action.trim()
            ? s.action.trim().slice(0, 200)
            : '';
          const tools_likely = Array.isArray(s.tools_likely)
            ? s.tools_likely.filter(t => typeof t === 'string' && t).slice(0, 5)
            : [];
          const depends_on = Array.isArray(s.depends_on)
            ? s.depends_on
                .map(n => Number(n))
                .filter(n => Number.isFinite(n) && n > 0)
                .slice(0, 5)
            : [];
          return { id, action, tools_likely, depends_on };
        })
        .filter(s => s.action);
      if (steps.length > 0) {
        safe.steps = steps;
      }
    }

    logger.info(`[planner] ${safe.complexity}/${safe.recommended_model || 'auto'}/verify=${safe.needs_verification}${safe.steps ? `/${safe.steps.length} steps` : ''}: ${safe.plan_text.slice(0, 80)}`);
    // P6: cache the freshly-generated plan for the next identical query.
    // We don't cache fallback plans (LLM errored / output was malformed)
    // since they don't carry useful state.
    planCacheSet(cacheKey, safe);
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
  if (plan?.recommended_model === 'sonnet') return 'claude-sonnet-4.6';
  return null;
}

module.exports = {
  generatePlan,
  planToModelId,
  planCacheStats,
  ENABLED,
};
