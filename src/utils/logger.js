/**
 * Custom Logger Utility
 * Provides conditional logging based on environment
 * Improves performance by disabling logs in production
 */

const IS_DEV = __DEV__; // Expo/React Native development flag

/**
 * Log levels
 */
const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
};

/**
 * Current log level - only logs at this level or higher will be shown
 * In production, set to ERROR to only show critical errors
 */
const CURRENT_LOG_LEVEL = IS_DEV ? LogLevel.DEBUG : LogLevel.ERROR;

/**
 * Custom logger object
 */
const logger = {
  /**
   * Debug level logs - only in development
   * Use for detailed debugging information
   */
  debug: (...args) => {
    if (CURRENT_LOG_LEVEL <= LogLevel.DEBUG) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Info level logs - only in development
   * Use for general information
   */
  info: (...args) => {
    if (CURRENT_LOG_LEVEL <= LogLevel.INFO) {
      console.log('[INFO]', ...args);
    }
  },

  /**
   * Warning level logs - development + production
   * Use for non-critical issues
   */
  warn: (...args) => {
    if (CURRENT_LOG_LEVEL <= LogLevel.WARN) {
      console.warn('[WARN]', ...args);
    }
  },

  /**
   * Error level logs - always shown
   * Use for critical errors only
   */
  error: (...args) => {
    if (CURRENT_LOG_LEVEL <= LogLevel.ERROR) {
      console.error('[ERROR]', ...args);
    }
  },

  /**
   * Log with emoji prefix for better visibility (dev only)
   */
  emoji: (emoji, ...args) => {
    if (CURRENT_LOG_LEVEL <= LogLevel.DEBUG) {
      console.log(emoji, ...args);
    }
  },

  /**
   * Group logs together (dev only)
   */
  group: (label, callback) => {
    if (CURRENT_LOG_LEVEL <= LogLevel.DEBUG && console.group) {
      console.group(label);
      callback();
      console.groupEnd();
    } else if (CURRENT_LOG_LEVEL <= LogLevel.DEBUG) {
      console.log(`--- ${label} ---`);
      callback();
    }
  },

  /**
   * Time a function execution (dev only)
   */
  time: (label) => {
    if (CURRENT_LOG_LEVEL <= LogLevel.DEBUG && console.time) {
      console.time(label);
    }
  },

  timeEnd: (label) => {
    if (CURRENT_LOG_LEVEL <= LogLevel.DEBUG && console.timeEnd) {
      console.timeEnd(label);
    }
  },
};

export default logger;
