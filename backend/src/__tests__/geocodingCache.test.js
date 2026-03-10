/**
 * Geocoding Cache Tests
 *
 * Validates caching, TTL expiry, LRU eviction,
 * coordinate normalization, and API error handling.
 */

jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

// We need a fresh GeocodingCache for each test — require after mock
let GeocodingCacheModule;
let cache;

beforeEach(() => {
  // Clear module cache to get a fresh singleton
  jest.resetModules();
  jest.mock('../utils/logger', () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }));
  // Mock global fetch
  global.fetch = jest.fn();
  GeocodingCacheModule = require('../utils/geocodingCache');
  cache = GeocodingCacheModule.geocodingCache;
});

afterEach(() => {
  delete global.fetch;
});

describe('GeocodingCache', () => {
  test('cache miss → calls fetch, returns address, caches result', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ address: '123 Main St, Springfield' }),
    });

    const address = await cache.getAddress(40.7128, -74.006);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(address).toBe('123 Main St, Springfield');
    expect(cache.getStats().size).toBe(1);
  });

  test('cache hit → returns cached address, no fetch call', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ address: '456 Oak Ave' }),
    });

    // First call — cache miss
    await cache.getAddress(40.7128, -74.006);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call — cache hit
    const address = await cache.getAddress(40.7128, -74.006);
    expect(global.fetch).toHaveBeenCalledTimes(1); // NOT called again
    expect(address).toBe('456 Oak Ave');
  });

  test('coordinate normalization: toFixed(5) precision', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ address: 'Normalized St' }),
    });

    // These should map to the same cache key (5 decimal places)
    await cache.getAddress(40.712800001, -74.006000002);
    await cache.getAddress(40.712800009, -74.006000008);

    // Only one fetch call — second resolves from cache
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('TTL expiry: stale entry triggers new fetch', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ address: 'Fresh St' }),
    });

    // Manually insert a stale entry
    const key = `${(40.7128).toFixed(5)},${(-74.006).toFixed(5)}`;
    cache.cache.set(key, {
      address: 'Stale St',
      timestamp: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
    });

    const address = await cache.getAddress(40.7128, -74.006);

    // Should have called fetch because entry is expired
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(address).toBe('Fresh St');
  });

  test('LRU eviction: oldest entry removed when exceeding MAX_SIZE', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ address: 'New Entry' }),
    });

    // Fill cache to MAX_SIZE
    for (let i = 0; i < cache.MAX_SIZE; i++) {
      cache.cache.set(`key-${i}`, { address: `addr-${i}`, timestamp: Date.now() });
    }
    expect(cache.cache.size).toBe(cache.MAX_SIZE);

    // Add one more via getAddress
    await cache.getAddress(99.99999, 99.99999);

    // Should have evicted oldest, size stays at MAX_SIZE
    expect(cache.cache.size).toBe(cache.MAX_SIZE);
    expect(cache.cache.has('key-0')).toBe(false);
  });

  test('getStats() returns correct size', () => {
    cache.cache.set('a', { address: 'A', timestamp: Date.now() });
    cache.cache.set('b', { address: 'B', timestamp: Date.now() });

    const stats = cache.getStats();

    expect(stats.size).toBe(2);
    expect(stats.maxSize).toBe(1000);
    expect(stats.ttl).toBe(24 * 60 * 60 * 1000);
  });

  test('clear() empties cache', () => {
    cache.cache.set('a', { address: 'A', timestamp: Date.now() });
    cache.cache.set('b', { address: 'B', timestamp: Date.now() });

    cache.clear();

    expect(cache.getStats().size).toBe(0);
  });

  test('API error → returns null, does not cache', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const address = await cache.getAddress(40.7128, -74.006);

    expect(address).toBeNull();
    expect(cache.getStats().size).toBe(0);
  });

  test('network error → returns null, does not cache', async () => {
    global.fetch.mockRejectedValue(new Error('Network failure'));

    const address = await cache.getAddress(40.7128, -74.006);

    expect(address).toBeNull();
    expect(cache.getStats().size).toBe(0);
  });
});
