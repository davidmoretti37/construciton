/**
 * OwnerMainNavigator
 * Main navigation for the Owner (Boss View)
 * Includes bottom tabs and additional screens
 */

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// Import navigators
import OwnerBottomTabNavigator from './OwnerBottomTabNavigator';

// Import additional screens
import SupervisorDetailScreen from '../screens/owner/SupervisorDetailScreen';
import SupervisorsScreen from '../screens/owner/SupervisorsScreen';

// Import project screens
import ProjectDetailScreen from '../screens/ProjectDetailScreen';
import ProjectTransactionsScreen from '../screens/ProjectTransactionsScreen';
import TransactionEntryScreen from '../screens/TransactionEntryScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';

// Import workers screen
import WorkersScreen from '../screens/WorkersScreen';
import WorkerDetailHistoryScreen from '../screens/WorkerDetailHistoryScreen';

// Import settings screens
import EditBusinessInfoScreen from '../screens/settings/EditBusinessInfoScreen';
import ChangeLanguageScreen from '../screens/settings/ChangeLanguageScreen';
import NotificationSettingsScreen from '../screens/settings/NotificationSettingsScreen';
import SubscriptionSettingsScreen from '../screens/settings/SubscriptionSettingsScreen';
import PaywallScreen from '../screens/subscription/PaywallScreen';

// Import documents & media screens
import PicturesScreen from '../screens/media/PicturesScreen';
import ContractsScreen from '../screens/documents/ContractsScreen';
import EstimatesDetailScreen from '../screens/documents/EstimatesDetailScreen';
import InvoicesDetailScreen from '../screens/documents/InvoicesDetailScreen';

// Import services screens
import EditServiceScreen from '../screens/settings/EditServiceScreen';
import AddServiceScreen from '../screens/settings/AddServiceScreen';
import AddServicePhasesScreen from '../screens/settings/AddServicePhasesScreen';
import AddServicePricingScreen from '../screens/settings/AddServicePricingScreen';

// Import notifications screen
import NotificationsScreen from '../screens/NotificationsScreen';

// Import daily report screen
import DailyReportFormScreen from '../screens/worker/DailyReportFormScreen';

// Import expense form screen (with AI receipt analysis)
import ExpenseFormScreen from '../screens/worker/ExpenseFormScreen';

const Stack = createStackNavigator();

export default function OwnerMainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="MainTabs" component={OwnerBottomTabNavigator} />

      {/* Project Screens */}
      <Stack.Screen
        name="ProjectDetail"
        component={ProjectDetailScreen}
      />
      <Stack.Screen
        name="ProjectTransactions"
        component={ProjectTransactionsScreen}
      />
      <Stack.Screen
        name="TransactionDetail"
        component={TransactionDetailScreen}
      />
      <Stack.Screen
        name="TransactionEntry"
        component={TransactionEntryScreen}
        options={{
          presentation: 'modal',
        }}
      />

      {/* Team Screens (from More tab) */}
      <Stack.Screen
        name="SupervisorsList"
        component={SupervisorsScreen}
      />
      <Stack.Screen
        name="SupervisorDetail"
        component={SupervisorDetailScreen}
      />
      <Stack.Screen
        name="WorkersList"
        component={WorkersScreen}
      />
      <Stack.Screen
        name="WorkerDetailHistory"
        component={WorkerDetailHistoryScreen}
      />

      {/* Settings Screens */}
      <Stack.Screen
        name="EditBusinessInfo"
        component={EditBusinessInfoScreen}
      />
      <Stack.Screen
        name="ChangeLanguage"
        component={ChangeLanguageScreen}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
      />
      <Stack.Screen
        name="SubscriptionSettings"
        component={SubscriptionSettingsScreen}
      />
      <Stack.Screen
        name="Paywall"
        component={PaywallScreen}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
      />

      {/* Documents & Media Screens */}
      <Stack.Screen
        name="Pictures"
        component={PicturesScreen}
      />
      <Stack.Screen
        name="Contracts"
        component={ContractsScreen}
      />
      <Stack.Screen
        name="EstimatesDetail"
        component={EstimatesDetailScreen}
      />
      <Stack.Screen
        name="InvoicesDetail"
        component={InvoicesDetailScreen}
      />

      {/* Services Screens */}
      <Stack.Screen
        name="EditService"
        component={EditServiceScreen}
      />
      <Stack.Screen
        name="AddService"
        component={AddServiceScreen}
      />
      <Stack.Screen
        name="AddServicePhases"
        component={AddServicePhasesScreen}
      />
      <Stack.Screen
        name="AddServicePricing"
        component={AddServicePricingScreen}
      />

      {/* Daily Report Screen */}
      <Stack.Screen
        name="DailyReportForm"
        component={DailyReportFormScreen}
      />

      {/* Expense Form Screen (with AI receipt analysis) */}
      <Stack.Screen
        name="ExpenseForm"
        component={ExpenseFormScreen}
      />
    </Stack.Navigator>
  );
}
