/**
 * SubOnboardingNavigator
 *
 * One-screen onboarding for the 'sub' role: SubWelcomeScreen checks for an
 * email-based invite and either accepts (linking sub_organization →
 * profiles.is_onboarded=true) or asks them to wait.
 */

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { OnboardingProvider } from '../contexts/OnboardingContext';
import SubWelcomeScreen from '../screens/sub/onboarding/SubWelcomeScreen';

const Stack = createStackNavigator();

export default function SubOnboardingNavigator({ onComplete, onGoBack }) {
  return (
    <OnboardingProvider onComplete={onComplete} onGoBack={onGoBack}>
      <Stack.Navigator
        screenOptions={{ headerShown: false, gestureEnabled: false }}
        initialRouteName="SubWelcome"
      >
        <Stack.Screen name="SubWelcome" component={SubWelcomeScreen} />
      </Stack.Navigator>
    </OnboardingProvider>
  );
}
