/**
 * Geocoding route tests
 *
 * Validates:
 * - GET /api/geocode — address geocoding
 * - GET /api/distance — distance matrix
 * - GET /api/reverse — reverse geocoding
 */

// Set env vars before any require
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

// Mock Supabase — auth returns a valid user so route handlers run
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@example.com' } },
        error: null,
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

// Mock Stripe (required by server.js)
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: { sessions: { create: jest.fn() } },
    billingPortal: { sessions: { create: jest.fn() } },
    webhooks: { constructEvent: jest.fn() },
    balance: { retrieve: jest.fn().mockResolvedValue({ available: [] }) },
  }));
});

// Mock fetchWithRetry module
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
const { fetchGoogleMaps } = require('../utils/fetchWithRetry');

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
// GET /api/geocode
// ============================================================

describe('GET /api/geocode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('missing address returns 400', async () => {
    const res = await request(app).get('/api/geocode').set("Authorization", "Bearer test-token");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Address is required');
  });

  test('missing GOOGLE_MAPS_API_KEY returns 500', async () => {
    // Ensure the key is not set
    const original = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;

    const res = await request(app).get('/api/geocode').set("Authorization", "Bearer test-token").query({ address: '123 Main St' });
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error', 'Google Maps API key not configured');

    // Restore
    if (original) process.env.GOOGLE_MAPS_API_KEY = original;
  });

  test('valid geocode request returns data from Google Maps', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-maps-key';

    const mockGeoData = {
      status: 'OK',
      results: [{ formatted_address: '123 Main St, New York, NY', geometry: { location: { lat: 40.7128, lng: -74.006 } } }],
    };

    fetchGoogleMaps.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockGeoData),
    });

    const res = await request(app).get('/api/geocode').set("Authorization", "Bearer test-token").query({ address: '123 Main St' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockGeoData);
    expect(fetchGoogleMaps).toHaveBeenCalledTimes(1);
    expect(fetchGoogleMaps).toHaveBeenCalledWith(
      expect.stringContaining('geocode/json?address=123%20Main%20St')
    );

    delete process.env.GOOGLE_MAPS_API_KEY;
  });
});

// ============================================================
// GET /api/distance
// ============================================================

describe('GET /api/distance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('missing origins returns 400', async () => {
    const res = await request(app).get('/api/distance').set("Authorization", "Bearer test-token").query({ destinations: 'B' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Origins and destinations are required');
  });

  test('missing destinations returns 400', async () => {
    const res = await request(app).get('/api/distance').set("Authorization", "Bearer test-token").query({ origins: 'A' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Origins and destinations are required');
  });

  test('missing both params returns 400', async () => {
    const res = await request(app).get('/api/distance').set("Authorization", "Bearer test-token");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Origins and destinations are required');
  });

  test('valid distance request returns data', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-maps-key';

    const mockDistData = {
      status: 'OK',
      rows: [{ elements: [{ distance: { text: '10 mi' }, duration: { text: '15 mins' } }] }],
    };

    fetchGoogleMaps.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockDistData),
    });

    const res = await request(app).get('/api/distance').set("Authorization", "Bearer test-token").query({ origins: 'A', destinations: 'B' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual(mockDistData);

    delete process.env.GOOGLE_MAPS_API_KEY;
  });
});

// ============================================================
// GET /api/reverse
// ============================================================

describe('GET /api/reverse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('missing lat returns 400', async () => {
    const res = await request(app).get('/api/reverse').set("Authorization", "Bearer test-token").query({ lng: '-74.006' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Latitude and longitude are required');
  });

  test('missing lng returns 400', async () => {
    const res = await request(app).get('/api/reverse').set("Authorization", "Bearer test-token").query({ lat: '40.7128' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Latitude and longitude are required');
  });

  test('missing both lat and lng returns 400', async () => {
    const res = await request(app).get('/api/reverse').set("Authorization", "Bearer test-token");
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Latitude and longitude are required');
  });

  test('valid coordinates returns address', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-maps-key';

    const mockReverseData = {
      status: 'OK',
      results: [{ formatted_address: '123 Main St, New York, NY 10001' }],
    };

    fetchGoogleMaps.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue(mockReverseData),
    });

    const res = await request(app).get('/api/reverse').set("Authorization", "Bearer test-token").query({ lat: '40.7128', lng: '-74.006' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('address', '123 Main St, New York, NY 10001');

    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  test('no results returns 404', async () => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-google-maps-key';

    fetchGoogleMaps.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ status: 'ZERO_RESULTS', results: [] }),
    });

    const res = await request(app).get('/api/reverse').set("Authorization", "Bearer test-token").query({ lat: '0', lng: '0' });
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error', 'No address found for coordinates');

    delete process.env.GOOGLE_MAPS_API_KEY;
  });
});
