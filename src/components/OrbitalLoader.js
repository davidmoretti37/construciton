import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function OrbitalLoader({ message, size = 64, color }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const rotation1 = useSharedValue(0);
  const rotation2 = useSharedValue(0);
  const rotation3 = useSharedValue(0);

  const loaderColor = color || Colors.primaryBlue || '#0EA5E9';

  useEffect(() => {
    // Outer ring - 1 second, clockwise
    rotation1.value = withRepeat(
      withTiming(360, {
        duration: 1000,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    // Middle ring - 1.5 seconds, counter-clockwise
    rotation2.value = withRepeat(
      withTiming(-360, {
        duration: 1500,
        easing: Easing.linear,
      }),
      -1,
      false
    );

    // Inner ring - 0.8 seconds, clockwise
    rotation3.value = withRepeat(
      withTiming(360, {
        duration: 800,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, []);

  const animatedStyle1 = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation1.value}deg` }],
  }));

  const animatedStyle2 = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation2.value}deg` }],
  }));

  const animatedStyle3 = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation3.value}deg` }],
  }));

  return (
    <View style={styles.container}>
      <View style={[styles.loaderContainer, { width: size, height: size }]}>
        {/* Outer ring */}
        <Animated.View
          style={[
            styles.ring,
            styles.outerRing,
            { borderTopColor: loaderColor, width: size, height: size },
            animatedStyle1,
          ]}
        />

        {/* Middle ring */}
        <Animated.View
          style={[
            styles.ring,
            styles.middleRing,
            { borderTopColor: loaderColor, width: size - 16, height: size - 16 },
            animatedStyle2,
          ]}
        />

        {/* Inner ring */}
        <Animated.View
          style={[
            styles.ring,
            styles.innerRing,
            { borderTopColor: loaderColor, width: size - 32, height: size - 32 },
            animatedStyle3,
          ]}
        />
      </View>

      {message && (
        <Text style={[styles.message, { color: Colors.primaryText }]}>
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loaderContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  outerRing: {
    // Outer ring at full size
  },
  middleRing: {
    // Middle ring, 16px smaller
  },
  innerRing: {
    // Inner ring, 32px smaller
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
