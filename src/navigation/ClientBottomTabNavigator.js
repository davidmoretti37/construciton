import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import ClientProjectsScreen from '../screens/client/ClientProjectsScreen';
import ClientPhotosScreen from '../screens/client/ClientPhotosScreen';
import ClientInvoicesScreen from '../screens/client/ClientInvoicesScreen';
import ClientMessagesScreen from '../screens/client/ClientMessagesScreen';
import { getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const Tab = createBottomTabNavigator();

export default function ClientBottomTabNavigator() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  return (
    <Tab.Navigator
      initialRouteName="Projects"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#7C3AED',
        tabBarInactiveTintColor: Colors.secondaryText,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.border,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Projects') {
            iconName = focused ? 'briefcase' : 'briefcase-outline';
          } else if (route.name === 'Photos') {
            iconName = focused ? 'images' : 'images-outline';
          } else if (route.name === 'Invoices') {
            iconName = focused ? 'document-text' : 'document-text-outline';
          } else if (route.name === 'Messages') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Projects"
        component={ClientProjectsScreen}
        options={{ tabBarLabel: 'Projects' }}
      />
      <Tab.Screen
        name="Photos"
        component={ClientPhotosScreen}
        options={{ tabBarLabel: 'Photos' }}
      />
      <Tab.Screen
        name="Invoices"
        component={ClientInvoicesScreen}
        options={{ tabBarLabel: 'Invoices' }}
      />
      <Tab.Screen
        name="Messages"
        component={ClientMessagesScreen}
        options={{ tabBarLabel: 'Messages' }}
      />
    </Tab.Navigator>
  );
}
