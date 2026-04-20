/**
 * Plaid route tests
 *
 * Validates:
 * - POST /api/plaid/create-link-token — requires auth
 * - POST /api/plaid/exchange-token — requires auth
 * - POST /api/plaid/webhook — processes SYNC_UPDATES_AVAILABLE
 */

// Set env vars before any require
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
process.env.PLAID_CLIENT_ID = 'test-plaid-client-id';
process.env.PLAID_SECRET = 'test-plaid-secret';
process.env.PLAID_ENV = 'sandbox';

// Mock Supabase
const mockSupabaseFrom = jest.fn().mockReturnValue({
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  is: jest.fn().mockReturnThis(),
  not: jest.fn().mockReturnThis(),
  neq: jest.fn().mockReturnThis(),
  lt: jest.fn().mockReturnThis(),
  single: jest.fn().mockResolvedValue({ data: null, error: null }),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue({ data: [], error: null }),
});

const mockGetUser = jest.fn().mockResolvedValue({
  data: { user: null },
  error: { message: 'Invalid token' },
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockSupabaseFrom,
  }),
}));

// Mock Stripe (required by server.js)
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
    webhooks: { constructEvent: jest.fn() },
    balance: { retrieve: jest.fn().mockResolvedValue({ available: [] }) },
  }));
});

// Mock Plaid
const mockLinkTokenCreate = jest.fn().mockResolvedValue({
  data: { link_token: 'test-link-token' },
});
const mockItemPublicTokenExchange = jest.fn().mockResolvedValue({
  data: { access_token: 'test-access', item_id: 'test-item' },
});
const mockTransactionsSync = jest.fn().mockResolvedValue({
  data: { added: [], modified: [], removed: [], has_more: false, next_cursor: 'test' },
});

jest.mock('plaid', () => ({
  Configuration: jest.fn(),
  PlaidApi: jest.fn().mockImplementation(() => ({
    linkTokenCreate: mockLinkTokenCreate,
    itemPublicTokenExchange: mockItemPublicTokenExchange,
    transactionsSync: mockTransactionsSync,
    accountsGet: jest.fn().mockResolvedValue({ data: { accounts: [] } }),
  })),
  PlaidEnvironments: { sandbox: 'https://sandbox.plaid.com' },
}));

// Mock reconciliation and CSV services (required by plaid.js)
jest.mock('../services/reconciliationService', () => ({
  reconcileTransactions: jest.fn().mockResolvedValue({ autoMatched: 0, unmatched: 0 }),
}));

jest.mock('../services/csvParserService', () => ({
  parseCSV: jest.fn().mockReturnValue([]),
}));

// Mock fetchWithRetry (required by server.js)
jest.mock('../utils/fetchWithRetry', () => ({
  fetchGoogleMaps: jest.fn(),
  fetchDeepgram: jest.fn(),
  fetchGroq: jest.fn(),
  fetchOpenRouter: jest.fn(),
  fetchOpenRouterVision: jest.fn(),
  fetchOpenRouterStream: jest.fn(),
  fetchWithRetry: jest.fn(),
}));

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
// POST /api/plaid/create-link-token (requires auth + owner role)
// ============================================================

describe('POST /api/plaid/create-link-token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires auth — returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/plaid/create-link-token');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('requires auth — returns 401 with invalid token', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const res = await request(app)
      .post('/api/plaid/create-link-token')
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });
});

// ============================================================
// POST /api/plaid/exchange-token (requires auth + owner role)
// ============================================================

describe('POST /api/plaid/exchange-token', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires auth — returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/plaid/exchange-token')
      .send({ public_token: 'public-sandbox-test' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  test('requires auth — returns 401 with invalid token', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const res = await request(app)
      .post('/api/plaid/exchange-token')
      .set('Authorization', 'Bearer invalid-token')
      .send({ public_token: 'public-sandbox-test' });
    expect(res.status).toBe(401);
  });
});

// ============================================================
// POST /api/plaid/webhook (public - called by Plaid servers)
// ============================================================

describe('POST /api/plaid/webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('processes SYNC_UPDATES_AVAILABLE webhook', async () => {
    // Mock supabase returning accounts for the item
    mockSupabaseFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    const res = await request(app)
      .post('/api/plaid/webhook')
      .send({
        webhook_type: 'TRANSACTIONS',
        webhook_code: 'SYNC_UPDATES_AVAILABLE',
        item_id: 'test-item-id',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('received', true);
  });

  test('handles DEFAULT_UPDATE webhook', async () => {
    mockSupabaseFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      upsert: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
    });

    const res = await request(app)
      .post('/api/plaid/webhook')
      .send({
        webhook_type: 'TRANSACTIONS',
        webhook_code: 'DEFAULT_UPDATE',
        item_id: 'test-item-id-2',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('received', true);
  });

  test('handles non-transaction webhooks gracefully', async () => {
    const res = await request(app)
      .post('/api/plaid/webhook')
      .send({
        webhook_type: 'ITEM',
        webhook_code: 'PENDING_EXPIRATION',
        item_id: 'test-item-id-3',
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('received', true);
  });
});
