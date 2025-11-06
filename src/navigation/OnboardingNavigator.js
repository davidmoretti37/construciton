import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';

// Onboarding Screens
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import TradeSelectionScreen from '../screens/onboarding/TradeSelectionScreen';
import BusinessInfoScreen from '../screens/onboarding/BusinessInfoScreen';
import PricingSetupScreen from '../screens/onboarding/PricingSetupScreen';
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
      <Stack.Screen name="TradeSelection" component={TradeSelectionScreen} />
      <Stack.Screen name="BusinessInfo" component={BusinessInfoScreen} />
      <Stack.Screen name="PricingSetup" component={PricingSetupScreen} />
      <Stack.Screen name="Completion">
        {(props) => <CompletionScreen {...props} onComplete={onComplete} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
