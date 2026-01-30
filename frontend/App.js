import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, LogBox } from 'react-native';
import MainNavigator from './src/navigation/MainNavigator';
import WorkerMainNavigator from './src/navigation/WorkerMainNavigator';
import ClientMainNavigator from './src/navigation/ClientMainNavigator';
import OnboardingNavigator from './src/navigation/OnboardingNavigator';
import WorkerOnboardingNavigator from './src/navigation/WorkerOnboardingNavigator';
import ClientOnboardingNavigator from './src/navigation/ClientOnboardingNavigator';
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
  const { user, session, role, profile, isLoading: authLoading, clearRole } = useAuth();
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
      if (session) {
        // Wait for profile to actually be loaded before checking
        // profile is null while loading, then gets set to the data
        if (profile !== null) {
          checkLanguageAndOnboarding();
        }
        // If profile is null but authLoading is false, profile is still propagating
        // The useEffect will re-run when profile updates
      } else {
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

      setLanguageSelected(langSelected);
      setUserOnboarded(onboarded);
    } catch (error) {
      logger.error('Error checking language and onboarding:', error);
      setLanguageSelected(false);
      setUserOnboarded(false);
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

  const handleGoBackToRoleSelection = async () => {
    const success = await clearRole();
    if (success) {
      // Role has been cleared, App.js will automatically show RoleSelectionScreen
      logger.debug('Going back to role selection');
    }
  };

  // Show loading while:
  // - auth is loading
  // - profile is being fetched (session exists but profile not yet)
  // - language/onboarding state not yet determined (null)
  if (loading || authLoading || (session && !profile) || languageSelected === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
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
    if (!session) {
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
        logger.debug('Showing: OWNER ONBOARDING');
        return <OnboardingNavigator onComplete={handleOnboardingComplete} onGoBack={handleGoBackToRoleSelection} />;
      } else if (role === 'worker') {
        logger.debug('Showing: WORKER ONBOARDING');
        return <WorkerOnboardingNavigator onComplete={handleOnboardingComplete} />;
      } else if (role === 'client') {
        logger.debug('Showing: CLIENT ONBOARDING');
        return <ClientOnboardingNavigator onComplete={handleOnboardingComplete} />;
      }
    }

    // Fully set up → Show role-specific main app
    if (role === 'owner') {
      logger.debug('Showing: OWNER MAIN APP');
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
