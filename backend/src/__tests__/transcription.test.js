/**
 * Transcription route tests
 *
 * Validates:
 * - POST /api/transcribe — audio transcription with Groq primary, Deepgram fallback
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
const { fetchGroq, fetchDeepgram } = require('../utils/fetchWithRetry');

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
// POST /api/transcribe
// ============================================================

describe('POST /api/transcribe', () => {
  const testAudioBase64 = Buffer.from('fake-audio-data').toString('base64');

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear API keys before each test
    delete process.env.GROQ_API_KEY;
    delete process.env.DEEPGRAM_API_KEY;
  });

  test('missing audio returns 400', async () => {
    const res = await request(app)
      .post('/api/transcribe').set("Authorization", "Bearer test-token")
      .send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'Audio data is required');
  });

  test('no API keys configured returns 500', async () => {
    // Neither GROQ_API_KEY nor DEEPGRAM_API_KEY is set
    const res = await request(app)
      .post('/api/transcribe').set("Authorization", "Bearer test-token")
      .send({ audio: testAudioBase64 });
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error', 'No transcription API configured');
  });

  test('Groq transcription success', async () => {
    process.env.GROQ_API_KEY = 'test-groq-key';

    fetchGroq.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ text: 'Hello world' }),
    });

    const res = await request(app)
      .post('/api/transcribe').set("Authorization", "Bearer test-token")
      .send({ audio: testAudioBase64 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      results: {
        channels: [{
          alternatives: [{
            transcript: 'Hello world',
          }],
        }],
      },
    });
    expect(fetchGroq).toHaveBeenCalledTimes(1);
  });

  test('Deepgram fallback when Groq fails', async () => {
    process.env.GROQ_API_KEY = 'test-groq-key';
    process.env.DEEPGRAM_API_KEY = 'test-deepgram-key';

    // Groq fails
    fetchGroq.mockResolvedValue({
      ok: false,
      status: 500,
      text: jest.fn().mockResolvedValue('Internal Server Error'),
    });

    // Deepgram succeeds
    const deepgramResponse = {
      results: {
        channels: [{
          alternatives: [{
            transcript: 'Fallback transcription',
          }],
        }],
      },
    };

    fetchDeepgram.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(deepgramResponse),
    });

    const res = await request(app)
      .post('/api/transcribe').set("Authorization", "Bearer test-token")
      .send({ audio: testAudioBase64 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(deepgramResponse);
    expect(fetchGroq).toHaveBeenCalledTimes(1);
    expect(fetchDeepgram).toHaveBeenCalledTimes(1);
  });

  test('response format matches expected shape', async () => {
    process.env.GROQ_API_KEY = 'test-groq-key';

    fetchGroq.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ text: 'Test transcription output' }),
    });

    const res = await request(app)
      .post('/api/transcribe').set("Authorization", "Bearer test-token")
      .send({ audio: testAudioBase64, contentType: 'audio/m4a', language: 'en' });

    expect(res.status).toBe(200);
    // Verify the Deepgram-compatible response format
    expect(res.body).toHaveProperty('results');
    expect(res.body.results).toHaveProperty('channels');
    expect(Array.isArray(res.body.results.channels)).toBe(true);
    expect(res.body.results.channels[0]).toHaveProperty('alternatives');
    expect(res.body.results.channels[0].alternatives[0]).toHaveProperty('transcript');
    expect(typeof res.body.results.channels[0].alternatives[0].transcript).toBe('string');
  });

  test('Deepgram primary when no Groq key', async () => {
    // Only Deepgram configured
    process.env.DEEPGRAM_API_KEY = 'test-deepgram-key';

    const deepgramResponse = {
      results: {
        channels: [{
          alternatives: [{
            transcript: 'Direct Deepgram transcription',
          }],
        }],
      },
    };

    fetchDeepgram.mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue(deepgramResponse),
    });

    const res = await request(app)
      .post('/api/transcribe').set("Authorization", "Bearer test-token")
      .send({ audio: testAudioBase64 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(deepgramResponse);
    // Groq should NOT have been called
    expect(fetchGroq).not.toHaveBeenCalled();
    expect(fetchDeepgram).toHaveBeenCalledTimes(1);
  });
});
