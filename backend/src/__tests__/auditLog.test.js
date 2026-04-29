/**
 * Audit Log Tests
 *
 * Covers the middleware and direct-call API:
 *   - redactSensitive strips passwords/tokens/api keys
 *   - recordAudit writes a row through the supabase client
 *   - auditLog middleware fetches before-state, lets the handler
 *     run, then records the audit row asynchronously
 *   - Recursion guard prevents writes to audit_log
 *   - Bulk helper rolls up to a single row with item_count
 */

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENROUTER_API_KEY = 'test-openrouter-key';

// Jest only allows variables prefixed with `mock` to be referenced
// inside a jest.mock() factory — keep the names below conformant.
const mockInsertCalls = [];
const mockFetchedRows = new Map();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: jest.fn((table) => {
      const builder = {
        _table: table,
        _filters: {},
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(function (col, val) {
          this._filters[col] = val;
          return this;
        }),
        maybeSingle: jest.fn(function () {
          const row = mockFetchedRows.get(`${this._table}:${this._filters.id}`) || null;
          return Promise.resolve({ data: row, error: null });
        }),
        single: jest.fn(function () {
          const row = mockFetchedRows.get(`${this._table}:${this._filters.id}`) || null;
          return Promise.resolve({ data: row, error: row ? null : { code: 'PGRST116' } });
        }),
        insert: jest.fn(function (row) {
          mockInsertCalls.push({ table: this._table, row });
          return Promise.resolve({ data: row, error: null });
        }),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        in: jest.fn().mockReturnThis(),
      };
      return builder;
    }),
  }),
}));

const insertCalls = mockInsertCalls;
const fetchedRows = mockFetchedRows;

const {
  auditLog,
  recordAudit,
  recordBulkAudit,
  redactSensitive,
} = require('../middleware/auditLog');

beforeEach(() => {
  insertCalls.length = 0;
  fetchedRows.clear();
});

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

// --------------------------------------------------------------
// redactSensitive
// --------------------------------------------------------------
describe('redactSensitive', () => {
  test('redacts top-level password', () => {
    const input = { name: 'Joe', password: 'secret123' };
    const out = redactSensitive(input);
    expect(out.password).toBe('[REDACTED]');
    expect(out.name).toBe('Joe');
  });

  test('redacts token / api_key / refresh_token / authorization', () => {
    const input = {
      access_token: 'a',
      api_key: 'b',
      refresh_token: 'c',
      Authorization: 'd',
      apiKey: 'e',
      stripe_secret: 'f',
      ssn: '111-22-3333',
    };
    const out = redactSensitive(input);
    for (const k of Object.keys(input)) {
      expect(out[k]).toBe('[REDACTED]');
    }
  });

  test('redacts nested secrets', () => {
    // Note: an outer key like `tokens` would itself match the sensitive
    // pattern and get redacted whole — verifying that recursion still
    // reaches sensitive children requires a non-sensitive wrapper.
    const input = {
      user: { name: 'Joe', password: 'x', meta: { apiKey: 'k' } },
      sessions: [{ value: 'v', token: 't' }],
    };
    const out = redactSensitive(input);
    expect(out.user.password).toBe('[REDACTED]');
    expect(out.user.meta.apiKey).toBe('[REDACTED]');
    expect(out.sessions[0].token).toBe('[REDACTED]');
    expect(out.sessions[0].value).toBe('v');
  });

  test('redacts an outer array key whose name matches the pattern', () => {
    const out = redactSensitive({ tokens: [{ token: 't' }], password: 'x' });
    // `tokens` matches /token/i so the whole value collapses.
    expect(out.tokens).toBe('[REDACTED]');
    expect(out.password).toBe('[REDACTED]');
  });

  test('preserves null and primitives', () => {
    expect(redactSensitive(null)).toBeNull();
    expect(redactSensitive('hello')).toBe('hello');
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(true)).toBe(true);
  });

  test('handles arrays', () => {
    const out = redactSensitive([{ password: 'x' }, { name: 'a' }]);
    expect(out[0].password).toBe('[REDACTED]');
    expect(out[1].name).toBe('a');
  });
});

// --------------------------------------------------------------
// recordAudit
// --------------------------------------------------------------
describe('recordAudit', () => {
  test('inserts a row when called with required fields', async () => {
    await recordAudit({
      companyId: 'company-1',
      actorUserId: 'user-1',
      actorType: 'user',
      action: 'update',
      entityType: 'project',
      entityId: 'project-1',
      beforeJson: { name: 'A' },
      afterJson: { name: 'B' },
    });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('audit_log');
    expect(insertCalls[0].row.company_id).toBe('company-1');
    expect(insertCalls[0].row.action).toBe('update');
    expect(insertCalls[0].row.entity_type).toBe('project');
  });

  test('redacts sensitive fields in before/after JSON', async () => {
    await recordAudit({
      companyId: 'c',
      action: 'update',
      entityType: 'profile',
      entityId: 'p',
      beforeJson: { password: 'secret', name: 'Joe' },
      afterJson: { password: 'new-secret', name: 'Joe' },
    });
    expect(insertCalls[0].row.before_json.password).toBe('[REDACTED]');
    expect(insertCalls[0].row.after_json.password).toBe('[REDACTED]');
    expect(insertCalls[0].row.after_json.name).toBe('Joe');
  });

  test('skips write for the audit_log entity (recursion guard)', async () => {
    await recordAudit({
      companyId: 'c',
      action: 'update',
      entityType: 'audit_log',
      entityId: 'x',
    });
    expect(insertCalls).toHaveLength(0);
  });

  test('skips write when companyId is missing', async () => {
    await recordAudit({
      action: 'update',
      entityType: 'project',
      entityId: 'x',
    });
    expect(insertCalls).toHaveLength(0);
  });

  test('skips write when action or entityType is missing', async () => {
    await recordAudit({ companyId: 'c', entityType: 'project' });
    await recordAudit({ companyId: 'c', action: 'update' });
    expect(insertCalls).toHaveLength(0);
  });
});

// --------------------------------------------------------------
// recordBulkAudit
// --------------------------------------------------------------
describe('recordBulkAudit', () => {
  test('rolls up to a single row with item_count and bulk_ prefix', async () => {
    await recordBulkAudit({
      companyId: 'c',
      action: 'update',
      entityType: 'transaction',
      itemCount: 17,
    });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].row.action).toBe('bulk_update');
    expect(insertCalls[0].row.item_count).toBe(17);
    expect(insertCalls[0].row.entity_id).toBeNull();
  });

  test('does not double-prefix bulk_ when action already starts with it', async () => {
    await recordBulkAudit({
      companyId: 'c',
      action: 'bulk_create',
      entityType: 'transaction',
      itemCount: 3,
    });
    expect(insertCalls[0].row.action).toBe('bulk_create');
  });
});

// --------------------------------------------------------------
// auditLog middleware
// --------------------------------------------------------------
function makeReq(overrides = {}) {
  return {
    method: 'PATCH',
    params: { id: 'project-1' },
    body: {},
    user: { id: 'user-1' },
    headers: { 'user-agent': 'jest-test', 'x-client': 'mobile' },
    ip: '1.2.3.4',
    ...overrides,
  };
}

function makeRes() {
  const listeners = {};
  const res = {
    statusCode: 200,
    json: jest.fn(function (body) { res._body = body; return res; }),
    status: jest.fn(function (code) { res.statusCode = code; return res; }),
    on: jest.fn((event, fn) => { listeners[event] = fn; }),
    fire: (event) => listeners[event] && listeners[event](),
  };
  return res;
}

describe('auditLog middleware', () => {
  test('fetches before-state on PATCH and writes audit row on success', async () => {
    fetchedRows.set('projects:project-1', { id: 'project-1', name: 'Old', owner_id: 'company-1' });

    const middleware = auditLog({ entityType: 'project', table: 'projects' });
    const req = makeReq({ method: 'PATCH' });
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();

    // Simulate handler updating the row and calling res.json
    fetchedRows.set('projects:project-1', { id: 'project-1', name: 'New', owner_id: 'company-1' });
    res.json({ id: 'project-1', name: 'New' });
    res.statusCode = 200;
    res.fire('finish');

    // Allow microtask queue to drain.
    await new Promise(setImmediate);

    const auditWrite = insertCalls.find(c => c.table === 'audit_log');
    expect(auditWrite).toBeDefined();
    expect(auditWrite.row.action).toBe('update');
    expect(auditWrite.row.before_json.name).toBe('Old');
    expect(auditWrite.row.after_json.name).toBe('New');
    expect(auditWrite.row.actor_user_id).toBe('user-1');
    expect(auditWrite.row.ip).toBe('1.2.3.4');
    expect(auditWrite.row.user_agent).toBe('jest-test');
    expect(auditWrite.row.source).toBe('mobile');
  });

  test('does not write on 4xx response', async () => {
    fetchedRows.set('projects:project-1', { id: 'project-1', owner_id: 'c' });

    const middleware = auditLog({ entityType: 'project', table: 'projects' });
    const req = makeReq({ method: 'DELETE' });
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);
    res.statusCode = 404;
    res.fire('finish');
    await new Promise(setImmediate);

    expect(insertCalls.find(c => c.table === 'audit_log')).toBeUndefined();
  });

  test('handles POST (create) with skipBefore', async () => {
    const middleware = auditLog({
      entityType: 'project',
      table: 'projects',
      skipBefore: true,
    });
    const req = makeReq({ method: 'POST', params: {} });
    const res = makeRes();
    await middleware(req, res, jest.fn());

    fetchedRows.set('projects:new-id', { id: 'new-id', name: 'Created', owner_id: 'company-1' });
    res.json({ id: 'new-id', name: 'Created' });
    res.statusCode = 201;
    res.fire('finish');
    await new Promise(setImmediate);

    const auditWrite = insertCalls.find(c => c.table === 'audit_log');
    expect(auditWrite).toBeDefined();
    expect(auditWrite.row.action).toBe('create');
    expect(auditWrite.row.before_json).toBeNull();
    expect(auditWrite.row.entity_id).toBe('new-id');
  });

  test('skips for unsupported methods (GET)', async () => {
    const middleware = auditLog({ entityType: 'project', table: 'projects' });
    const req = makeReq({ method: 'GET' });
    const res = makeRes();
    const next = jest.fn();
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    // No "finish" listener registered for GET.
    expect(res.on).not.toHaveBeenCalledWith('finish', expect.anything());
  });

  test('throws when constructed without entityType/table', () => {
    expect(() => auditLog({})).toThrow();
    expect(() => auditLog({ entityType: 'x' })).toThrow();
  });
});
