/**
 * Offline Cache Service
 * Key-value cache using AsyncStorage for offline data access.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_STALE_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days — absolute cap even for stale reads

/**
 * Cache data with a key and optional TTL
 */
export function cacheData(key, data, ttl = DEFAULT_TTL) {
  try {
    const entry = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    AsyncStorage.setItem(`cache:${key}`, JSON.stringify(entry)).catch(() => {});
  } catch (e) {
    console.warn('[OfflineCache] Write error:', e.message);
  }
}

/**
 * Get cached data. Returns null if expired or missing.
 * If allowStale=true, returns data even if expired (for offline fallback).
 */
export function getCachedData(key, allowStale = false) {
  // Synchronous in-memory layer for instant reads
  const mem = memCache[`cache:${key}`];
  if (mem) {
    const entry = JSON.parse(mem);
    const age = Date.now() - entry.timestamp;
    if (age > MAX_STALE_AGE) return null;
    if (!allowStale && age > entry.ttl) return null;
    return entry.data;
  }
  return null;
}

/**
 * Async version — use when you can await
 */
export async function getCachedDataAsync(key, allowStale = false) {
  try {
    const raw = await AsyncStorage.getItem(`cache:${key}`);
    if (!raw) return null;

    const entry = JSON.parse(raw);
    const age = Date.now() - entry.timestamp;

    if (age > MAX_STALE_AGE) return null;
    if (!allowStale && age > entry.ttl) return null;

    // Populate in-memory layer
    memCache[`cache:${key}`] = raw;
    return entry.data;
  } catch (e) {
    return null;
  }
}

/**
 * Check if we have any cached data for a key (even if stale)
 */
export function hasCachedData(key) {
  return !!memCache[`cache:${key}`];
}

/**
 * Clear a specific cache entry
 */
export function clearCache(key) {
  delete memCache[`cache:${key}`];
  AsyncStorage.removeItem(`cache:${key}`).catch(() => {});
}

/**
 * Clear all cached data
 */
export async function clearAllCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith('cache:'));
    await AsyncStorage.multiRemove(cacheKeys);
    cacheKeys.forEach(k => { delete memCache[k]; });
  } catch (e) {
    console.warn('[OfflineCache] Clear all error:', e.message);
  }
}

// In-memory mirror for synchronous reads (populated on writes + async reads)
const memCache = {};

// Warm up: load all cache keys into memory on startup
AsyncStorage.getAllKeys().then(keys => {
  const cacheKeys = keys.filter(k => k.startsWith('cache:'));
  if (cacheKeys.length > 0) {
    AsyncStorage.multiGet(cacheKeys).then(pairs => {
      pairs.forEach(([k, v]) => { if (v) memCache[k] = v; });
    }).catch(() => {});
  }
}).catch(() => {});
