import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import ClientDashboardScreen from '../screens/client/ClientDashboardScreen';
import ClientProjectDetailScreen from '../screens/client/ClientProjectDetailScreen';
import ClientInvoicesScreen from '../screens/client/ClientInvoicesScreen';
import ClientMessagesScreen from '../screens/client/ClientMessagesScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';

const Stack = createStackNavigator();

export default function ClientMainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Dashboard" component={ClientDashboardScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="ClientProjectDetail" component={ClientProjectDetailScreen} />
      <Stack.Screen name="ClientInvoices" component={ClientInvoicesScreen} />
      <Stack.Screen name="ClientMessages" component={ClientMessagesScreen} />
    </Stack.Navigator>
  );
}
