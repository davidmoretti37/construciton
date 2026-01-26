import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { useTheme } from '../contexts/ThemeContext';
import { getColors, LightColors } from '../constants/theme';

/**
 * StatusMessage - ChatGPT-style status indicator with typewriter effect and shine
 *
 * Shows messages like "Thinking...", "Checking schedule...", etc.
 * Text types out letter by letter, then dots animate: . → .. → ... → .
 * Features a subtle shine/glare animation across the text
 *
 * @param {string} message - The status text (without dots, e.g., "Thinking")
 */
const StatusMessage = ({ message }) => {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [displayedText, setDisplayedText] = useState('');
  const [isTypingComplete, setIsTypingComplete] = useState(false);
  const [dots, setDots] = useState('.');
  const opacity = useSharedValue(0);
  const shinePosition = useSharedValue(0);
  const previousMessage = useRef('');

  // Dynamic text color based on theme
  const textColor = isDark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)';

  // Clean the message (remove trailing dots)
  const cleanMessage = message?.replace(/\.+$/, '') || '';

  // Typewriter effect - type out letters one by one
  useEffect(() => {
    if (!message) {
      setDisplayedText('');
      setIsTypingComplete(false);
      return;
    }

    // If message changed, reset and start typing
    if (cleanMessage !== previousMessage.current) {
      previousMessage.current = cleanMessage;
      setDisplayedText('');
      setIsTypingComplete(false);

      let currentIndex = 0;
      const typeInterval = setInterval(() => {
        if (currentIndex < cleanMessage.length) {
          setDisplayedText(cleanMessage.slice(0, currentIndex + 1));
          currentIndex++;
        } else {
          clearInterval(typeInterval);
          setIsTypingComplete(true);
        }
      }, 40); // 40ms per character = fast but visible typing

      return () => clearInterval(typeInterval);
    }
  }, [message, cleanMessage]);

  // Animate dots only after typing is complete
  useEffect(() => {
    if (!isTypingComplete) {
      setDots('.');
      return;
    }

    const interval = setInterval(() => {
      setDots((prev) => {
        if (prev === '.') return '..';
        if (prev === '..') return '...';
        return '.';
      });
    }, 400);

    return () => clearInterval(interval);
  }, [isTypingComplete]);

  // Fade in when message appears
  useEffect(() => {
    if (message) {
      opacity.value = withTiming(1, { duration: 150 });
    } else {
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [message]);

  // Shine animation - continuous sweep across text
  useEffect(() => {
    if (message && isTypingComplete) {
      shinePosition.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500 }) // Pause at end
        ),
        -1, // Infinite repeat
        false
      );
    } else {
      shinePosition.value = 0;
    }
  }, [message, isTypingComplete]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const shineStyle = useAnimatedStyle(() => {
    const translateX = interpolate(
      shinePosition.value,
      [0, 1],
      [-100, 250]
    );
    return {
      transform: [{ translateX }],
    };
  });

  if (!message) return null;

  const fullText = `${displayedText}${isTypingComplete ? dots : ''}`;

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.textContainer}>
        {/* Base text */}
        <Text style={[styles.text, { color: textColor }]}>{fullText}</Text>

        {/* Shine overlay - only show after typing complete */}
        {isTypingComplete && (
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
              <Text style={[styles.text, styles.maskText]}>{fullText}</Text>
            }
          >
            <View style={[styles.shineContainer, { backgroundColor: textColor }]}>
              <Animated.View style={[styles.shine, shineStyle]}>
                <LinearGradient
                  colors={[
                    'transparent',
                    'rgba(255, 255, 255, 0.4)',
                    'rgba(255, 255, 255, 0.6)',
                    'rgba(255, 255, 255, 0.4)',
                    'transparent',
                  ]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.gradient}
                />
              </Animated.View>
            </View>
          </MaskedView>
        )}
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'flex-start',
  },
  textContainer: {
    position: 'relative',
  },
  text: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  maskText: {
    color: 'black', // Mask needs solid color
  },
  shineContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  shine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 60,
  },
  gradient: {
    flex: 1,
    width: '100%',
  },
});

export default StatusMessage;
