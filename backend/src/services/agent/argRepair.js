/**
 * LLM-assisted argument repair.
 *
 * When a tool fails with a recoverable error (missing field, invalid
 * format, type mismatch), this stage runs a small Haiku call:
 *   "tool X errored with Y. Here's the schema. Fix the args."
 *
 * Returns either { repaired: true, args } or { repaired: false, reason }.
 *
 * Wins:
 *   - Project_id missing because planner used wrong path → fix to right path
 *   - Number was string → coerce to number
 *   - Required field omitted → fill with sensible default if obvious
 *
 * Refuses to repair:
 *   - Auth / permission errors
 *   - "Not found" errors (no amount of arg massaging fixes a missing row)
 *   - Anything where the original intent is unclear
 *
 * Cost: only fires when a tool returns bad_args / soft error. ~$0.0008 per
 * repair attempt. Saves the user a clarification round-trip when the
 * planner's args were just slightly off.
 */

const logger = require('../../utils/logger');

const REPAIR_MODEL = process.env.PEV_ARG_REPAIR_MODEL || 'anthropic/claude-haiku-4.5';
const REPAIR_TIMEOUT_MS = parseInt(process.env.PEV_ARG_REPAIR_TIMEOUT_MS, 10) || 5000;

const SYSTEM_PROMPT = `You repair tool arguments after a tool call failed with a recoverable argument error. Reply with ONLY this JSON:

{
  "repairable": true | false,
  "args": { ... }              // only when repairable=true
  "reason": "why not"          // only when repairable=false
}

REPAIRABLE errors:
  - Missing required field that has an obvious value in the original args
    (e.g., 'project_id required' when args.id holds a UUID — promote it)
  - Type mismatch (string vs number) — coerce
  - Wrong field name typo (project_uid vs project_id) when the value is right
  - Format mismatch (date string in wrong format) when original intent is clear

NOT REPAIRABLE:
  - Auth / permission errors
  - "Not found" / "no match" — fix is upstream (different search args)
  - Ambiguous matches (multiple suggestions) — user must pick
  - Anything where the correct args aren't inferable from the original args + error

Reply with ONLY the JSON. No prose, no markdown.`;

/**
 * Attempt to repair args for a failed tool call.
 *
 * @param {Object} input
 *   tool        — name of the tool that failed
 *   args        — the args that were passed
 *   error       — the error returned (string)
 *   schema      — the tool's parameters JSONSchema (from definitions.js)
 * @returns {Promise<{repaired: boolean, args?: object, reason?: string}>}
 */
async function repair({ tool, args, error, schema }) {
  if (!process.env.OPENROUTER_API_KEY) return { repaired: false, reason: 'no API key' };
  if (!tool || !error) return { repaired: false, reason: 'missing input' };

  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REPAIR_TIMEOUT_MS);

  try {
    const userPayload = `TOOL: ${tool}
ORIGINAL ARGS:
${JSON.stringify(args || {}, null, 2)}

ERROR:
${error}

${schema ? `SCHEMA:\n${JSON.stringify(schema, null, 2).slice(0, 1500)}` : ''}`;

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': 'https://construction-manager.app',
        'X-Title': 'Construction Manager - PEV ArgRepair',
      },
      body: JSON.stringify({
        model: REPAIR_MODEL,
        max_tokens: 600,
        temperature: 0,
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
      logger.warn(`[PEV.argRepair] OpenRouter ${resp.status}`);
      return { repaired: false, reason: `http ${resp.status}` };
    }
    const json = await resp.json();
    const content = json?.choices?.[0]?.message?.content || '';
    const parsed = parseJson(content);
    if (!parsed) return { repaired: false, reason: 'unparseable' };
    if (parsed.repairable === true && parsed.args && typeof parsed.args === 'object') {
      logger.info(`[PEV.argRepair] repaired ${tool} args in ${Date.now() - t0}ms`);
      return { repaired: true, args: parsed.args };
    }
    return { repaired: false, reason: parsed.reason || 'not repairable' };
  } catch (e) {
    clearTimeout(timer);
    return { repaired: false, reason: e.message };
  }
}

/**
 * Decide whether an error message is even worth attempting repair on.
 * Cheap pre-filter so we don't burn LLM calls on obvious dead-ends.
 */
function isWorthRepairing(error) {
  if (!error || typeof error !== 'string') return false;
  const lower = error.toLowerCase();
  // Skip "not found" / auth errors / ambiguous — repair won't help
  if (lower.includes('not found') || lower.includes('no match')) return false;
  if (lower.includes('unauthorized') || lower.includes('forbidden') || lower.includes('access denied')) return false;
  if (lower.includes('multiple') && lower.includes('match')) return false;
  // Heuristic: contains 'required' / 'invalid' / 'missing' / 'must be' = arg-shaped
  return /required|invalid|missing|must be|expected|format|type/i.test(error);
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

module.exports = { repair, isWorthRepairing };
