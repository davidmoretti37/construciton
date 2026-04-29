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

// Import document viewer
import DocumentViewerScreen from '../screens/DocumentViewerScreen';

// Import workers screen
import WorkersScreen from '../screens/WorkersScreen';
import WorkerDetailHistoryScreen from '../screens/WorkerDetailHistoryScreen';
import EditWorkerPaymentScreen from '../screens/EditWorkerPaymentScreen';
import EditSupervisorScreen from '../screens/owner/EditSupervisorScreen';

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
import InvoiceTemplateScreen from '../screens/documents/InvoiceTemplateScreen';

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
import OwnerDailyReportsScreen from '../screens/OwnerDailyReportsScreen';

// Import clock-outs screen
import ClockOutsScreen from '../screens/owner/ClockOutsScreen';

// Import expense form screen (with AI receipt analysis)
import ExpenseFormScreen from '../screens/worker/ExpenseFormScreen';

// Import financial report screen
import FinancialReportScreen from '../screens/owner/FinancialReportScreen';

// Import financial tools screens
import ARAgingScreen from '../screens/owner/ARAgingScreen';
import TaxSummaryScreen from '../screens/owner/TaxSummaryScreen';
import ContractorPaymentsScreen from '../screens/owner/ContractorPaymentsScreen';
import PayrollSummaryScreen from '../screens/owner/PayrollSummaryScreen';
import CompanyOverheadScreen from '../screens/owner/CompanyOverheadScreen';

// Import bank integration screens
import BankConnectionScreen from '../screens/owner/BankConnectionScreen';
import BankReconciliationScreen from '../screens/owner/BankReconciliationScreen';
import BankTransactionAssignScreen from '../screens/owner/BankTransactionAssignScreen';

// Import Google Drive integration screen
import GoogleDriveScreen from '../screens/owner/GoogleDriveScreen';

// Import client portal screens
import ClientVisibilityScreen from '../screens/owner/ClientVisibilityScreen';
import ClientsScreen from '../screens/owner/ClientsScreen';

// Audit log
import AuditLogScreen from '../screens/owner/AuditLogScreen';

// Import SMS inbox screens
import InboxScreen from '../screens/owner/InboxScreen';
import ThreadScreen from '../screens/owner/ThreadScreen';

// Import MCP integrations
import IntegrationsScreen from '../screens/owner/IntegrationsScreen';

// Import manual project creation
import ManualProjectCreateScreen from '../screens/owner/ManualProjectCreateScreen';

// Import configure details project builder
import ProjectBuilderScreen from '../screens/owner/ProjectBuilderScreen';

// Import service plan screens
import ServicePlanDetailScreen from '../screens/owner/ServicePlanDetailScreen';
import DailyRouteScreen from '../screens/owner/DailyRouteScreen';
import RouteBuilderScreen from '../screens/owner/RouteBuilderScreen';
import BillingScreen from '../screens/owner/BillingScreen';
import MapRouteScreen from '../screens/owner/MapRouteScreen';

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
        name="ManualProjectCreate"
        component={ManualProjectCreateScreen}
      />
      <Stack.Screen
        name="ProjectBuilder"
        component={ProjectBuilderScreen}
        options={{ contentStyle: { backgroundColor: '#1E3A8A' } }}
      />
      <Stack.Screen
        name="ProjectDetail"
        component={ProjectDetailScreen}
        options={{ contentStyle: { backgroundColor: '#1E3A8A' } }}
      />
      <Stack.Screen
        name="ServicePlanDetail"
        component={ServicePlanDetailScreen}
      />
      <Stack.Screen
        name="DailyRoute"
        component={DailyRouteScreen}
      />
      <Stack.Screen
        name="RouteBuilder"
        component={RouteBuilderScreen}
      />
      <Stack.Screen
        name="MapRoute"
        component={MapRouteScreen}
      />
      <Stack.Screen
        name="Billing"
        component={BillingScreen}
      />
      <Stack.Screen
        name="ClientVisibility"
        component={ClientVisibilityScreen}
      />
      <Stack.Screen
        name="Clients"
        component={ClientsScreen}
      />
      <Stack.Screen
        name="AuditLog"
        component={AuditLogScreen}
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
      <Stack.Screen
        name="EditSupervisor"
        component={EditSupervisorScreen}
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
      <Stack.Screen
        name="InvoiceTemplate"
        component={InvoiceTemplateScreen}
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
      <Stack.Screen
        name="OwnerDailyReports"
        component={OwnerDailyReportsScreen}
      />

      {/* Clock-Outs Screen */}
      <Stack.Screen
        name="ClockOuts"
        component={ClockOutsScreen}
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
        name="CompanyOverhead"
        component={CompanyOverheadScreen}
      />

      {/* Document Viewer */}
      <Stack.Screen
        name="DocumentViewer"
        component={DocumentViewerScreen}
        options={{ headerShown: false, presentation: 'modal' }}
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

      {/* Google Drive Integration */}
      <Stack.Screen
        name="GoogleDrive"
        component={GoogleDriveScreen}
      />

      {/* SMS Inbox + Thread (two-way Twilio messaging) */}
      <Stack.Screen
        name="Inbox"
        component={InboxScreen}
      />
      <Stack.Screen
        name="Thread"
        component={ThreadScreen}
      />

      {/* MCP integrations (Settings → Integrations) */}
      <Stack.Screen
        name="Integrations"
        component={IntegrationsScreen}
      />

      {/* Subcontractor module */}
      <Stack.Screen name="Subcontractors"        component={require('../screens/SubcontractorsScreen').default} />
      <Stack.Screen name="SubcontractorDetail"   component={require('../screens/SubcontractorDetailScreen').default} />
      <Stack.Screen name="AddSubcontractor"      component={require('../screens/AddSubcontractorScreen').default} />
      <Stack.Screen name="EngagementDetail"      component={require('../screens/EngagementDetailScreen').default} />
    </Stack.Navigator>
  );
}
