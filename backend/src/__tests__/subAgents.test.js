/**
 * Phase 5 — sub-agent specialist + runner tests.
 *
 * Verifies:
 *   - 4 specialists are registered (researcher / builder / bookkeeper / communicator)
 *   - each specialist's tool surface is correctly filtered by category
 *     and risk-level allow list
 *   - getToolsForSpecialist returns full OpenAI definitions, not just names
 *   - the runner refuses unknown specialist kinds gracefully
 *   - the runner refuses empty task briefs gracefully
 *   - the runner refuses if OPENROUTER_API_KEY is missing
 *
 * The runner's actual LLM call is not exercised here — that's the
 * domain of an integration test against a real key. We test the
 * preconditions + tool filtering, which is the business-logic surface
 * area Phase 5 introduced.
 */

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test';
process.env.OPENROUTER_API_KEY = 'test-key';

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

const { listSpecialists, getSpecialist, getToolsForSpecialist } = require('../services/subAgents/specialists');
const { toolDefinitions } = require('../services/tools/definitions');
const { RISK_LEVELS } = require('../services/tools/categories');
const { runSubAgent } = require('../services/subAgents/runner');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('Specialist registry', () => {
  test('exposes the four canonical specialists', () => {
    const kinds = listSpecialists().map(s => s.kind).sort();
    expect(kinds).toEqual(['bookkeeper', 'builder', 'communicator', 'researcher']);
  });

  test('getSpecialist(unknown) returns null', () => {
    expect(getSpecialist('definitely_not_a_real_kind')).toBeNull();
    expect(getSpecialist('')).toBeNull();
    expect(getSpecialist(null)).toBeNull();
  });

  test('every specialist has the required shape', () => {
    for (const spec of listSpecialists()) {
      expect(typeof spec.kind).toBe('string');
      expect(typeof spec.systemPrompt).toBe('string');
      expect(spec.systemPrompt.length).toBeGreaterThan(100);
      expect(['haiku', 'sonnet']).toContain(spec.model);
      expect(spec.maxIterations).toBeGreaterThan(0);
      expect(spec.maxIterations).toBeLessThanOrEqual(10);
      expect(spec.riskAllowList).toBeInstanceOf(Set);
      expect(Array.isArray(spec.categories)).toBe(true);
    }
  });
});

describe('Specialist tool restrictions', () => {
  test('Researcher is read-only — no write tools in its surface', () => {
    const spec = getSpecialist('researcher');
    const tools = getToolsForSpecialist(spec, toolDefinitions);
    const names = tools.map(t => t.function.name);
    // Sanity: researcher has data-fetching tools
    expect(names).toContain('search_projects');
    expect(names).toContain('get_ar_aging');
    // Researcher MUST NOT have write tools
    expect(names).not.toContain('record_expense');
    expect(names).not.toContain('delete_project');
    expect(names).not.toContain('share_document');
    expect(names).not.toContain('void_invoice');
  });

  test('Builder has create/update tools but no destructive or external_write', () => {
    const spec = getSpecialist('builder');
    const tools = getToolsForSpecialist(spec, toolDefinitions);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('search_projects');
    expect(names).toContain('create_project_phase');
    expect(names).toContain('update_estimate');
    expect(names).not.toContain('delete_project');
    expect(names).not.toContain('share_document');
    expect(names).not.toContain('void_invoice');
  });

  test('Bookkeeper can mutate financials INCLUDING destructive ones', () => {
    const spec = getSpecialist('bookkeeper');
    const tools = getToolsForSpecialist(spec, toolDefinitions);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('record_expense');
    expect(names).toContain('assign_bank_transaction');
    // delete_expense + void_invoice are destructive but Bookkeeper CAN
    // call them — the approval gate still gates each call.
    expect(names).toContain('delete_expense');
    expect(names).toContain('void_invoice');
    // Should NOT have unrelated mutation surfaces
    expect(names).not.toContain('share_document');
    expect(names).not.toContain('create_project_phase');
  });

  test('Communicator can fire external_write but not destructive', () => {
    const spec = getSpecialist('communicator');
    const tools = getToolsForSpecialist(spec, toolDefinitions);
    const names = tools.map(t => t.function.name);
    expect(names).toContain('share_document');
    expect(names).toContain('request_signature');
    expect(names).toContain('search_invoices'); // can look up the doc
    expect(names).not.toContain('delete_project');
    expect(names).not.toContain('record_expense');
  });

  test('every returned tool is a full OpenAI function definition', () => {
    for (const spec of listSpecialists()) {
      const tools = getToolsForSpecialist(spec, toolDefinitions);
      for (const t of tools) {
        expect(t.type).toBe('function');
        expect(t.function?.name).toBeTruthy();
        expect(t.function?.description).toBeTruthy();
      }
    }
  });
});

describe('Sub-agent runner — preconditions', () => {
  test('rejects unknown kind cleanly (no throw)', async () => {
    const r = await runSubAgent({
      kind: 'mystery_kind',
      task: 'do something',
      userId: 'u-1',
    });
    expect(r.error).toMatch(/Unknown sub-agent kind/i);
    expect(r.summary).toBe('');
  });

  test('rejects empty task brief', async () => {
    const r = await runSubAgent({
      kind: 'researcher',
      task: '',
      userId: 'u-1',
    });
    expect(r.error).toMatch(/empty/i);
  });

  test('rejects missing OPENROUTER_API_KEY', async () => {
    const saved = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const r = await runSubAgent({
      kind: 'researcher',
      task: 'real task',
      userId: 'u-1',
    });
    expect(r.error).toMatch(/OPENROUTER_API_KEY/);
    process.env.OPENROUTER_API_KEY = saved;
  });
});
