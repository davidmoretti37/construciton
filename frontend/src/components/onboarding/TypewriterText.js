/**
 * TypewriterText
 * Text that types out character-by-character
 * Uses React state for crisp text rendering (no worklet string operations)
 */

import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export default function TypewriterText({
  text,
  style,
  speed = 40, // ms per character
  delay = 0, // initial delay before starting
  onComplete,
  isActive = true, // Control when animation starts
  showCursor = true, // Show blinking cursor
}) {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const charIndexRef = useRef(0);

  // Cursor animation using reanimated (this is safe - just opacity)
  const cursorOpacity = useSharedValue(1);

  useEffect(() => {
    // Cleanup function
    const cleanup = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    if (!isActive) {
      cleanup();
      setDisplayedText('');
      setIsComplete(false);
      charIndexRef.current = 0;
      cursorOpacity.value = 1;
      return;
    }

    // Start cursor blinking
    if (showCursor) {
      cursorOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 400 }),
          withTiming(1, { duration: 400 })
        ),
        -1,
        true
      );
    }

    // Start typing after delay
    timeoutRef.current = setTimeout(() => {
      charIndexRef.current = 0;

      intervalRef.current = setInterval(() => {
        charIndexRef.current += 1;

        if (charIndexRef.current <= text.length) {
          setDisplayedText(text.slice(0, charIndexRef.current));
        }

        if (charIndexRef.current >= text.length) {
          cleanup();
          setIsComplete(true);
          if (onComplete) {
            onComplete();
          }
        }
      }, speed);
    }, delay);

    return cleanup;
  }, [text, speed, delay, isActive, showCursor, onComplete]);

  // Animated style for cursor (just opacity - safe for worklet)
  const cursorAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <Text style={[styles.text, style]}>
        {displayedText}
      </Text>
      {showCursor && !isComplete && (
        <Animated.Text style={[styles.cursor, style, cursorAnimatedStyle]}>
          |
        </Animated.Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  text: {
    fontSize: 16,
    color: '#94A3B8',
  },
  cursor: {
    fontSize: 16,
    color: '#94A3B8',
    opacity: 0.7,
  },
});
