import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { getPendingInvites } from '../utils/storage';

/**
 * Hook to check for pending worker invitations
 * This should be used in all worker screens to ensure
 * invitations are shown regardless of which screen loads first
 *
 * @returns {Object} { invites, loading, refetch }
 */
export const useWorkerInvites = () => {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadInvites = async () => {
    try {
      setLoading(true);

      // Get the current user's email
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email;

      if (!email) {
        setInvites([]);
        setLoading(false);
        return;
      }

      // Check for pending invitations
      const pendingInvites = await getPendingInvites(email);

      setInvites(pendingInvites || []);
    } catch (error) {
      console.error('Error loading worker invites:', error);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvites();
  }, []);

  return {
    invites,
    loading,
    refetch: loadInvites,
  };
};
