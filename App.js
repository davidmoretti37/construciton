import 'react-native-gesture-handler';
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import BottomTabNavigator from './src/navigation/BottomTabNavigator';
import OnboardingNavigator from './src/navigation/OnboardingNavigator';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { isOnboarded } from './src/utils/storage';

// TEMPORARY: Authentication disabled for testing
// To enable auth, uncomment the auth-related code below

function AppContent() {
  const { isDark = false } = useTheme() || {};
  const [loading, setLoading] = useState(true);
  const [userOnboarded, setUserOnboarded] = useState(false);

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  const checkOnboardingStatus = async () => {
    try {
      const onboarded = await isOnboarded();
      setUserOnboarded(onboarded);
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      setUserOnboarded(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  const handleOnboardingComplete = () => {
    setUserOnboarded(true);
  };

  const handleSignOut = () => {
    setUserOnboarded(false);
  };

  return (
    <NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {userOnboarded ? (
        <BottomTabNavigator onSignOut={handleSignOut} />
      ) : (
        <OnboardingNavigator onComplete={handleOnboardingComplete} />
      )}
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

/*
AUTHENTICATION CODE (Currently Disabled)
To enable Supabase authentication, replace App.js with this:

import AuthNavigator from './src/navigation/AuthNavigator';
import { supabase } from './src/lib/supabase';

function AppContent() {
  const { isDark = false } = useTheme() || {};
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [userOnboarded, setUserOnboarded] = useState(false);

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        checkOnboardingStatus();
      } else {
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
        await checkOnboardingStatus();
      }
    } catch (error) {
      console.error('Error checking auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const getNavigator = () => {
    if (!session) return <AuthNavigator />;
    if (!userOnboarded) return <OnboardingNavigator onComplete={handleOnboardingComplete} />;
    return <BottomTabNavigator />;
  };

  return (
    <NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {getNavigator()}
    </NavigationContainer>
  );
}
*/
