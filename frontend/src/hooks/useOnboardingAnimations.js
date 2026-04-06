/**
 * useOnboardingAnimations
 * Reusable animation hooks for onboarding screens
 * Provides consistent, choreographed animations across all flows
 */

import { useEffect, useRef } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  withSequence,
  withRepeat,
  Easing,
  interpolate,
} from 'react-native-reanimated';

/**
 * Icon bounce animation - pops in with overshoot
 */
export function useIconBounce(isActive = true, delay = 0) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      scale.value = withDelay(
        delay,
        withSpring(1, { damping: 8, stiffness: 120 })
      );
      opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    } else {
      scale.value = 0;
      opacity.value = 0;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return animatedStyle;
}

/**
 * Icon with continuous glow pulse after entrance
 */
export function useIconWithGlow(isActive = true, delay = 0, glowColor = '#3B82F6') {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const glowOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (isActive) {
      // Entrance
      scale.value = withDelay(
        delay,
        withSpring(1, { damping: 8, stiffness: 120 })
      );
      opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));

      // Start glow pulse after entrance
      glowOpacity.value = withDelay(
        delay + 500,
        withRepeat(
          withSequence(
            withTiming(0.6, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.3, { duration: 1000, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          false
        )
      );
    } else {
      scale.value = 0;
      opacity.value = 0;
      glowOpacity.value = 0.3;
    }
  }, [isActive, delay]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: glowOpacity.value,
  }));

  return { containerStyle, glowStyle };
}

/**
 * Text slide up with fade
 */
export function useTextSlideUp(isActive = true, delay = 0) {
  const translateY = useSharedValue(30);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      translateY.value = withDelay(
        delay,
        withSpring(0, { damping: 15, stiffness: 100 })
      );
      opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    } else {
      translateY.value = 30;
      opacity.value = 0;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return animatedStyle;
}

/**
 * Staggered list item animation - slides from left
 */
export function useStaggeredItem(isActive = true, index = 0, baseDelay = 0, staggerMs = 150) {
  const translateX = useSharedValue(-40);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.9);

  const delay = baseDelay + index * staggerMs;

  useEffect(() => {
    if (isActive) {
      translateX.value = withDelay(
        delay,
        withSpring(0, { damping: 15, stiffness: 100 })
      );
      opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
      scale.value = withDelay(
        delay,
        withSpring(1, { damping: 12, stiffness: 120 })
      );
    } else {
      translateX.value = -40;
      opacity.value = 0;
      scale.value = 0.9;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return animatedStyle;
}

/**
 * Form field pop in animation
 */
export function useFormFieldPop(isActive = true, index = 0, baseDelay = 0) {
  const translateY = useSharedValue(20);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.95);

  const delay = baseDelay + index * 120;

  useEffect(() => {
    if (isActive) {
      translateY.value = withDelay(
        delay,
        withSpring(0, { damping: 15, stiffness: 100 })
      );
      opacity.value = withDelay(delay, withTiming(1, { duration: 250 }));
      scale.value = withDelay(
        delay,
        withSpring(1, { damping: 12, stiffness: 120 })
      );
    } else {
      translateY.value = 20;
      opacity.value = 0;
      scale.value = 0.95;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return animatedStyle;
}

/**
 * Button bounce in animation
 */
export function useButtonBounce(isActive = true, delay = 0) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (isActive) {
      scale.value = withDelay(
        delay,
        withSpring(1, { damping: 8, stiffness: 100 })
      );
      opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
      translateY.value = withDelay(
        delay,
        withSpring(0, { damping: 12, stiffness: 100 })
      );
    } else {
      scale.value = 0.8;
      opacity.value = 0;
      translateY.value = 20;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return animatedStyle;
}

/**
 * Progress dots animation
 */
export function useProgressDots(isActive = true, delay = 0, activeIndex = 0, totalDots = 3) {
  const animations = [];

  for (let i = 0; i < totalDots; i++) {
    const scale = useSharedValue(0);
    const width = useSharedValue(8);

    useEffect(() => {
      if (isActive) {
        const dotDelay = delay + i * 100;
        scale.value = withDelay(
          dotDelay,
          withSpring(1, { damping: 10, stiffness: 150 })
        );
        width.value = withDelay(
          dotDelay,
          withSpring(i === activeIndex ? 24 : 8, { damping: 12, stiffness: 100 })
        );
      } else {
        scale.value = 0;
        width.value = 8;
      }
    }, [isActive, delay, activeIndex]);

    const dotStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scale.value }],
      width: width.value,
    }));

    animations.push(dotStyle);
  }

  return animations;
}

/**
 * Success celebration animation - icon pops with scale overshoot
 */
export function useSuccessCelebration(isActive = true, delay = 0) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const rotation = useSharedValue(-15);

  useEffect(() => {
    if (isActive) {
      // Pop with overshoot and slight rotation
      scale.value = withDelay(
        delay,
        withSequence(
          withSpring(1.2, { damping: 6, stiffness: 150 }),
          withSpring(1, { damping: 10, stiffness: 100 })
        )
      );
      opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
      rotation.value = withDelay(
        delay,
        withSequence(
          withTiming(10, { duration: 200 }),
          withSpring(0, { damping: 8, stiffness: 100 })
        )
      );
    } else {
      scale.value = 0;
      opacity.value = 0;
      rotation.value = -15;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotation.value}deg` },
    ],
    opacity: opacity.value,
  }));

  return animatedStyle;
}

/**
 * Card pop animation with spring
 */
export function useCardPop(isActive = true, index = 0, baseDelay = 0) {
  const scale = useSharedValue(0.8);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(30);

  const delay = baseDelay + index * 200;

  useEffect(() => {
    if (isActive) {
      scale.value = withDelay(
        delay,
        withSpring(1, { damping: 10, stiffness: 100 })
      );
      opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
      translateY.value = withDelay(
        delay,
        withSpring(0, { damping: 12, stiffness: 100 })
      );
    } else {
      scale.value = 0.8;
      opacity.value = 0;
      translateY.value = 30;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return animatedStyle;
}

/**
 * Card selection pulse animation
 */
export function useCardSelectionPulse(isSelected = false) {
  const scale = useSharedValue(1);
  const borderWidth = useSharedValue(1);

  useEffect(() => {
    if (isSelected) {
      // Quick pulse on selection
      scale.value = withSequence(
        withTiming(1.02, { duration: 150 }),
        withSpring(1, { damping: 10, stiffness: 100 })
      );
      borderWidth.value = withSpring(2, { damping: 15, stiffness: 150 });
    } else {
      scale.value = withSpring(1, { damping: 15, stiffness: 100 });
      borderWidth.value = withSpring(1, { damping: 15, stiffness: 150 });
    }
  }, [isSelected]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    borderWidth: borderWidth.value,
  }));

  return animatedStyle;
}

/**
 * Slide down animation for headers
 */
export function useSlideDown(isActive = true, delay = 0) {
  const translateY = useSharedValue(-30);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      translateY.value = withDelay(
        delay,
        withSpring(0, { damping: 15, stiffness: 100 })
      );
      opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
    } else {
      translateY.value = -30;
      opacity.value = 0;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return animatedStyle;
}

/**
 * Slide from side animation
 */
export function useSlideFromSide(isActive = true, delay = 0, fromRight = false) {
  const translateX = useSharedValue(fromRight ? 50 : -50);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      translateX.value = withDelay(
        delay,
        withSpring(0, { damping: 15, stiffness: 100 })
      );
      opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
    } else {
      translateX.value = fromRight ? 50 : -50;
      opacity.value = 0;
    }
  }, [isActive, delay, fromRight]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return animatedStyle;
}
