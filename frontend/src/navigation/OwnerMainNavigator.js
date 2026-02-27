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
import EditWorkerPaymentScreen from '../screens/EditWorkerPaymentScreen';

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

// Import daily report screens
import DailyReportFormScreen from '../screens/worker/DailyReportFormScreen';
import DailyReportDetailScreen from '../screens/worker/DailyReportDetailScreen';

// Import expense form screen (with AI receipt analysis)
import ExpenseFormScreen from '../screens/worker/ExpenseFormScreen';

// Import financial report screen
import FinancialReportScreen from '../screens/owner/FinancialReportScreen';

// Import financial tools screens
import ARAgingScreen from '../screens/owner/ARAgingScreen';
import TaxSummaryScreen from '../screens/owner/TaxSummaryScreen';
import ContractorPaymentsScreen from '../screens/owner/ContractorPaymentsScreen';
import PayrollSummaryScreen from '../screens/owner/PayrollSummaryScreen';
import RecurringExpenseScreen from '../screens/owner/RecurringExpenseScreen';

// Import bank integration screens
import BankConnectionScreen from '../screens/owner/BankConnectionScreen';
import BankReconciliationScreen from '../screens/owner/BankReconciliationScreen';
import BankTransactionAssignScreen from '../screens/owner/BankTransactionAssignScreen';

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

      {/* Financial Report */}
      <Stack.Screen
        name="FinancialReport"
        component={FinancialReportScreen}
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
      <Stack.Screen
        name="EditWorkerPayment"
        component={EditWorkerPaymentScreen}
        options={{ headerShown: false }}
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

      {/* Daily Report Screens */}
      <Stack.Screen
        name="DailyReportForm"
        component={DailyReportFormScreen}
      />
      <Stack.Screen
        name="DailyReportDetail"
        component={DailyReportDetailScreen}
      />

      {/* Expense Form Screen (with AI receipt analysis) */}
      <Stack.Screen
        name="ExpenseForm"
        component={ExpenseFormScreen}
      />

      {/* Financial Tools Screens */}
      <Stack.Screen
        name="ARAging"
        component={ARAgingScreen}
      />
      <Stack.Screen
        name="TaxSummary"
        component={TaxSummaryScreen}
      />
      <Stack.Screen
        name="ContractorPayments"
        component={ContractorPaymentsScreen}
      />
      <Stack.Screen
        name="PayrollSummary"
        component={PayrollSummaryScreen}
      />
      <Stack.Screen
        name="RecurringExpenses"
        component={RecurringExpenseScreen}
      />

      {/* Bank Integration Screens */}
      <Stack.Screen
        name="BankConnection"
        component={BankConnectionScreen}
      />
      <Stack.Screen
        name="BankReconciliation"
        component={BankReconciliationScreen}
      />
      <Stack.Screen
        name="BankTransactionAssign"
        component={BankTransactionAssignScreen}
        options={{
          presentation: 'modal',
        }}
      />
    </Stack.Navigator>
  );
}
