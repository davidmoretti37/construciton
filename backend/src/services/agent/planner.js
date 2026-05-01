/**
 * Stage 1 — Planner
 *
 * Given a complex user message + the available tools, emits a structured
 * JSON plan. The Executor walks the plan step by step, resolving
 * placeholders ({{stepId.field}}) at runtime so the Planner doesn't need
 * to know real DB IDs.
 *
 * Output schema:
 * {
 *   goal:       string,
 *   steps: [{
 *     id:          'sN',
 *     tool:        '<tool_name from available tools>',
 *     args:        object  (placeholders allowed: "{{s1.results[0].id}}")
 *     why:         string  (one line — for debug + user-facing reasoning trail)
 *     depends_on:  string[] (ids of earlier steps; '[]' for the first)
 *   }],
 *   needs_user_input: null | { question: string, options?: string[] },
 *   confidence: 0.0-1.0,
 *   reasoning: string
 * }
 *
 * If needs_user_input is set, the executor halts and returns the question
 * to the chat. If confidence < threshold, the orchestrator can also halt
 * and ask. If the plan is malformed or references unknown tools, we fall
 * back to the existing Foreman flow (zero risk to current behavior).
 *
 * Why Sonnet not Haiku: planning errors cascade through every step, so we
 * pay for the better model here and use Haiku for the cheaper, more
 * tolerant downstream stages (verifier, classifier, memory extractor).
 */

const logger = require('../../utils/logger');

const PLANNER_MODEL = process.env.PEV_PLANNER_MODEL || 'anthropic/claude-sonnet-4';
const PLANNER_TIMEOUT_MS = parseInt(process.env.PEV_PLANNER_TIMEOUT_MS, 10) || 25_000;
const MIN_PLAN_CONFIDENCE = parseFloat(process.env.PEV_MIN_PLAN_CONFIDENCE) || 0.55;

/**
 * Build a compact tool catalog the planner will ground its plan in.
 * We pass NAME + DESCRIPTION + REQUIRED ARGS — not the full JSON schema —
 * to keep token cost bounded. The Executor validates args against the full
 * schema at execution time.
 */
function buildToolCatalog(toolDefs) {
  return (toolDefs || []).map((t) => {
    const fn = t.function || t;
    const required = (fn.parameters?.required || []).join(', ');
    const props = fn.parameters?.properties || {};
    const propLines = Object.entries(props).slice(0, 12).map(([k, v]) => {
      const type = v.type || 'any';
      const desc = (v.description || '').slice(0, 120);
      return `    ${k} (${type}): ${desc}`;
    }).join('\n');
    return `- ${fn.name}\n    ${(fn.description || '').slice(0, 240)}\n    required: [${required}]\n${propLines}`;
  }).join('\n\n');
}

const SYSTEM_PROMPT = (toolCatalog, businessContext, memorySnapshot) => `You are the PLANNER stage of an agentic loop for a service-business management app (construction, cleaning, pest, HVAC, lawn, pool, plumbing, etc.). Your job is to convert a complex user request into a structured JSON plan that the Executor can run step by step.

You do NOT execute tools yourself. You output one JSON object — no prose, no markdown.

# CONTEXT

${businessContext || '(no business context)'}

${memorySnapshot ? `# MEMORY (durable facts about this user)
${memorySnapshot}

**USE MEMORY ACTIVELY.** Before planning, scan the memory above for facts that apply to THIS request:
  - Pricing defaults (tax rate, markup, payment terms) → use them in line item calculations and arg values
  - Team roles (who is supervisor, who is the owner) → factor into assignments
  - Workflow preferences ("always email, never text") → respect when picking tools
  - Client-specific terms ("Smith pays net-15") → apply to that client's invoices/COs
  - Business model (route-based vs project-based) → frame the plan correctly
If a memory fact contradicts the user's request (user says net-30 but memory says they always do net-15), DEFAULT to the explicit request but flag it in the plan's reasoning so the verifier can surface it.
` : ''}

# AVAILABLE TOOLS

${toolCatalog}

# OUTPUT SCHEMA — return EXACTLY this JSON shape

{
  "goal": "one-line description of what the user wants",
  "steps": [
    {
      "id": "s1",
      "tool": "<must be one of the tool names above>",
      "args": { "<arg>": "<value or {{placeholder}}>" },
      "why": "one-line reason for this step",
      "depends_on": []
    }
  ],
  "needs_user_input": null,
  "confidence": 0.85,
  "reasoning": "one-line plan summary"
}

# PLACEHOLDERS

Steps that depend on earlier results use placeholders the Executor will resolve at runtime:
  - "{{s1.id}}"            — single id from prior step
  - "{{s1.results[0].id}}" — first item from a list result
  - "{{s2.project_id}}"    — named field from prior step result
The placeholder must be a STRING literal in args — the Executor handles substitution.

# RULES

1. Use ONLY tools listed above. If you need a tool that isn't available, set "needs_user_input" with a question explaining what's missing — DON'T invent a tool name.
2. Each step's "depends_on" must list earlier step ids. The first step's depends_on is [].
3. Keep plans MINIMAL — fewest steps that solve the goal. Don't add "view summary" / "confirm" steps unless the user asked for them.
4. If the request is ambiguous (missing project, missing client, multiple matches likely), set "needs_user_input" with one targeted question and an EMPTY steps array.
5. If the user mentioned a CHANGE ORDER, your plan MUST use create_change_order — never decompose a CO into create_project_phase + record_expense. A CO is one entity that bumps contract + extends schedule + handles phase placement on approval.
6. confidence: 0.9+ if the plan is unambiguous, 0.7-0.9 if minor unknowns the Executor can resolve, 0.5-0.7 if guessing. Below 0.5 set needs_user_input instead.
7. NEVER include prose outside the JSON. Output ONLY the object.

# EXAMPLES

User: "add a change order to John for 200sf bath tile at $8/sf for two more days"
Output:
{
  "goal": "Create a change order on John's project for 200sf of bath tile",
  "steps": [
    {
      "id": "s1",
      "tool": "search_projects",
      "args": { "q": "John" },
      "why": "resolve which 'John' project the CO attaches to",
      "depends_on": []
    },
    {
      "id": "s2",
      "tool": "create_change_order",
      "args": {
        "project_id": "{{s1.results[0].id}}",
        "title": "Bath tile addition",
        "description": "200sf bath tile at $8/sf, +2 days schedule impact",
        "line_items": [
          { "description": "Bath tile", "quantity": 200, "unit": "sf", "unit_price": 8.0, "category": "materials" }
        ],
        "schedule_impact_days": 2,
        "billing_strategy": "invoice_now"
      },
      "why": "create the CO draft (phase placement set on the preview card by user)",
      "depends_on": ["s1"]
    }
  ],
  "needs_user_input": null,
  "confidence": 0.85,
  "reasoning": "single CO creation with one search to resolve project"
}

User: "switch the Wilson job to net-15 and re-issue the next invoice"
Output:
{
  "goal": "Update Wilson project's payment terms to net-15 and reissue the most recent invoice",
  "steps": [
    {
      "id": "s1",
      "tool": "search_projects",
      "args": { "q": "Wilson" },
      "why": "find the Wilson project id",
      "depends_on": []
    },
    {
      "id": "s2",
      "tool": "update_project",
      "args": { "project_id": "{{s1.results[0].id}}", "payment_terms": "net-15" },
      "why": "apply new payment terms",
      "depends_on": ["s1"]
    },
    {
      "id": "s3",
      "tool": "search_invoices",
      "args": { "project_id": "{{s1.results[0].id}}", "status": "draft", "limit": 1 },
      "why": "find the next invoice to reissue",
      "depends_on": ["s1"]
    }
  ],
  "needs_user_input": null,
  "confidence": 0.7,
  "reasoning": "needed to find project + invoice; reissue step depends on whether a draft exists"
}

Now produce a plan for the user's actual message.`;

/**
 * Plan a complex user request.
 *
 * @param {Object} input
 *   userMessage:    string
 *   tools:          array of tool definitions (filtered by toolRouter)
 *   businessContext: short string describing the user's business (optional)
 *   memorySnapshot:  short string of memory facts (optional)
 * @returns {Promise<{ok, plan?, error?, latencyMs}>}
 */
async function plan({ userMessage, tools = [], businessContext = '', memorySnapshot = '' }) {
  if (!userMessage) return { ok: false, error: 'empty message', latencyMs: 0 };
  if (!process.env.OPENROUTER_API_KEY) return { ok: false, error: 'no API key', latencyMs: 0 };
  if (!tools || tools.length === 0) return { ok: false, error: 'no tools provided', latencyMs: 0 };

  const toolNames = new Set(tools.map((t) => (t.function || t).name));
  const toolCatalog = buildToolCatalog(tools);
  const sys = SYSTEM_PROMPT(toolCatalog, businessContext, memorySnapshot);

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PLANNER_TIMEOUT_MS);

  try {
    // Prompt caching: the system prompt (with the full tool catalog) is the
    // big repeating block — same across every planner call. Anthropic cache
    // hits cut input cost ~90% on cached portions and shave latency. We mark
    // the system content as cacheable; OpenRouter forwards the cache_control
    // hint to Anthropic when the model + endpoint support it.
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - PEV Planner',
        'anthropic-beta': 'prompt-caching-2024-07-31',
      },
      body: JSON.stringify({
        model: PLANNER_MODEL,
        max_tokens: 1500,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            // Anthropic-style content blocks with cache_control marker.
            // OpenRouter passes these through to Anthropic for caching.
            content: [
              { type: 'text', text: sys, cache_control: { type: 'ephemeral' } },
            ],
          },
          { role: 'user', content: userMessage.slice(0, 4000) },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      logger.warn(`[PEV.planner] OpenRouter ${resp.status}`);
      return { ok: false, error: `http ${resp.status}`, latencyMs: Date.now() - t0 };
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content || '';
    const parsed = parseJson(content);
    if (!parsed) {
      logger.warn(`[PEV.planner] unparseable: ${content.slice(0, 160)}`);
      return { ok: false, error: 'unparseable plan', latencyMs: Date.now() - t0 };
    }
    const validated = validatePlan(parsed, toolNames);
    if (validated.error) {
      logger.warn(`[PEV.planner] invalid plan: ${validated.error}`);
      return { ok: false, error: validated.error, latencyMs: Date.now() - t0 };
    }
    return { ok: true, plan: validated.plan, latencyMs: Date.now() - t0 };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      return { ok: false, error: 'timeout', latencyMs: Date.now() - t0 };
    }
    logger.warn(`[PEV.planner] error: ${e.message}`);
    return { ok: false, error: e.message, latencyMs: Date.now() - t0 };
  }
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

/**
 * Strict validation: every step references a known tool, every depends_on
 * points at an earlier step id, no cycles, no duplicate ids.
 */
function validatePlan(p, toolNames) {
  if (!p || typeof p !== 'object') return { error: 'plan is not an object' };
  if (typeof p.goal !== 'string') return { error: 'missing goal' };
  if (!Array.isArray(p.steps)) return { error: 'steps must be an array' };

  const seen = new Set();
  for (let i = 0; i < p.steps.length; i++) {
    const s = p.steps[i];
    if (!s || typeof s !== 'object') return { error: `step ${i} not an object` };
    if (typeof s.id !== 'string' || !s.id) return { error: `step ${i} missing id` };
    if (seen.has(s.id)) return { error: `duplicate step id: ${s.id}` };
    if (typeof s.tool !== 'string' || !toolNames.has(s.tool)) {
      return { error: `step ${s.id} references unknown tool: ${s.tool}` };
    }
    if (s.args !== undefined && (s.args === null || typeof s.args !== 'object')) {
      return { error: `step ${s.id} args must be an object` };
    }
    if (!Array.isArray(s.depends_on)) return { error: `step ${s.id} depends_on must be array` };
    for (const dep of s.depends_on) {
      if (!seen.has(dep)) return { error: `step ${s.id} depends_on unknown step ${dep}` };
    }
    seen.add(s.id);
  }

  // Normalize needs_user_input — accept string OR { question, options? }
  // The model sometimes returns just a string question; tolerate both.
  let normalizedNeedsInput = null;
  if (p.needs_user_input != null) {
    if (typeof p.needs_user_input === 'string') {
      normalizedNeedsInput = { question: p.needs_user_input, options: [] };
    } else if (typeof p.needs_user_input === 'object' && typeof p.needs_user_input.question === 'string') {
      normalizedNeedsInput = {
        question: p.needs_user_input.question,
        options: Array.isArray(p.needs_user_input.options) ? p.needs_user_input.options : [],
      };
    } else {
      return { error: 'needs_user_input must be string or { question, options? }' };
    }
  }

  const confidence = clamp01(parseFloat(p.confidence));
  return {
    plan: {
      goal: p.goal,
      steps: p.steps.map((s) => ({
        id: s.id,
        tool: s.tool,
        args: s.args || {},
        why: typeof s.why === 'string' ? s.why : '',
        depends_on: s.depends_on || [],
      })),
      needs_user_input: normalizedNeedsInput,
      confidence,
      reasoning: typeof p.reasoning === 'string' ? p.reasoning : '',
    },
  };
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/**
 * Decide whether the planner's output is actionable.
 * Returns one of: 'execute' | 'ask' | 'fallback'
 */
function planVerdict(plan) {
  if (!plan) return 'fallback';
  if (plan.needs_user_input) return 'ask';
  if (plan.steps.length === 0) return 'fallback';
  if (plan.confidence < MIN_PLAN_CONFIDENCE) return 'ask';
  return 'execute';
}

module.exports = { plan, planVerdict, MIN_PLAN_CONFIDENCE };
