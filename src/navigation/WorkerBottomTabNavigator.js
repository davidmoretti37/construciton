import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import TimeClockScreen from '../screens/worker/TimeClockScreen';
import WorkerAssignmentsScreen from '../screens/worker/WorkerAssignmentsScreen';
import WorkerDailyReportScreen from '../screens/WorkerDailyReportScreen';
import WorkerMessagesScreen from '../screens/worker/WorkerMessagesScreen';
import WorkerLumaBar from '../components/WorkerLumaBar';

const Tab = createBottomTabNavigator();

export default function WorkerBottomTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="TimeClock"
      tabBar={(props) => <WorkerLumaBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tab.Screen name="TimeClock" component={TimeClockScreen} />
      <Tab.Screen name="Assignments" component={WorkerAssignmentsScreen} />
      <Tab.Screen name="DailyReport" component={WorkerDailyReportScreen} />
      <Tab.Screen name="Messages" component={WorkerMessagesScreen} />
    </Tab.Navigator>
  );
}
