import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

// Import screens
import HomeScreen from '../screens/HomeScreen';
import ProjectsScreen from '../screens/ProjectsScreen';
import WorkersScreen from '../screens/WorkersScreen';
import ChatScreen from '../screens/ChatScreen';
import StatsScreen from '../screens/StatsScreen';

const Tab = createBottomTabNavigator();

// Helper to ensure proper types in navigation options
const getScreenOptions = (iconName) => ({
  tabBarIcon: ({ color, size }) => (
    <Ionicons name={iconName} size={size || 24} color={color} />
  ),
});

export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Chat"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primaryBlue,
        tabBarInactiveTintColor: Colors.secondaryText,
        tabBarStyle: {
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: Colors.border,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
        tabBarHideOnKeyboard: true,
        animationEnabled: false,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={getScreenOptions('home')}
      />
      <Tab.Screen
        name="Projects"
        component={ProjectsScreen}
        options={getScreenOptions('folder')}
      />
      <Tab.Screen
        name="Workers"
        component={WorkersScreen}
        options={getScreenOptions('people')}
      />
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={getScreenOptions('chatbubble')}
      />
      <Tab.Screen
        name="Stats"
        component={StatsScreen}
        options={getScreenOptions('bar-chart')}
      />
    </Tab.Navigator>
  );
}
