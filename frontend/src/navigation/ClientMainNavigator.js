import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import ClientTabNavigator from './ClientTabNavigator';
import ClientProjectDetailScreen from '../screens/client/ClientProjectDetailScreen';
import ClientInvoicesScreen from '../screens/client/ClientInvoicesScreen';
import ClientMessagesScreen from '../screens/client/ClientMessagesScreen';
import ClientChangeOrderDetailScreen from '../screens/client/ClientChangeOrderDetailScreen';
import ClientDocumentsScreen from '../screens/client/ClientDocumentsScreen';
import ClientPhotosScreen from '../screens/client/ClientPhotosScreen';
import ClientAISummariesScreen from '../screens/client/ClientAISummariesScreen';
import ClientSelectionsScreen from '../screens/client/ClientSelectionsScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';

const Stack = createStackNavigator();

export default function ClientMainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {/* Tab navigator is the root */}
      <Stack.Screen name="ClientTabs" component={ClientTabNavigator} />

      {/* Detail screens push above tabs (tab bar hides) */}
      <Stack.Screen name="ClientProjectDetail" component={ClientProjectDetailScreen} />
      <Stack.Screen name="ClientInvoices" component={ClientInvoicesScreen} />
      <Stack.Screen name="ClientMessages" component={ClientMessagesScreen} />
      <Stack.Screen name="ClientChangeOrderDetail" component={ClientChangeOrderDetailScreen} />
      <Stack.Screen name="ClientDocuments" component={ClientDocumentsScreen} />
      <Stack.Screen name="ClientPhotos" component={ClientPhotosScreen} />
      <Stack.Screen name="ClientAISummaries" component={ClientAISummariesScreen} />
      <Stack.Screen name="ClientSelections" component={ClientSelectionsScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}
