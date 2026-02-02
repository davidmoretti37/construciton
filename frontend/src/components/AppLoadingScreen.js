/**
 * AppLoadingScreen
 * Simple classic spinner loader
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const DEFAULT_TIMEOUT_MS = 15000;

// Classic spinning loader
const Spinner = ({ size = 48, color = '#2563EB' }) => {
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, []);

  const rotate = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.spinner,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: color,
          transform: [{ rotate }],
        },
      ]}
    />
  );
};

export default function AppLoadingScreen({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  onTimeout,
  onRetry,
  error = null,
}) {
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const timeoutRef = useRef(null);

  useEffect(() => {
    timeoutRef.current = setTimeout(() => {
      setHasTimedOut(true);
      if (onTimeout) {
        onTimeout();
      }
    }, timeoutMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [timeoutMs, onTimeout]);

  const handleRetry = () => {
    setHasTimedOut(false);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setHasTimedOut(true);
      if (onTimeout) {
        onTimeout();
      }
    }, timeoutMs);

    if (onRetry) {
      onRetry();
    }
  };

  // Show error state
  if (error || hasTimedOut) {
    return (
      <View style={styles.container}>
        <View style={styles.errorIconContainer}>
          <Ionicons
            name={error ? 'alert-circle-outline' : 'cloud-offline-outline'}
            size={48}
            color="#EF4444"
          />
        </View>

        <Text style={styles.errorTitle}>
          {error ? 'Connection Error' : 'Taking Too Long'}
        </Text>

        <Text style={styles.errorMessage}>
          {error
            ? 'Please check your internet connection.'
            : 'The connection is slower than expected.'}
        </Text>

        {onRetry && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={handleRetry}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh" size={20} color="#fff" />
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Simple loading state
  return (
    <View style={styles.container}>
      <Spinner size={40} color="#2563EB" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  spinner: {
    borderWidth: 4,
    borderTopColor: 'transparent',
  },
  errorIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 32,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    gap: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
