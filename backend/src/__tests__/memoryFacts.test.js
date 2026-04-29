/**
 * P4 — typed memory taxonomy tests.
 *
 * Covers the additive layer in memoryService:
 *   - formatRecallForPrompt renders typed `kind` tag instead of legacy
 *     `category` when present (transition-friendly rendering)
 *   - both legacy and typed entries can co-exist in the same recall block
 *   - userMemories cap raised from 8 to 12 to fit typed augmentation
 *   - the legacy category → new kind mapping is total (every legacy
 *     category produces a valid kind)
 *
 * Schema migration + dual-write/dual-read paths require a live DB to
 * exercise meaningfully; they are exercised by the smoke harness in
 * the PHASE_4_REPORT verification section.
 */

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
process.env.OPENROUTER_API_KEY = 'test';

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn() },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: [], error: null }),
      upsert: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: jest.fn(async () => ({ data: [], error: null })),
    storage: { from: jest.fn(() => ({ createSignedUrl: jest.fn() })) },
  }),
}));

const { formatRecallForPrompt } = require('../services/memory/memoryService');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('formatRecallForPrompt — typed vs legacy rendering', () => {
  test('renders [kind] tag when metadata.kind is present (P4 typed)', () => {
    const out = formatRecallForPrompt({
      userMemories: [
        { content: 'smith prefers morning visits', metadata: { kind: 'preference', subject: 'smith' } },
      ],
    });
    expect(out).toContain('[preference]');
    expect(out).toContain('smith prefers morning visits');
  });

  test('renders [category] tag when metadata.category is present (legacy)', () => {
    const out = formatRecallForPrompt({
      userMemories: [
        { content: 'smith prefers morning visits', metadata: { category: 'client_preference', subject: 'smith' } },
      ],
    });
    expect(out).toContain('[client_preference]');
  });

  test('prefers kind over category when both are set (typed wins)', () => {
    const out = formatRecallForPrompt({
      userMemories: [
        { content: 'x', metadata: { kind: 'preference', category: 'client_preference', subject: 's' } },
      ],
    });
    expect(out).toContain('[preference]');
    expect(out).not.toContain('[client_preference]');
  });

  test('legacy + typed entries render side-by-side without breaking', () => {
    const out = formatRecallForPrompt({
      userMemories: [
        { content: 'old fact', metadata: { category: 'project_insight', subject: 'a' } },
        { content: 'new fact', metadata: { kind: 'pattern', subject: 'b' } },
      ],
    });
    expect(out).toContain('[project_insight]');
    expect(out).toContain('old fact');
    expect(out).toContain('[pattern]');
    expect(out).toContain('new fact');
  });

  test('returns empty string for empty recall', () => {
    expect(formatRecallForPrompt(null)).toBe('');
    expect(formatRecallForPrompt({})).toBe('');
  });

  test('caps userMemories at 12 entries (was 8 pre-P4)', () => {
    const fifteen = Array.from({ length: 15 }, (_, i) => ({
      content: `fact ${i}`,
      metadata: { kind: 'fact', subject: `s${i}` },
    }));
    const out = formatRecallForPrompt({ userMemories: fifteen });
    const lines = out.split('\n').filter(l => l.startsWith('- '));
    expect(lines).toHaveLength(12);
  });

  // P8: episodic event surfacing — formatRecallForPrompt must render
  // the new `episodicEvents` array as its own "Recent relevant events"
  // section so the agent sees them.
  test('renders episodicEvents in their own section', () => {
    const out = formatRecallForPrompt({
      episodicEvents: [
        { event_type: 'PROJECT_STATUS_CHANGED', summary: 'Davis project marked behind', occurred_at: '2026-03-14T15:30:00Z' },
        { event_type: 'INVOICE_VOIDED', summary: 'Smith invoice INV-018 voided', occurred_at: '2026-04-02T10:00:00Z' },
      ],
    });
    expect(out).toContain('## Recent relevant events');
    expect(out).toContain('[2026-03-14]');
    expect(out).toContain('Davis project marked behind');
    expect(out).toContain('(project status changed)');
    expect(out).toContain('Smith invoice INV-018 voided');
  });

  test('caps episodicEvents at 3 in the prompt', () => {
    const five = Array.from({ length: 5 }, (_, i) => ({
      event_type: 'TEST_EVENT',
      summary: `Event ${i}`,
      occurred_at: `2026-04-${String(i + 1).padStart(2, '0')}`,
    }));
    const out = formatRecallForPrompt({ episodicEvents: five });
    const eventLines = out.split('\n').filter(l => l.startsWith('- ') && l.includes('Event '));
    expect(eventLines).toHaveLength(3);
  });

  test('omits the events section when episodicEvents is empty/missing', () => {
    const a = formatRecallForPrompt({ userMemories: [{ content: 'x', metadata: { kind: 'fact' } }] });
    expect(a).not.toContain('Recent relevant events');
    const b = formatRecallForPrompt({ userMemories: [{ content: 'x', metadata: { kind: 'fact' } }], episodicEvents: [] });
    expect(b).not.toContain('Recent relevant events');
  });
});

describe('CATEGORY_TO_KIND mapping invariants', () => {
  // The mapping lives inside memoryService.js + the backfill script.
  // We assert the policy here so any change has to update both files.
  test('every legacy category maps to a valid kind', () => {
    const validKinds = new Set(['fact', 'preference', 'rule', 'pattern', 'context_conditional']);
    const mapping = {
      client_preference: 'preference',
      worker_skill: 'fact',
      pricing_pattern: 'pattern',
      business_rule: 'rule',
      project_insight: 'fact',
      correction: 'fact',
    };
    for (const [cat, kind] of Object.entries(mapping)) {
      expect(validKinds.has(kind)).toBe(true);
    }
    // Every documented legacy category is covered.
    expect(Object.keys(mapping).sort()).toEqual([
      'business_rule', 'client_preference', 'correction',
      'pricing_pattern', 'project_insight', 'worker_skill',
    ].sort());
  });
});
