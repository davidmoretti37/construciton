import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onCacheInvalidated, emitCacheInvalidated } from '../services/eventEmitter';

/**
 * Hook that implements cache-first + stale-while-revalidate + optimistic updates.
 * Shows cached data immediately, then fetches fresh data in background.
 *
 * @param {string} cacheKey - Unique key for this data
 * @param {Function} fetchFn - Async function that returns the data
 * @param {Object} options - { staleTTL, maxAge, initialData: data from nav params for instant render }
 */
export function useCachedFetch(cacheKey, fetchFn, options = {}) {
  const { staleTTL = 30000, maxAge = 5 * 60 * 1000, initialData = null } = options;
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async (force = false) => {
    try {
      // Try cache first
      if (!force) {
        const cached = await AsyncStorage.getItem(`cache:${cacheKey}`);
        if (cached) {
          const { data: cachedData, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;

          if (age < maxAge) {
            if (mountedRef.current) {
              setData(cachedData);
              setLoading(false);
            }

            // If stale, refresh in background
            if (age > staleTTL) {
              setRefreshing(true);
              try {
                const fresh = await fetchFn();
                if (mountedRef.current) {
                  setData(fresh);
                  setRefreshing(false);
                }
                await AsyncStorage.setItem(`cache:${cacheKey}`, JSON.stringify({ data: fresh, timestamp: Date.now() }));
              } catch (e) {
                if (mountedRef.current) setRefreshing(false);
              }
            }
            return;
          }
        }
      }

      // No cache or expired — fetch fresh
      setLoading(data === null && !initialData); // Only show loading if no data yet
      const fresh = await fetchFn();
      if (mountedRef.current) {
        setData(fresh);
        setLoading(false);
        setRefreshing(false);
      }
      await AsyncStorage.setItem(`cache:${cacheKey}`, JSON.stringify({ data: fresh, timestamp: Date.now() }));
    } catch (error) {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [cacheKey, fetchFn, staleTTL, maxAge]);

  // Auto-load on mount and when cacheKey/fetchFn changes
  useEffect(() => {
    load();
  }, [load]);

  // Listen for external cache invalidation → auto-refresh
  useEffect(() => {
    const unsub = onCacheInvalidated(cacheKey, () => load(true));
    return unsub;
  }, [cacheKey, load]);

  const refresh = useCallback(() => load(true), [load]);

  /**
   * Optimistically update the local data and cache immediately.
   * @param {Function} updater - Receives current data, returns new data. e.g. (prev) => prev.filter(...)
   * @returns {Function} rollback - Call this to revert to the previous state.
   */
  const optimisticUpdate = useCallback((updater) => {
    let previousData;
    setData((prev) => {
      previousData = prev;
      const next = updater(prev);
      // Write optimistic value to cache so other screens see it too
      AsyncStorage.setItem(`cache:${cacheKey}`, JSON.stringify({ data: next, timestamp: Date.now() })).catch(() => {});
      return next;
    });
    // Return rollback function
    return () => {
      if (mountedRef.current) {
        setData(previousData);
        AsyncStorage.setItem(`cache:${cacheKey}`, JSON.stringify({ data: previousData, timestamp: Date.now() })).catch(() => {});
      }
    };
  }, [cacheKey]);

  return { data, setData, loading, refreshing, refresh, reload: load, optimisticUpdate };
}

/**
 * Invalidate a specific cache key from anywhere (action hooks, etc.).
 * Any mounted useCachedFetch with that key will auto-refresh.
 */
export async function invalidateCacheKey(cacheKey) {
  await AsyncStorage.removeItem(`cache:${cacheKey}`);
  emitCacheInvalidated(cacheKey);
}
