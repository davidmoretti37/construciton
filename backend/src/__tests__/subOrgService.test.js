/**
 * subOrgService unit tests.
 *
 * Pure-function helpers (normalizeTaxId, sha256Hex) and the token issuance/
 * lookup/consume cycle with mocked Supabase. Integration-level dedup and
 * claim-flow paths are exercised here against in-memory state.
 */

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

// In-memory tables shared across the mocked Supabase client.
// Prefixed with `mock` so jest.mock hoisting doesn't reject the reference.
const mockTables = {
  sub_organizations: [],
  sub_action_tokens: [],
  profiles: [],
};
const tables = mockTables; // alias used in test bodies

function mockMakeBuilder(tableName) {
  // Minimal query-builder stub that captures filters and applies them on terminal calls.
  const filters = [];
  const updates = { fields: null };
  const inserts = { rows: null };
  let single = false;
  let maybeSingle = false;
  let returnSelected = true;

  const builder = {
    select: jest.fn(function (_cols) {
      returnSelected = true;
      return builder;
    }),
    insert: jest.fn(function (rows) {
      inserts.rows = Array.isArray(rows) ? rows : [rows];
      return builder;
    }),
    update: jest.fn(function (fields) {
      updates.fields = fields;
      return builder;
    }),
    eq: jest.fn(function (col, val) {
      filters.push({ op: 'eq', col, val });
      return builder;
    }),
    is: jest.fn(function (col, val) {
      filters.push({ op: 'is', col, val });
      return builder;
    }),
    neq: jest.fn(function (col, val) {
      filters.push({ op: 'neq', col, val });
      return builder;
    }),
    in: jest.fn(function (col, vals) {
      filters.push({ op: 'in', col, vals });
      return builder;
    }),
    not: jest.fn(function (col, op, val) {
      filters.push({ op: 'not', col, sub_op: op, val });
      return builder;
    }),
    or: jest.fn(function () {
      return builder;
    }),
    lte: jest.fn(function () { return builder; }),
    order: jest.fn(function () { return builder; }),
    limit: jest.fn(function () { return builder; }),
    single: jest.fn(function () { single = true; return runTerminal(); }),
    maybeSingle: jest.fn(function () { maybeSingle = true; return runTerminal(); }),
    then: jest.fn((onFulfilled) => Promise.resolve(runQuery()).then(onFulfilled)),
  };

  function applyFilters(rows) {
    return rows.filter((r) => filters.every((f) => {
      if (f.op === 'eq') return r[f.col] === f.val;
      if (f.op === 'is') return f.val === null ? r[f.col] === null || r[f.col] === undefined : r[f.col] === f.val;
      if (f.op === 'neq') return r[f.col] !== f.val;
      if (f.op === 'in') return Array.isArray(f.vals) && f.vals.includes(r[f.col]);
      if (f.op === 'not') return r[f.col] !== null && r[f.col] !== undefined;
      return true;
    }));
  }

  function runQuery() {
    if (inserts.rows) {
      const created = inserts.rows.map((row) => {
        const id = row.id || `mock-${tableName}-${mockTables[tableName].length + 1}`;
        const created_at = row.created_at || new Date().toISOString();
        const updated_at = row.updated_at || created_at;
        const final = { id, created_at, updated_at, ...row };
        mockTables[tableName].push(final);
        return final;
      });
      if (single) return Promise.resolve({ data: created[0], error: null });
      if (maybeSingle) return Promise.resolve({ data: created[0] || null, error: null });
      return Promise.resolve({ data: created, error: null });
    }
    if (updates.fields) {
      const matches = applyFilters(mockTables[tableName]);
      matches.forEach((row) => Object.assign(row, updates.fields, { updated_at: new Date().toISOString() }));
      if (single) return Promise.resolve({ data: matches[0] || null, error: null });
      if (maybeSingle) return Promise.resolve({ data: matches[0] || null, error: null });
      return Promise.resolve({ data: matches, error: null });
    }
    const matches = applyFilters(mockTables[tableName]);
    if (single) return Promise.resolve({ data: matches[0] || null, error: null });
    if (maybeSingle) return Promise.resolve({ data: matches[0] || null, error: null });
    return Promise.resolve({ data: matches, error: null });
  }

  function runTerminal() {
    return runQuery();
  }

  return builder;
}

const mockAdminCreateUser = jest.fn(async ({ email }) => ({
  data: { user: { id: `auth-${email}`, email } },
  error: null,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (tableName) => mockMakeBuilder(tableName),
    auth: {
      admin: {
        createUser: (...args) => mockAdminCreateUser(...args),
        deleteUser: jest.fn().mockResolvedValue({ error: null }),
      },
    },
  }),
}));

beforeEach(() => {
  mockTables.sub_organizations = [];
  mockTables.sub_action_tokens = [];
  mockTables.profiles = [];
  mockAdminCreateUser.mockClear();
});

const subOrgService = require('../services/subOrgService');

// =============================================================================
describe('subOrgService — pure helpers', () => {
  test('normalizeTaxId strips non-alphanumerics', () => {
    expect(subOrgService.normalizeTaxId('12-3456789')).toBe('123456789');
    expect(subOrgService.normalizeTaxId('  AB.CD-12 ')).toBe('ABCD12');
    expect(subOrgService.normalizeTaxId(null)).toBeNull();
    expect(subOrgService.normalizeTaxId('')).toBeNull();
  });

  test('sha256Hex returns a 64-char hex string', () => {
    const out = subOrgService.sha256Hex('hello');
    expect(out).toHaveLength(64);
    expect(out).toMatch(/^[0-9a-f]+$/);
  });
});

// =============================================================================
describe('subOrgService — addSubByGc dedup', () => {
  test('first add creates new sub_organization + first_claim token', async () => {
    const result = await subOrgService.addSubByGc({
      gcUserId: 'gc-1',
      legalName: "Mike's Plumbing",
      primaryEmail: 'mike@plumb.com',
      taxId: '12-3456789',
    });

    expect(result.was_existing).toBe(false);
    expect(result.sub_organization.legal_name).toBe("Mike's Plumbing");
    expect(result.sub_organization.tax_id).toBe('123456789');
    expect(result.action_token).not.toBeNull();
    expect(result.action_token.scope).toBe('first_claim');
    expect(result.action_token.raw).toMatch(/.{20,}/);
    expect(mockTables.sub_organizations).toHaveLength(1);
    expect(mockTables.sub_action_tokens).toHaveLength(1);
  });

  test('second add with same EIN is deduped — no new sub, no new token', async () => {
    await subOrgService.addSubByGc({
      gcUserId: 'gc-1',
      legalName: "Mike's Plumbing",
      primaryEmail: 'mike@plumb.com',
      taxId: '12-3456789',
    });

    const second = await subOrgService.addSubByGc({
      gcUserId: 'gc-2',
      legalName: 'Mikes Plumb LLC',
      primaryEmail: 'office@plumb.com',
      taxId: '123456789', // same EIN, formatted differently
    });

    expect(second.was_existing).toBe(true);
    expect(second.sub_organization.legal_name).toBe("Mike's Plumbing"); // original
    expect(second.action_token).toBeNull();
    expect(mockTables.sub_organizations).toHaveLength(1);
  });

  test('add without taxId always creates new (no dedup possible)', async () => {
    await subOrgService.addSubByGc({
      gcUserId: 'gc-1',
      legalName: 'Anon Plumbing',
      primaryEmail: 'a@p.com',
    });
    await subOrgService.addSubByGc({
      gcUserId: 'gc-1',
      legalName: 'Anon Plumbing 2',
      primaryEmail: 'b@p.com',
    });
    expect(mockTables.sub_organizations).toHaveLength(2);
  });
});

// =============================================================================
describe('subOrgService — action tokens', () => {
  test('issued tokens are single-use, expire-aware, and lookup-able by raw value', async () => {
    // Seed a sub_org
    mockTables.sub_organizations.push({
      id: 'sub-1', legal_name: 'X', primary_email: 'x@x.x',
      country_code: 'US', tax_id_type: 'ein', deleted_at: null,
    });

    const issued = await subOrgService.issueActionToken({
      subOrganizationId: 'sub-1',
      scope: 'upload_doc',
      docTypeRequested: 'coi_gl',
    });
    expect(issued.raw).toBeDefined();
    expect(mockTables.sub_action_tokens).toHaveLength(1);

    const found = await subOrgService.lookupActionToken(issued.raw);
    expect(found).not.toBeNull();
    expect(found.scope).toBe('upload_doc');

    // Wrong token returns null
    const bad = await subOrgService.lookupActionToken('not-a-real-token');
    expect(bad).toBeNull();

    // Consume + lookup again returns null
    await subOrgService.consumeActionToken(issued.id);
    const reused = await subOrgService.lookupActionToken(issued.raw);
    expect(reused).toBeNull();
  });

  test('expired tokens are not returned by lookup', async () => {
    mockTables.sub_organizations.push({
      id: 'sub-2', legal_name: 'Y', primary_email: 'y@y.y',
      country_code: 'US', tax_id_type: 'ein', deleted_at: null,
    });

    const issued = await subOrgService.issueActionToken({
      subOrganizationId: 'sub-2',
      scope: 'upload_doc',
    });

    // Manually expire
    const row = mockTables.sub_action_tokens.find((t) => t.id === issued.id);
    row.expires_at = new Date(Date.now() - 60_000).toISOString();

    const found = await subOrgService.lookupActionToken(issued.raw);
    expect(found).toBeNull();
  });

  test('rejects unknown scope', async () => {
    await expect(
      subOrgService.issueActionToken({ subOrganizationId: 'sub-1', scope: 'not_a_real_scope' })
    ).rejects.toThrow(/unknown token scope/);
  });
});

// =============================================================================
describe('subOrgService — claimSubAccount + upgradeSubToOwner', () => {
  beforeEach(() => {
    mockTables.sub_organizations.push({
      id: 'sub-claim-1',
      legal_name: 'Mike',
      primary_email: 'mike@p.com',
      country_code: 'US',
      tax_id_type: 'ein',
      auth_user_id: null,
      deleted_at: null,
    });
  });

  test('claimSubAccount creates auth user, profile, and links sub_org', async () => {
    const result = await subOrgService.claimSubAccount({
      subOrganizationId: 'sub-claim-1',
      email: 'mike@p.com',
      password: 'supersecure123',
    });

    expect(mockAdminCreateUser).toHaveBeenCalledWith(expect.objectContaining({
      email: 'mike@p.com',
      password: 'supersecure123',
      email_confirm: true,
    }));
    expect(result.user.id).toBe('auth-mike@p.com');
    expect(mockTables.profiles).toHaveLength(1);
    expect(mockTables.profiles[0]).toMatchObject({
      id: 'auth-mike@p.com',
      role: 'sub',
      subscription_tier: 'free',
    });
    const sub = mockTables.sub_organizations.find((s) => s.id === 'sub-claim-1');
    expect(sub.auth_user_id).toBe('auth-mike@p.com');
    expect(sub.claimed_at).toBeTruthy();
  });

  test('upgradeSubToOwner flips subscription_tier and stamps upgraded_at', async () => {
    // First claim
    await subOrgService.claimSubAccount({
      subOrganizationId: 'sub-claim-1',
      email: 'mike@p.com',
      password: 'supersecure123',
    });

    const upgraded = await subOrgService.upgradeSubToOwner({
      subOrganizationId: 'sub-claim-1',
    });

    expect(upgraded.upgraded_at).toBeTruthy();
    const profile = mockTables.profiles[0];
    expect(profile.subscription_tier).toBe('solo');
  });

  test('upgradeSubToOwner refuses to upgrade an unclaimed sub', async () => {
    await expect(
      subOrgService.upgradeSubToOwner({ subOrganizationId: 'sub-claim-1' })
    ).rejects.toThrow(/has not claimed/);
  });
});
