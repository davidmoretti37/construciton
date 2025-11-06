import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import TimeClockScreen from '../screens/worker/TimeClockScreen';
import WorkerAssignmentsScreen from '../screens/worker/WorkerAssignmentsScreen';
import WorkerTimesheetScreen from '../screens/worker/WorkerTimesheetScreen';
import WorkerMessagesScreen from '../screens/worker/WorkerMessagesScreen';
import { getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const Tab = createBottomTabNavigator();

export default function WorkerBottomTabNavigator() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  return (
    <Tab.Navigator
      initialRouteName="TimeClock"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#059669',
        tabBarInactiveTintColor: Colors.secondaryText,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: Colors.border,
        },
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'TimeClock') {
            iconName = focused ? 'time' : 'time-outline';
          } else if (route.name === 'Assignments') {
            iconName = focused ? 'briefcase' : 'briefcase-outline';
          } else if (route.name === 'Timesheet') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'Messages') {
            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="TimeClock"
        component={TimeClockScreen}
        options={{ tabBarLabel: 'Clock' }}
      />
      <Tab.Screen
        name="Assignments"
        component={WorkerAssignmentsScreen}
        options={{ tabBarLabel: 'Assignments' }}
      />
      <Tab.Screen
        name="Timesheet"
        component={WorkerTimesheetScreen}
        options={{ tabBarLabel: 'Hours' }}
      />
      <Tab.Screen
        name="Messages"
        component={WorkerMessagesScreen}
        options={{ tabBarLabel: 'Messages' }}
      />
    </Tab.Navigator>
  );
}
