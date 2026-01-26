/**
 * GlowingBorder
 * Animated glowing border effect for selected cards
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export default function GlowingBorder({
  children,
  active = false,
  color = '#3B82F6',
  borderRadius = 16,
  style,
}) {
  const glowOpacity = useSharedValue(0);
  const borderOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (active) {
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.6, { duration: 1000 }),
          withTiming(0.2, { duration: 1000 })
        ),
        -1
      );
      borderOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000 }),
          withTiming(0.6, { duration: 1000 })
        ),
        -1
      );
    } else {
      glowOpacity.value = withTiming(0, { duration: 300 });
      borderOpacity.value = withTiming(0.3, { duration: 300 });
    }
  }, [active]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: active ? color : 'rgba(255, 255, 255, 0.1)',
    opacity: borderOpacity.value,
  }));

  return (
    <View style={[styles.container, style]}>
      {/* Outer glow */}
      <Animated.View
        style={[
          styles.glow,
          glowStyle,
          {
            borderRadius: borderRadius + 8,
            shadowColor: color,
          },
        ]}
      />
      {/* Border container */}
      <Animated.View
        style={[
          styles.borderContainer,
          borderStyle,
          { borderRadius },
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
  glow: {
    ...StyleSheet.absoluteFillObject,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 20,
  },
  borderContainer: {
    borderWidth: 2,
    overflow: 'hidden',
  },
});
