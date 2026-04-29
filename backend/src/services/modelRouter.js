/**
 * Model Router - Intelligent model selection based on query complexity
 *
 * Simple rule: 10+ tools needed = use Sonnet (smarter orchestration)
 *              <10 tools = use Haiku (fast and efficient)
 *
 * This ensures:
 * - Simple queries stay fast with Haiku
 * - Complex multi-domain queries get Sonnet's reasoning power
 * - Cost-effective (Haiku handles 80-85% of requests)
 */

const logger = require('../utils/logger');

// Configuration
const TOOL_THRESHOLD = 10; // Use Sonnet if query needs 10+ tools
const ERROR_THRESHOLD = 2; // Switch to Sonnet after 2 consecutive errors

// In-memory usage tracking
const usageStats = {
  totalRequests: 0,
  haikuRequests: 0,
  sonnetRequests: 0,
  estimatedInputTokens: 0,
  estimatedOutputTokens: 0,
  estimatedCost: 0, // USD
  startedAt: new Date().toISOString(),
};

// Approximate pricing per 1M tokens (OpenRouter rates)
const PRICING = {
  'claude-haiku-4.5': { input: 0.80, output: 4.00 },
  'claude-sonnet-4.6': { input: 3.00, output: 15.00 },
};

/**
 * Track usage after a request completes
 */
function trackUsage(model, inputTokens, outputTokens) {
  usageStats.totalRequests++;

  if (model.includes('haiku')) {
    usageStats.haikuRequests++;
  } else {
    usageStats.sonnetRequests++;
  }

  usageStats.estimatedInputTokens += inputTokens;
  usageStats.estimatedOutputTokens += outputTokens;

  const pricing = PRICING[model] || PRICING['claude-haiku-4.5'];
  usageStats.estimatedCost += (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;

  // Log summary every 100 requests
  if (usageStats.totalRequests % 100 === 0) {
    logger.info(`📊 Usage milestone: ${usageStats.totalRequests} requests | Haiku: ${usageStats.haikuRequests} | Sonnet: ${usageStats.sonnetRequests} | Est. cost: $${usageStats.estimatedCost.toFixed(4)}`);
  }
}

/**
 * Get current usage statistics
 */
function getUsageStats() {
  return { ...usageStats };
}

/**
 * Selects the appropriate model based on tool count and conversation history
 *
 * @param {number} toolCount - Number of tools needed for this query
 * @param {Array} conversationHistory - Recent conversation messages
 * @returns {Object} { model, reason, toolCount }
 */
function selectModel(toolCount, conversationHistory = []) {
  // Primary rule: Use Sonnet for complex queries requiring many tools
  if (toolCount >= TOOL_THRESHOLD) {
    logger.info(`🧠 Selecting Sonnet: ${toolCount} tools needed (threshold: ${TOOL_THRESHOLD})`);
    return {
      model: 'claude-sonnet-4.6',
      reason: `Complex query (${toolCount} tools, threshold: ${TOOL_THRESHOLD})`,
      toolCount
    };
  }

  // Fallback rule: Switch to Sonnet if Haiku failed repeatedly
  const recentErrors = conversationHistory.slice(-4).filter(msg => {
    if (msg.role !== 'assistant') return false;

    const content = msg.content || '';
    return (
      content.includes('error') ||
      content.includes('I apologize') ||
      content.includes('unable to') ||
      content.includes('not found') ||
      content.includes('failed')
    );
  });

  if (recentErrors.length >= ERROR_THRESHOLD) {
    logger.info(`🔄 Switching to Sonnet: ${recentErrors.length} recent errors detected`);
    return {
      model: 'claude-sonnet-4.6',
      reason: `Fallback after ${recentErrors.length} errors`,
      toolCount
    };
  }

  // Default: Use Haiku (fast, efficient, handles most tasks perfectly)
  logger.info(`⚡ Selecting Haiku: ${toolCount} tools needed (under threshold)`);
  return {
    model: 'claude-haiku-4.5',
    reason: `Standard query (${toolCount} tools)`,
    toolCount
  };
}

/**
 * Get model statistics for monitoring
 * @param {Array} selectionHistory - Array of past model selections
 * @returns {Object} Statistics about model usage
 */
function getModelStats(selectionHistory) {
  if (!selectionHistory || selectionHistory.length === 0) {
    return {
      haikuCount: 0,
      sonnetCount: 0,
      haikuPercentage: 0,
      sonnetPercentage: 0,
      avgToolCount: 0
    };
  }

  const haikuCount = selectionHistory.filter(s => s.model.includes('haiku')).length;
  const sonnetCount = selectionHistory.filter(s => s.model.includes('sonnet')).length;
  const total = selectionHistory.length;

  const avgToolCount = selectionHistory.reduce((sum, s) => sum + s.toolCount, 0) / total;

  return {
    haikuCount,
    sonnetCount,
    haikuPercentage: Math.round((haikuCount / total) * 100),
    sonnetPercentage: Math.round((sonnetCount / total) * 100),
    avgToolCount: Math.round(avgToolCount * 10) / 10
  };
}

module.exports = {
  selectModel,
  getModelStats,
  trackUsage,
  getUsageStats,
  TOOL_THRESHOLD,
  ERROR_THRESHOLD
};
