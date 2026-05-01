/**
 * Executor tests — pure logic, no LLM calls. Verifies:
 *   - placeholder resolution (single + interpolated + array indexing)
 *   - normal execution path (multi-step plan, results chain)
 *   - error classification + retry-on-transient
 *   - halt on soft tool errors (result.error)
 *   - halt on hard exceptions
 *   - plan with no steps
 */

const { execute, resolvePlaceholders, classifyError } = require('../services/agent/executor');

describe('PEV executor', () => {
  describe('resolvePlaceholders', () => {
    test('whole-string placeholder preserves type', () => {
      const results = new Map([['s1', { id: 'abc-123', count: 5 }]]);
      expect(resolvePlaceholders('{{s1.id}}', results)).toBe('abc-123');
      expect(resolvePlaceholders('{{s1.count}}', results)).toBe(5);
    });

    test('array indexing', () => {
      const results = new Map([['s1', { results: [{ id: 'p1', name: 'Smith' }, { id: 'p2' }] }]]);
      expect(resolvePlaceholders('{{s1.results[0].id}}', results)).toBe('p1');
      expect(resolvePlaceholders('{{s1.results[1].id}}', results)).toBe('p2');
    });

    test('interpolated string', () => {
      const results = new Map([['s1', { name: 'Wilson' }]]);
      expect(resolvePlaceholders('Project: {{s1.name}}', results)).toBe('Project: Wilson');
    });

    test('nested object args', () => {
      const results = new Map([['s1', { id: 'abc' }]]);
      const args = {
        project_id: '{{s1.id}}',
        line_items: [{ description: 'Tile for {{s1.id}}', quantity: 200 }],
      };
      const resolved = resolvePlaceholders(args, results);
      expect(resolved.project_id).toBe('abc');
      expect(resolved.line_items[0].description).toBe('Tile for abc');
      expect(resolved.line_items[0].quantity).toBe(200);
    });

    test('throws on missing step id', () => {
      const results = new Map([['s1', { id: 'abc' }]]);
      expect(() => resolvePlaceholders('{{s99.id}}', results)).toThrow(/missing step/);
    });

    test('throws on null path traversal', () => {
      const results = new Map([['s1', { id: null }]]);
      expect(() => resolvePlaceholders('{{s1.id.deeper}}', results)).toThrow(/null/);
    });

    test('non-placeholder strings pass through', () => {
      const results = new Map();
      expect(resolvePlaceholders('plain string', results)).toBe('plain string');
      expect(resolvePlaceholders(42, results)).toBe(42);
      expect(resolvePlaceholders(null, results)).toBe(null);
    });
  });

  describe('classifyError', () => {
    test('transient errors', () => {
      expect(classifyError(new Error('connection timeout'))).toBe('transient');
      expect(classifyError(new Error('ECONNRESET'))).toBe('transient');
      expect(classifyError(Object.assign(new Error('x'), { transient: true }))).toBe('transient');
    });
    test('not_found', () => {
      expect(classifyError(new Error('Project not found'))).toBe('not_found');
      expect(classifyError(new Error('no match'))).toBe('not_found');
    });
    test('bad_args', () => {
      expect(classifyError(new Error('project_id is required'))).toBe('bad_args');
      expect(classifyError(new Error('invalid status'))).toBe('bad_args');
    });
    test('fatal', () => {
      expect(classifyError(new Error('something exploded'))).toBe('fatal');
    });
  });

  describe('execute', () => {
    test('runs a simple plan and chains results via placeholders', async () => {
      const plan = {
        goal: 'create a CO on John\'s project',
        steps: [
          { id: 's1', tool: 'search_projects', args: { q: 'John' }, why: 'find', depends_on: [] },
          {
            id: 's2', tool: 'create_change_order',
            args: {
              project_id: '{{s1.results[0].id}}',
              title: 'Bath tile',
              line_items: [{ description: 'Tile', quantity: 200, unit_price: 8 }],
            },
            why: 'create',
            depends_on: ['s1'],
          },
        ],
      };
      const calls = [];
      const fakeTool = async (name, args) => {
        calls.push({ name, args });
        if (name === 'search_projects') {
          return { results: [{ id: 'proj-abc', name: 'Smith' }] };
        }
        if (name === 'create_change_order') {
          expect(args.project_id).toBe('proj-abc'); // placeholder resolved
          return { success: true, change_order: { id: 'co-1', co_number: 1 } };
        }
        throw new Error('unexpected');
      };
      const events = [];
      const r = await execute({ plan, executeTool: fakeTool, userId: 'u1', emit: (e) => events.push(e) });

      expect(r.ok).toBe(true);
      expect(r.reachedSteps).toBe(2);
      expect(calls).toHaveLength(2);
      // events: plan_start, step_start, step_done, step_start, step_done, plan_complete
      expect(events[0].type).toBe('plan_start');
      expect(events.filter((e) => e.type === 'step_done')).toHaveLength(2);
      expect(events[events.length - 1].type).toBe('plan_complete');
    });

    test('retries on transient error then succeeds', async () => {
      const plan = {
        goal: 'x',
        steps: [{ id: 's1', tool: 't', args: {}, why: '', depends_on: [] }],
      };
      let calls = 0;
      const fakeTool = async () => {
        calls++;
        if (calls === 1) throw Object.assign(new Error('timeout'), { transient: true });
        return { ok: true };
      };
      const r = await execute({ plan, executeTool: fakeTool, userId: 'u1' });
      expect(r.ok).toBe(true);
      expect(calls).toBe(2);
    });

    test('halts on hard exception', async () => {
      const plan = {
        goal: 'x',
        steps: [
          { id: 's1', tool: 't', args: {}, why: '', depends_on: [] },
          { id: 's2', tool: 't', args: {}, why: '', depends_on: ['s1'] },
        ],
      };
      const fakeTool = async () => { throw new Error('something exploded'); };
      const r = await execute({ plan, executeTool: fakeTool, userId: 'u1' });
      expect(r.ok).toBe(false);
      expect(r.reachedSteps).toBe(0);
      expect(r.stepResults).toHaveLength(1); // only s1 attempted
      expect(r.stoppedReason).toMatch(/something exploded/);
    });

    test('halts on soft tool error (result.error)', async () => {
      const plan = {
        goal: 'x',
        steps: [{ id: 's1', tool: 't', args: {}, why: '', depends_on: [] }],
      };
      const fakeTool = async () => ({ error: 'No project matches "John"' });
      const events = [];
      const r = await execute({ plan, executeTool: fakeTool, userId: 'u1', emit: (e) => events.push(e) });
      expect(r.ok).toBe(false);
      expect(r.stepResults[0].error.class).toBe('soft');
      const errEvent = events.find((e) => e.type === 'step_error');
      expect(errEvent).toBeTruthy();
    });

    test('rejects empty plan', async () => {
      const r = await execute({ plan: { goal: 'x', steps: [] }, executeTool: async () => {}, userId: 'u1' });
      expect(r.ok).toBe(true);
      expect(r.reachedSteps).toBe(0);
    });

    test('preToolCheck BLOCK halts plan and returns pendingApproval', async () => {
      const plan = {
        goal: 'send invoice',
        steps: [
          { id: 's1', tool: 'search_projects', args: { q: 'Smith' }, why: 'find', depends_on: [] },
          { id: 's2', tool: 'send_invoice', args: { id: 'inv-1' }, why: 'send', depends_on: ['s1'] },
        ],
      };
      const calls = [];
      const fakeTool = async (n, a) => {
        calls.push({ n, a });
        if (n === 'search_projects') return { results: [{ id: 'p1' }] };
        return { sent: true };
      };
      // Block writes — only allow reads
      const preToolCheck = async ({ tool }) => {
        if (tool.startsWith('send_') || tool.startsWith('mirror_')) {
          return { verdict: 'BLOCK', reason: 'external write', risk_level: 'external_write', action_summary: `Send ${tool}` };
        }
        return { verdict: 'PROCEED' };
      };
      const r = await execute({ plan, executeTool: fakeTool, userId: 'u1', preToolCheck });
      expect(r.ok).toBe(false);
      expect(r.pendingApproval).toBeTruthy();
      expect(r.pendingApproval.tool).toBe('send_invoice');
      expect(r.pendingApproval.risk_level).toBe('external_write');
      // Search should have run (read), send should NOT have run (blocked)
      expect(calls.map((c) => c.n)).toEqual(['search_projects']);
    });

    test('preToolCheck PROCEED runs the tool normally', async () => {
      const plan = {
        goal: 'x',
        steps: [{ id: 's1', tool: 'search_projects', args: {}, why: '', depends_on: [] }],
      };
      const fakeTool = async () => ({ ok: true });
      const preToolCheck = async () => ({ verdict: 'PROCEED' });
      const r = await execute({ plan, executeTool: fakeTool, userId: 'u1', preToolCheck });
      expect(r.ok).toBe(true);
      expect(r.pendingApproval).toBeFalsy();
    });

    test('optional step failure does NOT halt the plan', async () => {
      const plan = {
        goal: 'send 3 reminders',
        steps: [
          { id: 's1', tool: 'send_reminder', args: { id: 'inv-1' }, optional: true, depends_on: [] },
          { id: 's2', tool: 'send_reminder', args: { id: 'inv-2' }, optional: true, depends_on: [] },
          { id: 's3', tool: 'send_reminder', args: { id: 'inv-3' }, optional: true, depends_on: [] },
        ],
      };
      const fakeTool = async (n, a) => {
        if (a.id === 'inv-2') throw new Error('email bounced');
        return { sent: true, id: a.id };
      };
      const r = await execute({ plan, executeTool: fakeTool, userId: 'u1' });
      expect(r.ok).toBe(true);
      expect(r.reachedSteps).toBe(3);
      expect(r.stepResults).toHaveLength(3);
      expect(r.stepResults[1].error).toBeTruthy(); // s2 failed
      expect(r.stepResults[1].skipped).toBe(true); // marked as skipped (optional)
      expect(r.stepResults[0].result.sent).toBe(true); // s1 succeeded
      expect(r.stepResults[2].result.sent).toBe(true); // s3 succeeded
    });

    test('non-optional step failure DOES halt', async () => {
      const plan = {
        goal: 'critical chain',
        steps: [
          { id: 's1', tool: 'search_projects', args: {}, depends_on: [] },
          { id: 's2', tool: 'create_change_order', args: {}, depends_on: ['s1'] },
        ],
      };
      const fakeTool = async (n) => {
        if (n === 'search_projects') return { results: [{ id: 'p1' }] };
        throw new Error('CO creation failed');
      };
      const r = await execute({ plan, executeTool: fakeTool, userId: 'u1' });
      expect(r.ok).toBe(false);
      expect(r.reachedSteps).toBe(1);
    });

    test('optional soft error (result.error) also continues', async () => {
      const plan = {
        goal: 'soft tolerant',
        steps: [
          { id: 's1', tool: 'send_x', args: {}, optional: true, depends_on: [] },
          { id: 's2', tool: 'send_y', args: {}, optional: true, depends_on: [] },
        ],
      };
      const fakeTool = async () => ({ error: 'no recipient' });
      const r = await execute({ plan, executeTool: fakeTool, userId: 'u1' });
      expect(r.ok).toBe(true); // both failed but optional, plan completes
      expect(r.stepResults.every((s) => s.skipped === true)).toBe(true);
    });

    test('repairArgs fixes a bad_args error and retries successfully', async () => {
      const plan = {
        goal: 'create CO',
        steps: [{ id: 's1', tool: 'create_change_order', args: { uid: 'p1', title: 'x' }, depends_on: [] }],
      };
      let calls = 0;
      const fakeTool = async (n, a) => {
        calls++;
        if (calls === 1) {
          // First call: tool throws because project_id is required and missing.
          // (This matches real Supabase tool behavior for arg validation.)
          throw new Error('project_id is required');
        }
        // Second call (after repair): success
        if (a.project_id !== 'p1') throw new Error('repair did not fix args');
        return { success: true, change_order: { id: 'co-1' } };
      };
      const repairArgs = async ({ args, error }) => {
        if (error.includes('project_id is required') && args.uid) {
          return { repaired: true, args: { project_id: args.uid, title: args.title } };
        }
        return { repaired: false };
      };
      const events = [];
      const r = await execute({ plan, executeTool: fakeTool, userId: 'u1', repairArgs, emit: (e) => events.push(e) });
      expect(r.ok).toBe(true);
      expect(calls).toBe(2);
      expect(r.stepResults[0].repaired).toBe(true);
      expect(events.find((e) => e.type === 'step_repair_done')).toBeTruthy();
    });

    test('repairArgs that says not-repairable falls through to halt', async () => {
      const plan = {
        goal: 'x',
        steps: [{ id: 's1', tool: 't', args: {}, depends_on: [] }],
      };
      const fakeTool = async () => { throw new Error('project_id is required'); };
      const repairArgs = async () => ({ repaired: false, reason: 'not enough info' });
      const r = await execute({ plan, executeTool: fakeTool, userId: 'u1', repairArgs });
      expect(r.ok).toBe(false);
    });

    test('repairArgs not called on not-found errors (pre-filtered upstream)', async () => {
      // The pre-filter (isWorthRepairing) lives in pev.js; here we just verify
      // the executor passes through whatever the callback returns.
      const plan = {
        goal: 'x',
        steps: [{ id: 's1', tool: 't', args: {}, depends_on: [] }],
      };
      const fakeTool = async () => ({ error: 'project not found' });
      let repairCalled = false;
      const repairArgs = async () => { repairCalled = true; return { repaired: false }; };
      const r = await execute({ plan, executeTool: fakeTool, userId: 'u1', repairArgs });
      // Soft errors classify as 'soft', not 'bad_args', so repair shouldn't fire
      expect(repairCalled).toBe(false);
      expect(r.ok).toBe(false);
    });

    test('preToolCheck error halts (fail-closed)', async () => {
      const plan = {
        goal: 'x',
        steps: [{ id: 's1', tool: 'search_projects', args: {}, why: '', depends_on: [] }],
      };
      const fakeTool = async () => ({ ok: true });
      const preToolCheck = async () => { throw new Error('gate exploded'); };
      const r = await execute({ plan, executeTool: fakeTool, userId: 'u1', preToolCheck });
      expect(r.ok).toBe(false);
      expect(r.stoppedReason).toMatch(/approval check failed/);
    });
  });
});
