/**
 * MemoryService - Long-term fact storage and retrieval
 *
 * This service enables the AI to remember facts about your business
 * across conversations, making responses more personalized and intelligent.
 *
 * Responsibilities:
 * 1. Extract facts from conversations automatically
 * 2. Store facts in Supabase with confidence scores
 * 3. Retrieve relevant facts for prompts
 * 4. Track fact reinforcement (repeated mentions increase confidence)
 */

import { supabase } from '../../../lib/supabase';
import logger from '../../../utils/logger';

// ============================================================================
// EXTRACTION PATTERNS
// These patterns identify learnable facts from conversations
// ============================================================================

const EXTRACTION_PATTERNS = {
  worker_skill: [
    // "Jose is certified for electrical"
    {
      pattern: /\b(\w+)\s+is\s+(certified|licensed|qualified|good at|skilled in|experienced in|trained in)\s+(?:for\s+)?(.+?)(?:\.|,|$)/i,
      extract: (m) => ({ subject: m[1], fact: `${m[2]} ${m[3]}`.trim() })
    },
    // "Jose can do electrical work"
    {
      pattern: /\b(\w+)\s+can\s+do\s+(.+?)(?:\.|,|$)/i,
      extract: (m) => ({ subject: m[1], fact: `can do ${m[2]}`.trim() })
    },
    // "Jose handles all the plumbing"
    {
      pattern: /\b(\w+)\s+(handles?|does?|manages?)\s+(?:all\s+)?(?:the\s+)?(.+?)(?:\.|,|$)/i,
      extract: (m) => ({ subject: m[1], fact: `handles ${m[3]}`.trim() })
    },
  ],

  client_preference: [
    // "Mrs. Johnson always wants itemized invoices"
    {
      pattern: /\b((?:Mrs?\.|Ms\.|Dr\.)?\s*\w+(?:\s+\w+)?)\s+(always|usually|prefers?|likes?|wants?|needs?|requires?)\s+(.+?)(?:\.|,|$)/i,
      extract: (m) => ({ subject: m[1].trim(), fact: `${m[2]} ${m[3]}`.trim() })
    },
    // "The Smiths never want weekend work"
    {
      pattern: /\b((?:The\s+)?\w+s?)\s+(never|doesn't want|don't want|hates?)\s+(.+?)(?:\.|,|$)/i,
      extract: (m) => ({ subject: m[1].trim(), fact: `${m[2]} ${m[3]}`.trim() })
    },
  ],

  pricing_pattern: [
    // "I usually charge $150/hr for plumbing"
    {
      pattern: /(?:I|we)\s+(usually|typically|normally|always|generally)\s+charge\s+\$?(\d+[\d,]*(?:\.\d{2})?)\s*(?:\/|\s*per\s*)(\w+)\s+(?:for\s+)?(.+?)(?:\.|,|$)/i,
      extract: (m) => ({ subject: m[4].trim(), fact: `$${m[2]}/${m[3]}` })
    },
    // "Bathroom remodels cost $5000-8000" or "run $5000-8000"
    {
      pattern: /\b(\w+(?:\s+\w+)?(?:\s+remodels?|\s+jobs?|\s+projects?)?)\s+(?:costs?|runs?|goes?\s+for|is\s+about)\s+\$?(\d+[\d,]*(?:\s*[-–]\s*\$?\d+[\d,]*)?)/i,
      extract: (m) => ({ subject: m[1].trim(), fact: `typically $${m[2]}` })
    },
    // "My rate for electrical is $100/hr"
    {
      pattern: /(?:my|our)\s+rate\s+for\s+(.+?)\s+is\s+\$?(\d+[\d,]*(?:\.\d{2})?)\s*(?:\/|\s*per\s*)?(\w+)?/i,
      extract: (m) => ({ subject: m[1].trim(), fact: `$${m[2]}${m[3] ? '/' + m[3] : ''}` })
    },
  ],

  business_rule: [
    // "Always add 15% contingency"
    {
      pattern: /\balways\s+(.+?)(?:\.|,|$)/i,
      extract: (m) => ({ subject: 'business', fact: `always ${m[1]}`.trim() })
    },
    // "Never schedule on weekends"
    {
      pattern: /\bnever\s+(.+?)(?:\.|,|$)/i,
      extract: (m) => ({ subject: 'business', fact: `never ${m[1]}`.trim() })
    },
    // "I don't work on Sundays"
    {
      pattern: /(?:I|we)\s+(?:don't|do\s+not|never)\s+(work|schedule|do\s+jobs?)\s+(?:on\s+)?(.+?)(?:\.|,|$)/i,
      extract: (m) => ({ subject: 'business', fact: `never ${m[1]} on ${m[2]}`.trim() })
    },
  ],

  project_insight: [
    // "The house at 123 Main had mold issues"
    {
      pattern: /(?:the\s+)?(?:house|property|place|building|project)\s+(?:at\s+)?(.+?)\s+(had|has|had\s+issues?\s+with|has\s+issues?\s+with)\s+(.+?)(?:\.|,|$)/i,
      extract: (m) => ({ subject: m[1].trim(), fact: `${m[2]} ${m[3]}`.trim() })
    },
  ],

  correction: [
    // "No, I meant $500"
    {
      pattern: /\bno,?\s*(?:I\s+meant|it's|it\s+should\s+be|make\s+it|change\s+(?:it\s+)?to|actually)\s+(.+?)(?:\.|,|$)/i,
      extract: (m) => ({ subject: 'correction', fact: m[1].trim() })
    },
    // "That's wrong, it should be X"
    {
      pattern: /(?:that's|that\s+is)\s+(?:wrong|incorrect|not\s+right),?\s*(?:it\s+should\s+be|it's)\s+(.+?)(?:\.|,|$)/i,
      extract: (m) => ({ subject: 'correction', fact: m[1].trim() })
    },
  ],
};

// ============================================================================
// MEMORY SERVICE CLASS
// ============================================================================

class MemoryService {
  constructor() {
    this.cache = new Map();
    this.userId = null;
    this.initialized = false;
    this.initPromise = null;
  }

  /**
   * Initialize with user ID and load existing memories
   */
  async initialize(userId) {
    if (this.userId === userId && this.initialized) {
      return; // Already initialized for this user
    }

    this.userId = userId;
    this.cache.clear();
    this.initialized = false;

    // Prevent multiple concurrent initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.loadFromDatabase();
    await this.initPromise;
    this.initPromise = null;
    this.initialized = true;
  }

  /**
   * Load all memories from database into cache
   */
  async loadFromDatabase() {
    if (!this.userId) return;

    try {
      const { data, error } = await supabase
        .from('user_memories')
        .select('*')
        .eq('user_id', this.userId)
        .order('confidence', { ascending: false })
        .limit(200);

      if (error) {
        logger.error('[Memory] Failed to load from database:', error);
        return;
      }

      this.cache.clear();
      data?.forEach(memory => {
        const key = this.getCacheKey(memory);
        this.cache.set(key, memory);
      });

      logger.debug(`[Memory] Loaded ${data?.length || 0} memories from database`);
    } catch (error) {
      logger.error('[Memory] Exception loading memories:', error);
    }
  }

  /**
   * Generate cache key for a memory
   */
  getCacheKey(memory) {
    return `${memory.category}:${memory.subject.toLowerCase()}:${memory.fact.toLowerCase()}`;
  }

  /**
   * Extract facts from a conversation turn
   * @param {string} userMessage - The user's message
   * @param {object} aiResponse - The AI's response (optional)
   * @returns {Array} Array of extracted facts
   */
  extractFacts(userMessage, aiResponse = null) {
    const facts = [];
    const textToAnalyze = userMessage + (aiResponse?.text ? ' ' + aiResponse.text : '');

    // Skip very short messages
    if (textToAnalyze.length < 10) {
      return facts;
    }

    for (const [category, patterns] of Object.entries(EXTRACTION_PATTERNS)) {
      for (const { pattern, extract } of patterns) {
        const match = textToAnalyze.match(pattern);
        if (match) {
          try {
            const { subject, fact } = extract(match);

            // Validate extracted data
            if (!subject || !fact || subject.length < 2 || fact.length < 3) {
              continue;
            }

            // Skip common false positives
            if (this.isFalsePositive(subject, fact)) {
              continue;
            }

            facts.push({
              category,
              subject: this.normalizeSubject(subject),
              fact: fact.trim(),
              full_context: match[0].trim(),
              confidence: category === 'correction' ? 1.0 : 0.7,
              source: category === 'correction' ? 'explicit' : 'inferred'
            });

            // Only extract one fact per category per message to avoid noise
            break;
          } catch (e) {
            logger.warn('[Memory] Pattern extraction error:', e);
          }
        }
      }
    }

    return facts;
  }

  /**
   * Check for false positive extractions
   */
  isFalsePositive(subject, fact) {
    const subjectLower = subject.toLowerCase();
    const factLower = fact.toLowerCase();

    // Common words that shouldn't be subjects
    const invalidSubjects = ['i', 'we', 'you', 'they', 'he', 'she', 'it', 'this', 'that', 'the', 'a', 'an'];
    if (invalidSubjects.includes(subjectLower)) {
      return true;
    }

    // Facts that are too generic
    const genericFacts = ['work', 'do', 'help', 'thing', 'stuff'];
    if (genericFacts.includes(factLower)) {
      return true;
    }

    return false;
  }

  /**
   * Normalize subject names for consistency
   */
  normalizeSubject(subject) {
    // Capitalize first letter of each word
    return subject
      .trim()
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Save extracted facts to database
   * @param {Array} facts - Array of facts to save
   */
  async saveFacts(facts) {
    if (!this.userId || facts.length === 0) return;

    for (const fact of facts) {
      try {
        const key = this.getCacheKey(fact);
        const existing = this.cache.get(key);

        if (existing) {
          // Reinforce existing memory
          const newConfidence = Math.min(1.0, existing.confidence + 0.1);
          const newReinforced = existing.times_reinforced + 1;

          const { error } = await supabase
            .from('user_memories')
            .update({
              times_reinforced: newReinforced,
              confidence: newConfidence,
              last_used_at: new Date().toISOString()
            })
            .eq('id', existing.id);

          if (!error) {
            existing.times_reinforced = newReinforced;
            existing.confidence = newConfidence;
            logger.debug(`[Memory] Reinforced: ${fact.subject} - ${fact.fact} (confidence: ${newConfidence.toFixed(2)})`);
          }
        } else {
          // Insert new memory
          const { data, error } = await supabase
            .from('user_memories')
            .insert({
              user_id: this.userId,
              category: fact.category,
              subject: fact.subject,
              fact: fact.fact,
              full_context: fact.full_context,
              confidence: fact.confidence,
              source: fact.source
            })
            .select()
            .single();

          if (!error && data) {
            this.cache.set(key, data);
            logger.debug(`[Memory] Saved new: ${fact.subject} - ${fact.fact}`);
          } else if (error) {
            // Might be a duplicate constraint violation, which is fine
            if (!error.message?.includes('duplicate')) {
              logger.warn('[Memory] Insert error:', error);
            }
          }
        }
      } catch (error) {
        logger.error('[Memory] Failed to save fact:', error);
      }
    }
  }

  /**
   * Get memories relevant to a query
   * @param {string} query - The user's query
   * @param {number} limit - Maximum memories to return
   * @returns {Array} Relevant memories sorted by score
   */
  getRelevantMemories(query, limit = 15) {
    if (!query || this.cache.size === 0) {
      return [];
    }

    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);

    const scored = [];

    for (const memory of this.cache.values()) {
      let score = memory.confidence * 0.5; // Base score from confidence

      const subjectLower = memory.subject.toLowerCase();
      const factLower = memory.fact.toLowerCase();

      // Strong boost if subject is mentioned in query
      if (queryLower.includes(subjectLower)) {
        score += 0.5;
      }

      // Boost if fact words match query words
      const factWords = factLower.split(/\s+/);
      const overlap = factWords.filter(w => queryWords.includes(w)).length;
      score += overlap * 0.15;

      // Boost corrections and explicit facts
      if (memory.source === 'explicit' || memory.category === 'correction') {
        score += 0.2;
      }

      // Boost frequently reinforced memories
      if (memory.times_reinforced > 1) {
        score += Math.min(0.2, memory.times_reinforced * 0.05);
      }

      // Only include if there's some relevance
      if (score > 0.3) {
        scored.push({ memory, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(s => s.memory);
  }

  /**
   * Format memories for prompt injection
   * @param {string} query - The user's query for relevance filtering
   * @returns {string} Formatted memories for prompt
   */
  getMemoriesForPrompt(query = '') {
    const memories = this.getRelevantMemories(query);

    if (memories.length === 0) {
      return '';
    }

    // Group by category
    const grouped = {};
    memories.forEach(m => {
      if (!grouped[m.category]) grouped[m.category] = [];
      grouped[m.category].push(m);
    });

    const categoryLabels = {
      worker_skill: 'Worker Skills & Capabilities',
      client_preference: 'Client Preferences',
      pricing_pattern: 'Your Pricing Patterns',
      business_rule: 'Your Business Rules',
      correction: 'Your Corrections & Preferences',
      project_insight: 'Project History Notes'
    };

    let prompt = '\n\n# WHAT I REMEMBER ABOUT YOUR BUSINESS\n';
    prompt += '(Use this information to give personalized responses)\n';

    for (const [category, mems] of Object.entries(grouped)) {
      prompt += `\n## ${categoryLabels[category] || category}\n`;
      mems.forEach(m => {
        const confidence = m.confidence > 0.8 ? '' : ' (uncertain)';
        prompt += `- ${m.subject}: ${m.fact}${confidence}\n`;
      });
    }

    return prompt;
  }

  /**
   * Get all memories for a specific subject
   * @param {string} subject - The subject to look up
   * @returns {Array} All memories about this subject
   */
  getMemoriesForSubject(subject) {
    const subjectLower = subject.toLowerCase();
    return Array.from(this.cache.values()).filter(
      m => m.subject.toLowerCase() === subjectLower
    );
  }

  /**
   * Mark a memory as used (for tracking relevance over time)
   * @param {string} memoryId - The memory ID
   */
  async markUsed(memoryId) {
    try {
      await supabase
        .from('user_memories')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', memoryId);
    } catch (error) {
      logger.warn('[Memory] Failed to mark used:', error);
    }
  }

  /**
   * Delete a memory
   * @param {string} memoryId - The memory ID to delete
   */
  async deleteMemory(memoryId) {
    try {
      const { error } = await supabase
        .from('user_memories')
        .delete()
        .eq('id', memoryId);

      if (!error) {
        // Remove from cache
        for (const [key, memory] of this.cache.entries()) {
          if (memory.id === memoryId) {
            this.cache.delete(key);
            break;
          }
        }
        logger.debug(`[Memory] Deleted memory: ${memoryId}`);
      }
    } catch (error) {
      logger.error('[Memory] Failed to delete:', error);
    }
  }

  /**
   * Clear all memories (for testing or reset)
   */
  async clearAll() {
    if (!this.userId) return;

    try {
      await supabase
        .from('user_memories')
        .delete()
        .eq('user_id', this.userId);

      this.cache.clear();
      logger.debug('[Memory] Cleared all memories');
    } catch (error) {
      logger.error('[Memory] Failed to clear:', error);
    }
  }

  /**
   * Get memory statistics
   * @returns {object} Stats about stored memories
   */
  getStats() {
    const byCategory = {};
    let totalConfidence = 0;

    for (const memory of this.cache.values()) {
      byCategory[memory.category] = (byCategory[memory.category] || 0) + 1;
      totalConfidence += memory.confidence;
    }

    return {
      total: this.cache.size,
      byCategory,
      averageConfidence: this.cache.size > 0 ? totalConfidence / this.cache.size : 0
    };
  }
}

// Export singleton instance
export const memoryService = new MemoryService();
