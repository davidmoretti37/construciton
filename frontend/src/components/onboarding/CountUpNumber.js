/**
 * CountUpNumber
 * Animated number that counts up from 0 to target value
 */

import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  withDelay,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { TextInput } from 'react-native';

// Create animated TextInput for number display
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export default function CountUpNumber({
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
      // Animate from 0 to target value
      animatedValue.value = withDelay(
        delay,
        withTiming(value, {
          duration: duration,
          easing: Easing.out(Easing.cubic),
        })
      );
    } else {
      // Reset to 0 when inactive
      animatedValue.value = 0;
    }
  }, [value, isActive, delay, duration]);

  const animatedProps = useAnimatedProps(() => {
    const currentValue = animatedValue.value;

    // Format the number
    let formatted;
    if (decimals > 0) {
      formatted = currentValue.toFixed(decimals);
    } else {
      // Add thousands separator
      formatted = Math.floor(currentValue).toLocaleString('en-US');
    }

    return {
      text: `${prefix}${formatted}${suffix}`,
      defaultValue: `${prefix}${formatted}${suffix}`,
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
