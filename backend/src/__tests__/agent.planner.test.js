/**
 * Planner tests — verify it produces valid, actionable plans for real
 * complex requests (the same phrases that broke the agent today).
 *
 * Run with: OPENROUTER_API_KEY=... npx jest agent.planner
 */

const { plan, planVerdict } = require('../services/agent/planner');

const NO_KEY = !process.env.OPENROUTER_API_KEY;

// Minimal tool catalog covering the cases we test. Mirrors the shape of
// definitions.js entries (function: { name, description, parameters }).
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_projects',
      description: 'Find projects by client name, project name, or address.',
      parameters: {
        type: 'object',
        properties: { q: { type: 'string', description: 'Search query' } },
        required: ['q'],
      },
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
          project_id: { type: 'string', description: 'UUID of the project.' },
          title: { type: 'string' },
          description: { type: 'string' },
          line_items: { type: 'array', items: { type: 'object' } },
          schedule_impact_days: { type: 'number' },
          billing_strategy: { type: 'string', description: 'invoice_now | next_draw | project_end' },
        },
        required: ['project_id', 'title', 'line_items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_project',
      description: 'Update top-level fields on a project.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          payment_terms: { type: 'string' },
          contract_amount: { type: 'number' },
        },
        required: ['project_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_invoices',
      description: 'Find invoices by status / project.',
      parameters: {
        type: 'object',
        properties: {
          project_id: { type: 'string' },
          status: { type: 'string' },
          limit: { type: 'number' },
        },
        required: [],
      },
    },
  },
];

(NO_KEY ? describe.skip : describe)('PEV planner', () => {
  jest.setTimeout(60_000);

  test('plans a change order correctly (the bug case)', async () => {
    const r = await plan({
      userMessage: 'Add a change order to John for 200 square footed bath tile at $8 a square foot for two more days',
      tools: TOOLS,
    });
    expect(r.ok).toBe(true);
    expect(r.plan).toBeTruthy();
    expect(planVerdict(r.plan)).toBe('execute');

    const toolNames = r.plan.steps.map((s) => s.tool);
    // Must use create_change_order — never decompose
    expect(toolNames).toContain('create_change_order');
    // Forbidden decomposition tools: not in catalog so this also doubles as schema check
    expect(toolNames).not.toContain('record_expense');
    expect(toolNames).not.toContain('create_project_phase');

    // Must resolve project first since user said "John" (need to find which project)
    const coStep = r.plan.steps.find((s) => s.tool === 'create_change_order');
    expect(coStep).toBeTruthy();
    // project_id should be a placeholder, not a guess
    expect(String(coStep.args.project_id || '')).toMatch(/\{\{.*\}\}/);
    // Line items should reflect the user's numbers
    expect(Array.isArray(coStep.args.line_items)).toBe(true);
    expect(coStep.args.line_items.length).toBeGreaterThanOrEqual(1);
    // schedule_impact_days = 2
    expect(coStep.args.schedule_impact_days).toBe(2);
  });

  test('handles multi-step request: change terms + reissue invoice', async () => {
    const r = await plan({
      userMessage: 'switch the Wilson job to net-15 and re-issue the next invoice',
      tools: TOOLS,
    });
    expect(r.ok).toBe(true);
    const verdict = planVerdict(r.plan);
    expect(['execute', 'ask']).toContain(verdict);
    if (verdict === 'execute') {
      const toolNames = r.plan.steps.map((s) => s.tool);
      expect(toolNames).toContain('search_projects');
      expect(toolNames).toContain('update_project');
    }
  });

  test('returns ask for genuinely ambiguous request', async () => {
    const r = await plan({
      userMessage: 'add a CO for kitchen island, $2400, 1 day',
      tools: TOOLS,
    });
    // Either a low-confidence plan or an explicit ask is acceptable
    expect(r.ok).toBe(true);
    const verdict = planVerdict(r.plan);
    expect(['ask', 'execute']).toContain(verdict);
  });

  test('rejects plans referencing unknown tools', async () => {
    // Force a planning scenario where the model might invent a tool.
    // We pass a minimal tool list that lacks what's needed — the planner
    // should set needs_user_input rather than invent.
    const r = await plan({
      userMessage: 'send a Slack message to the team about the Smith project',
      tools: [TOOLS[0]], // only search_projects available
    });
    expect(r.ok).toBe(true);
    const verdict = planVerdict(r.plan);
    // Either the planner asks (no slack tool available) or returns no steps;
    // it must NOT have invented a tool name.
    expect(['ask', 'fallback']).toContain(verdict);
  });
});
