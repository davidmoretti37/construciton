import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import BottomTabNavigator from './BottomTabNavigator';
import SettingsNavigator from './SettingsNavigator';
import WorkerDetailHistoryScreen from '../screens/WorkerDetailHistoryScreen';

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
      <Stack.Screen
        name="WorkerDetailHistory"
        component={WorkerDetailHistoryScreen}
        options={{
          headerShown: false,
        }}
      />
    </Stack.Navigator>
  );
}
