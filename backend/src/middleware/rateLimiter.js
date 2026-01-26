const rateLimit = require('express-rate-limit');

/**
 * User-friendly error handler for rate limiting
 */
const createRateLimitHandler = (limitType) => (req, res) => {
  const retryAfter = Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000);

  res.status(429).json({
    error: 'Too many requests',
    message: `You're sending requests too quickly. Please wait ${Math.ceil(retryAfter)} seconds before trying again.`,
    type: limitType,
    retryAfter: Math.ceil(retryAfter),
    limit: req.rateLimit.limit,
    remaining: req.rateLimit.remaining,
    resetTime: new Date(req.rateLimit.resetTime).toISOString()
  });
};

/**
 * AI Endpoints Rate Limiter (Strict)
 * For: /api/chat, /api/chat/stream, /api/chat/vision
 * These are expensive API calls - prevent cost abuse
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 20, // 20 requests per minute
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  handler: createRateLimitHandler('ai'),
  message: 'Too many AI requests',
  skipFailedRequests: false
  // Use default keyGenerator (handles IPv6 properly)
});

/**
 * Services Rate Limiter (Moderate)
 * For: /api/geocode, /api/transcribe, /api/distance, /api/reverse
 * External APIs with their own quotas
 */
const servicesLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('services'),
  message: 'Too many service requests'
});

/**
 * General API Rate Limiter (Lenient)
 * Fallback for any other endpoints
 */
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('general'),
  message: 'Too many requests'
});

module.exports = {
  aiLimiter,
  servicesLimiter,
  generalLimiter
};
