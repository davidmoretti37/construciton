import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

const SkeletonBox = ({ width, height = 16, borderRadius = 6, style }) => {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.box,
        { width, height, borderRadius, opacity: pulseAnim },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  box: {
    backgroundColor: '#E5E7EB',
  },
});

export default SkeletonBox;
