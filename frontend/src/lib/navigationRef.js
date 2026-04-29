/**
 * Shared navigation ref so non-screen modules (push notification handlers,
 * background webhooks, etc.) can navigate without prop drilling.
 *
 * App.js attaches this to the root NavigationContainer; anyone else just
 * imports `navigate` and calls it.
 */

import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

export function navigate(name, params) {
  if (navigationRef.isReady && navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  }
}
