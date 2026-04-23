import React from 'react';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import TimeClockScreen from '../screens/worker/TimeClockScreen';
import TodaysWorkScreen from '../screens/worker/TodaysWorkScreen';
import WorkerProjectsListScreen from '../screens/worker/WorkerProjectsListScreen';
import WorkerLumaBar from '../components/WorkerLumaBar';

const Tab = createMaterialTopTabNavigator();

export default function WorkerBottomTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="TimeClock"
      tabBar={(props) => <WorkerLumaBar {...props} />}
      tabBarPosition="bottom"
      screenOptions={{
        headerShown: false,
        swipeEnabled: true,
        lazy: false,
      }}
    >
      <Tab.Screen name="TimeClock" component={TimeClockScreen} />
      <Tab.Screen name="WorkerProjects" component={WorkerProjectsListScreen} />
      <Tab.Screen name="TodaysWork" component={TodaysWorkScreen} />
    </Tab.Navigator>
  );
}
