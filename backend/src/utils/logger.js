/**
 * Backend Logger Utility
 *
 * Environment-aware logging that silences debug logs in production.
 * Maintains emoji prefixes for visual debugging in development.
 */

const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Determine environment
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const CURRENT_LOG_LEVEL = IS_PRODUCTION ? LogLevel.WARN : LogLevel.DEBUG;

/**
 * Format log message with timestamp in production
 */
const formatMessage = (level, args) => {
  if (IS_PRODUCTION) {
    const timestamp = new Date().toISOString();
    return [`[${timestamp}] [${level}]`, ...args];
  }
  return args;
};

const logger = {
  /**
   * Debug level - Only shown in development
   * Use for detailed debugging, request/response tracking
   */
  debug: (...args) => {
    if (CURRENT_LOG_LEVEL <= LogLevel.DEBUG) {
      console.log(...formatMessage('DEBUG', args));
    }
  },

  /**
   * Info level - General information
   * Use for startup messages, successful operations, status updates
   */
  info: (...args) => {
    if (CURRENT_LOG_LEVEL <= LogLevel.INFO) {
      console.log(...formatMessage('INFO', args));
    }
  },

  /**
   * Warning level - Non-critical issues
   * Use for deprecations, retries, recoverable errors
   */
  warn: (...args) => {
    if (CURRENT_LOG_LEVEL <= LogLevel.WARN) {
      console.warn(...formatMessage('WARN', args));
    }
  },

  /**
   * Error level - Always shown
   * Use for critical errors, failures, exceptions
   */
  error: (...args) => {
    if (CURRENT_LOG_LEVEL <= LogLevel.ERROR) {
      console.error(...formatMessage('ERROR', args));
    }
  },

  /**
   * Check if running in production
   */
  isProduction: () => IS_PRODUCTION,

  /**
   * Get current log level
   */
  getLevel: () => CURRENT_LOG_LEVEL
};

module.exports = logger;
