/**
 * Centralized API configuration.
 * All backend URL references should import from here.
 * Throws at import time if the env var is missing in production.
 */
import { EXPO_PUBLIC_BACKEND_URL } from '@env';

const API_URL = EXPO_PUBLIC_BACKEND_URL || (__DEV__ ? 'http://localhost:3000' : null);

if (!API_URL) {
  throw new Error(
    '[Config] EXPO_PUBLIC_BACKEND_URL is not set. Cannot make API calls in production without it.'
  );
}

export { API_URL };
