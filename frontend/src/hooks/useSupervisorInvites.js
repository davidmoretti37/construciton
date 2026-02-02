/**
 * useSupervisorInvites Hook
 * Fetches pending supervisor invitations for the current user
 * Used during supervisor onboarding to check for invites
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getPendingSupervisorInvites } from '../utils/storage/supervisors';

export const useSupervisorInvites = () => {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadInvites = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Get current user's email
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user?.email) {
        setInvites([]);
        return;
      }

      // Fetch pending invitations for this email
      const pendingInvites = await getPendingSupervisorInvites(user.email);
      setInvites(pendingInvites || []);

    } catch (err) {
      console.error('useSupervisorInvites - Error loading invites:', err);
      setError(err);
      setInvites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInvites();
  }, [loadInvites]);

  return {
    invites,
    loading,
    error,
    refetch: loadInvites,
  };
};

export default useSupervisorInvites;
