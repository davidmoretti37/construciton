import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// Onboarding Screens
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import ServiceSelectionScreen from '../screens/onboarding/ServiceSelectionScreen'; // NEW: AI-powered service discovery
import TradeSelectionScreen from '../screens/onboarding/TradeSelectionScreen'; // LEGACY: Keep for backward compatibility
import PhaseCustomizationScreen from '../screens/onboarding/PhaseCustomizationScreen'; // NEW: Review AI-generated phases
import PhaseTemplateSetupScreen from '../screens/onboarding/PhaseTemplateSetupScreen';
import BusinessInfoScreen from '../screens/onboarding/BusinessInfoScreen';
import PricingSetupScreen from '../screens/onboarding/PricingSetupScreen';
import InvoiceSetupScreen from '../screens/onboarding/InvoiceSetupScreen';
import TypicalContractsScreen from '../screens/onboarding/TypicalContractsScreen';
import CompletionScreen from '../screens/onboarding/CompletionScreen';

const Stack = createStackNavigator();

export default function OnboardingNavigator({ onComplete, onGoBack }) {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        gestureEnabled: false, // Disable swipe back during onboarding
      }}
      screenProps={{ onComplete, onGoBack }}
    >
      <Stack.Screen name="Welcome">
        {(props) => <WelcomeScreen {...props} onGoBack={onGoBack} />}
      </Stack.Screen>
      {/* NEW FLOW: Services → Phases → Pricing → Business Info → Invoice → Typical Contracts */}
      <Stack.Screen name="ServiceSelection" component={ServiceSelectionScreen} />
      <Stack.Screen name="PhaseCustomization" component={PhaseCustomizationScreen} />
      <Stack.Screen name="PricingSetup" component={PricingSetupScreen} />
      <Stack.Screen name="BusinessInfo" component={BusinessInfoScreen} />
      <Stack.Screen name="InvoiceSetup" component={InvoiceSetupScreen} />
      <Stack.Screen name="TypicalContracts" component={TypicalContractsScreen} />

      {/* LEGACY SCREENS: Keep for backward compatibility */}
      <Stack.Screen name="TradeSelection" component={TradeSelectionScreen} />
      <Stack.Screen name="PhaseTemplateSetup" component={PhaseTemplateSetupScreen} />

      <Stack.Screen name="Completion">
        {(props) => <CompletionScreen {...props} onComplete={onComplete} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
