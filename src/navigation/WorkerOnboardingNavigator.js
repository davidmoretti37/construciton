import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import WorkerWelcomeScreen from '../screens/worker/onboarding/WorkerWelcomeScreen';
import WorkerInfoScreen from '../screens/worker/onboarding/WorkerInfoScreen';
import WorkerCompletionScreen from '../screens/worker/onboarding/WorkerCompletionScreen';

const Stack = createStackNavigator();

export default function WorkerOnboardingNavigator({ onComplete }) {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
      }}
      initialRouteName="WorkerWelcome"
    >
      <Stack.Screen name="WorkerWelcome" component={WorkerWelcomeScreen} />
      <Stack.Screen name="WorkerInfo" component={WorkerInfoScreen} />
      <Stack.Screen
        name="WorkerCompletion"
        component={WorkerCompletionScreen}
        initialParams={{ onComplete }}
      />
    </Stack.Navigator>
  );
}
