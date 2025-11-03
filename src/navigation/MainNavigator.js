import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import BottomTabNavigator from './BottomTabNavigator';
import SettingsNavigator from './SettingsNavigator';

const Stack = createStackNavigator();

export default function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="MainTabs" component={BottomTabNavigator} />
      <Stack.Screen
        name="Settings"
        component={SettingsNavigator}
        options={{
          presentation: 'modal', // Makes it slide up like a modal on iOS
        }}
      />
    </Stack.Navigator>
  );
}
