import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { memoryService } from '../services/agents/core/MemoryService';
import {
  saveProfileToCache,
  loadProfileFromCache,
  clearProfileCache,
} from '../services/profileCacheService';

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
      loadError: null,
      isUsingCache: false,
      isOwner: false,
      isSupervisor: false,
      isWorker: false,
      ownerId: null,
      setRole: () => {},
      clearRole: () => {},
      refreshProfile: () => {},
      retryProfileLoad: () => {},
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
  const [loadError, setLoadError] = useState(null);
  const [isUsingCache, setIsUsingCache] = useState(false);

  // Owner/Supervisor hierarchy state
  const [ownerId, setOwnerIdState] = useState(null); // For supervisors - their owner's ID
  const [ownerHidesContract, setOwnerHidesContract] = useState(false); // Owner's setting for supervisors
  const profileRef = useRef(null); // Mirrors profile state — avoids stale closure in loadUserProfile

  useEffect(() => {
    // Load cached profile first for instant UI
    const loadCachedProfile = async () => {
      try {
        const { profile: cachedProfile, isStale } = await loadProfileFromCache();
        if (cachedProfile) {
          console.log('🔐 AuthContext - Loaded cached profile:', { isStale });
          setProfile(cachedProfile);
          profileRef.current = cachedProfile;
          setRoleState(cachedProfile?.role || null);
          setOwnerIdState(cachedProfile?.owner_id || null);
          setIsUsingCache(true);
          setIsLoading(false); // Allow app to render immediately with cached data
        }
      } catch (err) {
        console.warn('🔐 AuthContext - Failed to load cached profile:', err);
      }
    };

    loadCachedProfile();

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
          // Skip redundant profile load on token refresh if profile already loaded
          if (event === 'TOKEN_REFRESHED' && profileRef.current) {
            return;
          }
          await loadUserProfile(session.user.id);
        } else {
          // User logged out - clear all state
          setRoleState(null);
          setOwnerIdState(null);
          setProfile(null);
          profileRef.current = null;
          setIsLoading(false);
          setLoadError(null);
          setIsUsingCache(false);
          // Clear memory service cache on logout
          memoryService.cache?.clear();
          // Clear profile cache on logout
          await clearProfileCache();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const loadUserProfile = async (userId, retryCount = 0) => {
    const MAX_RETRIES = 2;
    const TIMEOUT_MS = 5000; // 5s per attempt

    try {
      console.log('🔐 AuthContext - Loading profile for user:', userId, retryCount > 0 ? `(retry ${retryCount})` : '');
      setLoadError(null);

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
        // If we have a cached profile, keep using it; otherwise set error
        if (!profileRef.current) {
          setLoadError('Failed to load profile');
        }
      } else if (!data) {
        console.log('🔐 AuthContext - No profile found for user (new account)');
        // New user - clear cache since there's no profile yet
        await clearProfileCache();
        setProfile(null);
        setIsUsingCache(false);
      } else if (data && !data.role) {
        // New user with no role yet — check if they have a pending supervisor invite
        try {
          const userEmail = (await supabase.auth.getUser())?.data?.user?.email;
          if (userEmail) {
            const { data: pendingInvites } = await supabase
              .from('supervisor_invites')
              .select('id')
              .eq('status', 'pending')
              .ilike('email', userEmail)
              .limit(1);

            if (pendingInvites && pendingInvites.length > 0) {
              console.log('🔐 AuthContext - Pending supervisor invite found, auto-setting role');
              await supabase
                .from('profiles')
                .update({ role: 'supervisor' })
                .eq('id', userId);
              data.role = 'supervisor';
            } else {
              // Also check workers table for pending worker invites
              const { data: pendingWorkerInvites } = await supabase
                .from('workers')
                .select('id')
                .eq('status', 'pending')
                .is('user_id', null)
                .ilike('email', userEmail)
                .limit(1);

              if (pendingWorkerInvites && pendingWorkerInvites.length > 0) {
                console.log('🔐 AuthContext - Pending worker invite found, auto-setting role');
                await supabase
                  .from('profiles')
                  .update({ role: 'worker' })
                  .eq('id', userId);
                data.role = 'worker';
              }
            }
          }
        } catch (inviteCheckError) {
          console.warn('🔐 AuthContext - Could not check for invites:', inviteCheckError);
        }

        // Continue with normal profile loading below
        console.log('🔐 AuthContext - Profile loaded:', {
          role: data?.role,
          owner_id: data?.owner_id,
          is_onboarded: data?.is_onboarded,
          has_language: !!data?.language
        });
        setRoleState(data?.role || null);
        setOwnerIdState(data?.owner_id || null);
        setProfile(data);
        profileRef.current = data;
        setIsUsingCache(false);
        setLoadError(null);

        // For supervisors, fetch owner's visibility settings
        if (data?.role === 'supervisor' && data?.owner_id) {
          try {
            const { data: ownerProfile, error: ownerError } = await supabase
              .from('profiles')
              .select('hide_contract_from_supervisors')
              .eq('id', data.owner_id)
              .maybeSingle();
            if (ownerError) {
              console.warn('AuthContext - Error fetching owner settings:', ownerError);
            }
            setOwnerHidesContract(ownerProfile?.hide_contract_from_supervisors || false);
          } catch (err) {
            console.warn('AuthContext - Could not fetch owner settings:', err);
          }
        } else {
          setOwnerHidesContract(false);
        }

        await saveProfileToCache(data);

        memoryService.initialize(userId).catch(err => {
          console.warn('🧠 AuthContext - Memory service init warning:', err);
        });
      } else {
        console.log('🔐 AuthContext - Profile loaded:', {
          role: data?.role,
          owner_id: data?.owner_id,
          is_onboarded: data?.is_onboarded,
          has_language: !!data?.language
        });
        setRoleState(data?.role || null);
        setOwnerIdState(data?.owner_id || null); // Track owner_id for supervisors
        setProfile(data);
        profileRef.current = data;
        setIsUsingCache(false);
        setLoadError(null);

        // For supervisors, fetch owner's visibility settings
        if (data?.role === 'supervisor' && data?.owner_id) {
          try {
            const { data: ownerProfile, error: ownerError } = await supabase
              .from('profiles')
              .select('hide_contract_from_supervisors')
              .eq('id', data.owner_id)
              .maybeSingle();
            if (ownerError) {
              console.warn('AuthContext - Error fetching owner settings:', ownerError);
            }
            setOwnerHidesContract(ownerProfile?.hide_contract_from_supervisors || false);
          } catch (err) {
            console.warn('AuthContext - Could not fetch owner settings:', err);
          }
        } else {
          setOwnerHidesContract(false);
        }

        // Save to cache for next app launch
        await saveProfileToCache(data);

        // Initialize memory service for personalized AI responses
        memoryService.initialize(userId).catch(err => {
          console.warn('🧠 AuthContext - Memory service init warning:', err);
        });
      }
      setIsLoading(false);
    } catch (error) {
      // Check if it was a timeout
      if (error.message === 'TIMEOUT') {
        // If we have a cached profile, don't retry - just use cache silently
        if (profileRef.current) {
          console.log('🔐 AuthContext - Timeout but using cached profile');
          setIsLoading(false);
          return;
        }
        // No cache - retry up to MAX_RETRIES
        if (retryCount < MAX_RETRIES) {
          console.warn('🔐 AuthContext - Profile load timed out, retrying...', retryCount + 1);
          return loadUserProfile(userId, retryCount + 1);
        }
      }

      console.error('🔐 AuthContext - Error loading profile:', error);
      // If we have a cached profile, keep using it
      if (!profileRef.current) {
        setLoadError('Connection timed out');
      }
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

  const retryProfileLoad = async () => {
    if (user) {
      setLoadError(null);
      setIsLoading(true);
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
    loadError,
    isUsingCache,
    // Role checks
    isOwner: role === 'owner',
    isSupervisor: role === 'supervisor',
    isWorker: role === 'worker',
    // Owner/Supervisor hierarchy
    ownerId, // For supervisors - their owner's ID
    ownerHidesContract, // Whether owner hides contract amounts from supervisors
    // Functions
    setRole,
    clearRole,
    refreshProfile,
    retryProfileLoad,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
