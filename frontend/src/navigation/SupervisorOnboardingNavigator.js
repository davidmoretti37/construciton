/**
 * SupervisorOnboardingNavigator
 * Simple onboarding flow for supervisors (similar to workers)
 *
 * Flow:
 * 1. Welcome - Accept invitation from owner
 * 2. Info - Basic supervisor information
 * 3. Completion - Save and finish
 *
 * Note: Supervisors use the owner's company settings (pricing, phases, etc.)
 * so they don't need the complex business setup onboarding.
 */

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { OnboardingProvider } from '../contexts/OnboardingContext';
import SupervisorWelcomeScreen from '../screens/supervisor/onboarding/SupervisorWelcomeScreen';
import SupervisorInfoScreen from '../screens/supervisor/onboarding/SupervisorInfoScreen';
import SupervisorCompletionScreen from '../screens/supervisor/onboarding/SupervisorCompletionScreen';

const Stack = createStackNavigator();

export default function SupervisorOnboardingNavigator({ onComplete, onGoBack }) {
  return (
    <OnboardingProvider onComplete={onComplete} onGoBack={onGoBack}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          gestureEnabled: false, // Prevent going back during onboarding
        }}
        initialRouteName="SupervisorWelcome"
      >
        <Stack.Screen
          name="SupervisorWelcome"
          component={SupervisorWelcomeScreen}
        />
        <Stack.Screen
          name="SupervisorInfo"
          component={SupervisorInfoScreen}
        />
        <Stack.Screen
          name="SupervisorCompletion"
          component={SupervisorCompletionScreen}
        />
      </Stack.Navigator>
    </OnboardingProvider>
  );
}
