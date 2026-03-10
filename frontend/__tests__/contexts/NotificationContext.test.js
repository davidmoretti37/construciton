/**
 * NotificationContext Tests
 * Tests for notification context provider, default state, and exports
 */

import { renderHook, waitFor } from '@testing-library/react-native';
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

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
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
      maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      single: jest.fn().mockResolvedValue({ data: null, error: null }),
    }),
    channel: jest.fn().mockReturnValue({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
    }),
    removeChannel: jest.fn(),
  })),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync: jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test]' }),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
}));

jest.mock('expo-device', () => ({
  isDevice: false,
  modelName: 'Test Device',
}));

jest.mock('../../src/contexts/AuthContext', () => ({
  useAuth: jest.fn(() => ({
    user: null,
    isOwner: false,
    isWorker: false,
    isSupervisor: false,
  })),
}));

jest.mock('../../src/utils/notificationStorage', () => ({
  fetchNotifications: jest.fn().mockResolvedValue([]),
  getUnreadCount: jest.fn().mockResolvedValue(0),
  markAsRead: jest.fn().mockResolvedValue(true),
  markAllAsRead: jest.fn().mockResolvedValue(true),
  deleteNotification: jest.fn().mockResolvedValue(true),
  savePushToken: jest.fn().mockResolvedValue(undefined),
  subscribeToNotifications: jest.fn().mockReturnValue({ unsubscribe: jest.fn() }),
  getNotificationPreferences: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
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

import { useNotifications, NotificationProvider } from '../../src/contexts/NotificationContext';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  fetchNotifications,
  getUnreadCount,
  subscribeToNotifications,
} from '../../src/utils/notificationStorage';

describe('NotificationContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({
      user: null,
      isOwner: false,
      isWorker: false,
      isSupervisor: false,
    });
  });

  // ============================================================
  // useNotifications() default values (no provider)
  // ============================================================
  describe('useNotifications() without provider', () => {
    it('should return default values when used outside NotificationProvider', () => {
      const { result } = renderHook(() => useNotifications());

      expect(result.current.notifications).toEqual([]);
      expect(result.current.unreadCount).toBe(0);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.expoPushToken).toBeNull();
    });

    it('should return no-op functions when used outside provider', () => {
      const { result } = renderHook(() => useNotifications());

      expect(typeof result.current.refreshNotifications).toBe('function');
      expect(typeof result.current.markNotificationAsRead).toBe('function');
      expect(typeof result.current.markAllNotificationsAsRead).toBe('function');
      expect(typeof result.current.removeNotification).toBe('function');

      // Should not throw when called
      expect(() => result.current.refreshNotifications()).not.toThrow();
      expect(() => result.current.markNotificationAsRead('id')).not.toThrow();
      expect(() => result.current.markAllNotificationsAsRead()).not.toThrow();
      expect(() => result.current.removeNotification('id')).not.toThrow();
    });
  });

  // ============================================================
  // Exports
  // ============================================================
  describe('exports', () => {
    it('should export NotificationProvider and useNotifications', () => {
      expect(NotificationProvider).toBeDefined();
      expect(typeof NotificationProvider).toBe('function');
      expect(useNotifications).toBeDefined();
      expect(typeof useNotifications).toBe('function');
    });
  });

  // ============================================================
  // NotificationProvider with no user
  // ============================================================
  describe('NotificationProvider with no user', () => {
    it('should have empty notifications when no user is logged in', async () => {
      const wrapper = ({ children }) => (
        <NotificationProvider>{children}</NotificationProvider>
      );
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.notifications).toEqual([]);
      expect(result.current.unreadCount).toBe(0);
    });

    it('should not fetch notifications when no user is present', async () => {
      const wrapper = ({ children }) => (
        <NotificationProvider>{children}</NotificationProvider>
      );
      renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(fetchNotifications).not.toHaveBeenCalled();
      });
    });

    it('should not subscribe to realtime when no user is present', async () => {
      const wrapper = ({ children }) => (
        <NotificationProvider>{children}</NotificationProvider>
      );
      renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(subscribeToNotifications).not.toHaveBeenCalled();
      });
    });
  });

  // ============================================================
  // NotificationProvider with authenticated user
  // ============================================================
  describe('NotificationProvider with authenticated user', () => {
    beforeEach(() => {
      useAuth.mockReturnValue({
        user: { id: 'user-1' },
        isOwner: true,
        isWorker: false,
        isSupervisor: false,
      });
    });

    it('should load notifications for an authenticated owner', async () => {
      const mockNotifications = [
        { id: 'n1', title: 'Test', read: false },
        { id: 'n2', title: 'Test 2', read: true },
      ];
      fetchNotifications.mockResolvedValue(mockNotifications);
      getUnreadCount.mockResolvedValue(1);

      const wrapper = ({ children }) => (
        <NotificationProvider>{children}</NotificationProvider>
      );
      const { result } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(fetchNotifications).toHaveBeenCalledWith({ limit: 50 });
      expect(getUnreadCount).toHaveBeenCalled();
      expect(result.current.notifications).toEqual(mockNotifications);
      expect(result.current.unreadCount).toBe(1);
    });

    it('should subscribe to realtime notifications for authenticated user', async () => {
      fetchNotifications.mockResolvedValue([]);
      getUnreadCount.mockResolvedValue(0);

      const wrapper = ({ children }) => (
        <NotificationProvider>{children}</NotificationProvider>
      );
      renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(subscribeToNotifications).toHaveBeenCalledWith(
          'user-1',
          expect.any(Function)
        );
      });
    });

    it('should clean up realtime subscription on unmount', async () => {
      const mockUnsubscribe = jest.fn();
      subscribeToNotifications.mockReturnValue({ unsubscribe: mockUnsubscribe });
      fetchNotifications.mockResolvedValue([]);
      getUnreadCount.mockResolvedValue(0);

      const wrapper = ({ children }) => (
        <NotificationProvider>{children}</NotificationProvider>
      );
      const { unmount } = renderHook(() => useNotifications(), { wrapper });

      await waitFor(() => {
        expect(subscribeToNotifications).toHaveBeenCalled();
      });

      unmount();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });
});
