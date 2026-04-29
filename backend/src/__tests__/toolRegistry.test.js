/**
 * Tool registry + approval gate tests (Phase 1).
 *
 * Covers:
 *  - Every tool in `definitions.js` has registry metadata
 *  - Metadata fields are well-formed (valid category, risk_level, etc.)
 *  - destructive + external_write tools are paired with requires_approval=true
 *  - Runtime registration (the path MCP tools will use) works
 *  - approvalGate.check returns PROCEED for read / write_safe
 *  - approvalGate.check delegates destructive + external_write paths
 *    to the destructiveGuard verifier (which we mock here)
 *  - blockedToolResult / pendingApprovalEvent shapes are stable
 */

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENROUTER_API_KEY = 'test-key';

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: jest.fn() },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}));

// Spy that approvalGate ends up exercising through destructiveGuard.
const mockVerifyDestructive = jest.fn();
jest.mock('../services/destructiveGuard', () => ({
  verifyDestructive: (...args) => mockVerifyDestructive(...args),
  isDestructive: jest.fn(),
  blockedToolResult: jest.fn(),
  DESTRUCTIVE_TOOLS: new Set(),
}));

const { toolDefinitions } = require('../services/tools/definitions');
const registry = require('../services/tools/registry');
const { CATEGORIES, RISK_LEVELS, MODEL_TIERS, VALID_RISK_LEVELS, VALID_MODEL_TIERS } = require('../services/tools/categories');
const approvalGate = require('../services/approvalGate');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

beforeEach(() => {
  mockVerifyDestructive.mockReset();
});

describe('Tool registry — metadata coverage', () => {
  test('every tool in definitions.js has registry metadata', () => {
    const definedNames = toolDefinitions.map(t => t.function.name);
    const missing = definedNames.filter(n => !registry.getMetadata(n));
    expect(missing).toEqual([]);
  });

  test('the memory tool is registered (added at runtime in agentService)', () => {
    expect(registry.getMetadata('memory')).toBeTruthy();
  });

  test('every metadata entry has all required fields with valid values', () => {
    for (const name of registry.listAll()) {
      const m = registry.getMetadata(name);
      expect(m).toBeDefined();
      expect(typeof m.category).toBe('string');
      expect(VALID_RISK_LEVELS.has(m.risk_level)).toBe(true);
      expect(typeof m.requires_approval).toBe('boolean');
      expect(VALID_MODEL_TIERS.has(m.model_tier_required)).toBe(true);
      expect(Array.isArray(m.tags)).toBe(true);
    }
  });

  test('destructive and external_write tools are paired with requires_approval=true', () => {
    const violations = [];
    for (const name of registry.listAll()) {
      const m = registry.getMetadata(name);
      if (m.risk_level === RISK_LEVELS.WRITE_DESTRUCTIVE && !m.requires_approval) {
        violations.push(`${name}: write_destructive without requires_approval`);
      }
      if (m.risk_level === RISK_LEVELS.EXTERNAL_WRITE && !m.requires_approval) {
        violations.push(`${name}: external_write without requires_approval`);
      }
    }
    expect(violations).toEqual([]);
  });

  test('no tool has requires_approval=true with a non-gated risk level', () => {
    // Approval=true on read or write_safe would silently never gate.
    const violations = [];
    for (const name of registry.listAll()) {
      const m = registry.getMetadata(name);
      if (m.requires_approval && m.risk_level !== RISK_LEVELS.WRITE_DESTRUCTIVE && m.risk_level !== RISK_LEVELS.EXTERNAL_WRITE) {
        violations.push(`${name}: requires_approval with non-gated risk_level=${m.risk_level}`);
      }
    }
    expect(violations).toEqual([]);
  });

  test('summary() returns a sensible breakdown', () => {
    const s = registry.summary();
    expect(s.total).toBeGreaterThan(50);
    expect(s.byCategory[CATEGORIES.PROJECTS]).toBeGreaterThan(0);
    expect(s.byCategory[CATEGORIES.DOCUMENTS]).toBeGreaterThan(0);
    expect(s.byRiskLevel[RISK_LEVELS.READ]).toBeGreaterThan(0);
    expect(s.byRiskLevel[RISK_LEVELS.WRITE_DESTRUCTIVE]).toBeGreaterThan(0);
  });
});

describe('Tool registry — lookups', () => {
  test('isReadOnly / isDestructive / isExternalWrite mirror metadata', () => {
    expect(registry.isReadOnly('search_projects')).toBe(true);
    expect(registry.isReadOnly('delete_project')).toBe(false);

    expect(registry.isDestructive('delete_project')).toBe(true);
    expect(registry.isDestructive('void_invoice')).toBe(true);
    expect(registry.isDestructive('search_projects')).toBe(false);

    // share_document and request_signature are the active external_write
    // tools (send_sms is disabled at the product level for now).
    expect(registry.isExternalWrite('share_document')).toBe(true);
    expect(registry.isExternalWrite('request_signature')).toBe(true);
    expect(registry.isExternalWrite('record_expense')).toBe(false);
  });

  test('getToolsByCategory returns only tools with that category', () => {
    const docs = registry.getToolsByCategory(CATEGORIES.DOCUMENTS);
    expect(docs).toContain('share_document');
    expect(docs).toContain('request_signature');
    expect(docs).not.toContain('search_projects');

    const invoices = registry.getToolsByCategory(CATEGORIES.INVOICES);
    expect(invoices).toContain('search_invoices');
    expect(invoices).toContain('void_invoice');
    expect(invoices).not.toContain('search_projects');
  });

  test('getToolsByCategory accepts an array of categories', () => {
    const fin = registry.getToolsByCategory([
      CATEGORIES.INVOICES,
      CATEGORIES.EXPENSES,
      CATEGORIES.BANK,
    ]);
    expect(fin.length).toBeGreaterThanOrEqual(7);
    expect(fin).toContain('search_invoices');
    expect(fin).toContain('record_expense');
    expect(fin).toContain('get_bank_transactions');
  });

  test('getToolsByTag finds cross-cutting tools', () => {
    const audit = registry.getToolsByTag('audit');
    expect(audit).toContain('query_event_history');
    expect(audit).toContain('who_changed');
  });
});

describe('Tool registry — runtime registration (the MCP path)', () => {
  test('register() accepts a well-formed metadata object', () => {
    registry.register({
      name: 'mcp_test_external_write',
      definition: { type: 'function', function: { name: 'mcp_test_external_write', description: 'test' } },
      handler: async () => ({ ok: true }),
      metadata: {
        category: 'mcp_test',
        risk_level: RISK_LEVELS.EXTERNAL_WRITE,
        requires_approval: true,
        model_tier_required: MODEL_TIERS.HAIKU,
        tags: ['external'],
      },
    });
    expect(registry.getMetadata('mcp_test_external_write')).toBeDefined();
    expect(registry.isExternalWrite('mcp_test_external_write')).toBe(true);
    expect(registry.requiresApproval('mcp_test_external_write')).toBe(true);
  });

  test('register() rejects invalid risk_level', () => {
    expect(() => registry.register({
      name: 'bad_risk',
      metadata: { category: CATEGORIES.PROJECTS, risk_level: 'unknown', requires_approval: true, model_tier_required: 'haiku', tags: [] },
    })).toThrow(/risk_level/);
  });

  test('register() rejects invalid category (uppercase)', () => {
    expect(() => registry.register({
      name: 'bad_category',
      metadata: { category: 'PROJECTS', risk_level: RISK_LEVELS.READ, requires_approval: false, model_tier_required: 'haiku', tags: [] },
    })).toThrow(/category/);
  });

  test('register() accepts mcp_<provider> categories without further config', () => {
    expect(() => registry.register({
      name: 'mcp_quickbooks_charge',
      metadata: { category: 'mcp_quickbooks', risk_level: RISK_LEVELS.EXTERNAL_WRITE, requires_approval: true, model_tier_required: 'haiku', tags: ['external'] },
    })).not.toThrow();
  });
});

describe('approvalGate — branching by risk_level', () => {
  test('PROCEED for read tools', async () => {
    const r = await approvalGate.check({
      toolName: 'search_projects',
      toolArgs: {},
      messages: [],
    });
    expect(r.verdict).toBe('PROCEED');
    expect(mockVerifyDestructive).not.toHaveBeenCalled();
  });

  test('PROCEED for write_safe tools', async () => {
    const r = await approvalGate.check({
      toolName: 'record_expense',
      toolArgs: { amount: 100 },
      messages: [],
    });
    expect(r.verdict).toBe('PROCEED');
    expect(mockVerifyDestructive).not.toHaveBeenCalled();
  });

  test('write_destructive defers to destructiveGuard verifier', async () => {
    mockVerifyDestructive.mockResolvedValue({ verdict: 'PROCEED', reason: '' });
    const r = await approvalGate.check({
      toolName: 'delete_project',
      toolArgs: { project_id: 'abc' },
      messages: [],
    });
    expect(r.verdict).toBe('PROCEED');
    expect(mockVerifyDestructive).toHaveBeenCalled();
  });

  test('write_destructive BLOCK includes action_summary + next_step', async () => {
    mockVerifyDestructive.mockResolvedValue({ verdict: 'BLOCK', reason: 'no consent' });
    const r = await approvalGate.check({
      toolName: 'delete_project',
      toolArgs: { project_id: 'abc-123' },
      messages: [],
    });
    expect(r.verdict).toBe('BLOCK');
    expect(r.risk_level).toBe(RISK_LEVELS.WRITE_DESTRUCTIVE);
    expect(r.action_summary).toMatch(/Delete project abc-123/i);
    expect(r.next_step).toBeTruthy();
  });

  test('external_write blocks with the same verifier and "send" copy', async () => {
    mockVerifyDestructive.mockResolvedValue({ verdict: 'BLOCK', reason: 'awaiting confirmation' });
    const r = await approvalGate.check({
      toolName: 'share_document',
      toolArgs: { document_type: 'estimate', client_name: 'Smith', method: 'email' },
      messages: [],
    });
    expect(r.verdict).toBe('BLOCK');
    expect(r.risk_level).toBe(RISK_LEVELS.EXTERNAL_WRITE);
    expect(r.action_summary).toMatch(/Share/i);
    expect(r.next_step).toMatch(/Send this now/i);
  });

  test('unknown tool blocks (defensive)', async () => {
    const r = await approvalGate.check({
      toolName: 'totally_made_up_tool_name',
      toolArgs: {},
      messages: [],
    });
    expect(r.verdict).toBe('BLOCK');
    expect(r.reason).toMatch(/registry/i);
  });
});

describe('approvalGate — synthesized payloads', () => {
  test('blockedToolResult wraps the gate verdict for the agent', () => {
    const result = approvalGate.blockedToolResult('delete_project', {
      verdict: 'BLOCK',
      reason: 'r',
      risk_level: RISK_LEVELS.WRITE_DESTRUCTIVE,
      action_summary: 'Delete project X',
      next_step: 'Ask confirm',
    });
    expect(result.blocked).toBe(true);
    expect(result.tool).toBe('delete_project');
    expect(result.action_summary).toBe('Delete project X');
  });

  test('pendingApprovalEvent produces a stable SSE shape', () => {
    const evt = approvalGate.pendingApprovalEvent('share_document', { document_type: 'estimate', client_name: 'Smith', method: 'email' }, {
      verdict: 'BLOCK',
      reason: 'r',
      risk_level: RISK_LEVELS.EXTERNAL_WRITE,
      action_summary: 'Share estimate with Smith via email',
    });
    expect(evt.type).toBe('pending_approval');
    expect(evt.tool).toBe('share_document');
    expect(evt.action_summary).toMatch(/Share/i);
    expect(evt.risk_level).toBe(RISK_LEVELS.EXTERNAL_WRITE);
  });
});
