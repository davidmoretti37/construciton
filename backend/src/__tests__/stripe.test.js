/**
 * Stripe route tests
 *
 * Validates:
 * - POST /api/stripe/create-guest-checkout — guest checkout flow
 * - POST /api/stripe/create-checkout-session — authenticated checkout
 * - POST /api/stripe/create-portal-session — billing portal
 * - POST /api/stripe/webhook — Stripe webhook processing
 */

// Set env vars before any require
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key';
process.env.STRIPE_STARTER_PRICE_ID = 'price_starter_test';
process.env.STRIPE_PRO_PRICE_ID = 'price_pro_test';
process.env.STRIPE_BUSINESS_PRICE_ID = 'price_business_test';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

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
  data: { user: { id: 'test-user-id', email: 'test@example.com' } },
  error: null,
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockSupabaseFrom,
  }),
}));

// Mock Stripe
const mockCheckoutCreate = jest.fn().mockResolvedValue({
  id: 'cs_test_123',
  url: 'https://checkout.stripe.com/test',
});
const mockPortalCreate = jest.fn().mockResolvedValue({
  url: 'https://billing.stripe.com/test',
});
const mockConstructEvent = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: mockCheckoutCreate } },
    billingPortal: { sessions: { create: mockPortalCreate } },
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
    customers: { create: jest.fn().mockResolvedValue({ id: 'cus_test' }), update: jest.fn() },
    balance: { retrieve: jest.fn().mockResolvedValue({ available: [] }) },
  }));
});

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
// POST /api/stripe/create-guest-checkout
// ============================================================

describe('POST /api/stripe/create-guest-checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('invalid tier returns 400', async () => {
    const res = await request(app)
      .post('/api/stripe/create-guest-checkout').set("Authorization", "Bearer test-token")
      .send({ tier: 'nonexistent' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Invalid subscription tier');
    expect(res.body).toHaveProperty('validTiers');
  });

  test('valid tier creates checkout session', async () => {
    const res = await request(app)
      .post('/api/stripe/create-guest-checkout').set("Authorization", "Bearer test-token")
      .send({ tier: 'starter' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sessionId', 'cs_test_123');
    expect(res.body).toHaveProperty('url', 'https://checkout.stripe.com/test');
    expect(mockCheckoutCreate).toHaveBeenCalledTimes(1);
  });

  test('pro tier creates checkout session', async () => {
    const res = await request(app)
      .post('/api/stripe/create-guest-checkout').set("Authorization", "Bearer test-token")
      .send({ tier: 'pro' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('sessionId');
    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: expect.arrayContaining([
          expect.objectContaining({ price: 'price_pro_test' }),
        ]),
      })
    );
  });
});

// ============================================================
// POST /api/stripe/create-checkout-session (authenticated)
// ============================================================

describe('POST /api/stripe/create-checkout-session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires auth — returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/stripe/create-checkout-session')
      .send({ tier: 'starter' });
    expect(res.status).toBe(401);
  });

  test('requires auth — returns 401 with invalid token', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const res = await request(app)
      .post('/api/stripe/create-checkout-session').set("Authorization", "Bearer test-token")
      .set('Authorization', 'Bearer invalid-token')
      .send({ tier: 'starter' });
    expect(res.status).toBe(401);
  });
});

// ============================================================
// POST /api/stripe/create-portal-session (authenticated)
// ============================================================

describe('POST /api/stripe/create-portal-session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires auth — returns 401 without token', async () => {
    const res = await request(app)
      .post('/api/stripe/create-portal-session');
    expect(res.status).toBe(401);
  });

  test('requires auth — returns 401 with invalid token', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const res = await request(app)
      .post('/api/stripe/create-portal-session').set("Authorization", "Bearer test-token")
      .set('Authorization', 'Bearer invalid-token');
    expect(res.status).toBe(401);
  });
});

// ============================================================
// POST /api/stripe/webhook
// ============================================================

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('processes checkout.session.completed event', async () => {
    const mockEvent = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_webhook',
          subscription: 'sub_test_123',
          customer: 'cus_test_123',
          metadata: { supabase_user_id: 'user-123' },
          customer_details: { email: 'test@example.com' },
        },
      },
    };

    mockConstructEvent.mockReturnValue(mockEvent);

    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test_123',
      status: 'trialing',
      items: {
        data: [{ price: { id: 'price_starter_test' } }],
      },
      trial_end: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      cancel_at_period_end: false,
    });

    const res = await request(app)
      .post('/api/stripe/webhook').set("Authorization", "Bearer test-token")
      .set('stripe-signature', 'test-sig')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(mockEvent));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('received', true);
    expect(mockConstructEvent).toHaveBeenCalledTimes(1);
  });

  test('returns 400 on invalid signature', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });

    const res = await request(app)
      .post('/api/stripe/webhook').set("Authorization", "Bearer test-token")
      .set('stripe-signature', 'bad-sig')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ type: 'test' }));

    expect(res.status).toBe(400);
  });
});
