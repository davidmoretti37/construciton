// Fresh instance for each test to avoid shared state
let memory;

beforeEach(() => {
  jest.resetModules();
  memory = require('../services/requestMemory');
  memory.clearAll();
});

afterEach(() => {
  memory.shutdown();
});

describe('remember and recall', () => {
  test('stores and retrieves a value', () => {
    memory.remember('user1', 'project_abc', { name: 'Test Project' }, 'get_project');
    const result = memory.recall('user1', 'project_abc');
    expect(result).toEqual({ name: 'Test Project' });
  });

  test('returns null for unknown key', () => {
    expect(memory.recall('user1', 'nonexistent')).toBeNull();
  });

  test('returns null for unknown user', () => {
    expect(memory.recall('unknown_user', 'key')).toBeNull();
  });

  test('has() returns true for existing entry', () => {
    memory.remember('user1', 'key1', 'value1');
    expect(memory.has('user1', 'key1')).toBe(true);
  });

  test('has() returns false for missing entry', () => {
    expect(memory.has('user1', 'key1')).toBe(false);
  });
});

describe('TTL expiration', () => {
  test('expired entries return null', () => {
    memory.remember('user1', 'old_key', 'old_value');

    // Manually set timestamp to 31 minutes ago
    const userCache = memory.cache.get('user1');
    const entry = userCache.get('old_key');
    entry.timestamp = Date.now() - 31 * 60 * 1000;

    expect(memory.recall('user1', 'old_key')).toBeNull();
  });
});

describe('LRU eviction', () => {
  test('evicts oldest entry when per-user cap is reached', () => {
    // Remember 200 entries (the cap)
    for (let i = 0; i < 200; i++) {
      memory.remember('user1', `key_${i}`, `value_${i}`);
    }

    // All 200 should exist
    expect(memory.recall('user1', 'key_0')).toBe('value_0');
    expect(memory.recall('user1', 'key_199')).toBe('value_199');

    // Make key_0 the oldest
    const userCache = memory.cache.get('user1');
    userCache.get('key_0').timestamp = Date.now() - 1000;

    // Adding one more should evict key_0
    memory.remember('user1', 'key_200', 'value_200');
    expect(memory.recall('user1', 'key_0')).toBeNull();
    expect(memory.recall('user1', 'key_200')).toBe('value_200');
  });
});

describe('cleanup', () => {
  test('removes expired entries', () => {
    memory.remember('user1', 'fresh', 'value1');
    memory.remember('user1', 'stale', 'value2');

    // Make one entry expired
    const userCache = memory.cache.get('user1');
    userCache.get('stale').timestamp = Date.now() - 31 * 60 * 1000;

    memory.cleanup();

    expect(memory.recall('user1', 'fresh')).toBe('value1');
    expect(memory.has('user1', 'stale')).toBe(false);
  });

  test('removes empty user caches', () => {
    memory.remember('user1', 'key', 'value');

    // Expire the only entry
    const userCache = memory.cache.get('user1');
    userCache.get('key').timestamp = Date.now() - 31 * 60 * 1000;

    memory.cleanup();

    expect(memory.cache.has('user1')).toBe(false);
  });
});

describe('getStats', () => {
  test('returns correct statistics', () => {
    memory.remember('user1', 'k1', 'v1');
    memory.remember('user1', 'k2', 'v2');
    memory.remember('user2', 'k3', 'v3');

    const stats = memory.getStats();
    expect(stats.users).toBe(2);
    expect(stats.entries).toBe(3);
    expect(stats.avgEntriesPerUser).toBe(1.5);
  });

  test('reports capacity info', () => {
    const stats = memory.getStats();
    expect(stats).toHaveProperty('maxUsers');
    expect(stats).toHaveProperty('maxEntriesPerUser');
    expect(stats).toHaveProperty('userCapacity');
  });
});

describe('getContextForPrompt', () => {
  test('returns empty string for unknown user', () => {
    const context = memory.getContextForPrompt('unknown-user-0000-0000');
    expect(context).toBe('');
  });

  test('returns empty string for user with no entries', () => {
    const context = memory.getContextForPrompt('user1');
    expect(context).toBe('');
  });

  test('includes project context for project_ keys', () => {
    memory.remember('user1', 'project_123', {
      name: 'Downtown Build',
      status: 'active',
      budget: 50000,
    }, 'get_project_details');

    const context = memory.getContextForPrompt('user1');
    expect(context).toContain('Downtown Build');
    expect(context).toContain('active');
    expect(context).toContain('50000');
  });

  test('includes worker context for worker_ keys', () => {
    memory.remember('user1', 'worker_456', {
      full_name: 'John Smith',
      trade: 'electrician',
      status: 'active',
    }, 'get_worker_details');

    const context = memory.getContextForPrompt('user1');
    expect(context).toContain('John Smith');
    expect(context).toContain('electrician');
  });

  test('includes invoice context for invoice_ keys', () => {
    memory.remember('user1', 'invoice_789', {
      invoice_number: 'INV-001',
      client_name: 'Acme Corp',
      status: 'pending',
      total: 10000,
      amount_paid: 3000,
    }, 'get_invoice_details');

    const context = memory.getContextForPrompt('user1');
    expect(context).toContain('INV-001');
    expect(context).toContain('Acme Corp');
    expect(context).toContain('7000'); // due = total - amount_paid
  });

  test('includes estimate context for estimate_ keys', () => {
    memory.remember('user1', 'estimate_abc', {
      estimate_number: 'EST-100',
      client_name: 'BuildCo',
      total: 25000,
    }, 'get_estimate_details');

    const context = memory.getContextForPrompt('user1');
    expect(context).toContain('EST-100');
    expect(context).toContain('BuildCo');
  });

  test('includes summary for recent_projects key', () => {
    memory.remember('user1', 'recent_projects', [
      { name: 'P1' }, { name: 'P2' }, { name: 'P3' },
    ], 'search_projects');

    const context = memory.getContextForPrompt('user1');
    expect(context).toContain('3 recent projects');
  });

  test('includes summary for workers_list key', () => {
    memory.remember('user1', 'workers_list', [
      { full_name: 'W1' }, { full_name: 'W2' },
    ], 'get_workers');

    const context = memory.getContextForPrompt('user1');
    expect(context).toContain('2 workers');
  });
});

describe('clearUser and clearAll', () => {
  test('clearUser removes all entries for a user', () => {
    memory.remember('user1', 'k1', 'v1');
    memory.remember('user2', 'k2', 'v2');

    memory.clearUser('user1');

    expect(memory.recall('user1', 'k1')).toBeNull();
    expect(memory.recall('user2', 'k2')).toBe('v2');
  });

  test('clearAll removes everything', () => {
    memory.remember('user1', 'k1', 'v1');
    memory.remember('user2', 'k2', 'v2');

    memory.clearAll();

    expect(memory.cache.size).toBe(0);
  });
});
