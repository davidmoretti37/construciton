/**
 * CountUpNumber
 * Animated number counting with slot machine effect
 */

import React, { useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useDerivedValue,
  withDelay,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { TextInput } from 'react-native';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export default function CountUpNumber({
  value,
  prefix = '',
  suffix = '',
  duration = 1500,
  delay = 0,
  style,
  decimals = 0,
  onComplete,
}) {
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    animatedValue.value = withDelay(
      delay,
      withTiming(value, {
        duration,
        easing: Easing.out(Easing.cubic),
      }, (finished) => {
        if (finished && onComplete) {
          runOnJS(onComplete)();
        }
      })
    );
  }, [value, duration, delay]);

  const animatedProps = useAnimatedProps(() => {
    const num = animatedValue.value;
    const formatted = decimals > 0
      ? num.toFixed(decimals)
      : Math.floor(num).toLocaleString('en-US');
    return {
      text: `${prefix}${formatted}${suffix}`,
      defaultValue: `${prefix}${formatted}${suffix}`,
    };
  });

  return (
    <AnimatedTextInput
      editable={false}
      style={[styles.text, style]}
      animatedProps={animatedProps}
    />
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F8FAFC',
  },
});
