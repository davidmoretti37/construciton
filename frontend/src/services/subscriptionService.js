/**
 * Subscription Service
 * Handles all subscription-related API calls to the backend
 */

import { supabase } from '../lib/supabase';
import { Linking, Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import logger from '../utils/logger';
import { API_URL } from '../config/api';

/**
 * Get the current auth token for API calls. Forces a refresh when `refresh`
 * is true so we can recover from a stale token before the UI sees a 401.
 */
const getAuthToken = async ({ refresh = false } = {}) => {
  if (refresh) {
    try {
      const { data } = await supabase.auth.refreshSession();
      if (data?.session?.access_token) return data.session.access_token;
    } catch (_) {
      // fall through to getSession so we return whatever's still there
    }
  }
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
};

/**
 * Fetch with authentication header. On a 401 we transparently refresh the
 * Supabase session and retry once — the old code dumped "Invalid or expired
 * token" to the error log every time the access_token aged out even though
 * the caller would have silently fallen back to defaults.
 */
const fetchWithAuth = async (endpoint, options = {}) => {
  const url = `${API_URL}${endpoint}`;

  const doFetch = async (token) => fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  let token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');

  logger.debug(`[SubscriptionService] ${options.method || 'GET'} ${endpoint}`);
  let response = await doFetch(token);

  // Auto-recover from expired tokens once.
  if (response.status === 401) {
    const refreshed = await getAuthToken({ refresh: true });
    if (refreshed && refreshed !== token) {
      response = await doFetch(refreshed);
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || `Request failed with status ${response.status}`;
    // 401 after a refresh attempt means the user really is signed out. Log
    // quietly so we don't flood the console — callers already fall back to
    // defaults, so this is not a user-facing failure.
    if (response.status === 401) {
      logger.debug(`[SubscriptionService] auth expired for ${endpoint} - using fallback`);
    } else {
      logger.error(`[SubscriptionService] Error: ${errorMessage}`);
    }
    throw new Error(errorMessage);
  }

  return response.json();
};

// ============================================================
// SUBSCRIPTION SERVICE METHODS
// ============================================================

const subscriptionService = {
  /**
   * Open the pricing page in web browser (App Store safe)
   * Used instead of showing prices in-app
   * @returns {Promise<void>}
   */
  openPricingPage: async () => {
    try {
      const pricingUrl = `${API_URL}/pricing`;
      logger.info(`[SubscriptionService] Opening pricing page: ${pricingUrl}`);

      await WebBrowser.openBrowserAsync(pricingUrl, {
        dismissButtonStyle: 'close',
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
      });
    } catch (error) {
      logger.error('[SubscriptionService] openPricingPage error:', error);
      // Fallback to Linking
      const pricingUrl = `${API_URL}/pricing`;
      const supported = await Linking.canOpenURL(pricingUrl);
      if (supported) {
        await Linking.openURL(pricingUrl);
      } else {
        throw new Error('Cannot open pricing page');
      }
    }
  },

  /**
   * Get current user's subscription status
   * @returns {Promise<Object>} Subscription details
   */
  getSubscription: async () => {
    try {
      return await fetchWithAuth('/api/stripe/subscription');
    } catch (error) {
      // Already logged inside fetchWithAuth. Auth blips fall through to the
      // default "no subscription" state instead of surfacing an error.
      logger.debug('[SubscriptionService] getSubscription fallback:', error?.message);
      return {
        hasSubscription: false,
        planTier: 'none',
        status: 'inactive',
      };
    }
  },

  /**
   * Check if user can create a new project based on subscription limits
   * @returns {Promise<Object>} { can_create, reason, active_count, limit, plan_tier }
   */
  canCreateProject: async () => {
    try {
      return await fetchWithAuth('/api/subscription/can-create-project');
    } catch (error) {
      logger.debug('[SubscriptionService] canCreateProject fallback:', error?.message);
      // Auth blip or offline - default to allowing creation. The server-side
      // row insert still enforces ownership + the real subscription limit
      // check runs again at saveProject time, so this is safe.
      return {
        can_create: true,
        reason: 'auth_fallback',
        active_count: 0,
        limit: 0,
        plan_tier: 'none',
      };
    }
  },

  /**
   * Start GUEST checkout flow (no authentication required)
   * For users who haven't signed up yet - pay first flow
   * Opens Stripe Checkout in the device's browser
   * @param {string} tier - 'starter' | 'pro' | 'business'
   * @returns {Promise<Object>} { sessionId, url }
   */
  startGuestCheckout: async (tier) => {
    try {
      logger.info(`[SubscriptionService] Starting GUEST checkout for tier: ${tier}`);

      const url = `${API_URL}/api/stripe/create-guest-checkout`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tier }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create checkout');
      }

      const data = await response.json();

      // Open Stripe Checkout in browser
      if (data.url) {
        try {
          // Use expo-web-browser for more reliable URL opening
          await WebBrowser.openBrowserAsync(data.url, {
            dismissButtonStyle: 'close',
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          });
          logger.info('[SubscriptionService] Opened Stripe Guest Checkout');
        } catch (browserError) {
          // Fallback to Linking if WebBrowser fails
          logger.warn('[SubscriptionService] WebBrowser failed, trying Linking:', browserError);
          const supported = await Linking.canOpenURL(data.url);
          if (supported) {
            await Linking.openURL(data.url);
          } else {
            throw new Error('Cannot open checkout URL');
          }
        }
      }

      return data;
    } catch (error) {
      logger.error('[SubscriptionService] startGuestCheckout error:', error);
      throw error;
    }
  },

  /**
   * Start checkout flow for a subscription plan (requires auth)
   * Opens Stripe Checkout in the device's browser
   * @param {string} tier - 'starter' | 'pro' | 'business'
   * @returns {Promise<Object>} { sessionId, url }
   */
  startCheckout: async (tier) => {
    try {
      logger.info(`[SubscriptionService] Starting checkout for tier: ${tier}`);

      const data = await fetchWithAuth('/api/stripe/create-checkout-session', {
        method: 'POST',
        body: JSON.stringify({ tier }),
      });

      // Open Stripe Checkout in browser
      if (data.url) {
        try {
          await WebBrowser.openBrowserAsync(data.url, {
            dismissButtonStyle: 'close',
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          });
          logger.info('[SubscriptionService] Opened Stripe Checkout');
        } catch (browserError) {
          logger.warn('[SubscriptionService] WebBrowser failed, trying Linking:', browserError);
          const supported = await Linking.canOpenURL(data.url);
          if (supported) {
            await Linking.openURL(data.url);
          } else {
            throw new Error('Cannot open checkout URL');
          }
        }
      }

      return data;
    } catch (error) {
      logger.error('[SubscriptionService] startCheckout error:', error);
      throw error;
    }
  },

  /**
   * Link pending subscription after user signs up
   * Call this after user creates their account
   * @returns {Promise<Object>} { linked, planTier, status }
   */
  linkPendingSubscription: async () => {
    try {
      logger.info('[SubscriptionService] Checking for pending subscription to link');
      return await fetchWithAuth('/api/stripe/link-pending-subscription', {
        method: 'POST',
      });
    } catch (error) {
      logger.error('[SubscriptionService] linkPendingSubscription error:', error);
      return { linked: false };
    }
  },

  /**
   * Open Stripe Customer Portal for managing subscription
   * Allows users to update payment method, cancel, etc.
   * @returns {Promise<Object>} { url }
   */
  openCustomerPortal: async () => {
    try {
      logger.info('[SubscriptionService] Opening customer portal');

      const data = await fetchWithAuth('/api/stripe/create-portal-session', {
        method: 'POST',
      });

      // Open portal in browser
      if (data.url) {
        try {
          await WebBrowser.openBrowserAsync(data.url, {
            dismissButtonStyle: 'close',
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          });
          logger.info('[SubscriptionService] Opened Stripe Customer Portal');
        } catch (browserError) {
          logger.warn('[SubscriptionService] WebBrowser failed, trying Linking:', browserError);
          const supported = await Linking.canOpenURL(data.url);
          if (supported) {
            await Linking.openURL(data.url);
          } else {
            throw new Error('Cannot open portal URL');
          }
        }
      }

      return data;
    } catch (error) {
      logger.error('[SubscriptionService] openCustomerPortal error:', error);
      throw error;
    }
  },

  /**
   * Get plan display information
   * @param {string} tier - Plan tier
   * @returns {Object} Plan details
   */
  getPlanInfo: (tier) => {
    const plans = {
      starter: {
        name: 'Starter',
        price: 49,
        projectLimit: 3,
        description: 'Perfect for solo contractors',
      },
      pro: {
        name: 'Pro',
        price: 79,
        projectLimit: 10,
        description: 'For growing businesses',
        popular: true,
      },
      business: {
        name: 'Business',
        price: 149,
        projectLimit: 999999, // Unlimited
        description: 'For established companies',
      },
    };

    return plans[tier] || plans.starter;
  },

  /**
   * Get all available plans
   * @returns {Array} List of plan objects
   */
  getAllPlans: () => {
    return [
      {
        tier: 'starter',
        name: 'Starter',
        price: 49,
        projectLimit: 3,
        description: 'Perfect for solo contractors',
        popular: false,
      },
      {
        tier: 'pro',
        name: 'Pro',
        price: 79,
        projectLimit: 10,
        description: 'For growing businesses',
        popular: true,
      },
      {
        tier: 'business',
        name: 'Business',
        price: 149,
        projectLimit: 'Unlimited',
        description: 'For established companies',
        popular: false,
      },
    ];
  },
};

// ============================================================
// STRIPE CONNECT — Contractor Payment Setup
// ============================================================

export const connectService = {
  async createAccount() {
    const token = await getAuthToken();
    const res = await fetch(`${API_URL}/api/stripe/connect/create-account`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    return res.json();
  },

  async getStatus() {
    const token = await getAuthToken();
    const res = await fetch(`${API_URL}/api/stripe/connect/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.json();
  },

  async getDashboardLink() {
    const token = await getAuthToken();
    const res = await fetch(`${API_URL}/api/stripe/connect/dashboard-link`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    return res.json();
  },

  async startOnboarding() {
    const result = await this.createAccount();
    if (result.alreadyConnected) return { alreadyConnected: true };
    if (result.url) {
      await WebBrowser.openBrowserAsync(result.url);
      return { opened: true };
    }
    return result;
  },

  async openDashboard() {
    const result = await this.getDashboardLink();
    if (result.url) {
      await WebBrowser.openBrowserAsync(result.url);
    }
    return result;
  },
};

export default subscriptionService;
