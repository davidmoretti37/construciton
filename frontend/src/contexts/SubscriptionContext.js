/**
 * SubscriptionContext
 * Manages subscription state throughout the app
 * Provides subscription info, project limits, and trial status
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import subscriptionService from '../services/subscriptionService';
import logger from '../utils/logger';

// =====================================================
// TESTING MODE - Set to true to bypass all paywalls
// Set back to false before production release!
// =====================================================
const TESTING_MODE = true;

// Create context
const SubscriptionContext = createContext();

/**
 * Hook to access subscription context
 * Returns default values if used outside provider
 */
export const useSubscription = () => {
  const context = useContext(SubscriptionContext);

  if (!context) {
    // Return safe defaults when used outside provider
    return {
      subscription: null,
      projectStatus: null,
      isLoading: true,
      hasActiveSubscription: false,
      planTier: 'none',
      status: 'inactive',
      trialDaysRemaining: null,
      trialEndsAt: null,
      cancelAtPeriodEnd: false,
      canCreateProject: false,
      activeProjectCount: 0,
      projectLimit: 0,
      limitReason: null,
      refreshSubscription: () => {},
      checkCanCreateProject: async () => ({ can_create: false }),
    };
  }

  return context;
};

/**
 * SubscriptionProvider component
 * Wrap your app with this to provide subscription state
 */
export const SubscriptionProvider = ({ children }) => {
  const { user, session, role } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [projectStatus, setProjectStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [justSubscribed, setJustSubscribed] = useState(false);
  const previousStatusRef = useRef(null);

  /**
   * Load subscription data from backend
   */
  const loadSubscription = useCallback(async () => {
    // Only load subscription for authenticated owner users
    if (!user || !session) {
      setSubscription(null);
      setProjectStatus(null);
      setIsLoading(false);
      return;
    }

    // Workers and clients don't need subscription checks
    if (role && role !== 'owner') {
      setSubscription({
        hasSubscription: true, // Workers/clients are never blocked
        planTier: 'worker_client',
        status: 'active',
      });
      setProjectStatus({
        can_create: true,
        active_count: 0,
        limit: 999999,
        plan_tier: 'worker_client',
      });
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      logger.debug('[SubscriptionContext] Loading subscription...');

      // Fetch subscription and project status in parallel
      const [subData, projData] = await Promise.all([
        subscriptionService.getSubscription(),
        subscriptionService.canCreateProject(),
      ]);

      // Detect if subscription just activated (for showing success message)
      const wasInactive = previousStatusRef.current === 'inactive' ||
                          previousStatusRef.current === 'none' ||
                          previousStatusRef.current === null;
      const isNowActive = ['trialing', 'active'].includes(subData?.status);

      if (wasInactive && isNowActive && previousStatusRef.current !== null) {
        logger.info('[SubscriptionContext] Subscription just activated!');
        setJustSubscribed(true);
      }

      previousStatusRef.current = subData?.status || 'inactive';

      setSubscription(subData);
      setProjectStatus(projData);

      logger.debug('[SubscriptionContext] Subscription loaded:', {
        tier: subData?.planTier,
        status: subData?.status,
        canCreate: projData?.can_create,
      });
    } catch (error) {
      logger.error('[SubscriptionContext] Error loading subscription:', error);
      setSubscription(null);
      setProjectStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [user, session, role]);

  // Load subscription on mount and when user/session changes
  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  // Refresh subscription when app comes to foreground
  // This handles returning from Stripe Checkout
  useEffect(() => {
    const handleAppStateChange = (nextAppState) => {
      if (nextAppState === 'active') {
        logger.debug('[SubscriptionContext] App became active, refreshing...');
        loadSubscription();
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      appStateSubscription?.remove();
    };
  }, [loadSubscription]);

  /**
   * Check if user can create a project (refreshes status)
   * @returns {Promise<Object>} Project creation status
   */
  const checkCanCreateProject = useCallback(async () => {
    try {
      const data = await subscriptionService.canCreateProject();
      setProjectStatus(data);
      return data;
    } catch (error) {
      logger.error('[SubscriptionContext] Error checking project limit:', error);
      return {
        can_create: false,
        reason: 'error',
        active_count: 0,
        limit: 0,
      };
    }
  }, []);

  // Build context value
  const value = TESTING_MODE ? {
    // TESTING MODE: All features unlocked
    subscription: { status: 'active', planTier: 'testing' },
    projectStatus: { can_create: true, active_count: 0, limit: 999999 },
    isLoading: false,
    hasActiveSubscription: true,
    planTier: 'testing',
    status: 'active',
    trialDaysRemaining: null,
    trialEndsAt: null,
    cancelAtPeriodEnd: false,
    canCreateProject: true,
    activeProjectCount: 0,
    projectLimit: 999999,
    limitReason: null,
    isTrial: false,
    refreshSubscription: loadSubscription,
    checkCanCreateProject: async () => ({ can_create: true, active_count: 0, limit: 999999 }),
    justSubscribed: false,
    clearJustSubscribed: () => {},
  } : {
    // PRODUCTION MODE: Normal subscription checking
    // Raw data
    subscription,
    projectStatus,
    isLoading,

    // Subscription status
    hasActiveSubscription: subscription?.hasSubscription || false,
    planTier: subscription?.planTier || 'none',
    status: subscription?.status || 'inactive',

    // Trial info
    trialDaysRemaining: subscription?.trialDaysRemaining ?? null,
    trialEndsAt: subscription?.trialEndsAt || null,
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false,

    // Project limits
    canCreateProject: projectStatus?.can_create || false,
    activeProjectCount: projectStatus?.active_count || 0,
    projectLimit: projectStatus?.limit || 0,
    limitReason: projectStatus?.reason || null,
    isTrial: projectStatus?.is_trial || false,

    // Actions
    refreshSubscription: loadSubscription,
    checkCanCreateProject,

    // Subscription activation tracking (for success message)
    justSubscribed,
    clearJustSubscribed: () => setJustSubscribed(false),
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export default SubscriptionContext;
