import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import ClientWelcomeScreen from '../screens/client/onboarding/ClientWelcomeScreen';
import ClientInfoScreen from '../screens/client/onboarding/ClientInfoScreen';
import ClientCompletionScreen from '../screens/client/onboarding/ClientCompletionScreen';

const Stack = createStackNavigator();

export default function ClientOnboardingNavigator({ onComplete }) {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
      }}
      initialRouteName="ClientWelcome"
    >
      <Stack.Screen name="ClientWelcome" component={ClientWelcomeScreen} />
      <Stack.Screen name="ClientInfo" component={ClientInfoScreen} />
      <Stack.Screen
        name="ClientCompletion"
        component={ClientCompletionScreen}
        initialParams={{ onComplete }}
      />
    </Stack.Navigator>
  );
}
