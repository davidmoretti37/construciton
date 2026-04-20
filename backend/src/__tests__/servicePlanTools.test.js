/**
 * Service Plan Tool Handler Tests
 *
 * Validates every service plan tool handler end-to-end with a
 * scripted in-memory Supabase client.
 */

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

const USER_ID = 'user-123';
const PLAN_ID = '11111111-2222-3333-4444-555555555555';
const WORKER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const LOCATION_ID = 'fffffff1-fff2-fff3-fff4-fffffffff555';

jest.mock('@supabase/supabase-js', () => {
  const mockState = {
    service_plans: [],
    service_locations: [],
    service_visits: [],
    project_transactions: [],
    project_documents: [],
    profiles: [{ id: 'user-123', role: 'owner' }],
    workers: [{ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', full_name: 'Test Worker', owner_id: 'user-123' }],
  };
  // Expose state through global for tests to mutate (the factory can't export directly)
  global.__SP_TEST_STATE__ = mockState;

  const rowsFor = (t) => mockState[t] || [];

  const makeQuery = (table) => {
    const filters = [];
    let limit = null;
    let isCountQuery = false;
    let updatePayload = null;
    let insertPayload = null;
    let deleteOp = false;

    const match = (row) => filters.every(f => {
      if (f.op === 'eq') return row[f.col] === f.val;
      if (f.op === 'neq') return row[f.col] !== f.val;
      if (f.op === 'in') return f.val.includes(row[f.col]);
      if (f.op === 'gte') return row[f.col] >= f.val;
      if (f.op === 'lte') return row[f.col] <= f.val;
      if (f.op === 'lt') return row[f.col] < f.val;
      if (f.op === 'is') return f.val === null ? row[f.col] == null : row[f.col] === f.val;
      if (f.op === 'not_is') return f.val === null ? row[f.col] != null : row[f.col] !== f.val;
      if (f.op === 'ilike') {
        const pattern = (f.val || '').replace(/%/g, '.*');
        return new RegExp(`^${pattern}$`, 'i').test(row[f.col] || '');
      }
      if (f.op === 'or') return true;
      return true;
    });

    const execSelect = (multi) => {
      let rows = rowsFor(table).filter(match);
      if (isCountQuery) return { count: rows.length, data: null, error: null };
      if (limit != null) rows = rows.slice(0, limit);
      if (!multi) return rows.length > 0 ? { data: rows[0], error: null } : { data: null, error: null };
      return { data: rows, error: null };
    };
    const execUpdate = (multi) => {
      const matched = rowsFor(table).filter(match);
      matched.forEach(row => Object.assign(row, updatePayload));
      return multi ? { data: matched, error: null } : { data: matched[0] || null, error: null };
    };
    const execInsert = (multi) => {
      const row = { id: 'new-id-' + Math.random().toString(36).slice(2, 8), ...insertPayload };
      rowsFor(table).push(row);
      return multi ? { data: [row], error: null } : { data: row, error: null };
    };
    const execDelete = () => {
      const kept = rowsFor(table).filter(r => !match(r));
      mockState[table] = kept;
      return { data: null, error: null };
    };

    const q = {
      select(cols, opts) {
        if (opts && opts.count === 'exact' && opts.head) isCountQuery = true;
        return q;
      },
      eq(col, val) { filters.push({ op: 'eq', col, val }); return q; },
      neq(col, val) { filters.push({ op: 'neq', col, val }); return q; },
      in(col, val) { filters.push({ op: 'in', col, val }); return q; },
      gte(col, val) { filters.push({ op: 'gte', col, val }); return q; },
      lte(col, val) { filters.push({ op: 'lte', col, val }); return q; },
      lt(col, val) { filters.push({ op: 'lt', col, val }); return q; },
      is(col, val) { filters.push({ op: 'is', col, val }); return q; },
      not(col, _, val) { filters.push({ op: 'not_is', col, val }); return q; },
      ilike(col, val) { filters.push({ op: 'ilike', col, val }); return q; },
      or() { filters.push({ op: 'or' }); return q; },
      order() { return q; },
      limit(n) { limit = n; return q; },
      update(p) { updatePayload = p; return q; },
      insert(p) { insertPayload = p; return q; },
      delete() { deleteOp = true; return q; },
      single() {
        if (updatePayload) return Promise.resolve(execUpdate(false));
        if (insertPayload) return Promise.resolve(execInsert(false));
        if (deleteOp) return Promise.resolve(execDelete());
        return Promise.resolve(execSelect(false));
      },
      then(resolve, reject) {
        let result;
        try {
          if (updatePayload) result = execUpdate(true);
          else if (insertPayload) result = execInsert(true);
          else if (deleteOp) result = execDelete();
          else result = execSelect(true);
        } catch (err) { result = { data: null, error: err }; }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return q;
  };

  return {
    createClient: () => ({
      auth: {
        getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null }),
      },
      from: (table) => makeQuery(table),
      storage: {
        from: () => ({ upload: jest.fn().mockResolvedValue({ error: null }) }),
      },
    }),
  };
});

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const { TOOL_HANDLERS } = require('../services/tools/handlers');

const state = () => global.__SP_TEST_STATE__;

function resetState() {
  const s = state();
  s.service_plans = [{
    id: PLAN_ID,
    owner_id: USER_ID,
    name: 'Smith Pest Control',
    service_type: 'pest control',
    status: 'active',
    billing_cycle: 'per_visit',
    price_per_visit: 150,
    monthly_rate: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
  }];
  s.service_locations = [{
    id: LOCATION_ID,
    service_plan_id: PLAN_ID,
    owner_id: USER_ID,
    name: 'Smith Residence',
    address: '123 Main St',
    access_notes: 'Gate code 1234',
    is_active: true,
  }];
  s.service_visits = [
    { id: 'v1', service_plan_id: PLAN_ID, service_location_id: LOCATION_ID, owner_id: USER_ID, status: 'completed', scheduled_date: '2026-04-01', billable: true, invoice_id: null, assigned_worker_id: WORKER_ID },
    { id: 'v2', service_plan_id: PLAN_ID, service_location_id: LOCATION_ID, owner_id: USER_ID, status: 'scheduled', scheduled_date: '2099-05-01', billable: true, invoice_id: null, assigned_worker_id: null },
  ];
  s.project_transactions = [
    { service_plan_id: PLAN_ID, type: 'income', category: 'payment', amount: 150 },
    { service_plan_id: PLAN_ID, type: 'expense', category: 'materials', amount: 40 },
  ];
  s.project_documents = [];
  s.profiles = [{ id: USER_ID, role: 'owner' }];
  s.workers = [{ id: WORKER_ID, full_name: 'Test Worker', owner_id: USER_ID }];
}

beforeEach(() => {
  resetState();
});

describe('update_service_plan', () => {
  test('updates allowed fields', async () => {
    const res = await TOOL_HANDLERS.update_service_plan(USER_ID, {
      plan_id: PLAN_ID, name: 'Renamed', price_per_visit: 175,
    });
    expect(res.success).toBe(true);
    expect(res.plan.name).toBe('Renamed');
    expect(res.plan.price_per_visit).toBe(175);
  });

  test('rejects without plan_id', async () => {
    const res = await TOOL_HANDLERS.update_service_plan(USER_ID, {});
    expect(res.error).toBe('plan_id is required');
  });

  test('rejects when no fields provided', async () => {
    const res = await TOOL_HANDLERS.update_service_plan(USER_ID, { plan_id: PLAN_ID });
    expect(res.error).toMatch(/No fields/i);
  });
});

describe('delete_service_plan', () => {
  test('owners can delete a plan by UUID', async () => {
    const res = await TOOL_HANDLERS.delete_service_plan(USER_ID, { plan_id: PLAN_ID });
    expect(res.success).toBe(true);
    expect(res.deletedPlan).toBe('Smith Pest Control');
    expect(state().service_plans.find(p => p.id === PLAN_ID)).toBeUndefined();
  });

  test('owners can delete a plan by name', async () => {
    const res = await TOOL_HANDLERS.delete_service_plan(USER_ID, { plan_id: 'Smith Pest Control' });
    expect(res.success).toBe(true);
    expect(state().service_plans.length).toBe(0);
  });

  test('supervisors are blocked', async () => {
    state().profiles = [{ id: USER_ID, role: 'supervisor' }];
    const res = await TOOL_HANDLERS.delete_service_plan(USER_ID, { plan_id: PLAN_ID });
    expect(res.error).toMatch(/Supervisors cannot delete/);
    expect(state().service_plans.length).toBe(1);
  });

  test('rejects without plan_id', async () => {
    const res = await TOOL_HANDLERS.delete_service_plan(USER_ID, {});
    expect(res.error).toBe('plan_id is required');
  });
});

describe('get_service_plan_details', () => {
  test('returns full plan detail', async () => {
    const res = await TOOL_HANDLERS.get_service_plan_details(USER_ID, { plan_id: PLAN_ID });
    expect(res.id).toBe(PLAN_ID);
    expect(res.name).toBe('Smith Pest Control');
    expect(res.locations.length).toBe(1);
    expect(res.financials.income).toBe(150);
    expect(res.financials.expenses).toBe(40);
    expect(res.financials.profit).toBe(110);
  });

  test('rejects without plan_id', async () => {
    const res = await TOOL_HANDLERS.get_service_plan_details(USER_ID, {});
    expect(res.error).toBe('plan_id is required');
  });
});

describe('get_service_plan_summary', () => {
  test('returns summary', async () => {
    const res = await TOOL_HANDLERS.get_service_plan_summary(USER_ID, { plan_id: PLAN_ID });
    expect(res.plan.id).toBe(PLAN_ID);
    expect(res.lifetime_revenue).toBe(150);
    expect(res.lifetime_profit).toBe(110);
  });
});

describe('add_service_location', () => {
  test('adds a new location', async () => {
    const before = state().service_locations.length;
    const res = await TOOL_HANDLERS.add_service_location(USER_ID, {
      plan_id: PLAN_ID, name: 'Warehouse', address: '789 Industrial Rd',
    });
    expect(res.success).toBe(true);
    expect(res.location.name).toBe('Warehouse');
    expect(state().service_locations.length).toBe(before + 1);
  });

  test('rejects missing fields', async () => {
    const res = await TOOL_HANDLERS.add_service_location(USER_ID, { plan_id: PLAN_ID, name: 'X' });
    expect(res.error).toBeTruthy();
  });
});

describe('update_service_location', () => {
  test('updates an existing location', async () => {
    const res = await TOOL_HANDLERS.update_service_location(USER_ID, {
      location_id: LOCATION_ID, name: 'Main Residence', is_active: false,
    });
    expect(res.success).toBe(true);
    expect(res.location.name).toBe('Main Residence');
    expect(res.location.is_active).toBe(false);
  });

  test('rejects without location_id', async () => {
    const res = await TOOL_HANDLERS.update_service_location(USER_ID, { name: 'X' });
    expect(res.error).toBe('location_id is required');
  });
});

describe('assign_worker_to_plan', () => {
  test('assigns worker to all upcoming visits', async () => {
    const res = await TOOL_HANDLERS.assign_worker_to_plan(USER_ID, {
      plan_id: PLAN_ID, worker_id: WORKER_ID,
    });
    expect(res.success).toBe(true);
    expect(res.plan_id).toBe(PLAN_ID);
    expect(res.worker_id).toBe(WORKER_ID);
    expect(typeof res.visits_assigned).toBe('number');
  });

  test('rejects missing inputs', async () => {
    const res = await TOOL_HANDLERS.assign_worker_to_plan(USER_ID, { plan_id: PLAN_ID });
    expect(res.error).toBeTruthy();
  });
});

describe('calculate_service_plan_revenue', () => {
  test('computes revenue breakdown', async () => {
    const res = await TOOL_HANDLERS.calculate_service_plan_revenue(USER_ID, {
      plan_id: PLAN_ID, start_date: '2026-01-01', end_date: '2026-12-31',
    });
    expect(res.plans.length).toBe(1);
    expect(typeof res.totals.projected_revenue).toBe('number');
  });

  test('defaults date range to current month', async () => {
    const res = await TOOL_HANDLERS.calculate_service_plan_revenue(USER_ID, {});
    expect(res.period.start_date).toMatch(/^\d{4}-\d{2}-01$/);
  });
});

describe('get_service_plan_documents', () => {
  test('returns empty list when no docs', async () => {
    const res = await TOOL_HANDLERS.get_service_plan_documents(USER_ID, { plan_id: PLAN_ID });
    expect(res.documents).toEqual([]);
    expect(res.count).toBe(0);
  });
});

describe('upload_service_plan_document', () => {
  test('rejects when no attachments', async () => {
    const res = await TOOL_HANDLERS.upload_service_plan_document(USER_ID, { plan_id: PLAN_ID });
    expect(res.error).toMatch(/No files/i);
  });

  test('rejects without plan_id', async () => {
    const res = await TOOL_HANDLERS.upload_service_plan_document(USER_ID, {
      _attachments: [{ name: 'x.pdf', base64: 'QQ==', mimeType: 'application/pdf' }],
    });
    expect(res.error).toBe('plan_id is required');
  });

  test('uploads a document', async () => {
    const res = await TOOL_HANDLERS.upload_service_plan_document(USER_ID, {
      plan_id: PLAN_ID,
      _attachments: [{ name: 'contract.pdf', base64: 'QQ==', mimeType: 'application/pdf' }],
    });
    expect(res.uploadedCount).toBe(1);
    expect(res.uploaded[0].fileType).toBe('pdf');
  });
});
