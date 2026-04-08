import React from 'react';
import { View, StyleSheet } from 'react-native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import ClientDashboardScreen from '../screens/client/ClientDashboardScreen';
import ClientMessagesListScreen from '../screens/client/ClientMessagesListScreen';
import ClientTimelineScreen from '../screens/client/ClientTimelineScreen';
import ClientMoneyScreen from '../screens/client/ClientMoneyScreen';
import ClientMoreScreen from '../screens/client/ClientMoreScreen';
import ClientLumaBar from '../components/ClientLumaBar';

const Tab = createMaterialTopTabNavigator();

const ClientNavContainer = (props) => (
  <View style={styles.navContainer}>
    <ClientLumaBar {...props} />
  </View>
);

export default function ClientTabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <ClientNavContainer {...props} />}
      tabBarPosition="bottom"
      screenOptions={{
        headerShown: false,
        swipeEnabled: true,
        lazy: true,
      }}
    >
      <Tab.Screen name="Home" component={ClientDashboardScreen} />
      <Tab.Screen name="Timeline" component={ClientTimelineScreen} />
      <Tab.Screen name="Messages" component={ClientMessagesListScreen} />
      <Tab.Screen name="Money" component={ClientMoneyScreen} />
      <Tab.Screen name="More" component={ClientMoreScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  navContainer: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
