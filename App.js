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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        checkLanguageAndOnboarding();
      } else {
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
      setSession(session);
      if (session) {
        await checkLanguageAndOnboarding();
      }
    } catch (error) {
      console.error('Error checking auth:', error);
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
    // Not authenticated → Show login/signup
    if (!session) {
      return <AuthNavigator />;
    }

    // Authenticated but no language selected → Show language selection
    if (!languageSelected) {
      return <LanguageSelectionScreen onLanguageSelected={handleLanguageSelected} />;
    }

    // Language selected but not onboarded → Show onboarding
    if (!userOnboarded) {
      return <OnboardingNavigator onComplete={handleOnboardingComplete} />;
    }

    // Fully set up → Show main app
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
