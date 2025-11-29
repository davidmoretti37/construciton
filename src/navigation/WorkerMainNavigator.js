import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import WorkerBottomTabNavigator from './WorkerBottomTabNavigator';
import SettingsScreen from '../screens/settings/SettingsScreen';
import WorkerProjectDetailScreen from '../screens/worker/WorkerProjectDetailScreen';
import DailyReportFormScreen from '../screens/worker/DailyReportFormScreen';
import DailyReportDetailScreen from '../screens/worker/DailyReportDetailScreen';

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
      <Stack.Screen
        name="WorkerProjectDetail"
        component={WorkerProjectDetailScreen}
      />
      <Stack.Screen
        name="DailyReportForm"
        component={DailyReportFormScreen}
      />
      <Stack.Screen
        name="DailyReportDetail"
        component={DailyReportDetailScreen}
      />
    </Stack.Navigator>
  );
}
