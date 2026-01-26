/**
 * Subscription Service
 * Handles all subscription-related API calls to the backend
 */

import { supabase } from '../lib/supabase';
import { Linking } from 'react-native';
import { EXPO_PUBLIC_BACKEND_URL } from '@env';
import logger from '../utils/logger';

const API_URL = EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

/**
 * Get the current auth token for API calls
 */
const getAuthToken = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token;
};

/**
 * Fetch with authentication header
 */
const fetchWithAuth = async (endpoint, options = {}) => {
  const token = await getAuthToken();

  if (!token) {
    throw new Error('Not authenticated');
  }

  const url = `${API_URL}${endpoint}`;
  logger.debug(`[SubscriptionService] ${options.method || 'GET'} ${endpoint}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error || `Request failed with status ${response.status}`;
    logger.error(`[SubscriptionService] Error: ${errorMessage}`);
    throw new Error(errorMessage);
  }

  return response.json();
};

// ============================================================
// SUBSCRIPTION SERVICE METHODS
// ============================================================

const subscriptionService = {
  /**
   * Get current user's subscription status
   * @returns {Promise<Object>} Subscription details
   */
  getSubscription: async () => {
    try {
      return await fetchWithAuth('/api/stripe/subscription');
    } catch (error) {
      logger.error('[SubscriptionService] getSubscription error:', error);
      // Return default state on error
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
      logger.error('[SubscriptionService] canCreateProject error:', error);
      return {
        can_create: false,
        reason: 'error',
        active_count: 0,
        limit: 0,
        plan_tier: 'none',
      };
    }
  },

  /**
   * Start checkout flow for a subscription plan
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
        const supported = await Linking.canOpenURL(data.url);
        if (supported) {
          await Linking.openURL(data.url);
          logger.info('[SubscriptionService] Opened Stripe Checkout');
        } else {
          throw new Error('Cannot open checkout URL');
        }
      }

      return data;
    } catch (error) {
      logger.error('[SubscriptionService] startCheckout error:', error);
      throw error;
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
        const supported = await Linking.canOpenURL(data.url);
        if (supported) {
          await Linking.openURL(data.url);
          logger.info('[SubscriptionService] Opened Stripe Customer Portal');
        } else {
          throw new Error('Cannot open portal URL');
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

export default subscriptionService;
