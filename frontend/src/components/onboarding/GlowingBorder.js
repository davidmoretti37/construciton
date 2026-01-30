/**
 * GlowingBorder
 * Border effect for selected cards with pulsing glow animation
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';

export default function GlowingBorder({
  children,
  active = false,
  color = '#3B82F6',
  borderRadius = 16,
  style,
}) {
  const shadowOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (active) {
      // Start pulsing glow animation
      shadowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.8, { duration: 750, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 750, easing: Easing.inOut(Easing.ease) })
        ),
        -1, // Infinite
        false
      );
    } else {
      shadowOpacity.value = 0;
    }
  }, [active]);

  const animatedStyle = useAnimatedStyle(() => ({
    shadowOpacity: shadowOpacity.value,
  }));

  return (
    <View style={[styles.container, style]}>
      {/* Border container with animated glow */}
      <Animated.View
        style={[
          styles.borderContainer,
          {
            borderRadius,
            borderColor: active ? color : 'rgba(255, 255, 255, 0.1)',
          },
          active && {
            shadowColor: color,
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 20,
            elevation: 20,
          },
          animatedStyle,
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  borderContainer: {
    borderWidth: 2,
    overflow: 'hidden',
  },
});
