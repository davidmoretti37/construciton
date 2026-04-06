import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import ClientLumaBar from '../components/ClientLumaBar';
import ClientDashboardScreen from '../screens/client/ClientDashboardScreen';
import ClientMessagesListScreen from '../screens/client/ClientMessagesListScreen';
import ClientProjectDetailScreen from '../screens/client/ClientProjectDetailScreen';
import ClientInvoicesScreen from '../screens/client/ClientInvoicesScreen';
import ClientMessagesScreen from '../screens/client/ClientMessagesScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';

const Tab = createMaterialTopTabNavigator();
const Stack = createStackNavigator();

function ClientBottomTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <ClientLumaBar {...props} />}
      screenOptions={{
        headerShown: false,
        swipeEnabled: true,
        lazy: false,
        animationEnabled: true,
      }}
      tabBarPosition="bottom"
    >
      <Tab.Screen name="Dashboard" component={ClientDashboardScreen} />
      <Tab.Screen name="MessagesList" component={ClientMessagesListScreen} />
    </Tab.Navigator>
  );
}

export default function ClientMainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={ClientBottomTabNavigator} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="ClientProjectDetail" component={ClientProjectDetailScreen} />
      <Stack.Screen name="ClientInvoices" component={ClientInvoicesScreen} />
      <Stack.Screen name="ClientMessages" component={ClientMessagesScreen} />
    </Stack.Navigator>
  );
}
