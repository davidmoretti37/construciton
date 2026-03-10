/**
 * AuthContext Tests
 * Tests for authentication context provider, role checking, and profile loading
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import React from 'react';

// Mock React Native modules
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Alert: { alert: jest.fn() },
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })), currentState: 'active' },
}));

jest.mock('react-native-url-polyfill/auto', () => {});

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  multiRemove: jest.fn().mockResolvedValue(undefined),
}));

// Mock supabase — create jest.fn() inside factory to avoid hoisting issues
jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: jest.fn(() => ({
        data: { subscription: { unsubscribe: jest.fn() } },
      })),
      getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
      upsert: jest.fn().mockResolvedValue({ error: null }),
      update: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ error: null }),
      }),
    }),
  },
}));

jest.mock('../../src/services/agents/core/MemoryService', () => ({
  memoryService: {
    initialize: jest.fn().mockResolvedValue(undefined),
    cache: { clear: jest.fn() },
  },
}));

jest.mock('../../src/services/profileCacheService', () => ({
  saveProfileToCache: jest.fn().mockResolvedValue(undefined),
  loadProfileFromCache: jest.fn().mockResolvedValue({ profile: null, isStale: true }),
  clearProfileCache: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
}));

// Import after mocks
import { useAuth, AuthProvider } from '../../src/contexts/AuthContext';
import { supabase } from '../../src/lib/supabase';
import { loadProfileFromCache, saveProfileToCache, clearProfileCache } from '../../src/services/profileCacheService';
import { memoryService } from '../../src/services/agents/core/MemoryService';

// Get references to mock functions via import
const mockGetSession = supabase.auth.getSession;
const mockOnAuthStateChange = supabase.auth.onAuthStateChange;
const mockGetUser = supabase.auth.getUser;
const mockFrom = supabase.from;

describe('AuthContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset defaults
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: jest.fn() } },
    });
    loadProfileFromCache.mockResolvedValue({ profile: null, isStale: true });
  });

  // ============================================================
  // useAuth() default values (no provider)
  // ============================================================
  describe('useAuth() without provider', () => {
    it('should return default values when used outside AuthProvider', () => {
      const { result } = renderHook(() => useAuth());

      expect(result.current.user).toBeNull();
      expect(result.current.session).toBeNull();
      expect(result.current.role).toBeNull();
      expect(result.current.profile).toBeNull();
      expect(result.current.isLoading).toBe(true);
      expect(result.current.loadError).toBeNull();
      expect(result.current.isUsingCache).toBe(false);
      expect(result.current.isOwner).toBe(false);
      expect(result.current.isSupervisor).toBe(false);
      expect(result.current.isWorker).toBe(false);
      expect(result.current.ownerId).toBeNull();
    });

    it('should return no-op functions when used outside AuthProvider', () => {
      const { result } = renderHook(() => useAuth());

      expect(typeof result.current.setRole).toBe('function');
      expect(typeof result.current.clearRole).toBe('function');
      expect(typeof result.current.refreshProfile).toBe('function');
      expect(typeof result.current.retryProfileLoad).toBe('function');

      // Should not throw when called
      expect(() => result.current.setRole()).not.toThrow();
      expect(() => result.current.clearRole()).not.toThrow();
      expect(() => result.current.refreshProfile()).not.toThrow();
      expect(() => result.current.retryProfileLoad()).not.toThrow();
    });
  });

  // ============================================================
  // Exports
  // ============================================================
  describe('exports', () => {
    it('should export AuthProvider and useAuth', () => {
      expect(AuthProvider).toBeDefined();
      expect(typeof AuthProvider).toBe('function');
      expect(useAuth).toBeDefined();
      expect(typeof useAuth).toBe('function');
    });
  });

  // ============================================================
  // AuthProvider with no session
  // ============================================================
  describe('AuthProvider with no session', () => {
    it('should set isLoading to false when there is no session', async () => {
      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.user).toBeNull();
      expect(result.current.session).toBeNull();
      expect(result.current.role).toBeNull();
      expect(result.current.profile).toBeNull();
    });

    it('should call supabase.auth.getSession on mount', async () => {
      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(mockGetSession).toHaveBeenCalled();
      });
    });

    it('should subscribe to auth state changes on mount', async () => {
      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(mockOnAuthStateChange).toHaveBeenCalled();
      });
    });
  });

  // ============================================================
  // Role checking
  // ============================================================
  describe('role checking', () => {
    it('should set isOwner to true when role is owner', async () => {
      const mockSession = { user: { id: 'user-1' } };
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      // Mock profile query chain
      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: { id: 'user-1', role: 'owner', owner_id: null },
        error: null,
      });
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
            ilike: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
        upsert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.role).toBe('owner');
      expect(result.current.isOwner).toBe(true);
      expect(result.current.isSupervisor).toBe(false);
      expect(result.current.isWorker).toBe(false);
    });

    it('should set isSupervisor to true when role is supervisor', async () => {
      const mockSession = { user: { id: 'user-2' } };
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      const mockMaybeSingle = jest.fn()
        .mockResolvedValueOnce({
          data: { id: 'user-2', role: 'supervisor', owner_id: 'owner-1' },
          error: null,
        })
        // Second call for owner settings
        .mockResolvedValueOnce({
          data: { hide_contract_from_supervisors: false },
          error: null,
        });

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
        upsert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.role).toBe('supervisor');
      expect(result.current.isSupervisor).toBe(true);
      expect(result.current.isOwner).toBe(false);
      expect(result.current.isWorker).toBe(false);
      expect(result.current.ownerId).toBe('owner-1');
    });

    it('should set isWorker to true when role is worker', async () => {
      const mockSession = { user: { id: 'user-3' } };
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: { id: 'user-3', role: 'worker', owner_id: null },
        error: null,
      });
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
        upsert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.role).toBe('worker');
      expect(result.current.isWorker).toBe(true);
      expect(result.current.isOwner).toBe(false);
      expect(result.current.isSupervisor).toBe(false);
    });
  });

  // ============================================================
  // Profile loading and caching
  // ============================================================
  describe('profile loading', () => {
    it('should load cached profile on mount for instant UI', async () => {
      const cachedProfile = { id: 'user-1', role: 'owner', name: 'Cached User' };
      loadProfileFromCache.mockResolvedValue({ profile: cachedProfile, isStale: false });

      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(loadProfileFromCache).toHaveBeenCalled();
      });

      // Should use cached data initially
      await waitFor(() => {
        expect(result.current.profile).toEqual(cachedProfile);
      });
    });

    it('should save profile to cache after successful load', async () => {
      const mockSession = { user: { id: 'user-1' } };
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      const profileData = { id: 'user-1', role: 'owner', name: 'Test User' };
      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: profileData,
        error: null,
      });
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
        upsert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(saveProfileToCache).toHaveBeenCalledWith(profileData);
      });
    });

    it('should initialize memory service after profile load', async () => {
      const mockSession = { user: { id: 'user-1' } };
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: { id: 'user-1', role: 'owner' },
        error: null,
      });
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
        upsert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(memoryService.initialize).toHaveBeenCalledWith('user-1');
      });
    });

    it('should handle profile load error gracefully', async () => {
      const mockSession = { user: { id: 'user-1' } };
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: null,
        error: { message: 'Network error' },
      });
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
      });

      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should set loadError when profile fetch fails and no cache exists
      expect(result.current.loadError).toBe('Failed to load profile');
    });
  });

  // ============================================================
  // Supervisor hierarchy
  // ============================================================
  describe('supervisor hierarchy', () => {
    it('should set ownerHidesContract when owner setting is true', async () => {
      const mockSession = { user: { id: 'user-2' } };
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      const mockMaybeSingle = jest.fn()
        .mockResolvedValueOnce({
          data: { id: 'user-2', role: 'supervisor', owner_id: 'owner-1' },
          error: null,
        })
        .mockResolvedValueOnce({
          data: { hide_contract_from_supervisors: true },
          error: null,
        });

      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
        upsert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isSupervisor).toBe(true);
      expect(result.current.ownerId).toBe('owner-1');
      expect(result.current.ownerHidesContract).toBe(true);
    });

    it('should NOT set ownerId for owner role', async () => {
      const mockSession = { user: { id: 'user-1' } };
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: { id: 'user-1', role: 'owner', owner_id: null },
        error: null,
      });
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
        upsert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isOwner).toBe(true);
      expect(result.current.ownerId).toBeNull();
      expect(result.current.ownerHidesContract).toBe(false);
    });

    it('should NOT set ownerId for worker role', async () => {
      const mockSession = { user: { id: 'user-3' } };
      mockGetSession.mockResolvedValue({ data: { session: mockSession }, error: null });

      const mockMaybeSingle = jest.fn().mockResolvedValue({
        data: { id: 'user-3', role: 'worker', owner_id: null },
        error: null,
      });
      mockFrom.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
        upsert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      const { result } = renderHook(() => useAuth(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.isWorker).toBe(true);
      expect(result.current.ownerId).toBeNull();
      expect(result.current.ownerHidesContract).toBe(false);
    });
  });

  // ============================================================
  // Auth state change cleanup
  // ============================================================
  describe('cleanup', () => {
    it('should unsubscribe from auth changes on unmount', async () => {
      const mockUnsubscribe = jest.fn();
      mockOnAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe: mockUnsubscribe } },
      });

      const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;
      const { unmount } = renderHook(() => useAuth(), { wrapper });

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
});
