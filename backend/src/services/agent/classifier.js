/**
 * Stage 0 — Complexity Classifier
 *
 * Cheap Haiku call (~150-300ms, ~$0.0005/call) that decides which agent path
 * a user message should take:
 *
 *   simple         — single-tool query or trivial follow-up (current Foreman flow)
 *   complex        — multi-step / multi-entity / requires planning (PEV flow)
 *   clarification  — message is too ambiguous to act on (ask user one question, halt)
 *   briefing       — user wants the daily briefing rollup (current briefing flow)
 *
 * Design choices:
 * - Haiku is the right model: fast, cheap, accurate enough for 4-class routing.
 * - JSON-only output via response_format. We validate strictly; on any parse
 *   error or unexpected value, we fall back to 'simple' (which is the current
 *   working flow) so a classifier outage never breaks chat.
 * - The classifier sees the latest user message + a 1-line summary of the
 *   conversation state. That's enough; we don't ship the whole history.
 * - Output is deterministic JSON, not prose.
 */

const logger = require('../../utils/logger');

const CLASSIFIER_MODEL = process.env.PEV_CLASSIFIER_MODEL || 'anthropic/claude-haiku-4.5';
const CLASSIFIER_TIMEOUT_MS = parseInt(process.env.PEV_CLASSIFIER_TIMEOUT_MS, 10) || 4000;

const VALID_CLASSIFICATIONS = ['simple', 'complex', 'clarification', 'briefing'];

const SYSTEM_PROMPT = `You classify chat messages from owners of small service businesses (construction, cleaning, pest control, HVAC, lawn, pool, plumbing, etc.) into ONE of four routing classes for an AI assistant. Reply with ONLY JSON: {"classification":"...","confidence":0.0-1.0,"reasoning":"..."}.

CLASSES:

simple — Single tool call resolves it, OR no tool needed (small talk, acknowledgement, follow-up to an in-flight preview card). Examples:
  • "show me my estimates"
  • "what's John Smith's address"
  • "yes" / "ok" / "send it"
  • "delete that"
  • "how much have I spent on the Smith project"

complex — Multiple steps, multiple entities, or requires planning before action. The agent must coordinate ≥2 distinct tool calls or make non-obvious decisions. Examples:
  • "add a change order to John for 200sf tile at $8/sf for two more days" (find project → create CO with line items + phase placement)
  • "set up a new project for Maria Henderson, kitchen remodel, $45k budget, starting next week, 4 phases" (create project → add phases → assign workers)
  • "send all my overdue invoices reminders" (find overdue → for each, send reminder)
  • "review my financial health" (multiple analytical tools)
  • "switch the Wilson job to net-15 and re-issue the next invoice" (update project → fetch invoice → regenerate)

clarification — Message is too ambiguous, vague, or fragmentary to act on. The agent should ask ONE targeted question. Examples:
  • "yes" with no recent prompt
  • "fix it" / "do that"
  • "Delo" (single unfamiliar word)
  • "It's 456 Oak" (orphan fragment)
  • "?"
NOTE: If the user asked an ambiguous question that can be answered by ONE quick lookup ("who is Lana?"), classify as simple, not clarification.
NOTE: If the STATE line says "the agent just asked a question last turn", then short replies like "yes" / "no" / "ok" / "sure" / "do it" are SIMPLE confirmations — not clarification.
NOTE: If the STATE line says "a preview card is awaiting user action", then "send it" / "yes" / "save" are SIMPLE confirmations.

briefing — User explicitly asks for a daily/morning/today summary. Examples:
  • "good morning" / "morning brief"
  • "what's going on today"
  • "anything I should know"
  • "give me my morning brief"

CONFIDENCE:
  0.9-1.0 — phrasing is unambiguous
  0.7-0.9 — likely correct, minor doubt
  0.5-0.7 — ambiguous, picking best guess
  <0.5    — really uncertain (caller may decide to ask the user)

Reply ONLY with the JSON object. No prose, no markdown, no preamble.`;

// ─────────────────────────────────────────────────────────────────
// Regex pre-classifier — instant, free, covers ~60% of common phrasings.
// Skips the Haiku call when the message is unambiguously simple/briefing/
// clarification. Falls through to LLM when patterns don't match.
//
// Patterns are intentionally narrow — false positives are costly (route
// wrong → poor response). False negatives are fine — the LLM picks up
// the slack.
// ─────────────────────────────────────────────────────────────────

const FAST_PATTERNS = [
  // briefing — explicit asks for a daily/morning summary
  { re: /^(good\s*morning|morning\s*brief|brief\s*me|daily\s*brief|whats?\s*up\s*today)\s*[!?.]*$/i,
    classification: 'briefing' },
  { re: /^(what'?s?\s+(?:going\s+on|happening)\s+today)\s*[?!.]*$/i, classification: 'briefing' },
  { re: /^(anything\s+i\s+should\s+know|whats?\s+on\s+my\s+plate)\s*[?!.]*$/i, classification: 'briefing' },

  // simple — small talk + acknowledgements (when no clarification context needed)
  { re: /^(hi|hello|hey|yo|sup|thanks|thank\s*you|ok|okay|cool|nice|great|got\s*it|sounds\s*good)\s*[!?.]*$/i,
    classification: 'simple' },

  // simple — explicit lookups / list operations
  { re: /^(show|list|find|get|see|view)\b.+\b(estimates?|invoices?|projects?|workers?|change\s*orders?|expenses?|payments?|reports?|photos?|documents?)\b/i,
    classification: 'simple' },
  { re: /^(my|all)\s+(estimates?|invoices?|projects?|workers?|change\s*orders?|reports?|photos?)\b/i,
    classification: 'simple' },
  { re: /^(how\s+much|how\s+many|what'?s|whose|who'?s)\b/i, classification: 'simple' },

  // clarification — single-word fragments and questions with no anchor
  { re: /^(huh|what|why|hmm|umm|err)\s*[?!.]*$/i, classification: 'clarification' },
  { re: /^[?!.]+$/, classification: 'clarification' },
  { re: /^(fix\s*it|do\s*that|do\s*it|same|again)\s*[!?.]*$/i, classification: 'clarification' },
];

/**
 * Try to classify by regex alone. Returns null if no pattern matches
 * confidently (caller should escalate to LLM).
 */
function fastClassify(userMessage, hints = {}) {
  if (!userMessage || typeof userMessage !== 'string') return null;
  const trimmed = userMessage.trim();

  // Don't fast-classify under any state where context matters more than
  // surface form: bare "yes" with hints is simple, without is clarification,
  // and we want the LLM to disambiguate. Defer to LLM for those.
  const isBareAck = /^(yes|yeah|yep|sure|no|nope|send\s*it|do\s*it)\s*[!?.]*$/i.test(trimmed);
  if (isBareAck) {
    if (hints.lastTurnWasQuestion || hints.hasActivePreview) {
      return { classification: 'simple', confidence: 0.92, reasoning: 'fast: confirmation under active prompt', latencyMs: 0, fallback: false, fast: true };
    }
    return { classification: 'clarification', confidence: 0.85, reasoning: 'fast: bare ack with no context', latencyMs: 0, fallback: false, fast: true };
  }

  for (const p of FAST_PATTERNS) {
    if (p.re.test(trimmed)) {
      return {
        classification: p.classification,
        confidence: 0.95,
        reasoning: `fast regex: matched ${p.re}`,
        latencyMs: 0,
        fallback: false,
        fast: true,
      };
    }
  }
  return null;
}

/**
 * Classify a single user message.
 *
 * Two-stage: first tries an instant regex pre-classifier (handles ~60%
 * of common messages: briefings, lookups, acks, fragments). If no
 * pattern matches, escalates to the Haiku LLM call. The LLM's fallback
 * remains 'simple' so a classifier outage never blocks chat.
 *
 * @param {string} userMessage  — the latest user turn
 * @param {Object} hints        — optional state hints
 *        hints.hasActivePreview  — boolean (a preview card is on screen)
 *        hints.hasDraftProject   — boolean
 *        hints.lastTurnWasQuestion — boolean (the agent just asked something)
 * @returns {Promise<{classification, confidence, reasoning, latencyMs, fast?, fallback}>}
 */
async function classify(userMessage, hints = {}) {
  // Stage 1: regex pre-classifier (instant, free)
  const fast = fastClassify(userMessage, hints);
  if (fast) return fast;

  // Stage 2: LLM classifier (Haiku via OpenRouter, ~1-2s)
  if (!userMessage || typeof userMessage !== 'string') {
    return safeFallback('empty input');
  }
  if (!process.env.OPENROUTER_API_KEY) {
    return safeFallback('no API key');
  }

  // Compose a 1-line state hint so "yes" / "ok" don't get classified as
  // clarification when there's an in-flight card or a recent agent question.
  const hintLine = describeHints(hints);

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - PEV Classifier',
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        max_tokens: 200,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: hintLine
              ? `STATE: ${hintLine}\nMESSAGE: ${userMessage.slice(0, 2000)}`
              : userMessage.slice(0, 2000) },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      logger.warn(`[PEV.classifier] OpenRouter ${resp.status}, falling back to simple`);
      return safeFallback(`http ${resp.status}`, t0);
    }

    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content || '';
    const parsed = parseClassifierJson(content);
    if (!parsed) {
      logger.warn(`[PEV.classifier] unparseable: ${content.slice(0, 120)}`);
      return safeFallback('unparseable', t0);
    }
    if (!VALID_CLASSIFICATIONS.includes(parsed.classification)) {
      logger.warn(`[PEV.classifier] invalid class: ${parsed.classification}`);
      return safeFallback('invalid class', t0);
    }
    return {
      classification: parsed.classification,
      confidence: clamp01(parseFloat(parsed.confidence) || 0.5),
      reasoning: String(parsed.reasoning || '').slice(0, 200),
      latencyMs: Date.now() - t0,
      fallback: false,
    };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') {
      logger.warn(`[PEV.classifier] timed out after ${CLASSIFIER_TIMEOUT_MS}ms`);
      return safeFallback('timeout', t0);
    }
    logger.warn(`[PEV.classifier] error: ${e.message}`);
    return safeFallback(e.message, t0);
  }
}

function describeHints(hints) {
  if (!hints || typeof hints !== 'object') return '';
  const parts = [];
  if (hints.hasActivePreview) parts.push('a preview card (estimate/invoice/CO) is awaiting user action');
  if (hints.hasDraftProject) parts.push('a draft project is in-flight in the conversation');
  if (hints.lastTurnWasQuestion) parts.push('the agent just asked a question last turn');
  return parts.join(', ');
}

function parseClassifierJson(content) {
  if (!content) return null;
  // Strip markdown fences if the model added them despite response_format
  const cleaned = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Try to extract first {...} block
    const m = cleaned.match(/\{[\s\S]*?\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

function safeFallback(reason, t0 = null) {
  return {
    classification: 'simple',
    confidence: 0.5,
    reasoning: `fallback: ${reason}`,
    latencyMs: t0 ? Date.now() - t0 : 0,
    fallback: true,
  };
}

module.exports = { classify, VALID_CLASSIFICATIONS };
