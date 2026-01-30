/**
 * CountUpNumberV2
 * Animated number that counts up from 0 to target value
 * Optimized for 60fps - all formatting runs on UI thread
 */

import React, { useEffect } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

/**
 * Worklet-compatible number formatter
 * Uses only math operations (no toLocaleString)
 */
function formatNumberWithCommas(num) {
  'worklet';
  const intValue = Math.floor(Math.abs(num));
  const isNegative = num < 0;

  if (intValue < 1000) {
    return (isNegative ? '-' : '') + String(intValue);
  }

  // Extract digits using modulo
  const digits = [];
  let remaining = intValue;

  while (remaining > 0) {
    digits.unshift(remaining % 10);
    remaining = Math.floor(remaining / 10);
  }

  // Build string with commas every 3 digits from right
  let result = '';
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    if (i > 0 && (len - i) % 3 === 0) {
      result = result + ',';
    }
    result = result + String(digits[i]);
  }

  return (isNegative ? '-' : '') + result;
}

/**
 * Worklet-compatible decimal formatter
 */
function formatWithDecimals(num, decimals) {
  'worklet';
  const factor = Math.pow(10, decimals);
  const rounded = Math.round(Math.abs(num) * factor);
  const intPart = Math.floor(rounded / factor);
  const decPart = rounded % factor;
  const isNegative = num < 0;

  const intFormatted = formatNumberWithCommas(intPart);

  // Pad decimal part with leading zeros
  let decStr = String(decPart);
  while (decStr.length < decimals) {
    decStr = '0' + decStr;
  }

  return (isNegative ? '-' : '') + intFormatted + '.' + decStr;
}

export default function CountUpNumberV2({
  value,
  prefix = '',
  suffix = '',
  style,
  decimals = 0,
  duration = 1500,
  delay = 0,
  isActive = true,
}) {
  const animatedValue = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      animatedValue.value = withDelay(
        delay,
        withTiming(value, {
          duration: duration,
          easing: Easing.out(Easing.cubic),
        })
      );
    } else {
      animatedValue.value = 0;
    }
  }, [value, isActive, delay, duration]);

  const animatedProps = useAnimatedProps(() => {
    const current = animatedValue.value;
    let formatted;

    if (decimals > 0) {
      formatted = formatWithDecimals(current, decimals);
    } else {
      formatted = formatNumberWithCommas(current);
    }

    const text = prefix + formatted + suffix;
    return {
      text: text,
      defaultValue: text,
    };
  });

  return (
    <AnimatedTextInput
      underlineColorAndroid="transparent"
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
    padding: 0,
    margin: 0,
  },
});
