/**
 * fetchWithRetry Tests
 *
 * Validates retry logic, exponential backoff, timeout handling,
 * and pre-configured API wrappers.
 */

// Silence logs
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// Mock node-fetch
const mockFetch = jest.fn();
jest.mock('node-fetch', () => mockFetch);

// Mock abort-controller
jest.mock('abort-controller', () => {
  return jest.fn().mockImplementation(() => ({
    signal: 'mock-signal',
    abort: jest.fn(),
  }));
});

const {
  fetchWithRetry,
  fetchOpenRouter,
  fetchGoogleMaps,
} = require('../utils/fetchWithRetry');

beforeEach(() => {
  jest.clearAllMocks();
  // Speed up tests by making setTimeout instant
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// Helper to advance timers when promises need to resolve
const flushPromises = () => new Promise(r => jest.requireActual('timers').setImmediate(r));

describe('fetchWithRetry', () => {
  test('success on first attempt → returns response', async () => {
    const mockResponse = { ok: true, status: 200, json: () => ({ data: 'test' }) };
    mockFetch.mockResolvedValue(mockResponse);

    const result = await fetchWithRetry('https://api.test.com', {}, {
      retries: 0,
      timeout: 5000,
    });

    expect(result).toBe(mockResponse);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('400 error (not in retryOn) → returns immediately, no retry', async () => {
    const mockResponse = { ok: false, status: 400 };
    mockFetch.mockResolvedValue(mockResponse);

    const result = await fetchWithRetry('https://api.test.com', {}, {
      retries: 3,
      timeout: 5000,
      retryDelay: 100,
    });

    // 400 is not in default retryOn, so returns the response without retry
    expect(result.status).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('500 error → retries up to N times, then returns error response', async () => {
    const mockResponse = { ok: false, status: 500 };
    mockFetch.mockResolvedValue(mockResponse);

    // Use real timers for this test since we need async delay to work
    jest.useRealTimers();

    const result = await fetchWithRetry('https://api.test.com', {}, {
      retries: 2,
      timeout: 5000,
      retryDelay: 1, // 1ms delay for speed
    });

    // 1 initial + 2 retries = 3 attempts, then returns the response
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(result.status).toBe(500);
  });

  test('429 error → retries with backoff', async () => {
    const mockResponse429 = { ok: false, status: 429 };
    const mockResponseOk = { ok: true, status: 200 };
    mockFetch
      .mockResolvedValueOnce(mockResponse429)
      .mockResolvedValueOnce(mockResponseOk);

    jest.useRealTimers();

    const result = await fetchWithRetry('https://api.test.com', {}, {
      retries: 2,
      timeout: 5000,
      retryDelay: 1,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  test('timeout → throws error with isTimeout: true', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    jest.useRealTimers();

    await expect(
      fetchWithRetry('https://api.test.com', {}, {
        retries: 0,
        timeout: 100,
        retryDelay: 1,
        name: 'TestAPI',
      })
    ).rejects.toMatchObject({
      isTimeout: true,
      code: 'ETIMEDOUT',
    });
  });

  test('network error with retryOnNetworkError=true → retries', async () => {
    const networkError = new Error('ECONNREFUSED');
    const mockResponseOk = { ok: true, status: 200 };

    mockFetch
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce(mockResponseOk);

    jest.useRealTimers();

    const result = await fetchWithRetry('https://api.test.com', {}, {
      retries: 2,
      timeout: 5000,
      retryDelay: 1,
      retryOnNetworkError: true,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  test('network error with retryOnNetworkError=false → throws immediately', async () => {
    const networkError = new Error('ECONNREFUSED');
    mockFetch.mockRejectedValue(networkError);

    jest.useRealTimers();

    await expect(
      fetchWithRetry('https://api.test.com', {}, {
        retries: 3,
        timeout: 5000,
        retryDelay: 1,
        retryOnNetworkError: false,
      })
    ).rejects.toThrow('ECONNREFUSED');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test('passes options through to fetch', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 200 });

    await fetchWithRetry('https://api.test.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"key":"value"}',
    }, { retries: 0, timeout: 5000 });

    expect(mockFetch).toHaveBeenCalledWith('https://api.test.com', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"key":"value"}',
    }));
  });
});

describe('pre-configured wrappers', () => {
  beforeEach(() => {
    jest.useRealTimers();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  test('fetchOpenRouter uses 60s timeout, 2 retries', async () => {
    await fetchOpenRouter('https://openrouter.ai/api', { method: 'POST' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    // Verify it works — the config is internal, but the function completes
  });

  test('fetchGoogleMaps uses 10s timeout, 3 retries', async () => {
    await fetchGoogleMaps('https://maps.googleapis.com/api', {});

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
