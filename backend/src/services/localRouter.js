// Local-LLM intent router. Talks to an Ollama instance (your Mac Mini or
// any reachable host) to classify user intent into one of the TOOL_GROUPS
// keys, smarter than the regex-only fallback. Runs free on local hardware
// so the more nuanced classification doesn't cost OpenRouter credits.
//
// Falls back to the existing regex router if Ollama is unreachable, slow,
// or returns garbage — so a Mini reboot never breaks production.
//
// Configuration via env:
//   OLLAMA_URL          (default http://localhost:11434)
//   OLLAMA_ROUTING_MODEL (default qwen2.5:1.5b — small, fast, multilingual)
//   OLLAMA_ROUTING_TIMEOUT_MS (default 800 — beyond this we fall back)
//
// Set OLLAMA_URL=disabled to force regex-only.

const logger = require('../utils/logger');

const URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const MODEL = process.env.OLLAMA_ROUTING_MODEL || 'qwen2.5:1.5b';
const TIMEOUT_MS = parseInt(process.env.OLLAMA_ROUTING_TIMEOUT_MS, 10) || 800;
const DISABLED = URL === 'disabled';

// Allowed intents must match keys in TOOL_GROUPS in toolRouter.js.
const ALLOWED = new Set([
  'financial', 'project', 'worker', 'estimate', 'briefing',
  'search', 'reports', 'settings', 'bank', 'document',
  'service_plan', 'change_order', 'general',
]);

// Tiny in-memory cache so a chatty user doesn't re-classify the same
// short message dozens of times in a row. Keyed by message text +
// conversation-state hint flags (which influence routing).
const cache = new Map();
const CACHE_MAX = 200;
const CACHE_TTL_MS = 60_000;

function cacheKey(message, hints) {
  return `${message.slice(0, 400)}|${hints.hasDraftProject ? 1 : 0}|${hints.hasDraftServicePlan ? 1 : 0}`;
}

function fromCache(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.t > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.intent;
}

function saveCache(key, intent) {
  if (cache.size >= CACHE_MAX) {
    const oldestKey = cache.keys().next().value;
    cache.delete(oldestKey);
  }
  cache.set(key, { intent, t: Date.now() });
}

const SYSTEM_PROMPT = `You classify the user's chat message into ONE intent for a service-business management app. Reply with ONLY a JSON object: {"intent":"<one of the allowed values>"}.

ALLOWED INTENTS:
- change_order — MID-PROJECT scope/price/schedule additions to an EXISTING active project. Triggers: "change order", "CO", "scope change", "extra work", "client wants more", "add ... for ... days", "added X for $Y" on a running project. ALWAYS pick this when the user says "change order" — it overrides project/financial.
- financial — invoices, expenses, payments, P&L, A/R, taxes, payroll, cash flow
- project — anything about ONE-OFF JOBS with phases (remodels, renovations, builds, custom installs)
- service_plan — RECURRING SERVICES (cleaning, lawn, pest, pool, HVAC service, route-based work)
- worker — workers, crew, schedules, timesheets, clock-in/out, assignments
- estimate — quotes, proposals, bids, pricing for line items
- briefing — daily/morning/today/week overviews, "what's happening"
- reports — daily reports, photos, progress documentation
- search — finding things by name without an obvious domain
- settings — business settings, profit margin, service catalog
- bank — bank/card transactions, reconciliation, CSV imports
- document — files, blueprints, permits, attachments
- general — fallback when nothing else fits

DISAMBIGUATION HINTS:
- "add a change order for John for 200sf at $8/sf" → change_order (NOT project, NOT financial)
- "the Smiths added 200sf of tile" (mid-project) → change_order
- "kitchen remodel for Smith" → project (one-off renovation)
- "weekly cleaning for Smith" → service_plan (recurring)
- "what's on my route today" → service_plan
- "create an estimate" → estimate
- Mentions of phases, timelines, "full gut" → project (NEW project planning, not mid-project additions)
- Mentions of every Tuesday, biweekly, monthly visits, routes → service_plan

Just JSON. No prose.`;

async function classifyWithOllama(message) {
  if (DISABLED) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(`${URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        format: 'json',
        stream: false,
        options: { temperature: 0, num_predict: 50 },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message.slice(0, 2000) },
        ],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) {
      logger.warn(`[localRouter] Ollama returned ${resp.status}, falling back`);
      return null;
    }
    const json = await resp.json();
    const content = json.message?.content || '';
    const match = content.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const intent = String(parsed.intent || '').toLowerCase();
    if (!ALLOWED.has(intent)) {
      logger.warn(`[localRouter] Ollama returned invalid intent "${intent}", falling back`);
      return null;
    }
    return intent;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      logger.debug(`[localRouter] timed out after ${TIMEOUT_MS}ms, falling back`);
    } else {
      logger.debug(`[localRouter] error: ${e.message}, falling back`);
    }
    return null;
  }
}

// Public API. Returns the local-classified intent or null. The caller is
// expected to combine this with the regex router; null means "fall back".
async function classifyIntent(message, hints = {}) {
  if (DISABLED || !message) return null;
  const key = cacheKey(message, hints);
  const cached = fromCache(key);
  if (cached) return cached;
  const intent = await classifyWithOllama(message);
  if (intent) saveCache(key, intent);
  return intent;
}

module.exports = { classifyIntent, ALLOWED };
