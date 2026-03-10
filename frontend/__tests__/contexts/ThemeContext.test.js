/**
 * ThemeContext Tests
 * Tests for theme context provider, toggling, and persistence
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';
import React from 'react';

// Mock React Native modules
jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Appearance: { getColorScheme: jest.fn(() => 'light'), addChangeListener: jest.fn(() => ({ remove: jest.fn() })) },
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

import { useTheme, ThemeProvider } from '../../src/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

describe('ThemeContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AsyncStorage.getItem.mockResolvedValue(null);
    AsyncStorage.setItem.mockResolvedValue(undefined);
  });

  // ============================================================
  // useTheme() default values (no provider)
  // ============================================================
  describe('useTheme() without provider', () => {
    it('should return default values when used outside ThemeProvider', () => {
      const { result } = renderHook(() => useTheme());

      expect(result.current.theme).toBe('light');
      expect(result.current.isDark).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(typeof result.current.toggleTheme).toBe('function');
    });

    it('should return a no-op toggleTheme when outside provider', () => {
      const { result } = renderHook(() => useTheme());

      // Should not throw
      expect(() => result.current.toggleTheme()).not.toThrow();
    });
  });

  // ============================================================
  // Exports
  // ============================================================
  describe('exports', () => {
    it('should export ThemeProvider and useTheme', () => {
      expect(ThemeProvider).toBeDefined();
      expect(typeof ThemeProvider).toBe('function');
      expect(useTheme).toBeDefined();
      expect(typeof useTheme).toBe('function');
    });
  });

  // ============================================================
  // Default theme value
  // ============================================================
  describe('default theme', () => {
    it('should default to light theme when no saved preference', async () => {
      AsyncStorage.getItem.mockResolvedValue(null);

      const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;
      const { result } = renderHook(() => useTheme(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.theme).toBe('light');
      expect(result.current.isDark).toBe(false);
    });

    it('should load saved theme from AsyncStorage on mount', async () => {
      AsyncStorage.getItem.mockResolvedValue('dark');

      const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;
      const { result } = renderHook(() => useTheme(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(AsyncStorage.getItem).toHaveBeenCalledWith('theme');
      expect(result.current.theme).toBe('dark');
      expect(result.current.isDark).toBe(true);
    });

    it('should handle AsyncStorage load error gracefully', async () => {
      AsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;
      const { result } = renderHook(() => useTheme(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should fall back to default light theme
      expect(result.current.theme).toBe('light');
      expect(result.current.isDark).toBe(false);
    });
  });

  // ============================================================
  // Toggle theme
  // ============================================================
  describe('toggleTheme', () => {
    it('should toggle from light to dark', async () => {
      const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;
      const { result } = renderHook(() => useTheme(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.theme).toBe('light');

      await act(async () => {
        await result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('dark');
      expect(result.current.isDark).toBe(true);
    });

    it('should toggle from dark to light', async () => {
      AsyncStorage.getItem.mockResolvedValue('dark');

      const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;
      const { result } = renderHook(() => useTheme(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.theme).toBe('dark');

      await act(async () => {
        await result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('light');
      expect(result.current.isDark).toBe(false);
    });

    it('should toggle back and forth correctly', async () => {
      const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;
      const { result } = renderHook(() => useTheme(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // light -> dark
      await act(async () => {
        await result.current.toggleTheme();
      });
      expect(result.current.theme).toBe('dark');

      // dark -> light
      await act(async () => {
        await result.current.toggleTheme();
      });
      expect(result.current.theme).toBe('light');
    });
  });

  // ============================================================
  // Theme persistence
  // ============================================================
  describe('theme persistence', () => {
    it('should save theme to AsyncStorage when toggled', async () => {
      const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;
      const { result } = renderHook(() => useTheme(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleTheme();
      });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
    });

    it('should save light theme when toggling back from dark', async () => {
      AsyncStorage.getItem.mockResolvedValue('dark');

      const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;
      const { result } = renderHook(() => useTheme(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.toggleTheme();
      });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('theme', 'light');
    });

    it('should handle AsyncStorage save error gracefully', async () => {
      AsyncStorage.setItem.mockRejectedValue(new Error('Storage write error'));

      const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;
      const { result } = renderHook(() => useTheme(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Should still update in-memory theme even if persistence fails
      await act(async () => {
        await result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('dark');
      expect(result.current.isDark).toBe(true);
    });
  });
});
