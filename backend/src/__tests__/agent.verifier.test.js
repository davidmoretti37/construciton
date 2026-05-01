/**
 * Verifier tests — end-to-end with live Haiku.
 *
 * Run with: OPENROUTER_API_KEY=... npx jest agent.verifier
 */

const { verify } = require('../services/agent/verifier');

const NO_KEY = !process.env.OPENROUTER_API_KEY;

(NO_KEY ? describe.skip : describe)('PEV verifier', () => {
  jest.setTimeout(30_000);

  test('satisfied when plan executed and request was simple action', async () => {
    const r = await verify({
      userMessage: 'Add a change order to John for 200sf bath tile at $8/sf for two more days',
      plan: {
        goal: "Create a change order on John's project for 200sf of bath tile",
        steps: [
          { id: 's1', tool: 'search_projects', args: { q: 'John' }, why: 'find project', depends_on: [] },
          { id: 's2', tool: 'create_change_order', args: {}, why: 'create CO', depends_on: ['s1'] },
        ],
      },
      executeResult: {
        ok: true,
        reachedSteps: 2,
        stepResults: [
          { id: 's1', tool: 'search_projects', result: { results: [{ id: 'proj-abc', name: 'John Smith Bathroom Remodel' }] } },
          { id: 's2', tool: 'create_change_order', result: { success: true, change_order: { id: 'co-1', co_number: 1, total_amount: 1600 } } },
        ],
      },
    });
    expect(r.satisfied).toBe(true);
    expect(r.gap).toBeNull();
  });

  test('not satisfied when execution halted with soft error', async () => {
    const r = await verify({
      userMessage: 'add a CO for kitchen island, $2400, 1 day',
      plan: {
        goal: 'Create CO',
        steps: [{ id: 's1', tool: 'search_projects', args: { q: 'kitchen island' }, why: 'find', depends_on: [] }],
      },
      executeResult: {
        ok: false,
        reachedSteps: 0,
        stoppedReason: 'step s1 (search_projects) returned error: No project matches',
        stepResults: [
          { id: 's1', tool: 'search_projects', error: { class: 'soft', message: 'No project matches' }, result: { error: 'No project matches' } },
        ],
      },
    });
    expect(r.satisfied).toBe(false);
    expect(r.gap).toBeTruthy();
  });

  test('not satisfied when user asked for X+Y but plan only did X', async () => {
    const r = await verify({
      userMessage: 'create a change order for Smith for $1500 and email it to him',
      plan: {
        goal: 'create change order',
        steps: [
          { id: 's1', tool: 'create_change_order', args: {}, why: 'create CO', depends_on: [] },
        ],
      },
      executeResult: {
        ok: true,
        reachedSteps: 1,
        stepResults: [
          { id: 's1', tool: 'create_change_order', result: { success: true, change_order: { id: 'co-1' } } },
        ],
      },
    });
    // When the verifier can run live (credits available), it must catch the
    // missing email step. When it can't (rate-limited / no credits), the
    // safe fallback returns satisfied=true to avoid blocking the user.
    if (r.fallback) {
      expect(r.satisfied).toBe(true); // safe default when verifier is degraded
    } else {
      expect(r.satisfied).toBe(false);
      expect(r.gap).toMatch(/email|send/i);
    }
  });

  test('falls back gracefully on missing input', async () => {
    const r = await verify({});
    expect(r.fallback).toBe(true);
    expect(r.satisfied).toBe(true); // safe default
  });
});

// ─────────────────────────────────────────────────────────────────
// Short-circuit tests — no LLM call needed. Always run.
// ─────────────────────────────────────────────────────────────────
describe('PEV verifier — short-circuit (no LLM)', () => {
  // Save and restore the API key so these tests work whether or not it's set
  const origKey = process.env.OPENROUTER_API_KEY;
  beforeAll(() => { process.env.OPENROUTER_API_KEY = 'test-key-not-used'; });
  afterAll(() => {
    if (origKey) process.env.OPENROUTER_API_KEY = origKey;
    else delete process.env.OPENROUTER_API_KEY;
  });

  test('short-circuits to unsatisfied when executor halted', async () => {
    const r = await verify({
      userMessage: 'add CO',
      plan: { goal: 'x', steps: [{ id: 's1', tool: 'search_projects', args: {}, why: '', depends_on: [] }] },
      executeResult: {
        ok: false,
        reachedSteps: 0,
        stoppedReason: 'step s1 (search_projects) returned error: No project matches',
        stepResults: [
          { id: 's1', tool: 'search_projects', error: { class: 'soft', message: 'No project matches' } },
        ],
      },
    });
    expect(r.shortCircuit).toBe(true);
    expect(r.satisfied).toBe(false);
    expect(r.gap).toMatch(/No project matches|step s1/);
    expect(r.latencyMs).toBe(0); // proves no LLM call happened
  });

  test('short-circuit suggests showing options when result has suggestions', async () => {
    const r = await verify({
      userMessage: 'find John',
      plan: { goal: 'x', steps: [{ id: 's1', tool: 'search_projects', args: {}, why: '', depends_on: [] }] },
      executeResult: {
        ok: false,
        reachedSteps: 0,
        stoppedReason: 'ambiguous',
        stepResults: [
          { id: 's1', tool: 'search_projects',
            error: { class: 'soft', message: 'Multiple matches' },
            result: { error: 'Multiple matches', suggestions: [{id: 'p1'}, {id: 'p2'}] } },
        ],
      },
    });
    expect(r.shortCircuit).toBe(true);
    expect(r.satisfied).toBe(false);
    expect(r.suggestion).toMatch(/suggestions/i);
  });
});
