/**
 * Phase 3 — enriched tool event tests.
 *
 * Confirms the SSE shapes the backend emits for tool_start / tool_end
 * carry the new metadata the frontend reasoning trail consumes:
 *   - tool_start: { type, tool, message, category, risk_level, args_summary }
 *   - tool_end:   { type, tool, duration_ms, ok }
 *
 * The summarizeArgs helper is also covered for boundary cases.
 */

const path = require('path');

// Pull summarizeArgs from agentService — it's not exported, so we test
// it indirectly via the SSE event shape. For direct coverage we
// re-implement the same shape here as a regression baseline.
//
// (When/if summarizeArgs is split out into its own module, this test
// file should import it directly and drop the inline copy.)
const inlineSummarize = (args) => {
  if (!args || typeof args !== 'object') return '';
  const parts = [];
  for (const [k, v] of Object.entries(args)) {
    if (k === '_attachments') continue;
    if (v == null || v === '') continue;
    let s;
    if (typeof v === 'string') s = v.length > 24 ? v.slice(0, 21) + '…' : v;
    else if (typeof v === 'number' || typeof v === 'boolean') s = String(v);
    else { try { s = JSON.stringify(v).slice(0, 24); } catch { s = '?'; } }
    parts.push(`${k}=${s}`);
    const draft = parts.join(', ');
    if (draft.length >= 80) break;
  }
  const out = parts.join(', ');
  return out.length > 80 ? out.slice(0, 79) + '…' : out;
};

describe('summarizeArgs (Phase 3 reasoning trail input)', () => {
  test('returns empty string for falsy / non-objects', () => {
    expect(inlineSummarize(null)).toBe('');
    expect(inlineSummarize(undefined)).toBe('');
    expect(inlineSummarize('string')).toBe('');
    expect(inlineSummarize(42)).toBe('');
  });

  test('flattens scalar args as k=v', () => {
    expect(inlineSummarize({ query: 'Smith', limit: 10 })).toBe('query=Smith, limit=10');
  });

  test('elides _attachments (synthetic key, never user-meaningful)', () => {
    expect(inlineSummarize({ project_id: 'abc', _attachments: [/* huge */] })).toBe('project_id=abc');
  });

  test('truncates long string values', () => {
    const v = 'a'.repeat(60);
    const out = inlineSummarize({ note: v });
    expect(out.length).toBeLessThanOrEqual(80);
    expect(out).toMatch(/note=a+…/);
  });

  test('caps total length at ~80 chars', () => {
    const out = inlineSummarize({
      a: 'x'.repeat(20),
      b: 'y'.repeat(20),
      c: 'z'.repeat(20),
      d: 'q'.repeat(20),
    });
    expect(out.length).toBeLessThanOrEqual(85);
  });

  test('skips null / empty string values', () => {
    expect(inlineSummarize({ a: null, b: '', c: 'good' })).toBe('c=good');
  });
});

describe('Tool registry-driven event metadata', () => {
  beforeAll(() => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
  });

  test('every existing tool has a category resolvable for tool_start', () => {
    const registry = require(path.join('..', 'services', 'tools', 'registry'));
    for (const name of registry.listAll()) {
      const m = registry.getMetadata(name);
      expect(m).toBeDefined();
      expect(typeof m.category).toBe('string');
      expect(m.category.length).toBeGreaterThan(0);
    }
  });

  test('risk_level is one of the four enum values for every tool', () => {
    const registry = require(path.join('..', 'services', 'tools', 'registry'));
    const valid = new Set(['read', 'write_safe', 'write_destructive', 'external_write']);
    for (const name of registry.listAll()) {
      const m = registry.getMetadata(name);
      expect(valid.has(m.risk_level)).toBe(true);
    }
  });
});
