/**
 * PhoneMockup
 * Reusable 3D phone frame with tilt and slide-in animation
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PhoneMockup({
  children,
  tilt = 0,
  slideInFrom = null,
  delay = 0,
  isActive = true,
  style,
}) {
  const translateX = useSharedValue(
    slideInFrom === 'right' ? 300 : slideInFrom === 'left' ? -300 : 0
  );
  const translateY = useSharedValue(slideInFrom === 'bottom' ? 200 : 0);
  const opacity = useSharedValue(slideInFrom ? 0 : 1);
  const scale = useSharedValue(slideInFrom ? 0.9 : 1);

  useEffect(() => {
    if (isActive && slideInFrom) {
      translateX.value = withDelay(delay, withSpring(0, { damping: 15, stiffness: 100 }));
      translateY.value = withDelay(delay, withSpring(0, { damping: 15, stiffness: 100 }));
      opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
      scale.value = withDelay(delay, withSpring(1, { damping: 15 }));
    }
  }, [isActive, slideInFrom, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 1000 },
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotateY: `${tilt}deg` },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle, style]}>
      {/* Phone frame */}
      <View style={styles.phone}>
        {/* Notch */}
        <View style={styles.notch} />
        {/* Screen content */}
        <View style={styles.screen}>
          {children}
        </View>
        {/* Home indicator */}
        <View style={styles.homeIndicator} />
      </View>
    </Animated.View>
  );
}

const PHONE_WIDTH = SCREEN_WIDTH * 0.7;
const PHONE_HEIGHT = PHONE_WIDTH * 2;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  phone: {
    width: PHONE_WIDTH,
    height: PHONE_HEIGHT,
    backgroundColor: '#1A1A2E',
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#2A2A4A',
    overflow: 'hidden',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 15,
  },
  notch: {
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -40,
    width: 80,
    height: 24,
    backgroundColor: '#0A0A1A',
    borderRadius: 12,
    zIndex: 10,
  },
  screen: {
    flex: 1,
    marginTop: 40,
    marginBottom: 20,
    marginHorizontal: 4,
    backgroundColor: '#0F172A',
    borderRadius: 8,
    overflow: 'hidden',
  },
  homeIndicator: {
    position: 'absolute',
    bottom: 8,
    left: '50%',
    marginLeft: -40,
    width: 80,
    height: 4,
    backgroundColor: '#4A4A6A',
    borderRadius: 2,
  },
});
