/**
 * PricingCard
 * Plan selection card with pulsing glow when selected
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
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
  const shadowOpacity = useSharedValue(0.3);

  useEffect(() => {
    if (isSelected) {
      // Start pulsing glow animation
      shadowOpacity.value = withRepeat(
        withSequence(
          withTiming(0.7, { duration: 750, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.3, { duration: 750, easing: Easing.inOut(Easing.ease) })
        ),
        -1, // Infinite
        false
      );
    } else {
      shadowOpacity.value = 0;
    }
  }, [isSelected]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    shadowOpacity: shadowOpacity.value,
  }));

  return (
    <TouchableOpacity
      onPress={onSelect}
      activeOpacity={0.9}
      style={styles.touchable}
    >
      <View style={[styles.container, isSelected && styles.containerSelected]}>
        {/* Card content with animated glow */}
        <Animated.View style={[styles.card, isSelected && styles.cardSelected, animatedCardStyle]}>
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

          {/* Price - hidden when null for App Store compliance */}
          {price !== null && (
            <View style={styles.priceRow}>
              <Text style={[
                styles.price,
                isSelected && styles.priceActive
              ]}>
                ${price}
              </Text>
              <Text style={styles.period}>{period}</Text>
            </View>
          )}

          {/* Projects */}
          <Text style={styles.projects}>
            {projects === 'Unlimited' ? 'Unlimited' : `${projects} projects`}
          </Text>
        </Animated.View>
      </View>
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
  containerSelected: {
    transform: [{ scale: 1.05 }],
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
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
