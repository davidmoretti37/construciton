/**
 * Memory write-loop — fire-and-forget Haiku call after every PEV turn.
 *
 * Reads the user message + agent response and extracts ONLY DURABLE FACTS
 * worth keeping across conversations. Writes them to the user's
 * persistent memory via the existing memoryTool (path-based, like a
 * tiny filesystem — see services/memoryTool.js for the API).
 *
 * What counts as durable:
 *   - Names of supervisors / workers / vendors / clients with their roles
 *   - Pricing defaults the user confirmed ("I always charge 8.75% tax",
 *     "Smith pays net-15")
 *   - Recurring preferences ("default phases are demo/rough/finish",
 *     "use ACH for client payments")
 *   - Business model facts established once ("we're a remodeler, not a
 *     route-based service")
 *
 * What does NOT count:
 *   - Database state (projects, transactions, schedules) — query fresh
 *   - In-flight task details ("the CO we just created")
 *   - Conversational ack ("yes", "ok")
 *   - Anything the user might change next week (current job status)
 *
 * Why fire-and-forget: this runs AFTER the user's response is sent.
 * It must never delay or block the chat. If extraction fails, we shrug
 * and try again next turn. Memory grows over time, no single turn is
 * critical.
 */

const logger = require('../../utils/logger');
// Lazy-require memoryTool inside extractAndWrite — its module init creates
// a Supabase client that fails when env isn't set (test environment).
// The pure helpers (isValidFact, pathForFact, formatFact, parseJson) don't
// need it, so we don't trigger the import unless we're actually writing.

const EXTRACTOR_MODEL = process.env.PEV_MEMORY_EXTRACTOR_MODEL || 'anthropic/claude-haiku-4.5';
const EXTRACTOR_TIMEOUT_MS = parseInt(process.env.PEV_MEMORY_EXTRACTOR_TIMEOUT_MS, 10) || 6000;
const MAX_FACTS_PER_TURN = parseInt(process.env.PEV_MAX_FACTS_PER_TURN, 10) || 2;

const SYSTEM_PROMPT = `You read a user message and the AI's response, and extract ONLY DURABLE FACTS worth saving across conversations. Reply with ONLY this JSON:

{
  "facts": [
    {
      "kind": "preference" | "team" | "pricing" | "workflow" | "business",
      "subject": "short identifier — e.g. 'lana', 'tax_rate', 'invoice_terms'",
      "fact": "the durable fact, in one short sentence"
    }
  ]
}

DURABLE FACTS:
  - Roles: "Lana is the supervisor on Bathroom Remodel"
  - Preferences: "User always invoices net-15 to Smith"
  - Defaults: "User charges 8.75% sales tax"
  - Workflow: "User wants estimates emailed, not texted"
  - Business model: "User runs a pest control route business, not project-based"

NOT DURABLE (do NOT extract):
  - Job statuses (will change tomorrow)
  - Specific transactions or invoice numbers
  - Conversational ack ("yes", "ok")
  - In-flight task details
  - Anything the user might reverse next week

Return at most ${MAX_FACTS_PER_TURN} facts. If nothing durable in this exchange, return: {"facts": []}.

Reply with ONLY the JSON. No prose.`;

/**
 * Extract + write memory for one conversational turn. Fire-and-forget.
 *
 * @param {Object} input
 *   userId      — string (auth user id; memoryTool resolves owner internally)
 *   userMessage — string
 *   responseText — string (the agent's reply to that message)
 */
async function extractAndWrite({ userId, userMessage, responseText }) {
  if (!userId || !userMessage || !responseText) return;
  if (!process.env.OPENROUTER_API_KEY) return;
  // Cost control: opt-in. Set PEV_MEMORY_WRITE_LOOP=1 to enable. Off by
  // default because it fires after every successful turn and ~$0.001/turn
  // adds up on chatty days. Enable when you want the agent to learn over time.
  if (process.env.PEV_MEMORY_WRITE_LOOP !== '1') return;

  const facts = await extractFacts({ userMessage, responseText });
  if (!facts || facts.length === 0) return;

  // Lazy-require so test environments without Supabase env don't fail
  // at module-import time.
  const { runMemoryCommand } = require('../memoryTool');

  for (const fact of facts.slice(0, MAX_FACTS_PER_TURN)) {
    const path = pathForFact(fact);
    const content = formatFact(fact);
    try {
      // Use create — overwrites if path exists. For "evolving" facts
      // (Lana switched from sup to admin) the new write replaces the old.
      // The path key (kind/subject) is the durable identity.
      await runMemoryCommand(userId, {
        command: 'create',
        path,
        file_text: content,
      });
      logger.info(`[memoryExtractor] wrote ${path} (${fact.kind}/${fact.subject})`);
    } catch (e) {
      logger.debug(`[memoryExtractor] write failed for ${path}: ${e.message}`);
    }
  }
}

async function extractFacts({ userMessage, responseText }) {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACTOR_TIMEOUT_MS);
  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - PEV MemoryExtractor',
      },
      body: JSON.stringify({
        model: EXTRACTOR_MODEL,
        max_tokens: 400,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content:
              `USER MESSAGE:\n${userMessage.slice(0, 1500)}\n\n` +
              `AGENT RESPONSE:\n${responseText.slice(0, 1500)}` },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content || '';
    const parsed = parseJson(content);
    if (!parsed || !Array.isArray(parsed.facts)) return null;
    logger.debug(`[memoryExtractor] extracted ${parsed.facts.length} facts in ${Date.now() - t0}ms`);
    return parsed.facts.filter(isValidFact);
  } catch (e) {
    clearTimeout(timer);
    return null;
  }
}

function isValidFact(f) {
  if (!f || typeof f !== 'object') return false;
  const validKinds = new Set(['preference', 'team', 'pricing', 'workflow', 'business']);
  if (!validKinds.has(f.kind)) return false;
  if (typeof f.subject !== 'string' || !f.subject) return false;
  if (typeof f.fact !== 'string' || !f.fact) return false;
  return true;
}

function pathForFact(fact) {
  // Filesystem-like: /<kind>/<subject>.md
  const safe = String(fact.subject).toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 40);
  return `/${fact.kind}/${safe}.md`;
}

function formatFact(fact) {
  // One-line markdown so it composes nicely in the system-prompt memory snapshot.
  const date = new Date().toISOString().slice(0, 10);
  return `${fact.fact}\n\n_extracted ${date}_`;
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

module.exports = { extractAndWrite, extractFacts, isValidFact, pathForFact };
