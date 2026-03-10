/**
 * MemoryService Tests
 *
 * Validates fact extraction, memory scoring, persistence,
 * false positive filtering, and prompt generation.
 */

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

let mockChainResult = { data: [], error: null };

const createChainBuilder = () => {
  const builder = {
    select: jest.fn(() => builder),
    eq: jest.fn(() => builder),
    order: jest.fn(() => builder),
    limit: jest.fn(() => Promise.resolve(mockChainResult)),
    single: jest.fn(() => Promise.resolve(mockChainResult)),
    insert: jest.fn(() => builder),
    update: jest.fn(() => builder),
    delete: jest.fn(() => builder),
    then: jest.fn((cb) => cb(mockChainResult)),
  };
  return builder;
};

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => createChainBuilder()),
  },
}));

// Import after mocks
import { supabase } from '../../src/lib/supabase';

// We need a fresh MemoryService instance for each test
// Import the class indirectly through the module
const createMemoryService = () => {
  // Create a new instance directly
  const service = {
    cache: new Map(),
    userId: null,
    initialized: false,
    initPromise: null,
  };

  // Re-import to get the prototype methods
  const mod = require('../../src/services/agents/core/MemoryService');
  const freshService = Object.create(mod.memoryService.__proto__);
  freshService.cache = new Map();
  freshService.userId = null;
  freshService.initialized = false;
  freshService.initPromise = null;
  return freshService;
};

let service;

beforeEach(() => {
  jest.clearAllMocks();
  mockChainResult = { data: [], error: null };
  supabase.from.mockImplementation(() => createChainBuilder());
  service = createMemoryService();
});

// ============================================================
// extractFacts
// ============================================================
describe('extractFacts', () => {
  test('"Jose is certified for electrical" → worker_skill fact', () => {
    const facts = service.extractFacts('Jose is certified for electrical work.');

    expect(facts).toHaveLength(1);
    expect(facts[0].category).toBe('worker_skill');
    expect(facts[0].subject).toBe('Jose');
    expect(facts[0].fact).toContain('certified');
    expect(facts[0].confidence).toBe(0.7);
  });

  test('"Mrs. Johnson wants itemized invoices" → client_preference', () => {
    const facts = service.extractFacts('Mrs. Johnson always wants itemized invoices.');

    expect(facts.length).toBeGreaterThanOrEqual(1);
    const pref = facts.find(f => f.category === 'client_preference');
    expect(pref).toBeTruthy();
    expect(pref.subject).toContain('Johnson');
  });

  test('"Always add 15% contingency" → business_rule', () => {
    const facts = service.extractFacts('Always add 15% contingency to estimates.');

    expect(facts.length).toBeGreaterThanOrEqual(1);
    const rule = facts.find(f => f.category === 'business_rule');
    expect(rule).toBeTruthy();
    expect(rule.fact).toContain('15%');
  });

  test('"No, I meant $500" → correction with confidence 1.0', () => {
    const facts = service.extractFacts('No, I meant $500 for the labor.');

    expect(facts.length).toBeGreaterThanOrEqual(1);
    const correction = facts.find(f => f.category === 'correction');
    expect(correction).toBeTruthy();
    expect(correction.confidence).toBe(1.0);
    expect(correction.source).toBe('explicit');
  });

  test('no matching patterns → empty array', () => {
    const facts = service.extractFacts('Hello, how are you?');
    expect(facts).toHaveLength(0);
  });

  test('very short message → empty array', () => {
    const facts = service.extractFacts('Hi');
    expect(facts).toHaveLength(0);
  });
});

// ============================================================
// isFalsePositive
// ============================================================
describe('isFalsePositive', () => {
  test('generic pronouns → true', () => {
    expect(service.isFalsePositive('I', 'some fact')).toBe(true);
    expect(service.isFalsePositive('we', 'some fact')).toBe(true);
    expect(service.isFalsePositive('they', 'some fact')).toBe(true);
    expect(service.isFalsePositive('it', 'some fact')).toBe(true);
  });

  test('generic facts → true', () => {
    expect(service.isFalsePositive('John', 'work')).toBe(true);
    expect(service.isFalsePositive('John', 'stuff')).toBe(true);
  });

  test('real subjects → false', () => {
    expect(service.isFalsePositive('Jose', 'certified for electrical')).toBe(false);
    expect(service.isFalsePositive('Mrs. Johnson', 'wants itemized invoices')).toBe(false);
  });
});

// ============================================================
// getRelevantMemories
// ============================================================
describe('getRelevantMemories', () => {
  beforeEach(() => {
    // Populate cache with test memories
    service.cache.set('key-1', {
      id: 'm1', category: 'worker_skill', subject: 'Jose',
      fact: 'certified for electrical', confidence: 0.9,
      source: 'inferred', times_reinforced: 3,
    });
    service.cache.set('key-2', {
      id: 'm2', category: 'client_preference', subject: 'Mrs. Johnson',
      fact: 'wants itemized invoices', confidence: 0.7,
      source: 'inferred', times_reinforced: 1,
    });
    service.cache.set('key-3', {
      id: 'm3', category: 'correction', subject: 'Correction',
      fact: 'labor rate is $500', confidence: 1.0,
      source: 'explicit', times_reinforced: 0,
    });
  });

  test('subject match boosts score', () => {
    const results = service.getRelevantMemories('Tell me about Jose');

    expect(results.length).toBeGreaterThanOrEqual(1);
    // Jose should be first (subject match boost)
    expect(results[0].subject).toBe('Jose');
  });

  test('word overlap boosts score', () => {
    const results = service.getRelevantMemories('electrical work on the project');

    const jose = results.find(m => m.subject === 'Jose');
    expect(jose).toBeTruthy();
  });

  test('correction source boosts score', () => {
    const results = service.getRelevantMemories('what is the labor rate');

    const correction = results.find(m => m.category === 'correction');
    expect(correction).toBeTruthy();
  });

  test('empty query → empty results', () => {
    expect(service.getRelevantMemories('')).toEqual([]);
  });

  test('empty cache → empty results', () => {
    service.cache.clear();
    expect(service.getRelevantMemories('anything')).toEqual([]);
  });
});

// ============================================================
// getMemoriesForPrompt
// ============================================================
describe('getMemoriesForPrompt', () => {
  test('groups by category with headers', () => {
    service.cache.set('key-1', {
      id: 'm1', category: 'worker_skill', subject: 'Jose',
      fact: 'certified for electrical', confidence: 0.9,
      source: 'inferred', times_reinforced: 2,
    });
    service.cache.set('key-2', {
      id: 'm2', category: 'business_rule', subject: 'Business',
      fact: 'always add 15% contingency', confidence: 0.9,
      source: 'inferred', times_reinforced: 1,
    });

    const prompt = service.getMemoriesForPrompt('Jose electrical work rules');

    expect(prompt).toContain('Worker Skills');
    expect(prompt).toContain('Jose');
    expect(prompt).toContain('Business Rules');
    expect(prompt).toContain('contingency');
  });

  test('includes uncertainty indicator for low confidence', () => {
    service.cache.set('key-1', {
      id: 'm1', category: 'worker_skill', subject: 'NewGuy',
      fact: 'can do painting', confidence: 0.5,
      source: 'inferred', times_reinforced: 0,
    });

    const prompt = service.getMemoriesForPrompt('NewGuy painting');

    expect(prompt).toContain('uncertain');
  });

  test('empty cache → empty string', () => {
    expect(service.getMemoriesForPrompt('anything')).toBe('');
  });
});

// ============================================================
// getStats
// ============================================================
describe('getStats', () => {
  test('returns correct total and byCategory counts', () => {
    service.cache.set('k1', { category: 'worker_skill', confidence: 0.9 });
    service.cache.set('k2', { category: 'worker_skill', confidence: 0.8 });
    service.cache.set('k3', { category: 'business_rule', confidence: 0.7 });

    const stats = service.getStats();

    expect(stats.total).toBe(3);
    expect(stats.byCategory.worker_skill).toBe(2);
    expect(stats.byCategory.business_rule).toBe(1);
    expect(stats.averageConfidence).toBeCloseTo(0.8, 1);
  });

  test('empty cache → zeros', () => {
    const stats = service.getStats();

    expect(stats.total).toBe(0);
    expect(stats.averageConfidence).toBe(0);
  });
});

// ============================================================
// initialize
// ============================================================
describe('initialize', () => {
  test('prevents concurrent init (returns same promise)', async () => {
    mockChainResult = { data: [], error: null };

    // Start two initializations simultaneously
    const p1 = service.initialize('user-1');
    const p2 = service.initialize('user-1');

    await Promise.all([p1, p2]);

    // Should only load from database once
    expect(service.initialized).toBe(true);
    expect(service.userId).toBe('user-1');
  });

  test('loads memories from DB into cache', async () => {
    const memories = [
      { id: 'm1', category: 'worker_skill', subject: 'Jose', fact: 'electrical', confidence: 0.9, user_id: 'user-1' },
    ];
    mockChainResult = { data: memories, error: null };

    await service.initialize('user-1');

    expect(service.cache.size).toBe(1);
    expect(service.initialized).toBe(true);
  });

  test('skips if already initialized for same user', async () => {
    service.userId = 'user-1';
    service.initialized = true;

    await service.initialize('user-1');

    // from() should NOT have been called
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
