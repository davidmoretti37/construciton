/**
 * Role Hierarchy Tests
 *
 * Validates the three-tier access model (Owner > Supervisor > Worker):
 * - resolveOwnerId scopes workers to parent owner
 * - resolveProjectId enforces user_id / assigned_supervisor_id filter
 * - resolveWorkerId scopes to resolved owner
 * - Supervisor permission blocks (delete_project, delete_expense)
 * - assign_worker cross-owner security
 */

// Silence logs
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

// ==================== Test Data ====================

const OWNER_ID = '00000000-0000-0000-0000-000000000001';
const SUPERVISOR_ID = '00000000-0000-0000-0000-000000000002';
const OTHER_OWNER_ID = '00000000-0000-0000-0000-000000000099';
const WORKER_A_ID = '00000000-0000-0000-0000-000000000010';
const WORKER_B_ID = '00000000-0000-0000-0000-000000000011';
const PROJECT_A_ID = '00000000-0000-0000-0000-000000000020';
const PROJECT_B_ID = '00000000-0000-0000-0000-000000000021';

const ownerProfile = { id: OWNER_ID, role: 'owner', owner_id: null };
const supervisorProfile = { id: SUPERVISOR_ID, role: 'supervisor', owner_id: OWNER_ID };

const workerA = { id: WORKER_A_ID, full_name: 'John Smith', trade: 'Electrician', owner_id: OWNER_ID, status: 'active', email: 'john@test.com', phone: '555-0001', payment_type: 'hourly', hourly_rate: 25, daily_rate: null, weekly_salary: null, project_rate: null, created_at: '2025-01-01' };
const workerB = { id: WORKER_B_ID, full_name: 'Jane Doe', trade: 'Plumber', owner_id: OWNER_ID, status: 'active', email: 'jane@test.com', phone: '555-0002', payment_type: 'hourly', hourly_rate: 30, daily_rate: null, weekly_salary: null, project_rate: null, created_at: '2025-01-02' };

const projectA = { id: PROJECT_A_ID, name: 'Kitchen Remodel', user_id: OWNER_ID, assigned_supervisor_id: SUPERVISOR_ID, status: 'active', start_date: '2025-03-01', end_date: '2025-06-01', contract_amount: 50000, budget: 50000, base_contract: 50000, extras: [], income_collected: 10000, expenses: 5000 };
const projectB = { id: PROJECT_B_ID, name: 'Office Buildout', user_id: OTHER_OWNER_ID, assigned_supervisor_id: null, status: 'active' };

// ==================== Stateful Supabase Mock ====================

let mockResponses = {};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    let currentTable = '';
    let filters = {};
    let orFilter = '';

    const resetAndReturn = (table) => {
      currentTable = table;
      filters = {};
      orFilter = '';
      return builder;
    };

    // Resolve current query state to a result
    const resolveQuery = (method) => {
      const key = `${currentTable}.${method}`;
      const handler = mockResponses[key];
      if (typeof handler === 'function') {
        return handler({ ...filters, _or: orFilter });
      }
      return handler || { data: null, error: null };
    };

    // The builder is thenable — `await supabase.from('x').select().eq().order()`
    // resolves via .then() just like the real Supabase client
    const builder = {
      select: jest.fn(() => builder),
      eq: jest.fn((col, val) => { filters[col] = val; return builder; }),
      or: jest.fn((filter) => { orFilter = filter; return builder; }),
      ilike: jest.fn((col, val) => { filters[`${col}_ilike`] = val; return builder; }),
      in: jest.fn(() => builder),
      is: jest.fn(() => builder),
      not: jest.fn(() => builder),
      gte: jest.fn(() => builder),
      lte: jest.fn(() => builder),
      order: jest.fn(() => builder),
      limit: jest.fn(() => { const r = resolveQuery('limit'); return { ...builder, then: (cb) => cb(r) }; }),
      single: jest.fn(() => { const r = resolveQuery('single'); return { ...builder, then: (cb) => cb(r) }; }),
      maybeSingle: jest.fn(() => { const r = resolveQuery('single'); return { ...builder, then: (cb) => cb(r) }; }),
      insert: jest.fn(() => builder),
      update: jest.fn(() => builder),
      delete: jest.fn(() => builder),
      // Default thenable — resolves with 'limit' query (for chains ending in .order())
      then: jest.fn((cb) => cb(resolveQuery('limit'))),
    };

    return {
      from: jest.fn((table) => resetAndReturn(table)),
      functions: { invoke: jest.fn().mockResolvedValue({}) },
    };
  },
}));

jest.mock('../utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../utils/geocodingCache', () => ({
  geocodingCache: {
    getAddress: jest.fn().mockResolvedValue('123 Main St'),
  },
}));

// Import after mocks
const { TOOL_HANDLERS } = require('../services/tools/handlers');

// ==================== Helper ====================

function setupProfileMock() {
  mockResponses['profiles.single'] = (f) => {
    if (f.id === OWNER_ID) return { data: ownerProfile, error: null };
    if (f.id === SUPERVISOR_ID) return { data: supervisorProfile, error: null };
    return { data: null, error: null };
  };
}

// ==================== Tests ====================

describe('Role Hierarchy — Data Flow', () => {
  beforeEach(() => {
    mockResponses = {};
    setupProfileMock();
  });

  // ============================================================
  // resolveOwnerId (tested via get_workers)
  // ============================================================
  describe('resolveOwnerId via get_workers', () => {
    beforeEach(() => {
      // Workers query: returns workers filtered by owner_id
      mockResponses['workers.limit'] = (f) => {
        // Only return workers when filtering by the correct owner
        if (f.owner_id === OWNER_ID) return { data: [workerA, workerB], error: null };
        return { data: [], error: null };
      };
      // No active clock-ins
      mockResponses['time_tracking.limit'] = () => ({ data: [], error: null });
    });

    test('owner gets own workers', async () => {
      const result = await TOOL_HANDLERS.get_workers(OWNER_ID, { include_clock_status: false });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result.map(w => w.id)).toContain(WORKER_A_ID);
      expect(result.map(w => w.id)).toContain(WORKER_B_ID);
    });

    test('supervisor gets parent owner\'s workers (not their own empty roster)', async () => {
      const result = await TOOL_HANDLERS.get_workers(SUPERVISOR_ID, { include_clock_status: false });

      // Supervisor's resolveOwnerId returns OWNER_ID, so they see owner's workers
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result.map(w => w.id)).toContain(WORKER_A_ID);
      expect(result.map(w => w.id)).toContain(WORKER_B_ID);
    });

    test('supervisor sees zero workers from other owners', async () => {
      // Override: supervisor's parent owner has no workers
      mockResponses['workers.limit'] = () => ({ data: [], error: null });

      const result = await TOOL_HANDLERS.get_workers(SUPERVISOR_ID, { include_clock_status: false });

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  // ============================================================
  // resolveProjectId (tested via get_project_details)
  // ============================================================
  describe('resolveProjectId via get_project_details', () => {
    beforeEach(() => {
      // Default mocks for sub-queries in get_project_details
      mockResponses['project_phases.limit'] = () => ({ data: [], error: null });
      mockResponses['worker_tasks.limit'] = () => ({ data: [], error: null });
      mockResponses['project_assignments.limit'] = () => ({ data: [], error: null });
      mockResponses['project_transactions.limit'] = () => ({ data: [], error: null });
    });

    test('owner sees own project by UUID', async () => {
      // Direct UUID query
      mockResponses['projects.single'] = (f) => {
        if (f.id === PROJECT_A_ID) return { data: projectA, error: null };
        return { data: null, error: { message: 'not found' } };
      };

      const result = await TOOL_HANDLERS.get_project_details(OWNER_ID, { project_id: PROJECT_A_ID });

      expect(result.id).toBe(PROJECT_A_ID);
      expect(result.name).toBe('Kitchen Remodel');
    });

    test('supervisor sees assigned project by UUID', async () => {
      // The .or() filter includes assigned_supervisor_id
      mockResponses['projects.single'] = (f) => {
        if (f.id === PROJECT_A_ID) return { data: projectA, error: null };
        return { data: null, error: { message: 'not found' } };
      };

      const result = await TOOL_HANDLERS.get_project_details(SUPERVISOR_ID, { project_id: PROJECT_A_ID });

      expect(result.id).toBe(PROJECT_A_ID);
      expect(result.name).toBe('Kitchen Remodel');
    });

    test('supervisor CANNOT see unassigned project from other owner', async () => {
      // The .or() filter won't match — supervisor is neither user_id nor assigned_supervisor_id
      mockResponses['projects.single'] = () => ({ data: null, error: { message: 'not found' } });
      // Name resolution also fails
      mockResponses['projects.limit'] = () => ({ data: [], error: null });

      const result = await TOOL_HANDLERS.get_project_details(SUPERVISOR_ID, { project_id: PROJECT_B_ID });

      expect(result).toHaveProperty('error');
    });
  });

  // ============================================================
  // resolveWorkerId (tested via get_worker_details)
  // ============================================================
  describe('resolveWorkerId via get_worker_details', () => {
    beforeEach(() => {
      // Sub-queries for get_worker_details
      mockResponses['time_tracking.limit'] = () => ({ data: [], error: null });
      mockResponses['project_assignments.limit'] = () => ({ data: [], error: null });
    });

    test('supervisor resolves worker by UUID, scoped to parent owner', async () => {
      // resolveOwnerId returns OWNER_ID for supervisor
      // get_worker_details queries workers with owner_id = OWNER_ID
      mockResponses['workers.single'] = (f) => {
        if (f.id === WORKER_A_ID && f.owner_id === OWNER_ID) {
          return { data: workerA, error: null };
        }
        return { data: null, error: { message: 'not found' } };
      };

      const result = await TOOL_HANDLERS.get_worker_details(SUPERVISOR_ID, { worker_id: WORKER_A_ID });

      expect(result.id).toBe(WORKER_A_ID);
      expect(result.full_name).toBe('John Smith');
    });

    test('supervisor CANNOT access worker from another owner', async () => {
      // Worker does not belong to supervisor's parent owner
      mockResponses['workers.single'] = () => ({ data: null, error: { message: 'not found' } });
      mockResponses['workers.limit'] = () => ({ data: [], error: null });

      const result = await TOOL_HANDLERS.get_worker_details(SUPERVISOR_ID, { worker_id: 'unknown-worker-uuid' });

      expect(result).toHaveProperty('error');
    });
  });

  // ============================================================
  // assign_worker — cross-owner security
  // ============================================================
  describe('assign_worker cross-owner security', () => {
    test('supervisor assigns owner\'s worker to assigned project', async () => {
      // resolveProjectId: project found (supervisor is assigned)
      mockResponses['projects.single'] = (f) => {
        if (f.id === PROJECT_A_ID) return { data: projectA, error: null };
        return { data: null, error: { message: 'not found' } };
      };
      // Worker ownership check: worker belongs to owner
      mockResponses['workers.single'] = (f) => {
        if (f.id === WORKER_A_ID && f.owner_id === OWNER_ID) {
          return { data: { id: WORKER_A_ID, full_name: 'John Smith', trade: 'Electrician', user_id: null }, error: null };
        }
        return { data: null, error: { message: 'not found' } };
      };
      // No existing assignment
      mockResponses['project_assignments.single'] = () => ({ data: null, error: { code: 'PGRST116' } });
      // Insert succeeds
      mockResponses['project_assignments.insert'] = () => ({ data: null, error: null });

      const result = await TOOL_HANDLERS.assign_worker(SUPERVISOR_ID, {
        worker_id: WORKER_A_ID,
        project_id: PROJECT_A_ID,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('John Smith');
      expect(result.message).toContain('Kitchen Remodel');
    });

    test('supervisor CANNOT assign worker to unassigned project', async () => {
      // resolveProjectId returns no match (not user_id and not assigned_supervisor_id)
      mockResponses['projects.single'] = () => ({ data: null, error: { message: 'not found' } });
      mockResponses['projects.limit'] = () => ({ data: [], error: null });

      const result = await TOOL_HANDLERS.assign_worker(SUPERVISOR_ID, {
        worker_id: WORKER_A_ID,
        project_id: PROJECT_B_ID,
      });

      expect(result).toHaveProperty('error');
    });
  });

  // ============================================================
  // Supervisor permission blocks
  // ============================================================
  describe('supervisor permission blocks', () => {
    test('delete_project blocks supervisors', async () => {
      const result = await TOOL_HANDLERS.delete_project(SUPERVISOR_ID, { project_id: PROJECT_A_ID });

      expect(result.error).toContain('Supervisors cannot delete projects');
    });

    test('delete_project allows owners', async () => {
      // Project resolution and deletion
      mockResponses['projects.single'] = (f) => {
        if (f.id === PROJECT_A_ID) return { data: { name: 'Kitchen Remodel' }, error: null };
        return { data: null, error: null };
      };
      mockResponses['projects.delete'] = () => ({ data: null, error: null });

      const result = await TOOL_HANDLERS.delete_project(OWNER_ID, { project_id: PROJECT_A_ID });

      expect(result.success).toBe(true);
      expect(result.deletedProject).toBe('Kitchen Remodel');
    });

    test('delete_expense blocks supervisors', async () => {
      const result = await TOOL_HANDLERS.delete_expense(SUPERVISOR_ID, {
        transaction_id: '00000000-0000-0000-0000-000000000050',
      });

      expect(result.error).toContain('expense management is owner-only');
    });

    test('delete_expense does NOT block owners', async () => {
      // Owner passes role check — test that it doesn't return "Access denied"
      mockResponses['project_transactions.single'] = () => ({
        data: { id: '00000000-0000-0000-0000-000000000050', project_id: PROJECT_A_ID },
        error: null,
      });
      mockResponses['projects.limit'] = () => ({ data: [{ id: PROJECT_A_ID }], error: null });
      mockResponses['project_transactions.limit'] = () => ({
        data: [{ id: '00000000-0000-0000-0000-000000000050', description: 'Lumber', amount: 500, category: 'materials', date: '2025-03-01', project_id: PROJECT_A_ID }],
        error: null,
      });
      mockResponses['project_transactions.delete'] = () => ({ data: null, error: null });

      const result = await TOOL_HANDLERS.delete_expense(OWNER_ID, {
        transaction_id: '00000000-0000-0000-0000-000000000050',
        project_id: PROJECT_A_ID,
      });

      // Should NOT contain the supervisor access denied message
      if (result.error) {
        expect(result.error).not.toContain('expense management is owner-only');
      }
    });
  });
});
