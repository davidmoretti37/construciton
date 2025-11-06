import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import WorkerBottomTabNavigator from './WorkerBottomTabNavigator';
import SettingsScreen from '../screens/settings/SettingsScreen';

const Stack = createStackNavigator();

export default function WorkerMainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="MainTabs" component={WorkerBottomTabNavigator} />
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
