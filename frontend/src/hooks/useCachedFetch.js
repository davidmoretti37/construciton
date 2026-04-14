import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Hook that implements cache-first + stale-while-revalidate.
 * Shows cached data immediately, then fetches fresh data in background.
 *
 * @param {string} cacheKey - Unique key for this data
 * @param {Function} fetchFn - Async function that returns the data
 * @param {Object} options - { staleTTL: ms before background refresh (default 30s), maxAge: ms before cache is ignored (default 5min) }
 */
export function useCachedFetch(cacheKey, fetchFn, options = {}) {
  const { staleTTL = 30000, maxAge = 5 * 60 * 1000 } = options;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
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
      setLoading(data === null); // Only show loading if no data yet
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

  const refresh = useCallback(() => load(true), [load]);

  return { data, loading, refreshing, refresh, reload: load };
}
