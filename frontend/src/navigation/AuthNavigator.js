import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, Linking } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import PremiumOnboarding from '../screens/onboarding/PremiumOnboarding';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import RoleSelectionScreen from '../screens/auth/RoleSelectionScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/auth/ResetPasswordScreen';

const Stack = createStackNavigator();

export default function AuthNavigator() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [inviteEmail, setInviteEmail] = useState(null);

  useEffect(() => {
    const init = async () => {
      // Check if app was opened via an invite deep link
      const url = await Linking.getInitialURL();
      const email = parseInviteEmail(url);

      if (email) {
        // Invite link — go straight to Signup, skip onboarding slides
        setInviteEmail(email);
        setInitialRoute('Signup');
      } else {
        const hasSeenOnboarding = await AsyncStorage.getItem('@hasSeenOnboarding');
        setInitialRoute(hasSeenOnboarding === 'true' ? 'Login' : 'Onboarding');
      }
    };
    init();

    // Also listen for links while app is already open
    const sub = Linking.addEventListener('url', ({ url }) => {
      const email = parseInviteEmail(url);
      if (email) setInviteEmail(email);
    });
    return () => sub.remove();
  }, []);

  // Show loading while checking
  if (!initialRoute) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
      }}
      initialRouteName={initialRoute}
    >
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="PremiumOnboarding" component={PremiumOnboarding} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen
        name="Signup"
        component={SignupScreen}
        initialParams={{ inviteEmail: inviteEmail }}
      />
      <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </Stack.Navigator>
  );
}

function parseInviteEmail(url) {
  if (!url) return null;
  try {
    // Handle both: https://construciton-production.up.railway.app/invite?email=x
    //         and: sylk://invite?email=x
    if (url.includes('/invite')) {
      const match = url.match(/[?&]email=([^&]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
  } catch (e) {}
  return null;
}
