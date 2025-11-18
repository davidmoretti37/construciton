import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import MoreScreen from '../screens/MoreScreen';
import EditBusinessInfoScreen from '../screens/settings/EditBusinessInfoScreen';
import EditPhasesScreen from '../screens/settings/EditPhasesScreen';
import EditPricingScreen from '../screens/settings/EditPricingScreen';
import ChangeLanguageScreen from '../screens/settings/ChangeLanguageScreen';
import TwilioSetupScreen from '../screens/settings/TwilioSetupScreen';
import PicturesScreen from '../screens/media/PicturesScreen';
import EstimatesDetailScreen from '../screens/documents/EstimatesDetailScreen';
import InvoicesDetailScreen from '../screens/documents/InvoicesDetailScreen';
import ContractsScreen from '../screens/documents/ContractsScreen';
import InvoiceTemplateScreen from '../screens/documents/InvoiceTemplateScreen';

const Stack = createStackNavigator();

export default function SettingsNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
      }}
    >
      <Stack.Screen
        name="SettingsMain"
        component={MoreScreen}
      />
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
      <Stack.Screen
        name="EditBusinessInfo"
        component={EditBusinessInfoScreen}
      />
      <Stack.Screen
        name="EditPhases"
        component={EditPhasesScreen}
      />
      <Stack.Screen
        name="EditPricing"
        component={EditPricingScreen}
      />
      <Stack.Screen
        name="ChangeLanguage"
        component={ChangeLanguageScreen}
      />
      <Stack.Screen
        name="TwilioSetup"
        component={TwilioSetupScreen}
      />
    </Stack.Navigator>
  );
}
