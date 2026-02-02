/**
 * OwnerBottomTabNavigator
 * Bottom tabs for the Owner (Boss View)
 * 5 tabs: Home, Projects, Chat, Workers, Settings
 * Includes QuickActionFAB for fast access to common actions
 */

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

// Import owner screens
import OwnerDashboardScreen from '../screens/owner/OwnerDashboardScreen';
import OwnerProjectsScreen from '../screens/owner/OwnerProjectsScreen';
import OwnerWorkersScreen from '../screens/owner/OwnerWorkersScreen';
import OwnerSettingsScreen from '../screens/owner/OwnerSettingsScreen';

// Import shared screens
import ChatScreen from '../screens/ChatScreen';

// Import custom tab bar and FAB
import OwnerLumaBar from '../components/OwnerLumaBar';
import QuickActionFAB from '../components/QuickActionFAB';
import QuickActionSheet from '../components/QuickActionSheet';

const Tab = createBottomTabNavigator();

// Wrapper component that combines LumaBar + FAB
const OwnerNavContainer = (props) => {
  const [showSheet, setShowSheet] = useState(false);
  const [actionType, setActionType] = useState(null);

  const handleActionPress = (action) => {
    if (action.type === 'ai') {
      // Open the sheet for AI-assisted creation
      setActionType(action.id);
      setShowSheet(true);
    } else if (action.id === 'report') {
      // Navigate to daily report form (owner mode)
      props.navigation.navigate('DailyReportForm', { isOwner: true });
    } else if (action.id === 'expense') {
      // Navigate to expense form with AI receipt analysis
      props.navigation.navigate('ExpenseForm');
    }
  };

  const handleSheetSubmit = (message) => {
    props.navigation.navigate('Chat', { initialMessage: message });
    setShowSheet(false);
  };

  return (
    <>
      <View style={styles.navContainer}>
        <OwnerLumaBar {...props} />
        <View style={styles.fabWrapper}>
          <QuickActionFAB
            onActionPress={handleActionPress}
            variant="owner"
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

export default function OwnerBottomTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <OwnerNavContainer {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="Home" component={OwnerDashboardScreen} />
      <Tab.Screen name="Projects" component={OwnerProjectsScreen} />
      <Tab.Screen name="Chat" component={ChatScreen} />
      <Tab.Screen name="Workers" component={OwnerWorkersScreen} />
      <Tab.Screen name="Settings" component={OwnerSettingsScreen} />
    </Tab.Navigator>
  );
}
