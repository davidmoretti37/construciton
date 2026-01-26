/**
 * TestimonialCard
 * Swipeable review card for social proof
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 80;

export default function TestimonialCard({
  quote,
  author,
  role,
  rating = 5,
  delay = 0,
  isActive = true,
}) {
  const scale = useSharedValue(0.9);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (isActive) {
      scale.value = withDelay(delay, withSpring(1, { damping: 15 }));
      opacity.value = withDelay(delay, withTiming(1, { duration: 400 }));
      translateY.value = withDelay(delay, withSpring(0, { damping: 15 }));
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateY: translateY.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      {/* Stars */}
      <View style={styles.starsRow}>
        {Array.from({ length: rating }).map((_, i) => (
          <Ionicons key={i} name="star" size={16} color="#FBBF24" />
        ))}
      </View>

      {/* Quote */}
      <Text style={styles.quote}>"{quote}"</Text>

      {/* Author */}
      <View style={styles.authorRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {author.charAt(0)}
          </Text>
        </View>
        <View>
          <Text style={styles.authorName}>{author}</Text>
          <Text style={styles.authorRole}>{role}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: CARD_WIDTH,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 24,
    marginHorizontal: 8,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 16,
  },
  quote: {
    fontSize: 16,
    fontStyle: 'italic',
    color: '#F8FAFC',
    lineHeight: 24,
    marginBottom: 20,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#60A5FA',
  },
  authorName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F8FAFC',
  },
  authorRole: {
    fontSize: 12,
    color: '#94A3B8',
  },
});
