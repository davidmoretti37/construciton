/**
 * ShimmerButton
 * CTA button with gradient and shimmer animation
 */

import React, { useEffect } from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  ONBOARDING_COLORS,
  ONBOARDING_TYPOGRAPHY,
  ONBOARDING_RADIUS,
  ONBOARDING_SHADOWS,
} from '../../screens/onboarding/slides/constants';

export default function ShimmerButton({
  title,
  onPress,
  gradientColors = [ONBOARDING_COLORS.primary, ONBOARDING_COLORS.cyan],
  disabled = false,
  showArrow = true,
  style,
}) {
  const shimmerPosition = useSharedValue(-1);

  useEffect(() => {
    // Start shimmer animation
    shimmerPosition.value = withRepeat(
      withTiming(2, {
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1, // Infinite
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerPosition.value * 150 }],
  }));

  return (
    <TouchableOpacity
      style={[styles.container, style, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.9}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        {/* Shimmer overlay */}
        <Animated.View style={[styles.shimmerContainer, shimmerStyle]}>
          <LinearGradient
            colors={[
              'transparent',
              'rgba(255, 255, 255, 0.25)',
              'transparent',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shimmer}
          />
        </Animated.View>

        <View style={styles.content}>
          <Text style={styles.text}>{title}</Text>
          {showArrow && (
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: ONBOARDING_RADIUS.button,
    overflow: 'hidden',
    ...ONBOARDING_SHADOWS.button,
  },
  gradient: {
    paddingVertical: 18,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  shimmerContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  shimmer: {
    width: 100,
    height: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  text: {
    ...ONBOARDING_TYPOGRAPHY.button,
  },
  disabled: {
    opacity: 0.6,
  },
});
