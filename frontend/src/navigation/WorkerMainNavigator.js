import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import WorkerBottomTabNavigator from './WorkerBottomTabNavigator';
import SettingsScreen from '../screens/settings/SettingsScreen';
import WorkerProjectDetailScreen from '../screens/worker/WorkerProjectDetailScreen';
import DailyReportFormScreen from '../screens/worker/DailyReportFormScreen';
import DailyReportDetailScreen from '../screens/worker/DailyReportDetailScreen';
import ExpenseFormScreen from '../screens/worker/ExpenseFormScreen';
import ExpenseDetailScreen from '../screens/worker/ExpenseDetailScreen';
import DocumentViewerScreen from '../screens/DocumentViewerScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import NotificationSettingsScreen from '../screens/settings/NotificationSettingsScreen';
import WorkerDailyRouteScreen from '../screens/worker/WorkerDailyRouteScreen';
import VisitDetailScreen from '../screens/worker/VisitDetailScreen';

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
      <Stack.Screen
        name="ExpenseForm"
        component={ExpenseFormScreen}
      />
      <Stack.Screen
        name="ExpenseDetail"
        component={ExpenseDetailScreen}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="WorkerDailyRoute"
        component={WorkerDailyRouteScreen}
      />
      <Stack.Screen
        name="VisitDetail"
        component={VisitDetailScreen}
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
