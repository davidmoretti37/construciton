/**
 * CacheService.js
 *
 * Response cache for agent queries to provide instant responses
 * when the same question is asked with unchanged context.
 */

import logger from '../../../utils/logger';

// Cache TTL by task type (milliseconds)
const CACHE_TTL_BY_TASK = {
  'track_time': 30000,              // 30 seconds (worker status changes frequently)
  'query_workers': 300000,          // 5 minutes (worker list rarely changes)
  'retrieve_schedule_events': 300000, // 5 minutes
  'view_reports': 60000,            // 1 minute
  'query_project': 300000,          // 5 minutes
  'query_estimates': 300000,        // 5 minutes
  'query_invoices': 300000,         // 5 minutes
  'default': 60000                  // 1 minute default
};

class AgentResponseCache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Generate cache key from message, agent, and context hash
   */
  generateKey(userMessage, agentName, contextHash) {
    const normalizedMessage = userMessage.toLowerCase().trim();
    return `${agentName}:${normalizedMessage}:${contextHash}`;
  }

  /**
   * Generate hash from relevant context data
   * Different agents care about different context parts
   */
  generateContextHash(context, agentName) {
    let hashSource = '';

    if (agentName === 'WorkersSchedulingAgent') {
      // Hash based on clocked-in workers and their IDs
      const workerIds = (context.clockedInToday || [])
        .map(w => w.id || w.worker_id)
        .sort()
        .join(',');
      hashSource = workerIds || 'no-workers';
    } else if (agentName === 'FinancialAgent') {
      // Hash based on stats
      hashSource = JSON.stringify(context.stats || {});
    } else if (agentName === 'ProjectAgent') {
      // Hash based on project count and IDs
      const projectIds = (context.projects || [])
        .map(p => p.id)
        .sort()
        .join(',');
      hashSource = projectIds || 'no-projects';
    } else {
      hashSource = 'generic';
    }

    return this.simpleHash(hashSource);
  }

  /**
   * Simple string hash function
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Get cached response if valid
   */
  get(userMessage, agentName, context) {
    const contextHash = this.generateContextHash(context, agentName);
    const key = this.generateKey(userMessage, agentName, contextHash);

    const cached = this.cache.get(key);
    if (!cached) return null;

    // Check TTL expiry
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }

    logger.debug(`⚡ [Cache] HIT for "${userMessage.substring(0, 30)}..."`);
    return cached.response;
  }

  /**
   * Store response in cache
   */
  set(userMessage, agentName, context, response, task = 'default') {
    const contextHash = this.generateContextHash(context, agentName);
    const key = this.generateKey(userMessage, agentName, contextHash);
    const ttl = CACHE_TTL_BY_TASK[task] || CACHE_TTL_BY_TASK['default'];

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      ttl
    });

    logger.debug(`⚡ [Cache] STORED "${userMessage.substring(0, 30)}..." (TTL: ${ttl / 1000}s)`);
  }

  /**
   * Invalidate all cache entries for a specific agent
   */
  invalidateAgent(agentName) {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${agentName}:`)) {
        this.cache.delete(key);
        count++;
      }
    }
    if (count > 0) {
      logger.debug(`⚡ [Cache] Invalidated ${count} ${agentName} entries`);
    }
  }

  /**
   * Clear entire cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    logger.debug(`⚡ [Cache] Cleared all ${size} entries`);
  }

  /**
   * Get cache stats for debugging
   */
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()).map(key => ({
        key: key.substring(0, 50),
        age: Date.now() - this.cache.get(key).timestamp
      }))
    };
  }
}

export const responseCache = new AgentResponseCache();
