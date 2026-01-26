import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import BottomTabNavigator from './BottomTabNavigator';
import SettingsNavigator from './SettingsNavigator';
import WorkerDetailHistoryScreen from '../screens/WorkerDetailHistoryScreen';
import EditWorkerPaymentScreen from '../screens/EditWorkerPaymentScreen';
import OwnerDailyReportsScreen from '../screens/OwnerDailyReportsScreen';
import DailyReportFormScreen from '../screens/worker/DailyReportFormScreen';
import DailyReportDetailScreen from '../screens/worker/DailyReportDetailScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import NotificationSettingsScreen from '../screens/settings/NotificationSettingsScreen';
import DocumentViewerScreen from '../screens/DocumentViewerScreen';

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
      <Stack.Screen
        name="EditWorkerPayment"
        component={EditWorkerPaymentScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="OwnerDailyReports"
        component={OwnerDailyReportsScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="DailyReportForm"
        component={DailyReportFormScreen}
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="DailyReportDetail"
        component={DailyReportDetailScreen}
        options={{
          headerShown: false,
        }}
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
        name="DocumentViewer"
        component={DocumentViewerScreen}
        options={{
          headerShown: false,
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
}
