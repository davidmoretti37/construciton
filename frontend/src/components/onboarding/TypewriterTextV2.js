/**
 * TypewriterTextV2
 * Text that types out character-by-character using width masking
 * Optimized for 60fps and high quality - uses single animated width instead of per-character
 */

import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';

/**
 * Animated blinking cursor
 */
const AnimatedCursor = ({ style, isComplete, isActive }) => {
  const cursorOpacity = useSharedValue(1);

  useEffect(() => {
    if (isActive && !isComplete) {
      cursorOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 400 }),
          withTiming(1, { duration: 400 })
        ),
        -1,
        true
      );
    } else if (isComplete) {
      cursorOpacity.value = withTiming(0, { duration: 200 });
    } else {
      cursorOpacity.value = 1;
    }
  }, [isComplete, isActive]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value,
  }));

  if (!isActive) return null;

  return (
    <Animated.Text style={[style, styles.cursor, animatedStyle]}>
      |
    </Animated.Text>
  );
};

export default function TypewriterTextV2({
  text,
  style,
  speed = 40, // ms per character
  delay = 0, // initial delay before starting
  onComplete,
  isActive = true,
  showCursor = true,
}) {
  const [textWidth, setTextWidth] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isMeasured, setIsMeasured] = useState(false);
  const animatedWidth = useSharedValue(0);

  // Measure text width using onTextLayout
  const handleTextLayout = useCallback((event) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0 && !isMeasured) {
      setTextWidth(width);
      setIsMeasured(true);
    }
  }, [isMeasured]);

  // Handle completion
  const handleComplete = useCallback(() => {
    setIsComplete(true);
    if (onComplete) {
      onComplete();
    }
  }, [onComplete]);

  // Start animation when measured and active
  useEffect(() => {
    if (!isActive) {
      animatedWidth.value = 0;
      setIsComplete(false);
      return;
    }

    if (!isMeasured || textWidth === 0) {
      return;
    }

    // Calculate duration based on text length and speed
    const totalDuration = text.length * speed;

    // Animate width from 0 to full width
    animatedWidth.value = withDelay(
      delay,
      withTiming(
        textWidth,
        {
          duration: totalDuration,
          easing: Easing.linear,
        },
        (finished) => {
          if (finished) {
            runOnJS(handleComplete)();
          }
        }
      )
    );
  }, [isActive, isMeasured, textWidth, text, speed, delay]);

  // Reset when text changes
  useEffect(() => {
    setIsMeasured(false);
    setIsComplete(false);
    animatedWidth.value = 0;
  }, [text]);

  // Animated style for the masking container
  const maskStyle = useAnimatedStyle(() => ({
    width: animatedWidth.value,
    overflow: 'hidden',
  }));

  if (!text) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Hidden text for measurement */}
      <Text
        style={[styles.text, style, styles.measureText]}
        onLayout={handleTextLayout}
      >
        {text}
      </Text>

      {/* Visible masked text */}
      <View style={styles.visibleContainer}>
        <Animated.View style={maskStyle}>
          <Text style={[styles.text, style]} numberOfLines={1}>
            {text}
          </Text>
        </Animated.View>
        {showCursor && (
          <AnimatedCursor
            style={style}
            isComplete={isComplete}
            isActive={isActive && isMeasured}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  measureText: {
    position: 'absolute',
    opacity: 0,
    pointerEvents: 'none',
  },
  visibleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  text: {
    fontSize: 16,
    color: '#94A3B8',
  },
  cursor: {
    opacity: 0.7,
  },
});
