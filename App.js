import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import BottomTabNavigator from './src/navigation/BottomTabNavigator';
import OnboardingNavigator from './src/navigation/OnboardingNavigator';
import AuthNavigator from './src/navigation/AuthNavigator';
import LanguageSelectionScreen from './src/screens/LanguageSelectionScreen';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { isOnboarded, hasSelectedLanguage, saveLanguage } from './src/utils/storage';
import { supabase } from './src/lib/supabase';

function AppContent() {
  const { isDark = false } = useTheme() || {};
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [languageSelected, setLanguageSelected] = useState(false);
  const [userOnboarded, setUserOnboarded] = useState(false);

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔄 AUTH STATE CHANGE:', event);
      console.log('🔄 New session:', session ? 'LOGGED IN' : 'LOGGED OUT');

      setSession(session);
      if (session) {
        checkLanguageAndOnboarding();
      } else {
        console.log('🔄 Clearing all state - should show login');
        setLanguageSelected(false);
        setUserOnboarded(false);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('🔐 AUTH CHECK - Session:', session ? 'LOGGED IN' : 'NOT LOGGED IN');
      console.log('🔐 User ID:', session?.user?.id || 'NONE');
      setSession(session);
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
      console.log('Is onboarded:', onboarded);
      console.log('Will show:',
        !langSelected ? 'Language Selection' :
        !onboarded ? 'Onboarding (Welcome Screen)' :
        'Main App'
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

  const handleLanguageSelected = async (languageId) => {
    const success = await saveLanguage(languageId);
    if (success) {
      setLanguageSelected(true);
    }
  };

  const handleOnboardingComplete = () => {
    setUserOnboarded(true);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  const getNavigator = () => {
    console.log('📱 NAVIGATION DECISION:');
    console.log('   Session:', session ? 'YES' : 'NO');
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

    // Language selected but not onboarded → Show onboarding
    if (!userOnboarded) {
      console.log('   ➡️ Showing: ONBOARDING (Welcome Screen)');
      return <OnboardingNavigator onComplete={handleOnboardingComplete} />;
    }

    // Fully set up → Show main app
    console.log('   ➡️ Showing: MAIN APP');
    return <BottomTabNavigator />;
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
      <AppContent />
    </ThemeProvider>
  );
}
