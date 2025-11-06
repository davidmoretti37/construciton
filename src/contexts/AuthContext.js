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

  const loadUserProfile = async (userId) => {
    try {
      console.log('🔐 AuthContext - Loading profile for user:', userId);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('🔐 AuthContext - Error loading profile:', error);
        setRoleState(null);
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
    } catch (error) {
      console.error('🔐 AuthContext - Error loading profile:', error);
      setRoleState(null);
      setProfile(null);
    } finally {
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
        .update({ role: newRole })
        .eq('id', user.id);

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
