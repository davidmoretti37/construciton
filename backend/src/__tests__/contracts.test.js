/**
 * API response contract / shape tests.
 *
 * Validates that response shapes don't accidentally change:
 * - GET /health response shape
 * - GET /ready response shape (with nested checks)
 * - 404 response shape
 */

// Set env vars before any require
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
  }),
}));

// Mock Stripe
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
    webhooks: { constructEvent: jest.fn() },
    balance: { retrieve: jest.fn().mockResolvedValue({ available: [] }) },
  }));
});

const request = require('supertest');
const app = require('../server');

// Silence logs during tests
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
  // Clean up request memory timer to prevent open handles
  try {
    const memory = require('../services/requestMemory');
    if (memory.shutdown) memory.shutdown();
  } catch (e) { /* ignore */ }
});

// ============================================================
// GET /health — response shape
// ============================================================

describe('GET /health response contract', () => {
  test('returns { status: string, timestamp: string }', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(typeof res.body.status).toBe('string');
    expect(typeof res.body.timestamp).toBe('string');
  });

  test('has exactly the expected keys', async () => {
    const res = await request(app).get('/health');
    const keys = Object.keys(res.body).sort();

    expect(keys).toEqual(['status', 'timestamp']);
  });

  test('timestamp is a valid ISO 8601 date', async () => {
    const res = await request(app).get('/health');
    const parsed = new Date(res.body.timestamp);

    expect(parsed.toISOString()).toBe(res.body.timestamp);
  });
});

// ============================================================
// GET /ready — response shape
// ============================================================

describe('GET /ready response contract', () => {
  test('returns { status: string, checks: object, duration: string, timestamp: string }', async () => {
    const res = await request(app).get('/ready');

    expect(typeof res.body.status).toBe('string');
    expect(typeof res.body.checks).toBe('object');
    expect(typeof res.body.duration).toBe('string');
    expect(typeof res.body.timestamp).toBe('string');
  });

  test('duration is formatted as "<number>ms"', async () => {
    const res = await request(app).get('/ready');

    expect(res.body.duration).toMatch(/^\d+ms$/);
  });

  test('checks includes supabase, openrouter, env, and tools', async () => {
    const res = await request(app).get('/ready');
    const { checks } = res.body;

    expect(checks).toHaveProperty('supabase');
    expect(checks).toHaveProperty('openrouter');
    expect(checks).toHaveProperty('env');
    expect(checks).toHaveProperty('tools');
  });

  test('each check has a { status: string } shape', async () => {
    const res = await request(app).get('/ready');
    const { checks } = res.body;

    for (const [name, check] of Object.entries(checks)) {
      expect(typeof check.status).toBe('string');
      expect(['ok', 'fail', 'skip']).toContain(check.status);
    }
  });

  test('status is "ready" or "degraded"', async () => {
    const res = await request(app).get('/ready');

    expect(['ready', 'degraded']).toContain(res.body.status);
  });
});

// ============================================================
// 404 — response shape
// ============================================================

describe('404 response contract', () => {
  test('unknown route returns an object with error or message key', async () => {
    const res = await request(app).get('/api/nonexistent');

    expect(res.status).toBe(404);
    // Express default 404 may use either "error" or "message" — accept both
    const hasError = typeof res.body.error === 'string';
    const hasMessage = typeof res.body.message === 'string';
    // Also accept HTML 404 from Express default handler
    const isHtml = res.headers['content-type'] && res.headers['content-type'].includes('text/html');

    expect(hasError || hasMessage || isHtml).toBe(true);
  });
});
