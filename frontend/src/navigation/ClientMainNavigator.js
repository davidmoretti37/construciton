import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import ClientBottomTabNavigator from './ClientBottomTabNavigator';
import SettingsScreen from '../screens/settings/SettingsScreen';
import DocumentViewerScreen from '../screens/DocumentViewerScreen';

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
      <Stack.Screen
        name="DocumentViewer"
        component={DocumentViewerScreen}
        options={{
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
}
