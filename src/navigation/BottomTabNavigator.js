import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';

// Import screens
import HomeScreen from '../screens/HomeScreen';
import ProjectsScreen from '../screens/ProjectsScreen';
import WorkersScreen from '../screens/WorkersScreen';
import ChatScreen from '../screens/ChatScreen';
import PhaseDetailScreen from '../screens/PhaseDetailScreen';

// Import navigators
import SettingsNavigator from './SettingsNavigator';

// Import custom tab bar
import LumaBar from '../components/LumaBar';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// Create a stack navigator for Projects to enable navigation to PhaseDetail
function ProjectsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="ProjectsMain" component={ProjectsScreen} />
      <Stack.Screen name="PhaseDetail" component={PhaseDetailScreen} />
    </Stack.Navigator>
  );
}

export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Chat"
      tabBar={(props) => <LumaBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Projects" component={ProjectsStack} />
      <Tab.Screen name="Workers" component={WorkersScreen} />
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="More" component={SettingsNavigator} />
    </Tab.Navigator>
  );
}
