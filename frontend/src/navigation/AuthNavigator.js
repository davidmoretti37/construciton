import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import PricingPreviewScreen from '../screens/auth/PricingPreviewScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';
import RoleSelectionScreen from '../screens/auth/RoleSelectionScreen';

const Stack = createStackNavigator();

export default function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
      }}
      initialRouteName="Pricing"
    >
      <Stack.Screen name="Pricing" component={PricingPreviewScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
      <Stack.Screen name="RoleSelection" component={RoleSelectionScreen} />
    </Stack.Navigator>
  );
}
