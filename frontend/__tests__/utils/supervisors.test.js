/**
 * Supervisor Storage Utilities Tests
 *
 * Validates that every Supabase query correctly scopes by owner_id,
 * invitation functions handle auth, and data flows correctly
 * between owner and supervisor roles.
 */

jest.mock('../../src/utils/logger', () => ({
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

// Track calls through the chainable builder
let mockChainCalls = [];
let mockChainResult = { data: null, error: null };
let mockRpcResult = { data: null, error: null };

const createChainBuilder = () => {
  const builder = {
    select: jest.fn((...args) => { mockChainCalls.push(['select', ...args]); return builder; }),
    eq: jest.fn((...args) => { mockChainCalls.push(['eq', ...args]); return builder; }),
    ilike: jest.fn((...args) => { mockChainCalls.push(['ilike', ...args]); return builder; }),
    is: jest.fn((...args) => { mockChainCalls.push(['is', ...args]); return builder; }),
    order: jest.fn((...args) => { mockChainCalls.push(['order', ...args]); return builder; }),
    limit: jest.fn((...args) => { mockChainCalls.push(['limit', ...args]); return Promise.resolve(mockChainResult); }),
    single: jest.fn(() => { mockChainCalls.push(['single']); return Promise.resolve(mockChainResult); }),
    maybeSingle: jest.fn(() => { mockChainCalls.push(['maybeSingle']); return Promise.resolve(mockChainResult); }),
    insert: jest.fn((...args) => { mockChainCalls.push(['insert', ...args]); return builder; }),
    update: jest.fn((...args) => { mockChainCalls.push(['update', ...args]); return builder; }),
    delete: jest.fn(() => { mockChainCalls.push(['delete']); return builder; }),
    // Thenable for chains ending without terminal method
    then: jest.fn((cb) => cb(mockChainResult)),
  };
  return builder;
};

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: jest.fn(),
    },
    from: jest.fn(() => createChainBuilder()),
    rpc: jest.fn(),
  },
}));

import {
  createSupervisorInvite,
  getPendingSupervisorInvites,
  acceptSupervisorInvite,
  rejectSupervisorInvite,
  cancelSupervisorInvite,
  fetchSupervisors,
  fetchPendingInvites,
  removeSupervisor,
  fetchSupervisorProjects,
  fetchSupervisorWorkers,
} from '../../src/utils/storage/supervisors';
import { supabase } from '../../src/lib/supabase';

const OWNER_ID = 'owner-uuid-1';
const SUPERVISOR_ID = 'supervisor-uuid-1';
const INVITE_ID = 'invite-uuid-1';

describe('Supervisor Storage Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChainCalls = [];
    mockChainResult = { data: null, error: null };
    mockRpcResult = { data: null, error: null };

    // Default: authenticated as owner
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: OWNER_ID } },
    });
    // Reset from() to default builder (clears any mockImplementation from prior tests)
    supabase.from.mockImplementation(() => createChainBuilder());
  });

  // ============================================================
  // createSupervisorInvite
  // ============================================================
  describe('createSupervisorInvite', () => {
    test('creates invite with correct owner_id and lowercased email', async () => {
      const inviteData = { id: INVITE_ID, owner_id: OWNER_ID, email: 'sup@test.com', status: 'pending' };
      mockChainResult = { data: inviteData, error: null };

      const result = await createSupervisorInvite({
        email: '  SUP@TEST.COM  ',
        fullName: '  Test Supervisor  ',
        phone: '  555-1234  ',
      });

      expect(supabase.from).toHaveBeenCalledWith('supervisor_invites');
      // Verify insert was called with correct data
      const insertCall = mockChainCalls.find(c => c[0] === 'insert');
      expect(insertCall).toBeTruthy();
      const insertData = insertCall[1];
      expect(insertData.owner_id).toBe(OWNER_ID);
      expect(insertData.email).toBe('sup@test.com'); // lowercased + trimmed
      expect(insertData.full_name).toBe('Test Supervisor'); // trimmed
      expect(insertData.phone).toBe('555-1234'); // trimmed
      expect(insertData.status).toBe('pending');
      expect(result).toEqual(inviteData);
    });

    test('throws when not authenticated', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

      await expect(
        createSupervisorInvite({ email: 'test@test.com' })
      ).rejects.toThrow('Not authenticated');
    });
  });

  // ============================================================
  // fetchSupervisors
  // ============================================================
  describe('fetchSupervisors', () => {
    test('calls RPC with correct owner_id', async () => {
      const supervisors = [{ id: SUPERVISOR_ID, business_name: 'Sup Co' }];
      supabase.rpc.mockResolvedValue({ data: supervisors, error: null });

      const result = await fetchSupervisors();

      expect(supabase.rpc).toHaveBeenCalledWith('get_owner_supervisors', {
        p_owner_id: OWNER_ID,
      });
      expect(result).toEqual(supervisors);
    });

    test('falls back to direct query on RPC failure', async () => {
      supabase.rpc.mockResolvedValue({ data: null, error: { message: 'RPC not found' } });

      const profiles = [{ id: SUPERVISOR_ID, business_name: 'Sup Co' }];
      mockChainResult = { data: profiles, error: null };

      const result = await fetchSupervisors();

      expect(supabase.from).toHaveBeenCalledWith('profiles');
      // Verify filters: owner_id and role=supervisor
      const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
      expect(eqCalls).toEqual(
        expect.arrayContaining([
          ['eq', 'owner_id', OWNER_ID],
          ['eq', 'role', 'supervisor'],
        ])
      );
      expect(result).toEqual(profiles);
    });

    test('throws when not authenticated', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

      await expect(fetchSupervisors()).rejects.toThrow('Not authenticated');
    });
  });

  // ============================================================
  // removeSupervisor
  // ============================================================
  describe('removeSupervisor', () => {
    test('updates profile with null owner_id, scoped by owner', async () => {
      mockChainResult = { error: null };

      await removeSupervisor(SUPERVISOR_ID);

      expect(supabase.from).toHaveBeenCalledWith('profiles');
      const updateCall = mockChainCalls.find(c => c[0] === 'update');
      expect(updateCall[1]).toEqual({ owner_id: null });
      // Both eq filters applied
      const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
      expect(eqCalls).toEqual(
        expect.arrayContaining([
          ['eq', 'id', SUPERVISOR_ID],
          ['eq', 'owner_id', OWNER_ID],
        ])
      );
    });

    test('throws when not authenticated', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

      await expect(removeSupervisor(SUPERVISOR_ID)).rejects.toThrow('Not authenticated');
    });
  });

  // ============================================================
  // cancelSupervisorInvite
  // ============================================================
  describe('cancelSupervisorInvite', () => {
    test('deletes invite scoped by owner_id', async () => {
      mockChainResult = { error: null };

      await cancelSupervisorInvite(INVITE_ID);

      expect(supabase.from).toHaveBeenCalledWith('supervisor_invites');
      expect(mockChainCalls.find(c => c[0] === 'delete')).toBeTruthy();
      const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
      expect(eqCalls).toEqual(
        expect.arrayContaining([
          ['eq', 'id', INVITE_ID],
          ['eq', 'owner_id', OWNER_ID],
        ])
      );
    });

    test('throws when not authenticated', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

      await expect(cancelSupervisorInvite(INVITE_ID)).rejects.toThrow('Not authenticated');
    });
  });

  // ============================================================
  // fetchSupervisorProjects
  // ============================================================
  describe('fetchSupervisorProjects', () => {
    test('queries projects by supervisor user_id', async () => {
      const projects = [{ id: 'p1', name: 'Kitchen Remodel', status: 'active' }];
      mockChainResult = { data: projects, error: null };

      const result = await fetchSupervisorProjects(SUPERVISOR_ID);

      expect(supabase.from).toHaveBeenCalledWith('projects');
      const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
      expect(eqCalls).toEqual(
        expect.arrayContaining([['eq', 'user_id', SUPERVISOR_ID]])
      );
      expect(result).toEqual(projects);
    });

    test('returns empty array when no projects', async () => {
      mockChainResult = { data: [], error: null };

      const result = await fetchSupervisorProjects(SUPERVISOR_ID);

      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // fetchSupervisorWorkers
  // ============================================================
  describe('fetchSupervisorWorkers', () => {
    test('queries workers by supervisor owner_id', async () => {
      const workers = [{ id: 'w1', full_name: 'John Smith', trade: 'Electrician' }];
      mockChainResult = { data: workers, error: null };

      const result = await fetchSupervisorWorkers(SUPERVISOR_ID);

      expect(supabase.from).toHaveBeenCalledWith('workers');
      const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
      expect(eqCalls).toEqual(
        expect.arrayContaining([['eq', 'owner_id', SUPERVISOR_ID]])
      );
      expect(result).toEqual(workers);
    });

    test('returns empty array when no workers', async () => {
      mockChainResult = { data: [], error: null };

      const result = await fetchSupervisorWorkers(SUPERVISOR_ID);

      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // getPendingSupervisorInvites
  // ============================================================
  describe('getPendingSupervisorInvites', () => {
    test('filters by lowercased email and pending status', async () => {
      mockChainResult = { data: [], error: null };

      await getPendingSupervisorInvites('SUP@TEST.COM');

      expect(supabase.from).toHaveBeenCalledWith('supervisor_invites');
      const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
      expect(eqCalls).toEqual(
        expect.arrayContaining([
          ['eq', 'email', 'sup@test.com'],
          ['eq', 'status', 'pending'],
        ])
      );
    });

    test('enriches invites with owner business_name', async () => {
      const invite = { id: INVITE_ID, owner_id: OWNER_ID, email: 'sup@test.com', status: 'pending' };
      // First call returns invites, second call returns owner profile
      let callCount = 0;
      supabase.from.mockImplementation((table) => {
        callCount++;
        const builder = createChainBuilder();
        if (callCount === 1) {
          // supervisor_invites query
          mockChainResult = { data: [invite], error: null };
        } else {
          // profiles query for owner
          mockChainResult = { data: { id: OWNER_ID, business_name: 'Construction Co', business_phone: '555-0000' }, error: null };
        }
        return builder;
      });

      const result = await getPendingSupervisorInvites('sup@test.com');

      expect(result).toHaveLength(1);
      expect(result[0].owner.business_name).toBe('Construction Co');
      expect(result[0].owner.id).toBe(OWNER_ID);
    });
  });

  // ============================================================
  // fetchPendingInvites
  // ============================================================
  describe('fetchPendingInvites', () => {
    test('filters by owner_id and pending status', async () => {
      const invites = [{ id: INVITE_ID, email: 'sup@test.com', status: 'pending' }];
      mockChainResult = { data: invites, error: null };

      const result = await fetchPendingInvites();

      expect(supabase.from).toHaveBeenCalledWith('supervisor_invites');
      const eqCalls = mockChainCalls.filter(c => c[0] === 'eq');
      expect(eqCalls).toEqual(
        expect.arrayContaining([
          ['eq', 'owner_id', OWNER_ID],
          ['eq', 'status', 'pending'],
        ])
      );
      expect(result).toEqual(invites);
    });

    test('throws when not authenticated', async () => {
      supabase.auth.getUser.mockResolvedValue({ data: { user: null } });

      await expect(fetchPendingInvites()).rejects.toThrow('Not authenticated');
    });
  });

  // ============================================================
  // acceptSupervisorInvite / rejectSupervisorInvite (RPC calls)
  // ============================================================
  describe('RPC invitation actions', () => {
    test('acceptSupervisorInvite calls correct RPC', async () => {
      supabase.rpc.mockResolvedValue({ data: { success: true }, error: null });

      await acceptSupervisorInvite(INVITE_ID, SUPERVISOR_ID);

      expect(supabase.rpc).toHaveBeenCalledWith('accept_supervisor_invite', {
        p_invite_id: INVITE_ID,
        p_user_id: SUPERVISOR_ID,
      });
    });

    test('rejectSupervisorInvite calls correct RPC', async () => {
      supabase.rpc.mockResolvedValue({ data: { success: true }, error: null });

      await rejectSupervisorInvite(INVITE_ID, SUPERVISOR_ID);

      expect(supabase.rpc).toHaveBeenCalledWith('reject_supervisor_invite', {
        p_invite_id: INVITE_ID,
        p_user_id: SUPERVISOR_ID,
      });
    });
  });
});
