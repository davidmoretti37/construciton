import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
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
import { isOnboarded, hasSelectedLanguage, saveLanguage } from './src/utils/storage';
import { supabase } from './src/lib/supabase';

function AppContent() {
  const { isDark = false } = useTheme() || {};
  const { user, session, role, isLoading: authLoading, clearRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [languageSelected, setLanguageSelected] = useState(false);
  const [userOnboarded, setUserOnboarded] = useState(false);

  useEffect(() => {
    console.log('🚀 APP STARTING...');
    console.log('🚀 Checking Supabase connection...');

    // Verify Supabase is configured
    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          console.error('❌ SUPABASE ERROR:', error.message);
        } else {
          console.log('✅ Supabase connected successfully');
        }
      });

    checkAuth();
  }, []);

  // Monitor auth state from AuthContext
  useEffect(() => {
    if (!authLoading) {
      if (session) {
        checkLanguageAndOnboarding();
      } else {
        console.log('🔄 No session - should show login');
        setLanguageSelected(false);
        setUserOnboarded(false);
        setLoading(false);
      }
    }
  }, [session, authLoading]);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('🔐 AUTH CHECK - Session:', session ? 'LOGGED IN' : 'NOT LOGGED IN');
      console.log('🔐 User ID:', session?.user?.id || 'NONE');
      if (session) {
        await checkLanguageAndOnboarding();
      } else {
        console.log('🔐 No session found - should show LOGIN screen');
      }
    } catch (error) {
      console.error('❌ Error checking auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkLanguageAndOnboarding = async () => {
    try {
      const [langSelected, onboarded] = await Promise.all([
        hasSelectedLanguage(),
        isOnboarded()
      ]);

      console.log('=== APP FLOW DEBUG ===');
      console.log('Has language selected:', langSelected);
      console.log('Has role:', role);
      console.log('Is onboarded:', onboarded);
      console.log('Will show:',
        !langSelected ? 'Language Selection' :
        !role ? 'Role Selection' :
        !onboarded ? `${role} Onboarding` :
        `${role} Main App`
      );
      console.log('=====================');

      setLanguageSelected(langSelected);
      setUserOnboarded(onboarded);
    } catch (error) {
      console.error('Error checking language and onboarding:', error);
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
      console.log('📱 Going back to role selection');
    }
  };

  if (loading || authLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  const getNavigator = () => {
    console.log('📱 NAVIGATION DECISION:');
    console.log('   Session:', session ? 'YES' : 'NO');
    console.log('   Role:', role || 'NONE');
    console.log('   Language Selected:', languageSelected ? 'YES' : 'NO');
    console.log('   Onboarded:', userOnboarded ? 'YES' : 'NO');

    // Not authenticated → Show login/signup
    if (!session) {
      console.log('   ➡️ Showing: LOGIN SCREEN');
      return <AuthNavigator />;
    }

    // Authenticated but no language selected → Show language selection
    if (!languageSelected) {
      console.log('   ➡️ Showing: LANGUAGE SELECTION');
      return <LanguageSelectionScreen onLanguageSelected={handleLanguageSelected} />;
    }

    // Language selected but no role → Show role selection
    if (!role) {
      console.log('   ➡️ Showing: ROLE SELECTION');
      return <RoleSelectionScreen onRoleSelected={handleRoleSelected} />;
    }

    // Role selected but not onboarded → Show role-specific onboarding
    if (!userOnboarded) {
      if (role === 'owner') {
        console.log('   ➡️ Showing: OWNER ONBOARDING');
        return <OnboardingNavigator onComplete={handleOnboardingComplete} onGoBack={handleGoBackToRoleSelection} />;
      } else if (role === 'worker') {
        console.log('   ➡️ Showing: WORKER ONBOARDING');
        return <WorkerOnboardingNavigator onComplete={handleOnboardingComplete} />;
      } else if (role === 'client') {
        console.log('   ➡️ Showing: CLIENT ONBOARDING');
        return <ClientOnboardingNavigator onComplete={handleOnboardingComplete} />;
      }
    }

    // Fully set up → Show role-specific main app
    if (role === 'owner') {
      console.log('   ➡️ Showing: OWNER MAIN APP');
      return <MainNavigator />;
    } else if (role === 'worker') {
      console.log('   ➡️ Showing: WORKER MAIN APP');
      return <WorkerMainNavigator />;
    } else if (role === 'client') {
      console.log('   ➡️ Showing: CLIENT MAIN APP');
      return <ClientMainNavigator />;
    }

    // Fallback
    console.log('   ➡️ Showing: MAIN APP (fallback)');
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
        <AppContent />
      </AuthProvider>
    </ThemeProvider>
  );
}
