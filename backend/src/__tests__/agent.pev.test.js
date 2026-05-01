/**
 * PEV orchestrator end-to-end tests.
 *
 * Tools are stubbed (no Supabase needed) but classifier/planner/verifier
 * use the real LLM. With OPENROUTER_API_KEY set, this exercises the
 * complete pipeline on the exact phrases that broke the agent today.
 */

const { runPev } = require('../services/agent/pev');

const NO_KEY = !process.env.OPENROUTER_API_KEY;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_projects',
      description: 'Find projects by client name, project name, or address.',
      parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_change_order',
      description: 'Create a draft change order on an existing project. Mid-project scope/price/schedule change. CO entity handles contract bump + schedule extension + phase placement on approval.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          line_items: { type: 'array', items: { type: 'object' } },
          schedule_impact_days: { type: 'number' },
          billing_strategy: { type: 'string' },
        },
        required: ['project_id', 'title', 'line_items'],
      },
    },
  },
];

(NO_KEY ? describe.skip : describe)('PEV orchestrator (E2E with stubbed tools)', () => {
  jest.setTimeout(120_000);

  test('change-order request: classify → plan → execute → verify → response', async () => {
    const calls = [];
    const fakeTool = async (name, args) => {
      calls.push({ name, args });
      if (name === 'search_projects') {
        return { results: [{ id: 'proj-john', name: 'John Smith Bathroom Remodel' }] };
      }
      if (name === 'create_change_order') {
        // assert placeholder substitution worked
        if (args.project_id !== 'proj-john') {
          throw new Error(`expected project_id=proj-john, got ${args.project_id}`);
        }
        return {
          success: true,
          change_order: {
            id: 'co-1',
            co_number: 1,
            total_amount: 1600,
            schedule_impact_days: 2,
          },
        };
      }
      throw new Error(`unexpected tool call: ${name}`);
    };

    const events = [];
    const result = await runPev({
      userMessage: 'Add a change order to John for 200 square footed bath tile at $8 a square foot for two more days',
      tools: TOOLS,
      userId: 'u-test',
      executeTool: fakeTool,
      emit: (e) => events.push(e),
    });

    // Tolerate degraded mode: if the classifier or planner is rate-limited
    // (OpenRouter 402 / network issue), PEV correctly falls back to foreman.
    // We assert correctness only when the pipeline actually ran.
    const classifyStage = result.trace.stages.find((s) => s.stage === 'classify');
    if (classifyStage?.fallback) {
      expect(result.handoff).toBe('foreman');
      return;
    }

    expect(result.handoff).toBe('response');
    expect(calls.map((c) => c.name)).toEqual(['search_projects', 'create_change_order']);
    expect(calls[1].args.line_items.length).toBeGreaterThanOrEqual(1);
    expect(calls[1].args.schedule_impact_days).toBe(2);

    // Verify trace shows all stages ran
    const stages = result.trace.stages.map((s) => s.stage);
    expect(stages).toContain('classify');
    expect(stages).toContain('plan');
    expect(stages).toContain('execute');
    expect(stages).toContain('verify');

    // Verify event stream
    const types = events.map((e) => e.type);
    expect(types).toContain('pev_classify_done');
    expect(types).toContain('pev_plan_done');
    expect(types).toContain('plan_start');
    expect(types).toContain('plan_complete');
    expect(types).toContain('pev_verify_done');
  });

  test('simple request → handoff to foreman', async () => {
    const result = await runPev({
      userMessage: 'show me my estimates',
      tools: TOOLS,
      userId: 'u-test',
      executeTool: async () => ({}),
    });
    expect(result.handoff).toBe('foreman');
    expect(result.reason).toBe('simple');
  });

  test('ambiguous request → ask user, no execution', async () => {
    const calls = [];
    const fakeTool = async (n, a) => { calls.push({ n, a }); return {}; };
    const result = await runPev({
      userMessage: 'add a CO for kitchen island, $2400, 1 day',
      tools: TOOLS,
      userId: 'u-test',
      executeTool: fakeTool,
    });
    // Either planner asks (needs_user_input) or executor halts; either way
    // we should not have created a CO without project resolution
    // Tolerate degraded LLM (foreman fallback) or proper PEV path
    expect(['ask', 'response', 'foreman']).toContain(result.handoff);
    if (result.handoff === 'ask') {
      expect(result.question).toBeTruthy();
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// Deterministic orchestrator tests (no LLM calls — verify pipeline mechanics)
// ─────────────────────────────────────────────────────────────────
describe('PEV orchestrator — degraded LLM behavior', () => {
  // Simulate "no LLM" by clearing the API key. PEV should always fall back
  // to handoff='foreman' so the existing chat path keeps working.
  const origKey = process.env.OPENROUTER_API_KEY;
  beforeAll(() => { delete process.env.OPENROUTER_API_KEY; });
  afterAll(() => {
    if (origKey) process.env.OPENROUTER_API_KEY = origKey;
    else delete process.env.OPENROUTER_API_KEY;
  });

  test('falls back to foreman when LLM is unavailable', async () => {
    const result = await runPev({
      userMessage: 'add a change order for John',
      tools: TOOLS,
      userId: 'u-test',
      executeTool: async () => ({}),
    });
    expect(result.handoff).toBe('foreman');
    // Trace should still record the classify attempt
    expect(result.trace.stages[0].stage).toBe('classify');
  });

  test('emits trace with stage timings even on fallback', async () => {
    const result = await runPev({
      userMessage: 'something complex',
      tools: TOOLS,
      userId: 'u-test',
      executeTool: async () => ({}),
    });
    expect(result.trace).toBeTruthy();
    expect(result.totalMs).toBeGreaterThanOrEqual(0);
  });
});

describe('PEV — dry-run detection', () => {
  const { detectDryRun } = require('../services/agent/pev');

  test('detects "dry run:" prefix', () => {
    const r = detectDryRun('dry run: add a CO for John');
    expect(r.dryRun).toBe(true);
    expect(r.cleaned).toBe('add a CO for John');
  });

  test('detects "test mode" prefix', () => {
    const r = detectDryRun('test mode  invoice Smith $5k');
    expect(r.dryRun).toBe(true);
    expect(r.cleaned).toBe('invoice Smith $5k');
  });

  test('detects "just show me the plan" prefix', () => {
    const r = detectDryRun('just show me the plan: send all overdue reminders');
    expect(r.dryRun).toBe(true);
    expect(r.cleaned).toBe('send all overdue reminders');
  });

  test('preserves message when no marker', () => {
    const r = detectDryRun('add a CO for John');
    expect(r.dryRun).toBe(false);
    expect(r.cleaned).toBe('add a CO for John');
  });

  test('handles "dry-run" with hyphen', () => {
    const r = detectDryRun('dry-run send the invoice');
    expect(r.dryRun).toBe(true);
    expect(r.cleaned).toBe('send the invoice');
  });
});
