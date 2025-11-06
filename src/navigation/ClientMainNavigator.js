import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import ClientBottomTabNavigator from './ClientBottomTabNavigator';
import SettingsScreen from '../screens/settings/SettingsScreen';

const Stack = createStackNavigator();

export default function ClientMainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="MainTabs" component={ClientBottomTabNavigator} />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
}
