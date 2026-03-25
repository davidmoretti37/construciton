/**
 * OwnerBottomTabNavigator
 * Bottom tabs for the Owner (Boss View)
 * 5 tabs: Home, Projects, Chat, Workers, Settings
 * Includes QuickActionFAB for fast access to common actions
 * Includes SpotlightWalkthrough for first-time user guidance
 */

import React, { useState, useRef, createContext, useContext } from 'react';
import { View, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';

// Import owner screens
import OwnerDashboardScreen from '../screens/owner/OwnerDashboardScreen';
import WorkScreen from '../screens/owner/WorkScreen';
import OwnerWorkersScreen from '../screens/owner/OwnerWorkersScreen';
import OwnerSettingsScreen from '../screens/owner/OwnerSettingsScreen';

// Import shared screens
import ChatScreen from '../screens/ChatScreen';

// Import custom tab bar, FAB, and walkthrough
import OwnerLumaBar from '../components/OwnerLumaBar';
import QuickActionFAB from '../components/QuickActionFAB';
import QuickActionSheet from '../components/QuickActionSheet';
import SpotlightWalkthrough from '../components/SpotlightWalkthrough';

const Tab = createMaterialTopTabNavigator();

// Context to share the overhead card ref from OwnerDashboardScreen
export const WalkthroughContext = createContext(null);
export const useWalkthrough = () => useContext(WalkthroughContext);

// Wrapper component that combines LumaBar + FAB
const OwnerNavContainer = ({ fabRef, fabContainerRef, menuItemRefs, ...props }) => {
  const [showSheet, setShowSheet] = useState(false);
  const [actionType, setActionType] = useState(null);

  const handleActionPress = (action) => {
    if (action.type === 'ai') {
      setActionType(action.id);
      setShowSheet(true);
    } else if (action.id === 'report') {
      props.navigation.navigate('DailyReportForm', { isOwner: true });
    } else if (action.id === 'expense') {
      props.navigation.navigate('ExpenseForm');
    } else if (action.id === 'assign-worker' || action.id === 'worker') {
      props.navigation.navigate('Workers', { openAddWorker: true });
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
        <View style={styles.fabWrapper} ref={fabContainerRef}>
          <QuickActionFAB
            ref={fabRef}
            onActionPress={handleActionPress}
            variant="owner"
            menuItemRefs={menuItemRefs}
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
  const fabRef = useRef(null);
  const fabContainerRef = useRef(null);
  const overheadRef = useRef(null);
  const navRef = useRef(null);
  const menuItemRefs = {
    project: useRef(null),
    'assign-worker': useRef(null),
    estimate: useRef(null),
    report: useRef(null),
    expense: useRef(null),
  };

  return (
    <WalkthroughContext.Provider value={{ overheadRef }}>
      <Tab.Navigator
        initialRouteName="Chat"
        tabBar={(props) => {
          navRef.current = props.navigation;
          return (
            <OwnerNavContainer
              {...props}
              fabRef={fabRef}
              fabContainerRef={fabContainerRef}
              menuItemRefs={menuItemRefs}
            />
          );
        }}
        tabBarPosition="bottom"
        screenOptions={{
          headerShown: false,
          swipeEnabled: true,
          lazy: false,
        }}
      >
        <Tab.Screen name="Home" component={OwnerDashboardScreen} />
        <Tab.Screen name="Projects" component={WorkScreen} />
        <Tab.Screen name="Chat" component={ChatScreen} />
        <Tab.Screen name="Workers" component={OwnerWorkersScreen} />
        <Tab.Screen name="Settings" component={OwnerSettingsScreen} />
      </Tab.Navigator>

      {/* First-time walkthrough overlay */}
      <SpotlightWalkthrough
        fabRef={fabContainerRef}
        overheadRef={overheadRef}
        fabMenuRefs={menuItemRefs}
        onExpandFAB={() => fabRef.current?.expand()}
        onCollapseFAB={() => fabRef.current?.collapse()}
        onNavigateToTab={(tab) => navRef.current?.navigate(tab)}
      />
    </WalkthroughContext.Provider>
  );
}
