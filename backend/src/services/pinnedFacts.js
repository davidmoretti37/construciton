/**
 * Pinned Facts Service — short-lived in-flight state for the agent.
 *
 * Different from agent_memories (long-term durable facts).
 * This is for "the agent needs to remember this until the work is done"
 * — active project, in-flight CO, pending approval the user paused on,
 * the worker the user just asked about, etc.
 *
 * Auto-loaded into the agent's system prompt at every request, so the
 * agent doesn't need to call a tool to read pins. Two write tools:
 *   pin_fact({ key, value, ttl_days? })
 *   unpin_fact({ key })
 *
 * Default TTL: 7 days. Expired pins are filtered server-side and
 * eventually swept by the daily cleanup job (deferred — for now, the
 * pre-fetch query just filters them out).
 */

const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Cap pinned facts per user — prevents the agent from filling memory
// with junk and bloating every system prompt.
const MAX_PINS_PER_USER = parseInt(process.env.PINNED_FACTS_MAX_PER_USER, 10) || 12;
const DEFAULT_TTL_DAYS = parseInt(process.env.PINNED_FACTS_DEFAULT_TTL_DAYS, 10) || 7;

/**
 * Fetch all non-expired pins for a user, ordered by most recently
 * updated. Returns array of { key, value, expires_at }.
 */
async function listPins(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('agent_pinned_facts')
    .select('key, value, expires_at, updated_at')
    .eq('user_id', userId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('updated_at', { ascending: false })
    .limit(MAX_PINS_PER_USER);
  if (error) {
    logger.warn('[pinnedFacts] list error:', error.message);
    return [];
  }
  return data || [];
}

/**
 * Format pinned facts as a compact text block for the system prompt.
 * Returns empty string when there are no pins so the prompt stays clean.
 *
 *   # IN-FLIGHT FACTS
 *   - active_project: Smith Bathroom Remodel
 *   - pending_co: CO-007 awaiting client response since 5/2
 *
 * Each line is one pin. Format keeps the agent honest about what's
 * pinned and lets it spot stale entries it should unpin.
 */
async function buildSystemPromptBlock(userId) {
  const pins = await listPins(userId);
  if (pins.length === 0) return '';
  const lines = pins.map((p) => `  - ${p.key}: ${p.value}`).join('\n');
  return [
    '',
    '# IN-FLIGHT FACTS',
    '(Short-lived state from earlier turns. You can update via pin_fact / unpin_fact.)',
    lines,
    '',
  ].join('\n');
}

/**
 * Upsert a pin. Replaces the value if the key already exists.
 *
 * @param {string} userId
 * @param {Object} args
 *   key:       string (required)  — stable identifier, e.g. 'active_project'
 *   value:     string (required)  — the fact, ≤500 chars
 *   ttl_days:  number (optional)  — override default. 0 or null = no expiry.
 */
async function pinFact(userId, { key, value, ttl_days } = {}) {
  if (!userId) return { error: 'no user' };
  if (!key || typeof key !== 'string') return { error: 'key is required' };
  if (!value || typeof value !== 'string') return { error: 'value is required' };
  if (value.length > 500) return { error: 'value too long (max 500 chars)' };

  // Compute expiry. ttl_days=0 / null means no expiry; otherwise N days from now.
  let expires_at = null;
  const ttl = (ttl_days === null || ttl_days === undefined) ? DEFAULT_TTL_DAYS : Number(ttl_days);
  if (ttl > 0) {
    expires_at = new Date(Date.now() + ttl * 24 * 60 * 60 * 1000).toISOString();
  }

  // Cap: if user already has MAX_PINS_PER_USER active pins AND this is a new key, evict the oldest
  const existing = await listPins(userId);
  const isNewKey = !existing.find((p) => p.key === key);
  if (isNewKey && existing.length >= MAX_PINS_PER_USER) {
    // Evict the oldest pin to make room
    const oldest = existing[existing.length - 1];
    await supabase.from('agent_pinned_facts').delete()
      .eq('user_id', userId)
      .eq('key', oldest.key);
    logger.info(`[pinnedFacts] evicted oldest pin "${oldest.key}" to make room for "${key}"`);
  }

  // Upsert via ON CONFLICT (user_id, key)
  const { error } = await supabase
    .from('agent_pinned_facts')
    .upsert({
      user_id: userId,
      key: String(key).trim().slice(0, 80),
      value: String(value).trim(),
      expires_at,
    }, { onConflict: 'user_id,key' });

  if (error) {
    logger.warn('[pinnedFacts] pin error:', error.message);
    return { error: error.message };
  }

  return { success: true, key, value, expires_at };
}

/**
 * Remove a pin. Returns success even if it didn't exist.
 */
async function unpinFact(userId, { key } = {}) {
  if (!userId) return { error: 'no user' };
  if (!key) return { error: 'key is required' };
  const { error } = await supabase
    .from('agent_pinned_facts')
    .delete()
    .eq('user_id', userId)
    .eq('key', String(key).trim());
  if (error) {
    logger.warn('[pinnedFacts] unpin error:', error.message);
    return { error: error.message };
  }
  return { success: true, key };
}

module.exports = { listPins, buildSystemPromptBlock, pinFact, unpinFact, MAX_PINS_PER_USER, DEFAULT_TTL_DAYS };
