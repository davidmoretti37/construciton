import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    // Return default values instead of throwing error
    return {
      user: null,
      session: null,
      role: null,
      profile: null,
      isLoading: true,
      isOwner: false,
      isWorker: false,
      isClient: false,
      setRole: () => {},
      clearRole: () => {},
      refreshProfile: () => {},
    };
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [role, setRoleState] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user || null);
      if (session?.user) {
        loadUserProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 AuthContext - Auth state change:', event);
        setSession(session);
        setUser(session?.user || null);

        if (session?.user) {
          await loadUserProfile(session.user.id);
        } else {
          // User logged out - clear all state
          setRoleState(null);
          setProfile(null);
          setIsLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (userId, retryCount = 0) => {
    const MAX_RETRIES = 2;
    const TIMEOUT_MS = 2000;

    try {
      console.log('🔐 AuthContext - Loading profile for user:', userId, retryCount > 0 ? `(retry ${retryCount})` : '');

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS);
      });

      // Race between the actual query and the timeout
      const { data, error } = await Promise.race([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle(),
        timeoutPromise
      ]);

      if (error) {
        console.error('🔐 AuthContext - Error loading profile:', error);
        // Don't clear role state on error, just clear profile
        setProfile(null);
      } else if (!data) {
        console.log('🔐 AuthContext - No profile found for user (new account)');
        // Don't clear role state when no profile exists (role might have just been set)
        setProfile(null);
      } else {
        console.log('🔐 AuthContext - Profile loaded:', {
          role: data?.role,
          is_onboarded: data?.is_onboarded,
          has_language: !!data?.language
        });
        setRoleState(data?.role || null);
        setProfile(data);
      }
      setIsLoading(false);
    } catch (error) {
      // Check if it was a timeout
      if (error.message === 'TIMEOUT' && retryCount < MAX_RETRIES) {
        console.warn('🔐 AuthContext - Profile load timed out, retrying...', retryCount + 1);
        return loadUserProfile(userId, retryCount + 1);
      }

      console.error('🔐 AuthContext - Error loading profile:', error);
      // Don't clear role state on catch, just clear profile
      setProfile(null);
      setIsLoading(false);
    }
  };

  const setRole = async (newRole) => {
    if (!user) {
      console.error('🔐 AuthContext - Cannot set role: No user logged in');
      return false;
    }

    try {
      console.log('🔐 AuthContext - Setting role to:', newRole);

      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          role: newRole
        }, {
          onConflict: 'id'
        });

      if (error) {
        console.error('🔐 AuthContext - Error setting role:', error);
        return false;
      }

      setRoleState(newRole);

      // Reload profile to get updated data
      await loadUserProfile(user.id);

      console.log('🔐 AuthContext - Role set successfully');
      return true;
    } catch (error) {
      console.error('🔐 AuthContext - Error setting role:', error);
      return false;
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await loadUserProfile(user.id);
    }
  };

  const clearRole = async () => {
    if (!user) {
      console.error('🔐 AuthContext - Cannot clear role: No user logged in');
      return false;
    }

    try {
      console.log('🔐 AuthContext - Clearing role');

      const { error } = await supabase
        .from('profiles')
        .update({ role: null })
        .eq('id', user.id);

      if (error) {
        console.error('🔐 AuthContext - Error clearing role:', error);
        return false;
      }

      setRoleState(null);

      // Reload profile to get updated data
      await loadUserProfile(user.id);

      console.log('🔐 AuthContext - Role cleared successfully');
      return true;
    } catch (error) {
      console.error('🔐 AuthContext - Error clearing role:', error);
      return false;
    }
  };

  const value = {
    user,
    session,
    role,
    profile,
    isLoading,
    isOwner: role === 'owner',
    isWorker: role === 'worker',
    isClient: role === 'client',
    setRole,
    clearRole,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
