// Sanitizes user-supplied free-text fields before they are interpolated into
// the system prompt or fed back to the LLM as tool results. The goal is to
// strip injection vectors (fake system tags, role markers, instructional
// fences) without distorting the legitimate text the user wrote about their
// own business.

const { scrub } = require('./userSafeError');

const CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const FAKE_FENCES_RE = /<<\/?\s*(?:USER_PROVIDED_CONTEXT|END_USER_PROVIDED_CONTEXT|SYSTEM|END_SYSTEM)\s*>>/gi;
const FAKE_TAG_RE = /<\/?\s*(?:system|assistant|user|tool|developer|instructions?)\s*>/gi;
const ANTHROPIC_DELIMITER_RE = /<\|[^|<>]{1,40}\|>/g;
const ROLE_LINE_RE = /^\s*(?:system|assistant|user|tool)\s*[:>][^\n]*$/gim;

function sanitizeUserContext(value, maxLen = 4000) {
  if (typeof value !== 'string' || value.length === 0) return '';
  let out = value
    .replace(CONTROL_CHARS_RE, ' ')
    .replace(FAKE_FENCES_RE, '[removed]')
    .replace(FAKE_TAG_RE, '[removed]')
    .replace(ANTHROPIC_DELIMITER_RE, '[removed]')
    .replace(ROLE_LINE_RE, '[removed]');
  if (out.length > maxLen) {
    out = out.slice(0, maxLen) + '…[truncated]';
  }
  return out;
}

function fenceUserContext(label, value) {
  const cleaned = sanitizeUserContext(value);
  if (!cleaned) return '';
  return `\n<<USER_PROVIDED_CONTEXT label="${label}">>\n${cleaned}\n<<END_USER_PROVIDED_CONTEXT>>\n`;
}

// Walk a tool result and sanitize any string field. Caps array sizes and
// individual string lengths so a maliciously-large or maliciously-shaped
// result can't dominate the LLM's context window.
function sanitizeToolResult(result, depth = 0) {
  if (depth > 6) return '[depth-cap]';
  if (result == null) return result;
  if (typeof result === 'string') {
    let s = result
      .replace(CONTROL_CHARS_RE, ' ')
      .replace(FAKE_FENCES_RE, '[removed]')
      .replace(FAKE_TAG_RE, '[removed]')
      .replace(ANTHROPIC_DELIMITER_RE, '[removed]')
      .replace(ROLE_LINE_RE, '[removed]');
    if (s.length > 2000) s = s.slice(0, 2000) + '…[truncated]';
    return s;
  }
  if (Array.isArray(result)) {
    const capped = result.slice(0, 50).map(item => sanitizeToolResult(item, depth + 1));
    if (result.length > 50) capped.push(`[${result.length - 50}-more-items-truncated]`);
    return capped;
  }
  if (typeof result === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(result)) {
      out[k] = sanitizeToolResult(v, depth + 1);
    }
    return out;
  }
  return result;
}

// Final-mile scrub: strip any UUID that survived. Used by the agent service
// before the tool result is JSON-stringified into the LLM context.
function scrubLeakedIds(result) {
  if (typeof result === 'string') return scrub(result);
  if (Array.isArray(result)) return result.map(scrubLeakedIds);
  if (result && typeof result === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(result)) {
      // Preserve `id` fields the LLM legitimately needs to call subsequent
      // tools — we only strip stray UUIDs in user-visible text. The LLM never
      // shows raw IDs to the user (system prompt + final scrub on the SSE
      // stream cover that).
      if (k === 'id' || k.endsWith('_id')) {
        out[k] = v;
      } else {
        out[k] = scrubLeakedIds(v);
      }
    }
    return out;
  }
  return result;
}

module.exports = {
  sanitizeUserContext,
  fenceUserContext,
  sanitizeToolResult,
  scrubLeakedIds,
};
