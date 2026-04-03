/**
 * BottomTabNavigator
 * Bottom tabs for Supervisors
 * 5 tabs: Home, Projects, Chat, Workers, Settings
 * Includes QuickActionFAB for fast access to common actions
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createStackNavigator } from '@react-navigation/stack';

// Import screens
import HomeScreen from '../screens/HomeScreen';
import ProjectsScreen from '../screens/ProjectsScreen';
import ChatScreen from '../screens/ChatScreen';
import ErrorBoundary from '../components/ErrorBoundary';
import WorkersScreen from '../screens/WorkersScreen';

const ChatScreenWithBoundary = (props) => (
  <ErrorBoundary>
    <ChatScreen {...props} />
  </ErrorBoundary>
);
import PhaseDetailScreen from '../screens/PhaseDetailScreen';
import ProjectDetailScreen from '../screens/ProjectDetailScreen';
import ProjectTransactionsScreen from '../screens/ProjectTransactionsScreen';
import TransactionEntryScreen from '../screens/TransactionEntryScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';

// Import navigators
import SettingsNavigator from './SettingsNavigator';

// Import custom tab bar and FAB
import LumaBar from '../components/LumaBar';
import QuickActionFAB from '../components/QuickActionFAB';
import QuickActionSheet from '../components/QuickActionSheet';

const Tab = createMaterialTopTabNavigator();
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
      <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} />
      <Stack.Screen name="PhaseDetail" component={PhaseDetailScreen} />
      <Stack.Screen name="ProjectTransactions" component={ProjectTransactionsScreen} />
      <Stack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
      <Stack.Screen
        name="TransactionEntry"
        component={TransactionEntryScreen}
        options={{
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
}

// Wrapper component that combines LumaBar + FAB
const SupervisorNavContainer = (props) => {
  const [showSheet, setShowSheet] = useState(false);
  const [actionType, setActionType] = useState(null);

  const handleActionPress = (action) => {
    if (action.type === 'ai') {
      // Open the sheet for AI-assisted creation
      setActionType(action.id);
      setShowSheet(true);
    } else if (action.id === 'report') {
      // Navigate to daily report form
      props.navigation.navigate('DailyReportForm');
    } else if (action.id === 'expense') {
      // Navigate to expense form with AI receipt analysis
      props.navigation.navigate('ExpenseForm');
    } else if (action.id === 'assign-worker') {
      // Navigate to Workers tab and open assign modal
      // Add timestamp to force fresh navigation and prevent stale state
      props.navigation.navigate('Workers', {
        openAssignModal: true,
        timestamp: Date.now()
      });
    }
  };

  const handleSheetSubmit = (message) => {
    props.navigation.navigate('Chat', { initialMessage: message });
    setShowSheet(false);
  };

  return (
    <>
      <View style={styles.navContainer}>
        <LumaBar {...props} />
        <View style={styles.fabWrapper}>
          <QuickActionFAB
            onActionPress={handleActionPress}
            variant="supervisor"
          />
        </View>
      </View>
      <QuickActionSheet
        visible={showSheet}
        actionType={actionType}
        onClose={() => setShowSheet(false)}
        onSubmit={handleSheetSubmit}
      />
    </>
  );
};

const styles = StyleSheet.create({
  navContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  fabWrapper: {
    // FAB sits to the right of the nav bar
  },
});

export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Chat"
      tabBar={(props) => <SupervisorNavContainer {...props} />}
      tabBarPosition="bottom"
      screenOptions={{
        headerShown: false,
        swipeEnabled: true,
        lazy: false,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Projects" component={ProjectsStack} />
      <Tab.Screen name="Chat" component={ChatScreenWithBoundary} />
      <Tab.Screen name="Workers" component={WorkersScreen} />
      <Tab.Screen name="Settings" component={SettingsNavigator} />
    </Tab.Navigator>
  );
}
