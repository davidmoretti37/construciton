import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import SettingsScreen from '../screens/settings/SettingsScreen';
import EditBusinessInfoScreen from '../screens/settings/EditBusinessInfoScreen';
import EditPricingScreen from '../screens/settings/EditPricingScreen';
import ChangeLanguageScreen from '../screens/settings/ChangeLanguageScreen';
import TwilioSetupScreen from '../screens/settings/TwilioSetupScreen';

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
        component={SettingsScreen}
      />
      <Stack.Screen
        name="EditBusinessInfo"
        component={EditBusinessInfoScreen}
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
