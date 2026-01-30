/**
 * useEntranceAnimation
 * Reusable hooks for dynamic slide entrance animations
 * Features bouncy springs, overshoot effects, and playful motion
 */

import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';

/**
 * Standard entrance - slides up with bounce
 */
export function useEntranceAnimation(isActive, delay = 0) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(40);

  useEffect(() => {
    if (isActive) {
      opacity.value = withDelay(
        delay,
        withTiming(1, { duration: 400 })
      );
      // Bouncy spring - overshoots then settles
      translateY.value = withDelay(
        delay,
        withSpring(0, { damping: 8, stiffness: 100, mass: 0.8 })
      );
    } else {
      opacity.value = 0;
      translateY.value = 40;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return animatedStyle;
}

/**
 * Pop/bounce animation - for logos, badges, icons
 * NO SCALE - prevents iOS rasterization blur, uses translateY instead
 */
export function useScaleAnimation(isActive, delay = 0) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (isActive) {
      opacity.value = withDelay(
        delay,
        withTiming(1, { duration: 300 })
      );
      // Pop with overshoot using translateY
      translateY.value = withDelay(
        delay,
        withSpring(0, { damping: 6, stiffness: 200, mass: 0.6 })
      );
    } else {
      opacity.value = 0;
      translateY.value = 20;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return animatedStyle;
}

/**
 * Bouncy text animation - words pop in with dramatic bounce
 * NO SCALE - prevents iOS rasterization blur
 */
export function useBounceAnimation(isActive, delay = 0) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(60);

  useEffect(() => {
    if (isActive) {
      opacity.value = withDelay(
        delay,
        withTiming(1, { duration: 350 })
      );
      // Extra bouncy spring for text
      translateY.value = withDelay(
        delay,
        withSpring(0, { damping: 5, stiffness: 120, mass: 0.7 })
      );
    } else {
      opacity.value = 0;
      translateY.value = 60;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return animatedStyle;
}

/**
 * Stats/number animation - bounces up and down before settling
 * Perfect for counters and metrics
 * NO SCALE - prevents iOS rasterization blur
 */
export function useStatsAnimation(isActive, delay = 0) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(30);

  useEffect(() => {
    if (isActive) {
      opacity.value = withDelay(
        delay,
        withTiming(1, { duration: 300 })
      );
      // Sequence: bounce up, overshoot down, settle
      translateY.value = withDelay(
        delay,
        withSequence(
          withSpring(-15, { damping: 4, stiffness: 200 }), // Bounce up
          withSpring(0, { damping: 6, stiffness: 150 }) // Settle
        )
      );
    } else {
      opacity.value = 0;
      translateY.value = 30;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return animatedStyle;
}

/**
 * Phone mockup animation - dramatic slide in with subtle rotation
 * NO SCALE - prevents iOS rasterization blur
 */
export function usePhoneAnimation(isActive, delay = 0) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(100);
  const rotateX = useSharedValue(15);

  useEffect(() => {
    if (isActive) {
      opacity.value = withDelay(
        delay,
        withTiming(1, { duration: 400 })
      );
      translateY.value = withDelay(
        delay,
        withSpring(0, { damping: 10, stiffness: 80, mass: 1 })
      );
      rotateX.value = withDelay(
        delay,
        withSpring(0, { damping: 12, stiffness: 80 })
      );
    } else {
      opacity.value = 0;
      translateY.value = 100;
      rotateX.value = 15;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { perspective: 1000 },
      { rotateX: `${rotateX.value}deg` },
    ],
  }));

  return animatedStyle;
}

/**
 * Card animation - slides in from side with spring
 * NO SCALE - prevents iOS rasterization blur
 */
export function useCardAnimation(isActive, delay = 0, fromLeft = true) {
  const opacity = useSharedValue(0);
  const translateX = useSharedValue(fromLeft ? -40 : 40);

  useEffect(() => {
    if (isActive) {
      opacity.value = withDelay(
        delay,
        withTiming(1, { duration: 350 })
      );
      translateX.value = withDelay(
        delay,
        withSpring(0, { damping: 10, stiffness: 120 })
      );
    } else {
      opacity.value = 0;
      translateX.value = fromLeft ? -40 : 40;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));

  return animatedStyle;
}
