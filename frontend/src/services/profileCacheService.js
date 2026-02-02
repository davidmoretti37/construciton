/**
 * Profile Cache Service
 * Handles caching user profile data to AsyncStorage for instant app startup
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_KEY = '@app:profile_cache';
const CACHE_TIMESTAMP_KEY = '@app:profile_cache_timestamp';
const FRESH_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - considered fresh
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days - usable but stale

/**
 * Save profile to local cache
 * @param {Object} profile - The user profile object
 */
export const saveProfileToCache = async (profile) => {
  try {
    if (!profile) return;

    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(profile));
    await AsyncStorage.setItem(CACHE_TIMESTAMP_KEY, new Date().toISOString());
  } catch (error) {
    console.warn('Failed to save profile to cache:', error);
  }
};

/**
 * Load profile from local cache
 * @returns {Object} { profile, isStale, isFresh, age }
 */
export const loadProfileFromCache = async () => {
  try {
    const [profileJson, timestampStr] = await Promise.all([
      AsyncStorage.getItem(CACHE_KEY),
      AsyncStorage.getItem(CACHE_TIMESTAMP_KEY),
    ]);

    if (!profileJson) {
      return { profile: null, isStale: true, isFresh: false, age: null };
    }

    const profile = JSON.parse(profileJson);
    const timestamp = timestampStr ? new Date(timestampStr) : new Date(0);
    const age = Date.now() - timestamp.getTime();

    const isFresh = age < FRESH_TTL_MS;
    const isStale = age >= FRESH_TTL_MS;
    const isExpired = age >= STALE_TTL_MS;

    // If expired beyond stale threshold, don't return the profile
    if (isExpired) {
      return { profile: null, isStale: true, isFresh: false, age };
    }

    return { profile, isStale, isFresh, age };
  } catch (error) {
    console.warn('Failed to load profile from cache:', error);
    return { profile: null, isStale: true, isFresh: false, age: null };
  }
};

/**
 * Clear the profile cache (call on logout)
 */
export const clearProfileCache = async () => {
  try {
    await AsyncStorage.multiRemove([CACHE_KEY, CACHE_TIMESTAMP_KEY]);
  } catch (error) {
    console.warn('Failed to clear profile cache:', error);
  }
};

/**
 * Check if we have a valid cached profile
 * @returns {boolean}
 */
export const hasCachedProfile = async () => {
  try {
    const { profile } = await loadProfileFromCache();
    return profile !== null;
  } catch {
    return false;
  }
};

export default {
  saveProfileToCache,
  loadProfileFromCache,
  clearProfileCache,
  hasCachedProfile,
};
