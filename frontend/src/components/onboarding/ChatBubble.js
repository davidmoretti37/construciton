/**
 * ChatBubble
 * User/AI message bubbles with animated entrance
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { ONBOARDING_COLORS } from '../../screens/onboarding/slides/constants';

// NO SCALE - prevents iOS rasterization blur
export default function ChatBubble({
  message,
  isUser = false,
  animated = false,
  delay = 0,
}) {
  const translateX = useSharedValue(animated ? (isUser ? 100 : -100) : 0);
  const opacity = useSharedValue(animated ? 0 : 1);

  useEffect(() => {
    if (animated) {
      translateX.value = withDelay(delay, withSpring(0, { damping: 15, stiffness: 120 }));
      opacity.value = withDelay(delay, withSpring(1, { damping: 20 }));
    }
  }, [animated, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
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
        <Text style={isUser ? styles.userText : styles.aiText}>
          {message}
        </Text>
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
    backgroundColor: `${ONBOARDING_COLORS.primary}33`,
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
    backgroundColor: ONBOARDING_COLORS.primary,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: ONBOARDING_COLORS.border,
    borderBottomLeftRadius: 4,
  },
  userText: {
    fontSize: 15,
    color: '#FFFFFF',
    lineHeight: 20,
  },
  aiText: {
    fontSize: 15,
    color: ONBOARDING_COLORS.textPrimary,
    lineHeight: 20,
  },
});
