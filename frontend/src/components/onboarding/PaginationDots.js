/**
 * PaginationDots
 * Animated progress dots for onboarding slides
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

const Dot = ({ index, activeIndex }) => {
  const animatedStyle = useAnimatedStyle(() => {
    const isActive = index === activeIndex;
    return {
      width: withSpring(isActive ? 28 : 6, { damping: 15, stiffness: 150 }),
      height: isActive ? 8 : 6,
      backgroundColor: isActive ? '#3B82F6' : 'rgba(255, 255, 255, 0.3)',
      opacity: withSpring(isActive ? 1 : 0.5),
    };
  });

  return <Animated.View style={[styles.dot, animatedStyle]} />;
};

export default function PaginationDots({ count, activeIndex }) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} index={i} activeIndex={activeIndex} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
});
