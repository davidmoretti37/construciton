/**
 * Tool handlers for the pinned-facts mechanism — short-lived in-flight
 * state the agent uses across turns.
 *
 * The agent writes via these tools; pins auto-load into the system
 * prompt at every request (see services/pinnedFacts.js).
 */

const { pinFact, unpinFact } = require('../../pinnedFacts');

async function pin_fact(userId, args = {}) {
  const r = await pinFact(userId, args);
  if (r.error) return { error: r.error };
  return {
    success: true,
    pinned: { key: r.key, value: r.value, expires_at: r.expires_at },
  };
}

async function unpin_fact(userId, args = {}) {
  const r = await unpinFact(userId, args);
  if (r.error) return { error: r.error };
  return { success: true, unpinned: r.key };
}

module.exports = { pin_fact, unpin_fact };
