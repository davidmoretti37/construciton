/**
 * SubMainNavigator
 *
 * Stack navigator for the 'sub' role. Root is SubPortalScreen (3-tab layout),
 * with sub-screens like SubUploadPage pushed on top for action-token flows.
 */

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import SubPortalScreen from '../screens/SubPortalScreen';
import SubUploadPage from '../screens/SubPortal/SubUploadPage';

const Stack = createStackNavigator();

export default function SubMainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SubPortal" component={SubPortalScreen} />
      <Stack.Screen name="SubUpload" component={SubUploadPage} />
    </Stack.Navigator>
  );
}
