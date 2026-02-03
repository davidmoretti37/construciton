import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { LogBox } from 'react-native';
import AppLoadingScreen from './src/components/AppLoadingScreen';
import MainNavigator from './src/navigation/MainNavigator';
import WorkerMainNavigator from './src/navigation/WorkerMainNavigator';
import ClientMainNavigator from './src/navigation/ClientMainNavigator';
import OwnerMainNavigator from './src/navigation/OwnerMainNavigator';
import OwnerMainWrapper from './src/components/OwnerMainWrapper';
import OnboardingNavigator from './src/navigation/OnboardingNavigator';
import WorkerOnboardingNavigator from './src/navigation/WorkerOnboardingNavigator';
import ClientOnboardingNavigator from './src/navigation/ClientOnboardingNavigator';
import SupervisorOnboardingNavigator from './src/navigation/SupervisorOnboardingNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';
import LanguageSelectionScreen from './src/screens/LanguageSelectionScreen';
import RoleSelectionScreen from './src/screens/auth/RoleSelectionScreen';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';
import { NotificationProvider } from './src/contexts/NotificationContext';
import { SubscriptionProvider } from './src/contexts/SubscriptionContext';
import { isOnboarded, saveLanguage, checkAndStartScheduledProjects } from './src/utils/storage';
import { supabase } from './src/lib/supabase';
import logger from './src/utils/logger';
import './src/i18n'; // Initialize i18n
import { changeLanguage } from './src/i18n';

// Suppress annoying warnings (they're false positives or transient errors)
LogBox.ignoreLogs([
  'It looks like you might be using shared value',
  'animations-in-inline-styling',
  'Reanimated',
  '[Reanimated]',
  // Expo push notification server issues (transient, handled with retry logic)
  'DEBUG [expo-notifications]',
  'no healthy upstream',
  'SERVICE_UNAVAILABLE',
  'Push notifications temporarily unavailable',
]);

function AppContent() {
  const { isDark = false } = useTheme() || {};
  const {
    user,
    session,
    role,
    profile,
    isLoading: authLoading,
    loadError,
    isUsingCache,
    clearRole,
    ownerId,
    refreshProfile,
    retryProfileLoad,
  } = useAuth();
  const [loading, setLoading] = useState(true);
  const [languageSelected, setLanguageSelected] = useState(null); // null = not yet determined
  const [userOnboarded, setUserOnboarded] = useState(null); // null = not yet determined

  useEffect(() => {
    logger.emoji('🚀', 'APP STARTING...');
    logger.debug('Checking Supabase connection...');

    // Verify Supabase is configured
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          logger.error('SUPABASE ERROR:', error.message);
        } else {
          logger.debug('Supabase connected successfully');
        }
      });
    // Auth state is handled by the useEffect watching [session, authLoading, profile]
  }, []);

  // Monitor auth state from AuthContext
  useEffect(() => {
    if (!authLoading) {
      if (session && profile !== null) {
        // Immediately set state from profile to prevent screen flash
        const hasLang = profile?.language !== null && profile?.language !== '';
        const isOnboarded = profile?.is_onboarded === true;
        if (hasLang) setLanguageSelected(true);
        if (isOnboarded) setUserOnboarded(true);
        // Then do full check (syncs i18n, etc.)
        checkLanguageAndOnboarding();
      } else if (profile && !session && isUsingCache) {
        // Have cached profile but session not loaded yet (initial app load only)
        // Pre-set state from cached profile so we don't flash wrong screens
        const cachedLanguage = profile?.language;
        if (cachedLanguage) {
          setLanguageSelected(true);
          changeLanguage(cachedLanguage);
          logger.debug('Pre-set language from cache:', cachedLanguage);
        }
        // Also pre-set onboarded status from cache
        if (profile?.is_onboarded !== undefined) {
          setUserOnboarded(profile.is_onboarded);
        }
        // Set loading false so app can render with cached data
        setLoading(false);
        // Session will load soon and trigger a refresh
      } else if (!session) {
        // No session - user needs to login
        // This handles both: initial load with no cached data, AND logout
        logger.debug('No session - showing login');
        setLanguageSelected(false);
        setUserOnboarded(false);
        setLoading(false);
      }
    }
  }, [session, authLoading, profile]);

  const checkLanguageAndOnboarding = async () => {
    try {
      // Use profile from AuthContext instead of making separate queries
      // This avoids race conditions where supabase.auth.getUser() isn't ready yet
      const savedLanguage = profile?.language || null;
      const langSelected = savedLanguage !== null && savedLanguage !== '';
      const onboarded = await isOnboarded();

      // Sync i18n with saved language preference
      if (savedLanguage) {
        await changeLanguage(savedLanguage);
        logger.debug('Language synced to i18n:', savedLanguage);
      }

      // Check and auto-start scheduled projects (only for contractor role)
      if (role === 'contractor' && onboarded) {
        const startedCount = await checkAndStartScheduledProjects();
        if (startedCount > 0) {
          logger.info(`Auto-started ${startedCount} scheduled project(s)`);
        }
      }

      logger.group('APP FLOW DEBUG', () => {
        logger.debug('Has language selected:', langSelected);
        logger.debug('Has role:', role);
        logger.debug('Is onboarded:', onboarded);
        logger.debug('Will show:',
          !langSelected ? 'Language Selection' :
          !role ? 'Role Selection' :
          !onboarded ? `${role} Onboarding` :
          `${role} Main App`
        );
      });

      // Use functional updates to prevent stale async calls from going backwards.
      // Once languageSelected or userOnboarded is true, never revert to false
      // (race condition: multiple checkLanguageAndOnboarding calls can overlap).
      setLanguageSelected(prev => prev === true ? true : langSelected);
      setUserOnboarded(prev => prev === true ? true : onboarded);
    } catch (error) {
      logger.error('Error checking language and onboarding:', error);
      // Don't reset to false if already set to true (stale call protection)
      setLanguageSelected(prev => prev === true ? true : false);
      setUserOnboarded(prev => prev === true ? true : false);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelected = async () => {
    // Refresh the auth context to get updated role
    // Then re-check language and onboarding
    await checkLanguageAndOnboarding();
  };

  const handleLanguageSelected = async (languageId) => {
    const success = await saveLanguage(languageId);
    if (success) {
      // Update i18n language
      await changeLanguage(languageId);
      logger.debug('Language set to:', languageId);
      setLanguageSelected(true);
    }
  };

  const handleOnboardingComplete = () => {
    setUserOnboarded(true);
  };

  const handleSupervisorInviteComplete = async () => {
    // Refresh profile to get updated owner_id and is_onboarded status
    await refreshProfile();
    // Re-check onboarding status
    await checkLanguageAndOnboarding();
  };

  const handleGoBackToRoleSelection = async () => {
    const success = await clearRole();
    if (success) {
      // Role has been cleared, App.js will automatically show RoleSelectionScreen
      logger.debug('Going back to role selection');
    }
  };

  // Show loading while:
  // - local loading state is true
  // - auth is loading
  // - session exists but profile not loaded yet
  // - language/onboarding state not yet determined (null)
  const needsLoading = loading || authLoading || (session && !profile) || languageSelected === null;

  if (needsLoading || loadError) {
    return (
      <AppLoadingScreen
        error={loadError}
        onRetry={retryProfileLoad}
        timeoutMs={15000}
      />
    );
  }

  const getNavigator = () => {
    logger.group('NAVIGATION DECISION', () => {
      logger.debug('Session:', session ? 'YES' : 'NO');
      logger.debug('Role:', role || 'NONE');
      logger.debug('Language Selected:', languageSelected ? 'YES' : 'NO');
      logger.debug('Onboarded:', userOnboarded ? 'YES' : 'NO');
    });

    // Not authenticated → Show login/signup
    // BUT only if we don't have a cached profile (which indicates user was logged in)
    if (!session) {
      // If we have profile data (cached), user is likely logged in - wait for session
      if (profile || isUsingCache) {
        logger.debug('Showing: LOADING (waiting for session with cached profile)');
        return <AppLoadingScreen timeoutMs={15000} />;
      }
      logger.debug('Showing: LOGIN SCREEN');
      return <AuthNavigator />;
    }

    // Authenticated but no language selected → Show language selection
    if (languageSelected === false) {
      logger.debug('Showing: LANGUAGE SELECTION');
      return <LanguageSelectionScreen onLanguageSelected={handleLanguageSelected} />;
    }

    // Language selected but no role → Show role selection
    if (!role) {
      logger.debug('Showing: ROLE SELECTION');
      return <RoleSelectionScreen onRoleSelected={handleRoleSelected} />;
    }

    // Role selected but not onboarded → Show role-specific onboarding
    if (userOnboarded === false) {
      if (role === 'owner') {
        // Owner uses a simpler onboarding (reuse existing for now)
        logger.debug('Showing: OWNER ONBOARDING');
        return <OnboardingNavigator onComplete={handleOnboardingComplete} onGoBack={handleGoBackToRoleSelection} />;
      } else if (role === 'supervisor') {
        // Supervisor uses simple onboarding (like workers):
        // 1. Welcome - Accept invitation from owner
        // 2. Info - Basic supervisor information (name, phone, title)
        // 3. Completion - Save and finish
        // Note: Supervisors use the owner's company settings (pricing, phases, etc.)
        logger.debug('Showing: SUPERVISOR SIMPLE ONBOARDING');
        return <SupervisorOnboardingNavigator onComplete={handleOnboardingComplete} onGoBack={handleGoBackToRoleSelection} />;
      } else if (role === 'worker') {
        logger.debug('Showing: WORKER ONBOARDING');
        return <WorkerOnboardingNavigator onComplete={handleOnboardingComplete} onGoBack={handleGoBackToRoleSelection} />;
      } else if (role === 'client') {
        logger.debug('Showing: CLIENT ONBOARDING');
        return <ClientOnboardingNavigator onComplete={handleOnboardingComplete} />;
      }
    }

    // Fully set up → Show role-specific main app
    if (role === 'owner') {
      logger.debug('Showing: OWNER BOSS VIEW');
      return <OwnerMainWrapper key="owner-main" />;
    } else if (role === 'supervisor') {
      // Supervisor needs to be linked to an owner to use the app
      if (!ownerId) {
        // Not linked to an owner - show invitation screen
        logger.debug('Showing: SUPERVISOR INVITATION SCREEN (no owner linked)');
        return <SupervisorOnboardingNavigator onComplete={handleSupervisorInviteComplete} />;
      }
      // Supervisor sees the full app (previously owner app)
      logger.debug('Showing: SUPERVISOR MAIN APP');
      return <MainNavigator />;
    } else if (role === 'worker') {
      logger.debug('Showing: WORKER MAIN APP');
      return <WorkerMainNavigator />;
    } else if (role === 'client') {
      logger.debug('Showing: CLIENT MAIN APP');
      return <ClientMainNavigator />;
    }

    // Fallback
    logger.debug('Showing: MAIN APP (fallback)');
    return <MainNavigator />;
  };

  return (
    <NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {getNavigator()}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SubscriptionProvider>
          <NotificationProvider>
            <AppContent />
          </NotificationProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
