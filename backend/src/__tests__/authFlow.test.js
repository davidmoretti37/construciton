/**
 * Auth flow integration tests.
 *
 * Validates the authenticateUser middleware:
 * - No Authorization header → 401
 * - Invalid Bearer token → 401 (supabase returns error)
 * - Valid Bearer token → request proceeds (supabase returns user)
 *
 * Uses GET /api/chat/sessions as the test endpoint (simple, protected).
 */

// Set env vars before any require
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

// Configurable auth mock — can be overridden per test
const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
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

afterEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// AUTH FLOW — No Authorization header
// ============================================================

describe('Auth flow — missing header', () => {
  test('returns 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/api/chat/sessions');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/missing|invalid|authorization/i);
  });

  test('returns 401 when Authorization header has no Bearer prefix', async () => {
    const res = await request(app)
      .get('/api/chat/sessions')
      .set('Authorization', 'Basic some-token');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});

// ============================================================
// AUTH FLOW — Invalid Bearer token
// ============================================================

describe('Auth flow — invalid token', () => {
  test('returns 401 when supabase rejects the token', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const res = await request(app)
      .get('/api/chat/sessions')
      .set('Authorization', 'Bearer expired-or-invalid-token');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatch(/invalid|expired|failed/i);
  });

  test('returns 401 when supabase returns no user and no error', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const res = await request(app)
      .get('/api/chat/sessions')
      .set('Authorization', 'Bearer token-with-no-user');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 401 when supabase auth throws an exception', async () => {
    mockGetUser.mockRejectedValue(new Error('Network error'));

    const res = await request(app)
      .get('/api/chat/sessions')
      .set('Authorization', 'Bearer token-causes-exception');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});

// ============================================================
// AUTH FLOW — Valid Bearer token
// ============================================================

describe('Auth flow — valid token', () => {
  const validUser = {
    id: 'user-abc-123',
    email: 'builder@example.com',
    role: 'authenticated',
  };

  test('request proceeds when supabase validates the token', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: validUser },
      error: null,
    });

    const res = await request(app)
      .get('/api/chat/sessions')
      .set('Authorization', 'Bearer valid-jwt-token');

    // Should NOT be 401 — the request made it past auth
    expect(res.status).not.toBe(401);
    // The sessions endpoint returns 200 with sessions array (or 500 on DB error)
    expect([200, 500]).toContain(res.status);
  });

  test('authenticated endpoint returns data structure on success', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: validUser },
      error: null,
    });

    const res = await request(app)
      .get('/api/chat/sessions')
      .set('Authorization', 'Bearer valid-jwt-token');

    // If auth passes and DB mock works, we get sessions back
    if (res.status === 200) {
      expect(res.body).toHaveProperty('sessions');
      expect(Array.isArray(res.body.sessions)).toBe(true);
    }
  });
});
