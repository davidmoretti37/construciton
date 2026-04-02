/**
 * Offline Cache Service
 * Fast key-value cache using MMKV for offline data access.
 * Falls back to in-memory if MMKV isn't available.
 */

import { MMKV } from 'react-native-mmkv';

let storage;
try {
  storage = new MMKV({ id: 'sylk-offline-cache' });
} catch (e) {
  console.warn('[OfflineCache] MMKV init failed, using in-memory fallback');
  const memoryStore = {};
  storage = {
    set: (key, value) => { memoryStore[key] = value; },
    getString: (key) => memoryStore[key] || undefined,
    delete: (key) => { delete memoryStore[key]; },
    getAllKeys: () => Object.keys(memoryStore),
  };
}

const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

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
    storage.set(`cache:${key}`, JSON.stringify(entry));
  } catch (e) {
    console.warn('[OfflineCache] Write error:', e.message);
  }
}

/**
 * Get cached data. Returns null if expired or missing.
 * If allowStale=true, returns data even if expired (for offline fallback).
 */
export function getCachedData(key, allowStale = false) {
  try {
    const raw = storage.getString(`cache:${key}`);
    if (!raw) return null;

    const entry = JSON.parse(raw);
    const age = Date.now() - entry.timestamp;

    if (!allowStale && age > entry.ttl) {
      return null; // expired
    }

    return entry.data;
  } catch (e) {
    console.warn('[OfflineCache] Read error:', e.message);
    return null;
  }
}

/**
 * Check if we have any cached data for a key (even if stale)
 */
export function hasCachedData(key) {
  try {
    return !!storage.getString(`cache:${key}`);
  } catch (e) {
    return false;
  }
}

/**
 * Clear a specific cache entry
 */
export function clearCache(key) {
  try {
    storage.delete(`cache:${key}`);
  } catch (e) {
    console.warn('[OfflineCache] Clear error:', e.message);
  }
}

/**
 * Clear all cached data
 */
export function clearAllCache() {
  try {
    const keys = storage.getAllKeys();
    keys.filter(k => k.startsWith('cache:')).forEach(k => storage.delete(k));
  } catch (e) {
    console.warn('[OfflineCache] Clear all error:', e.message);
  }
}
