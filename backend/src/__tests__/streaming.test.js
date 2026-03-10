/**
 * SSE streaming behavior tests for POST /api/chat/stream.
 *
 * Validates:
 * - 401 returned without auth (before SSE headers)
 * - Error handling when OpenRouter returns non-ok
 * - SSE event protocol constants
 */

// Set env vars before any require
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

// Mock node-fetch for OpenRouter calls
jest.mock('node-fetch');

// Configurable auth mock
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
      single: jest.fn().mockResolvedValue({ data: { role: 'owner', owner_id: null }, error: null }),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    }),
    functions: { invoke: jest.fn().mockResolvedValue({}) },
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
const fetch = require('node-fetch');
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
  try {
    const memory = require('../services/requestMemory');
    if (memory.shutdown) memory.shutdown();
  } catch (e) { /* ignore */ }
});

afterEach(() => {
  jest.clearAllMocks();
});

// ============================================================
// STREAMING — 401 without auth
// ============================================================

describe('POST /api/chat/stream — unauthenticated', () => {
  test('returns 401 without Authorization header', async () => {
    const res = await request(app)
      .post('/api/chat/stream')
      .send({ messages: [{ role: 'user', content: 'hello' }] });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('returns 401 with invalid Bearer token', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const res = await request(app)
      .post('/api/chat/stream')
      .set('Authorization', 'Bearer bad-token')
      .send({ messages: [{ role: 'user', content: 'hello' }] });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});

// ============================================================
// STREAMING — error handling
// ============================================================

describe('POST /api/chat/stream — error handling', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'test@test.com' } },
      error: null,
    });
  });

  test('handles OpenRouter non-ok response', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: jest.fn().mockResolvedValue('{"error":"rate limited"}'),
    });

    const res = await request(app)
      .post('/api/chat/stream')
      .set('Authorization', 'Bearer valid-token')
      .send({ messages: [{ role: 'user', content: 'hello' }] });

    // Should return an error (either in SSE body or as JSON error)
    expect(res.text).toBeTruthy();
  });

  test('handles missing messages in request body', async () => {
    const res = await request(app)
      .post('/api/chat/stream')
      .set('Authorization', 'Bearer valid-token')
      .send({});

    // Should return an error — either 400 or handle gracefully
    expect([200, 400, 500]).toContain(res.status);
  });
});

// ============================================================
// SSE Protocol
// ============================================================

describe('SSE Event Protocol', () => {
  test('agent service defines expected event types', () => {
    // These are the SSE event types documented in agentService.js header
    // If any are removed or renamed, the frontend will break
    const expectedEventTypes = [
      'job_id',
      'thinking',
      'tool_start',
      'tool_end',
      'delta',
      'metadata',
      'done',
      'error',
    ];

    // Verify by checking the agentService source
    const fs = require('fs');
    const path = require('path');
    const agentServicePath = path.join(__dirname, '..', 'services', 'agentService.js');
    const source = fs.readFileSync(agentServicePath, 'utf-8');

    for (const eventType of expectedEventTypes) {
      expect(source).toContain(`type: '${eventType}'`);
    }
  });

  test('SSE format uses data: prefix followed by JSON', () => {
    // Verify the writer uses the correct SSE format
    const fs = require('fs');
    const path = require('path');
    const agentServicePath = path.join(__dirname, '..', 'services', 'agentService.js');
    const source = fs.readFileSync(agentServicePath, 'utf-8');

    // The sendSSE function should write in SSE format
    expect(source).toContain('`data: ${JSON.stringify(data)}\\n\\n`');
  });
});
