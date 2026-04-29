/**
 * Planner step-emission tests (Phase 2).
 *
 * The planner's network call (Haiku via OpenRouter) is mocked. We
 * exercise the SANITIZER on a variety of LLM JSON outputs to confirm:
 *  - simple/standard plans never carry a `steps` field, even if the LLM
 *    accidentally emits one
 *  - complex plans get steps clamped to <=5, malformed entries dropped,
 *    string lengths bounded
 *  - depends_on coerces to numbers and drops invalid entries
 */

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
process.env.OPENROUTER_API_KEY = 'test';

const { generatePlan } = require('../services/planner');

function mockFetchOnce(plan) {
  global.fetch = jest.fn().mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(plan) } }],
    }),
  });
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (global.fetch) global.fetch = undefined;
});

describe('Planner step emission', () => {
  test('simple plan never carries steps even if LLM emits them', async () => {
    mockFetchOnce({
      plan_text: 'Looking up overdue invoices.',
      complexity: 'simple',
      recommended_model: 'haiku',
      needs_verification: false,
      intent_summary: 'show overdue',
      steps: [{ id: 1, action: 'should be stripped' }], // accidentally emitted
    });

    const plan = await generatePlan({ userMessage: 'whats overdue', toolNames: [] });
    expect(plan.complexity).toBe('simple');
    expect(plan.steps).toBeUndefined();
  });

  test('standard plan never carries steps', async () => {
    mockFetchOnce({
      plan_text: 'Recording the expense.',
      complexity: 'standard',
      recommended_model: 'haiku',
      needs_verification: false,
      intent_summary: 'record expense',
      steps: [{ id: 1, action: 'should be stripped' }],
    });

    const plan = await generatePlan({ userMessage: 'add an expense', toolNames: [] });
    expect(plan.complexity).toBe('standard');
    expect(plan.steps).toBeUndefined();
  });

  test('complex plan keeps a clean steps array', async () => {
    mockFetchOnce({
      plan_text: 'Setting up the recurring service plan.',
      complexity: 'complex',
      recommended_model: 'sonnet',
      needs_verification: true,
      intent_summary: 'service plan setup',
      steps: [
        { id: 1, action: 'Create the service plan', tools_likely: ['create_service_visit'] },
        { id: 2, action: 'Attach the cleaning checklist', tools_likely: ['setup_daily_checklist'], depends_on: [1] },
        { id: 3, action: 'Email the welcome packet', tools_likely: ['share_document'], depends_on: [1, 2] },
      ],
    });

    const plan = await generatePlan({ userMessage: 'big multi-step request', toolNames: [] });
    expect(plan.complexity).toBe('complex');
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[0]).toMatchObject({ id: 1, action: 'Create the service plan', tools_likely: ['create_service_visit'] });
    expect(plan.steps[2].depends_on).toEqual([1, 2]);
  });

  test('complex plan caps at 5 steps', async () => {
    const tenSteps = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, action: `Step ${i + 1}`, tools_likely: [] }));
    mockFetchOnce({
      plan_text: 'Big plan',
      complexity: 'complex',
      recommended_model: 'sonnet',
      needs_verification: true,
      intent_summary: 'lots',
      steps: tenSteps,
    });

    const plan = await generatePlan({ userMessage: 'lots', toolNames: [] });
    expect(plan.steps).toHaveLength(5);
  });

  test('drops malformed entries (no action) and keeps valid ones', async () => {
    mockFetchOnce({
      plan_text: 'mixed',
      complexity: 'complex',
      recommended_model: 'sonnet',
      needs_verification: true,
      intent_summary: 'mixed',
      steps: [
        { id: 1, action: 'Good step 1' },
        { id: 2, action: '' }, // empty action — should drop
        { id: 3 }, // missing action — should drop
        { id: 4, action: 'Good step 4' },
      ],
    });

    // Use a unique userMessage per test — P6 plan cache means the
    // same input would return a cached prior plan, masking what we're
    // actually testing.
    const plan = await generatePlan({ userMessage: 'malformed-step-test', toolNames: [] });
    expect(plan.steps.map(s => s.id)).toEqual([1, 4]);
  });

  test('depends_on coerces strings to numbers and drops garbage', async () => {
    mockFetchOnce({
      plan_text: 'p',
      complexity: 'complex',
      recommended_model: 'sonnet',
      needs_verification: true,
      intent_summary: 'i',
      steps: [
        { id: 1, action: 'A', depends_on: ['1', 'foo', 2, null, -3, 0] },
      ],
    });

    const plan = await generatePlan({ userMessage: 'depends-on-test', toolNames: [] });
    // '1' and 2 are valid; 'foo', null, -3, 0 dropped (must be Number.isFinite > 0)
    expect(plan.steps[0].depends_on).toEqual([1, 2]);
  });

  test('clamps action length to 200 chars', async () => {
    const long = 'X'.repeat(500);
    mockFetchOnce({
      plan_text: 'p',
      complexity: 'complex',
      recommended_model: 'sonnet',
      needs_verification: true,
      intent_summary: 'i',
      steps: [
        { id: 1, action: long },
      ],
    });

    const plan = await generatePlan({ userMessage: 'action-clamp-test', toolNames: [] });
    expect(plan.steps[0].action.length).toBeLessThanOrEqual(200);
  });

  test('non-string entries in tools_likely are filtered out', async () => {
    mockFetchOnce({
      plan_text: 'p',
      complexity: 'complex',
      recommended_model: 'sonnet',
      needs_verification: true,
      intent_summary: 'i',
      steps: [
        { id: 1, action: 'A', tools_likely: ['create_project_phase', 42, null, '', 'share_document'] },
      ],
    });

    const plan = await generatePlan({ userMessage: 'tools-likely-test', toolNames: [] });
    expect(plan.steps[0].tools_likely).toEqual(['create_project_phase', 'share_document']);
  });
});
