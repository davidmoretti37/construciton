/**
 * Request Memory - Session-scoped context cache
 *
 * Remembers tool results within a user session to:
 * 1. Avoid redundant tool calls
 * 2. Provide context to the agent about what it just learned
 * 3. Speed up follow-up queries
 *
 * Memory expires after 30 minutes (conversation-scoped, not persistent)
 */

const logger = require('../utils/logger');

const MAX_ENTRIES_PER_USER = 200;
const MAX_USERS = 5000;

class RequestMemory {
  constructor() {
    // userId -> Map(key -> { value, timestamp, toolName })
    this.cache = new Map();

    // Auto-cleanup expired entries every 15 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 15 * 60 * 1000);

    logger.info('💾 Request Memory initialized');
  }

  /**
   * Store a tool result for later retrieval
   *
   * @param {string} userId - User ID
   * @param {string} key - Memory key (e.g., "project_abc123")
   * @param {*} value - Value to store
   * @param {string} toolName - Name of tool that generated this data
   */
  remember(userId, key, value, toolName = 'unknown') {
    if (!this.cache.has(userId)) {
      // Evict user with fewest entries if at capacity
      if (this.cache.size >= MAX_USERS) {
        let minUser = null;
        let minSize = Infinity;
        for (const [uid, uc] of this.cache.entries()) {
          if (uc.size < minSize) {
            minSize = uc.size;
            minUser = uid;
          }
        }
        if (minUser) {
          this.cache.delete(minUser);
          logger.debug(`🧹 Evicted user ${minUser.substring(0, 8)} (${minSize} entries) — user cap reached`);
        }
      }
      this.cache.set(userId, new Map());
    }

    const userCache = this.cache.get(userId);

    // Evict oldest entry if at per-user capacity
    if (!userCache.has(key) && userCache.size >= MAX_ENTRIES_PER_USER) {
      let oldestKey = null;
      let oldestTime = Infinity;
      for (const [k, entry] of userCache.entries()) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        userCache.delete(oldestKey);
        logger.debug(`🧹 Evicted entry ${oldestKey} for user ${userId.substring(0, 8)} — per-user cap reached`);
      }
    }

    userCache.set(key, {
      value,
      timestamp: Date.now(),
      toolName
    });

    logger.debug(`💾 Remembered: ${key} for user ${userId.substring(0, 8)} (from ${toolName})`);
  }

  /**
   * Retrieve a previously stored result
   *
   * @param {string} userId - User ID
   * @param {string} key - Memory key
   * @returns {*} Stored value or null if not found/expired
   */
  recall(userId, key) {
    const userCache = this.cache.get(userId);
    if (!userCache || !userCache.has(key)) return null;

    const entry = userCache.get(key);
    const age = Date.now() - entry.timestamp;
    const TTL = 30 * 60 * 1000; // 30 minutes

    // Check if expired
    if (age > TTL) {
      userCache.delete(key);
      logger.debug(`🗑️ Expired: ${key} for user ${userId.substring(0, 8)}`);
      return null;
    }

    logger.debug(`🔍 Recalled: ${key} for user ${userId.substring(0, 8)} (age: ${Math.round(age / 1000)}s)`);
    return entry.value;
  }

  /**
   * Generate context string to append to system prompt
   * Shows the agent what it learned earlier in the conversation
   *
   * @param {string} userId - User ID
   * @returns {string} Context string for system prompt
   */
  getContextForPrompt(userId) {
    const userCache = this.cache.get(userId);
    if (!userCache || userCache.size === 0) return '';

    let context = '\n## CONTEXT FROM EARLIER IN THIS CONVERSATION:\n';
    let itemCount = 0;
    const MAX_ITEMS = 20; // Limit to avoid prompt bloat
    const RECENT_THRESHOLD = 30 * 60 * 1000; // Only show items from last 30 min

    for (const [key, entry] of userCache.entries()) {
      const age = Date.now() - entry.timestamp;

      // Only include recent items
      if (age > RECENT_THRESHOLD) continue;

      // Format based on data type
      try {
        if (key.startsWith('project_')) {
          const proj = entry.value;
          if (proj.name) {
            context += `- Project "${proj.name}": status=${proj.status}, budget=$${proj.budget || proj.contract_amount || 0}\n`;
            itemCount++;
          }
        } else if (key.startsWith('worker_')) {
          const worker = entry.value;
          if (worker.full_name) {
            context += `- Worker "${worker.full_name}": trade=${worker.trade}, status=${worker.status}\n`;
            itemCount++;
          }
        } else if (key.startsWith('estimate_')) {
          const est = entry.value;
          if (est.estimate_number) {
            context += `- Estimate ${est.estimate_number}: client=${est.client_name}, total=$${est.total}\n`;
            itemCount++;
          }
        } else if (key.startsWith('invoice_')) {
          const inv = entry.value;
          if (inv.invoice_number) {
            const amountDue = (inv.total || 0) - (inv.amount_paid || 0);
            context += `- Invoice ${inv.invoice_number}: client=${inv.client_name}, status=${inv.status}, due=$${amountDue}\n`;
            itemCount++;
          }
        } else if (key === 'recent_projects') {
          if (Array.isArray(entry.value) && entry.value.length > 0) {
            context += `- Found ${entry.value.length} recent projects\n`;
            itemCount++;
          }
        } else if (key === 'workers_list') {
          if (Array.isArray(entry.value) && entry.value.length > 0) {
            context += `- Found ${entry.value.length} workers\n`;
            itemCount++;
          }
        } else if (key === 'recent_estimates') {
          if (Array.isArray(entry.value) && entry.value.length > 0) {
            context += `- Found ${entry.value.length} recent estimates\n`;
            itemCount++;
          }
        } else if (key === 'recent_invoices') {
          if (Array.isArray(entry.value) && entry.value.length > 0) {
            context += `- Found ${entry.value.length} recent invoices\n`;
            itemCount++;
          }
        } else if (key === 'last_action') {
          const la = entry.value;
          if (la.tool) {
            const ageSec = Math.round((Date.now() - la.timestamp) / 1000);
            context += `- Last action: ${la.tool} (${ageSec}s ago)\n`;
            itemCount++;
          }
        } else if (key.startsWith('entity_')) {
          const ent = entry.value;
          if (ent.name || ent.full_name || ent.estimate_number || ent.invoice_number) {
            const label = ent.name || ent.full_name || `#${ent.estimate_number || ent.invoice_number}`;
            context += `- Entity "${label}" (id:${ent.id?.slice(0, 8)})\n`;
            itemCount++;
          }
        }
        // tool_last_* keys are intentionally NOT formatted into prompt context.
        // They exist for programmatic recall only. Formatting all ~58 would bloat the prompt.

        if (itemCount >= MAX_ITEMS) break;
      } catch (err) {
        // Skip malformed entries
        logger.debug(`⚠️ Skipped malformed memory entry: ${key}`);
      }
    }

    return itemCount > 0 ? context + '\n' : '';
  }

  /**
   * Check if a specific key exists and is not expired
   *
   * @param {string} userId - User ID
   * @param {string} key - Memory key
   * @returns {boolean} True if exists and not expired
   */
  has(userId, key) {
    return this.recall(userId, key) !== null;
  }

  /**
   * Remove expired entries from all user caches
   * Runs automatically every 15 minutes
   */
  cleanup() {
    const now = Date.now();
    const TTL = 30 * 60 * 1000;
    let cleaned = 0;

    for (const [userId, userCache] of this.cache.entries()) {
      for (const [key, entry] of userCache.entries()) {
        if (now - entry.timestamp > TTL) {
          userCache.delete(key);
          cleaned++;
        }
      }

      // Remove user cache if empty
      if (userCache.size === 0) {
        this.cache.delete(userId);
      }
    }

    if (cleaned > 0) {
      logger.debug(`🧹 Cleaned ${cleaned} expired memory entries`);
    }
  }

  /**
   * Clear all memory for a specific user
   * Useful on logout or session end
   *
   * @param {string} userId - User ID
   */
  clearUser(userId) {
    this.cache.delete(userId);
    logger.debug(`🗑️ Cleared all memory for user ${userId.substring(0, 8)}`);
  }

  /**
   * Clear all memory (for testing or maintenance)
   */
  clearAll() {
    const userCount = this.cache.size;
    this.cache.clear();
    logger.info(`🗑️ Cleared all memory (${userCount} users)`);
  }

  /**
   * Get statistics about memory usage
   * Useful for monitoring and debugging
   *
   * @returns {Object} Memory statistics
   */
  getStats() {
    let totalEntries = 0;
    let oldestEntry = Date.now();
    let newestEntry = 0;

    for (const userCache of this.cache.values()) {
      totalEntries += userCache.size;

      for (const entry of userCache.values()) {
        if (entry.timestamp < oldestEntry) oldestEntry = entry.timestamp;
        if (entry.timestamp > newestEntry) newestEntry = entry.timestamp;
      }
    }

    const stats = {
      users: this.cache.size,
      maxUsers: MAX_USERS,
      entries: totalEntries,
      maxEntriesPerUser: MAX_ENTRIES_PER_USER,
      avgEntriesPerUser: this.cache.size > 0 ? Math.round((totalEntries / this.cache.size) * 10) / 10 : 0,
      userCapacity: `${this.cache.size}/${MAX_USERS}`,
      oldestEntryAge: totalEntries > 0 ? Math.round((Date.now() - oldestEntry) / 1000) : 0,
      newestEntryAge: totalEntries > 0 ? Math.round((Date.now() - newestEntry) / 1000) : 0
    };

    return stats;
  }

  /**
   * Shutdown cleanup - clear interval
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('💾 Request Memory shutdown');
    }
  }
}

// Singleton instance
const memory = new RequestMemory();

// Graceful shutdown handling
process.on('SIGTERM', () => memory.shutdown());
process.on('SIGINT', () => memory.shutdown());

module.exports = memory;
