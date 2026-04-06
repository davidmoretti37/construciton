/**
 * OwnerMainWrapper
 * Wrapper for OwnerMainNavigator to prevent navigation state conflicts
 * when switching between navigator trees (Field Mode ↔ Boss Portal)
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import OwnerMainNavigator from '../navigation/OwnerMainNavigator';

export default function OwnerMainWrapper() {
  // Delay mounting to let React Navigation clean up the previous navigator
  // This prevents navigation state conflicts when switching between navigator trees
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Use requestAnimationFrame to wait for the next frame
    // This ensures the previous navigator is fully unmounted
    const frame = requestAnimationFrame(() => {
      setIsReady(true);
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E40AF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <OwnerMainNavigator />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
