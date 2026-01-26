/**
 * PricingCard
 * Plan selection card with glow effect when selected
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export default function PricingCard({
  plan,
  price,
  period = '/mo',
  projects,
  isSelected = false,
  isBest = false,
  onSelect,
}) {
  const scale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const borderOpacity = useSharedValue(0.1);

  useEffect(() => {
    if (isSelected) {
      scale.value = withSpring(1.05, { damping: 15 });
      glowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 1000 }),
          withTiming(0.2, { duration: 1000 })
        ),
        -1
      );
      borderOpacity.value = withTiming(1, { duration: 300 });
    } else {
      scale.value = withSpring(1, { damping: 15 });
      glowOpacity.value = withTiming(0, { duration: 300 });
      borderOpacity.value = withTiming(0.1, { duration: 300 });
    }
  }, [isSelected]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: isSelected
      ? `rgba(59, 130, 246, ${borderOpacity.value})`
      : `rgba(255, 255, 255, ${borderOpacity.value})`,
  }));

  return (
    <TouchableOpacity
      onPress={onSelect}
      activeOpacity={0.9}
      style={styles.touchable}
    >
      <Animated.View style={[styles.container, cardStyle]}>
        {/* Glow effect */}
        <Animated.View
          style={[
            styles.glow,
            glowStyle,
          ]}
        />

        {/* Card content */}
        <Animated.View style={[styles.card, borderStyle]}>
          {/* Best badge */}
          {isBest && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>BEST</Text>
            </View>
          )}

          {/* Plan name */}
          <Text style={[
            styles.planName,
            isSelected && styles.planNameActive
          ]}>
            {plan}
          </Text>

          {/* Price */}
          <View style={styles.priceRow}>
            <Text style={[
              styles.price,
              isSelected && styles.priceActive
            ]}>
              ${price}
            </Text>
            <Text style={styles.period}>{period}</Text>
          </View>

          {/* Projects */}
          <Text style={styles.projects}>
            {projects === 'Unlimited' ? 'Unlimited' : `${projects} projects`}
          </Text>
        </Animated.View>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    flex: 1,
  },
  container: {
    position: 'relative',
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    borderRadius: 20,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 20,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  badge: {
    position: 'absolute',
    top: -1,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  planName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 8,
    marginBottom: 8,
  },
  planNameActive: {
    color: '#F8FAFC',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 28,
    fontWeight: '700',
    color: '#64748B',
  },
  priceActive: {
    color: '#60A5FA',
  },
  period: {
    fontSize: 14,
    color: '#64748B',
  },
  projects: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
  },
});
