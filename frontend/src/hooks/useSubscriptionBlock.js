/**
 * useSubscriptionBlock
 * Hook for checking if features should be blocked based on subscription status
 *
 * For owners: Blocked if no active subscription
 * For workers: Blocked if not part of a team (no owner_id)
 */

import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useAuth } from '../contexts/AuthContext';

export function useSubscriptionBlock() {
  const navigation = useNavigation();
  const { hasActiveSubscription, isLoading: subLoading } = useSubscription();
  const { role, user } = useAuth();

  /**
   * Check if the current user is blocked from using features
   * @returns {boolean} true if blocked
   */
  const isBlocked = useCallback(() => {
    // Still loading - don't block yet
    if (subLoading) return false;

    // Owners need active subscription
    if (role === 'owner') {
      return !hasActiveSubscription;
    }

    // Workers need to be part of a team (have owner_id)
    if (role === 'worker') {
      return !user?.owner_id;
    }

    // Clients - not blocked for now
    return false;
  }, [role, hasActiveSubscription, user?.owner_id, subLoading]);

  /**
   * Get the type of block (for showing appropriate message)
   * @returns {'subscription' | 'team' | null}
   */
  const getBlockType = useCallback(() => {
    if (!isBlocked()) return null;

    if (role === 'owner') return 'subscription';
    if (role === 'worker') return 'team';
    return null;
  }, [isBlocked, role]);

  /**
   * Navigate to the appropriate screen when blocked
   * - Owners: Show paywall
   * - Workers: Show join team message (handled by caller)
   */
  const showBlockScreen = useCallback(() => {
    const blockType = getBlockType();

    if (blockType === 'subscription') {
      // Navigate to paywall for owners
      navigation.navigate('Settings', { screen: 'Paywall' });
    }
    // For workers, the caller should handle showing the "Join a team" modal
  }, [navigation, getBlockType]);

  /**
   * Execute an action only if not blocked
   * @param {Function} action - The action to execute
   * @param {Function} onBlocked - Optional callback when blocked (for custom handling)
   * @returns {boolean} true if action was executed, false if blocked
   */
  const withSubscriptionCheck = useCallback((action, onBlocked) => {
    if (isBlocked()) {
      if (onBlocked) {
        onBlocked(getBlockType());
      } else {
        showBlockScreen();
      }
      return false;
    }

    action();
    return true;
  }, [isBlocked, getBlockType, showBlockScreen]);

  return {
    isBlocked,
    getBlockType,
    showBlockScreen,
    withSubscriptionCheck,
    isLoading: subLoading,
    // Convenience properties
    isOwnerBlocked: role === 'owner' && !hasActiveSubscription,
    isWorkerWithoutTeam: role === 'worker' && !user?.owner_id,
  };
}

export default useSubscriptionBlock;
