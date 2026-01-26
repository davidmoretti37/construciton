/**
 * ChatBubble
 * User/AI message bubbles with animations
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import TypewriterText from './TypewriterText';

export default function ChatBubble({
  message,
  isUser = false,
  typewriter = false,
  typewriterDelay = 0,
  delay = 0,
  isActive = true,
  onTypewriterComplete,
}) {
  const translateX = useSharedValue(isUser ? 50 : -50);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    if (isActive) {
      translateX.value = withDelay(delay, withSpring(0, { damping: 15 }));
      opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
      scale.value = withDelay(delay, withSpring(1, { damping: 15 }));
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.container,
        isUser ? styles.userContainer : styles.aiContainer,
        animatedStyle,
      ]}
    >
      {!isUser && (
        <View style={styles.aiIcon}>
          <Ionicons name="sparkles" size={16} color="#3B82F6" />
        </View>
      )}
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.aiBubble,
        ]}
      >
        {typewriter && !isUser ? (
          <TypewriterText
            text={message}
            delay={typewriterDelay}
            style={styles.aiText}
            onComplete={onTypewriterComplete}
          />
        ) : (
          <Text style={isUser ? styles.userText : styles.aiText}>
            {message}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 4,
    gap: 8,
  },
  userContainer: {
    justifyContent: 'flex-end',
    paddingLeft: 40,
  },
  aiContainer: {
    justifyContent: 'flex-start',
    paddingRight: 40,
  },
  aiIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubble: {
    maxWidth: '85%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#3B82F6',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomLeftRadius: 4,
  },
  userText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  aiText: {
    fontSize: 15,
    color: '#F8FAFC',
    lineHeight: 20,
  },
});
