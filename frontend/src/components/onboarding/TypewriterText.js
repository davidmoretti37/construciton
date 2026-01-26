/**
 * TypewriterText
 * Character-by-character text animation with blinking cursor
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export default function TypewriterText({
  text,
  speed = 40,
  delay = 0,
  style,
  showCursor = true,
  onComplete,
}) {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const cursorOpacity = useSharedValue(1);

  useEffect(() => {
    // Blinking cursor animation
    cursorOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 500 }),
        withTiming(1, { duration: 500 })
      ),
      -1
    );
  }, []);

  useEffect(() => {
    let charIndex = 0;
    let timeoutId;

    const startTyping = () => {
      const interval = setInterval(() => {
        if (charIndex < text.length) {
          setDisplayedText(text.slice(0, charIndex + 1));
          charIndex++;
        } else {
          clearInterval(interval);
          setIsComplete(true);
          onComplete?.();
        }
      }, speed);

      return () => clearInterval(interval);
    };

    // Start after delay
    timeoutId = setTimeout(startTyping, delay);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [text, speed, delay, onComplete]);

  const cursorStyle = useAnimatedStyle(() => ({
    opacity: isComplete ? 0 : cursorOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <Text style={[styles.text, style]}>
        {displayedText}
        {showCursor && (
          <Animated.Text style={[styles.cursor, style, cursorStyle]}>|</Animated.Text>
        )}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
  text: {
    fontSize: 16,
    color: '#94A3B8',
  },
  cursor: {
    color: '#3B82F6',
  },
});
