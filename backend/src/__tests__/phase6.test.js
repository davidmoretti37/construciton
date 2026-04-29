/**
 * Phase 6 — production hardening tests.
 *
 * Covers:
 *   - traceContext mints valid ids, supports nextTurn, tags events
 *   - planner cache hits return _cached: true and skip the LLM
 *   - constitution catches the major rule violations
 *   - skills registry exposes the 3 reference skills with valid shape
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
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    })),
  }),
}));

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('traceContext', () => {
  const { newTraceContext, nextTurn, tagEvent, shortId } = require('../services/traceContext');

  test('shortId returns 8 hex chars', () => {
    const id = shortId();
    expect(id).toMatch(/^[0-9a-f]{8}$/);
  });

  test('newTraceContext returns trace_id + turn_id + started_at', () => {
    const ctx = newTraceContext();
    expect(ctx.trace_id).toMatch(/^[0-9a-f]{8}$/);
    expect(ctx.turn_id).toMatch(/^[0-9a-f]{8}$/);
    expect(typeof ctx.started_at).toBe('number');
  });

  test('newTraceContext({jobId}) reuses jobId for trace_id', () => {
    const ctx = newTraceContext({ jobId: 'abcd1234-ef56-7890-abcd-ef1234567890' });
    expect(ctx.trace_id).toBe('abcd1234');
  });

  test('nextTurn keeps trace_id, mints new turn_id', () => {
    const a = newTraceContext();
    const b = nextTurn(a);
    expect(b.trace_id).toBe(a.trace_id);
    expect(b.turn_id).not.toBe(a.turn_id);
  });

  test('tagEvent adds trace_id + turn_id; idempotent', () => {
    const ctx = newTraceContext();
    const e1 = tagEvent({ type: 'plan' }, ctx);
    expect(e1.trace_id).toBe(ctx.trace_id);
    expect(e1.turn_id).toBe(ctx.turn_id);

    const e2 = tagEvent({ type: 'plan', trace_id: 'preset' }, ctx);
    expect(e2.trace_id).toBe('preset'); // doesn't overwrite
  });
});

describe('planner cache', () => {
  // Mock fetch so the planner thinks it called Haiku once.
  let fetchCallCount = 0;
  beforeEach(() => {
    fetchCallCount = 0;
    global.fetch = jest.fn(async () => {
      fetchCallCount += 1;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"plan_text":"test plan","complexity":"simple","recommended_model":"haiku","needs_verification":false,"intent_summary":"test"}' } }],
        }),
      };
    });
  });
  afterEach(() => { delete global.fetch; });

  test('second call with identical inputs hits cache (no second fetch)', async () => {
    const { generatePlan } = require('../services/planner');
    // Use a unique message so we don't collide with earlier tests' cache.
    const msg = `cache-test-${Date.now()}-${Math.random()}`;
    const r1 = await generatePlan({ userMessage: msg, conversationHistory: [], toolNames: [] });
    expect(r1._cached).toBeUndefined();
    expect(fetchCallCount).toBe(1);

    const r2 = await generatePlan({ userMessage: msg, conversationHistory: [], toolNames: [] });
    expect(r2._cached).toBe(true);
    expect(fetchCallCount).toBe(1); // didn't fire again
  });

  test('different message → different cache key → fresh fetch', async () => {
    const { generatePlan } = require('../services/planner');
    await generatePlan({ userMessage: `unique-a-${Date.now()}`, toolNames: [] });
    await generatePlan({ userMessage: `unique-b-${Date.now()}`, toolNames: [] });
    expect(fetchCallCount).toBe(2);
  });
});

describe('constitution', () => {
  const { evaluate } = require('../services/constitution');

  test('blocks claim of SMS sent when SMS disabled', () => {
    const r = evaluate({ responseText: 'Just texted Carolyn she is on her way.', executedToolCalls: [] });
    expect(r.ok).toBe(false);
    expect(r.blocked?.rule).toBe('no_fake_sms_send');
  });

  test('passes plain email-style response', () => {
    const r = evaluate({ responseText: 'I let Carolyn know via email.', executedToolCalls: [] });
    expect(r.ok).toBe(true);
  });

  test('warns when destructive language used without a destructive call', () => {
    const r = evaluate({ responseText: 'Done — deleted the project for you.', executedToolCalls: [] });
    expect(r.ok).toBe(false);
    expect(r.results.some(v => v.rule === 'no_fake_destructive_completion')).toBe(true);
  });

  test('does not warn when destructive language matches a real destructive call', () => {
    const r = evaluate({
      responseText: 'Deleted the Smith project as you confirmed.',
      executedToolCalls: [{ tool: 'delete_project', blocked: false }],
    });
    // The destructive rule should pass.
    expect(r.results.find(v => v.rule === 'no_fake_destructive_completion')).toBeUndefined();
  });

  test('warns on internal tool name leak', () => {
    const r = evaluate({
      responseText: 'I called search_projects and update_project for you.',
      executedToolCalls: [],
    });
    expect(r.results.some(v => v.rule === 'no_tool_name_leak')).toBe(true);
  });
});

describe('skills', () => {
  const { listSkills, getSkill, buildSkillToolDef } = require('../services/skills');

  test('exposes the 3 reference skills', () => {
    const names = listSkills().map(s => s.name).sort();
    expect(names).toEqual(['audit_project', 'draft_estimate', 'weekly_review']);
  });

  test('every skill has the right shape', () => {
    for (const skill of listSkills()) {
      expect(typeof skill.name).toBe('string');
      expect(typeof skill.description).toBe('string');
      expect(skill.description.length).toBeGreaterThan(20);
      expect(Array.isArray(skill.toolWhitelist)).toBe(true);
      expect(skill.toolWhitelist.length).toBeGreaterThan(0);
      expect(typeof skill.parameters).toBe('object');
      expect(typeof skill.run).toBe('function');
    }
  });

  test('getSkill(unknown) returns null', () => {
    expect(getSkill('not_a_real_skill')).toBeNull();
    expect(getSkill('')).toBeNull();
  });

  test('buildSkillToolDef returns a valid OpenAI function definition', () => {
    const def = buildSkillToolDef();
    expect(def.type).toBe('function');
    expect(def.function.name).toBe('invoke_skill');
    expect(def.function.parameters.properties.name.enum).toEqual(
      expect.arrayContaining(['audit_project', 'weekly_review', 'draft_estimate'])
    );
  });
});
