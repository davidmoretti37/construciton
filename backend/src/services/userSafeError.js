// Sanitizes errors before they're returned to the LLM (and therefore to the
// user). Internal errors are logged at full fidelity server-side. The shape
// returned to the LLM is intentionally narrow: a short safe message, optional
// name-only suggestions, and optional schema-safe enums. Never UUIDs, never
// raw Postgres error strings, never table/column names.

const logger = require('../utils/logger');

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function scrub(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(UUID_RE, '[id]')
    .replace(/violates?\s+(?:foreign key|check|unique|not[-_ ]null)\s+constraint\s+"[^"]+"/gi, 'invalid input')
    .replace(/relation\s+"[^"]+"/gi, 'resource')
    .replace(/column\s+"[^"]+"/gi, 'field')
    .replace(/table\s+"[^"]+"/gi, 'resource')
    .replace(/duplicate\s+key\s+value[^.]*/gi, 'duplicate value')
    .replace(/\bschema\s+"[^"]+"/gi, 'schema');
}

function userSafeError(internal, safeMessage, extras = {}) {
  if (internal) {
    const ctx = extras.context ? ` [${extras.context}]` : '';
    logger.error(`[userSafeError]${ctx}`, internal?.message || internal, internal?.stack ? `\n${internal.stack}` : '');
  }
  const out = { error: scrub(safeMessage || 'Something went wrong.') };
  if (Array.isArray(extras.suggestionNames) && extras.suggestionNames.length > 0) {
    out.suggestions = extras.suggestionNames
      .filter(n => typeof n === 'string' && n.length > 0)
      .slice(0, 10)
      .map(scrub);
  }
  if (Array.isArray(extras.options) && extras.options.length > 0) {
    out.options = extras.options.slice(0, 20).map(scrub);
  }
  if (extras.needs_clarification) {
    out.needs_clarification = scrub(extras.needs_clarification);
  }
  return out;
}

module.exports = { userSafeError, scrub };
