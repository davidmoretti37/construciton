/**
 * useSubscription Hook
 * Provides subscription state and convenience methods
 */

import { useCallback } from 'react';
import { useSubscription as useSubscriptionContext } from '../contexts/SubscriptionContext';
import subscriptionService from '../services/subscriptionService';

/**
 * Enhanced subscription hook with helper methods
 */
export function useSubscription() {
  const context = useSubscriptionContext();

  /**
   * Get human-readable plan name
   */
  const getPlanName = useCallback(() => {
    switch (context.planTier) {
      case 'starter':
        return 'Starter';
      case 'pro':
        return 'Pro';
      case 'business':
        return 'Business';
      case 'worker_client':
        return 'Team Member';
      default:
        return 'No Plan';
    }
  }, [context.planTier]);

  /**
   * Get plan price
   */
  const getPlanPrice = useCallback(() => {
    switch (context.planTier) {
      case 'starter':
        return 49;
      case 'pro':
        return 79;
      case 'business':
        return 149;
      default:
        return 0;
    }
  }, [context.planTier]);

  /**
   * Check if currently in trial period
   */
  const isTrialing = useCallback(() => {
    return context.status === 'trialing';
  }, [context.status]);

  /**
   * Check if subscription is active (trialing or active)
   */
  const isActive = useCallback(() => {
    return ['trialing', 'active'].includes(context.status);
  }, [context.status]);

  /**
   * Check if subscription is past due
   */
  const isPastDue = useCallback(() => {
    return context.status === 'past_due';
  }, [context.status]);

  /**
   * Check if subscription is canceled
   */
  const isCanceled = useCallback(() => {
    return context.status === 'canceled';
  }, [context.status]);

  /**
   * Get remaining projects count
   */
  const getRemainingProjects = useCallback(() => {
    if (context.projectLimit === 999999) {
      return Infinity;
    }
    return Math.max(0, context.projectLimit - context.activeProjectCount);
  }, [context.projectLimit, context.activeProjectCount]);

  /**
   * Check if at project limit
   */
  const isAtProjectLimit = useCallback(() => {
    if (context.projectLimit === 999999) {
      return false;
    }
    return context.activeProjectCount >= context.projectLimit;
  }, [context.activeProjectCount, context.projectLimit]);

  /**
   * Get suggested upgrade tier
   */
  const getSuggestedUpgrade = useCallback(() => {
    switch (context.planTier) {
      case 'starter':
        return {
          tier: 'pro',
          name: 'Pro',
          price: 79,
          limit: 10,
        };
      case 'pro':
        return {
          tier: 'business',
          name: 'Business',
          price: 149,
          limit: 'Unlimited',
        };
      default:
        return {
          tier: 'starter',
          name: 'Starter',
          price: 49,
          limit: 3,
        };
    }
  }, [context.planTier]);

  /**
   * Format project limit for display
   */
  const getProjectLimitDisplay = useCallback(() => {
    if (context.projectLimit === 999999) {
      return 'Unlimited';
    }
    return context.projectLimit.toString();
  }, [context.projectLimit]);

  return {
    // Context values
    ...context,

    // Service methods (for direct API calls)
    startCheckout: subscriptionService.startCheckout,
    openCustomerPortal: subscriptionService.openCustomerPortal,
    getAllPlans: subscriptionService.getAllPlans,
    getPlanInfo: subscriptionService.getPlanInfo,

    // Helper methods
    getPlanName,
    getPlanPrice,
    isTrialing,
    isActive,
    isPastDue,
    isCanceled,
    getRemainingProjects,
    isAtProjectLimit,
    getSuggestedUpgrade,
    getProjectLimitDisplay,
  };
}

export default useSubscription;
