/**
 * SubMainNavigator
 *
 * Stack navigator for the 'sub' role. Root is SubPortalScreen (4-tab layout),
 * with detail screens pushed on top for actions.
 */

import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import SubPortalScreen from '../screens/SubPortalScreen';
import SubUploadPage from '../screens/SubPortal/SubUploadPage';
import SubBidSubmitPage from '../screens/SubPortal/SubBidSubmitPage';
import DocumentViewerScreen from '../screens/DocumentViewerScreen';

const Stack = createStackNavigator();

export default function SubMainNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SubPortal" component={SubPortalScreen} />
      <Stack.Screen name="SubUpload" component={SubUploadPage} />
      <Stack.Screen name="SubBidSubmit" component={SubBidSubmitPage} />
      <Stack.Screen
        name="DocumentViewer"
        component={DocumentViewerScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
