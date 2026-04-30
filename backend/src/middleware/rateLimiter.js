const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

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
 * AI Endpoints Rate Limiter (Strict + Per-User)
 * For: /api/chat, /api/chat/stream, /api/chat/vision
 * These are expensive API calls - prevent cost abuse
 * Uses auth token to rate-limit per user, falls back to IP
 */
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 20, // 20 requests per minute per user
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('ai'),
  message: 'Too many AI requests',
  skipFailedRequests: false,
  keyGenerator: (req) => {
    // Extract user ID from Bearer token (JWT payload) for per-user limiting
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const payload = JSON.parse(Buffer.from(auth.split('.')[1], 'base64').toString());
        if (payload.sub) return `user:${payload.sub}`;
      } catch (_) {}
    }
    return ipKeyGenerator(req);
  },
});

/**
 * Services Rate Limiter (Moderate)
 * For: /api/geocode, /api/transcribe, /api/distance, /api/reverse
 * External APIs with their own quotas
 */
const servicesLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 180, // 180 requests per minute — generous because list/refresh
            // patterns (sub portal Home loads bids + docs + pending in one tick)
            // can fire several requests close together.
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

/**
 * Chat History Rate Limiter (Very Lenient)
 * For: /api/chat/sessions endpoints
 * These are just database CRUD operations, allow frequent saves during streaming
 */
const chatHistoryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 200, // 200 requests per minute (allows frequent auto-save during streaming)
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('chat-history'),
  message: 'Too many chat history requests'
});

/**
 * Portal Rate Limiter (Lenient)
 * For: /api/portal, /api/portal-admin
 * Client portal is read-heavy with burst loads on app resume
 * Uses auth token for per-user limiting
 */
const portalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 120, // 120 requests per minute per user
  standardHeaders: true,
  legacyHeaders: false,
  handler: createRateLimitHandler('portal'),
  message: 'Too many requests',
  keyGenerator: (req) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      try {
        const payload = JSON.parse(Buffer.from(auth.split('.')[1], 'base64').toString());
        if (payload.sub) return `portal:${payload.sub}`;
      } catch (_) {}
    }
    const portalToken = req.headers['x-portal-token'];
    if (portalToken) return `portal:${portalToken}`;
    return ipKeyGenerator(req);
  },
});

module.exports = {
  aiLimiter,
  servicesLimiter,
  generalLimiter,
  chatHistoryLimiter,
  portalLimiter
};
