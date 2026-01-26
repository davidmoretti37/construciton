const fetch = require('node-fetch');
const AbortController = require('abort-controller');
const logger = require('./logger');

/**
 * Default retry status codes (server errors that may be transient)
 */
const DEFAULT_RETRY_STATUS_CODES = [500, 502, 503, 504, 429];

/**
 * Delay helper with exponential backoff
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch with timeout and retry support
 *
 * @param {string} url - The URL to fetch
 * @param {object} options - Fetch options (method, headers, body, etc.)
 * @param {object} config - Retry configuration
 * @param {number} config.timeout - Timeout in milliseconds (default: 30000)
 * @param {number} config.retries - Number of retry attempts (default: 3)
 * @param {number} config.retryDelay - Initial delay between retries in ms (default: 1000)
 * @param {number[]} config.retryOn - HTTP status codes to retry on (default: [500, 502, 503, 504, 429])
 * @param {boolean} config.retryOnNetworkError - Retry on network errors (default: true)
 * @param {string} config.name - Name for logging (e.g., 'OpenRouter', 'Google Maps')
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithRetry(url, options = {}, config = {}) {
  const {
    timeout = 30000,
    retries = 3,
    retryDelay = 1000,
    retryOn = DEFAULT_RETRY_STATUS_CODES,
    retryOnNetworkError = true,
    name = 'API'
  } = config;

  let lastError;
  let attempt = 0;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      attempt++;

      if (attempt > 1) {
        logger.debug(`🔄 [${name}] Retry attempt ${attempt - 1}/${retries}...`);
      }

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Check if we should retry based on status code
      if (!response.ok && retryOn.includes(response.status) && attempt <= retries) {
        const backoffDelay = retryDelay * Math.pow(2, attempt - 1);
        logger.warn(`⚠️ [${name}] Got ${response.status}, retrying in ${backoffDelay}ms...`);
        await delay(backoffDelay);
        continue;
      }

      // Success or non-retryable error
      return response;

    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;

      // Handle abort/timeout
      if (error.name === 'AbortError') {
        logger.warn(`⏱️ [${name}] Request timed out after ${timeout}ms`);

        if (attempt <= retries) {
          const backoffDelay = retryDelay * Math.pow(2, attempt - 1);
          logger.debug(`🔄 [${name}] Retrying after timeout in ${backoffDelay}ms...`);
          await delay(backoffDelay);
          continue;
        }

        const timeoutError = new Error(`Request to ${name} timed out after ${timeout}ms`);
        timeoutError.code = 'ETIMEDOUT';
        timeoutError.isTimeout = true;
        throw timeoutError;
      }

      // Handle network errors
      if (retryOnNetworkError && attempt <= retries) {
        const backoffDelay = retryDelay * Math.pow(2, attempt - 1);
        logger.warn(`🌐 [${name}] Network error: ${error.message}, retrying in ${backoffDelay}ms...`);
        await delay(backoffDelay);
        continue;
      }

      throw error;
    }
  }

  // Should not reach here, but just in case
  throw lastError || new Error(`Failed to fetch from ${name} after ${retries} retries`);
}

/**
 * Pre-configured fetch functions for specific APIs
 */

// OpenRouter AI - longer timeout, fewer retries (AI is slow but reliable)
const fetchOpenRouter = (url, options) => fetchWithRetry(url, options, {
  timeout: 60000,  // 60 seconds
  retries: 2,
  retryDelay: 2000,
  name: 'OpenRouter'
});

// OpenRouter Vision - medium timeout
const fetchOpenRouterVision = (url, options) => fetchWithRetry(url, options, {
  timeout: 45000,  // 45 seconds
  retries: 2,
  retryDelay: 2000,
  name: 'OpenRouter Vision'
});

// OpenRouter Streaming - shorter timeout (should connect quickly)
const fetchOpenRouterStream = (url, options) => fetchWithRetry(url, options, {
  timeout: 30000,  // 30 seconds
  retries: 1,
  retryDelay: 1000,
  name: 'OpenRouter Stream'
});

// Google Maps - fast API, more retries
const fetchGoogleMaps = (url, options) => fetchWithRetry(url, options, {
  timeout: 10000,  // 10 seconds
  retries: 3,
  retryDelay: 500,
  name: 'Google Maps'
});

// Deepgram - audio processing varies in time
const fetchDeepgram = (url, options) => fetchWithRetry(url, options, {
  timeout: 30000,  // 30 seconds
  retries: 2,
  retryDelay: 1000,
  name: 'Deepgram'
});

// Groq - Ultra-fast inference for planning/routing (300+ tokens/sec)
// Much shorter timeout since Groq is extremely fast
const fetchGroq = (url, options) => fetchWithRetry(url, options, {
  timeout: 15000,  // 15 seconds (Groq is very fast)
  retries: 2,
  retryDelay: 500,
  name: 'Groq'
});

module.exports = {
  fetchWithRetry,
  fetchOpenRouter,
  fetchOpenRouterVision,
  fetchOpenRouterStream,
  fetchGoogleMaps,
  fetchDeepgram,
  fetchGroq
};
