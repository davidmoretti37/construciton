/**
 * TestimonialCard
 * Review card for social proof (no animation)
 */

import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ONBOARDING_COLORS,
  ONBOARDING_RADIUS,
  ONBOARDING_SPACING,
} from '../../screens/onboarding/slides/constants';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 80;

export default function TestimonialCard({
  quote,
  author,
  role,
  rating = 5,
}) {
  return (
    <View style={styles.container}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: ONBOARDING_COLORS.glassBg,
    borderRadius: ONBOARDING_RADIUS.card,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.border,
    padding: ONBOARDING_SPACING.cardPadding,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 16,
  },
  quote: {
    fontSize: 15,
    color: ONBOARDING_COLORS.textPrimary,
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
    backgroundColor: `${ONBOARDING_COLORS.primary}4D`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600',
    color: ONBOARDING_COLORS.primaryLight,
  },
  authorName: {
    fontSize: 14,
    fontWeight: '600',
    color: ONBOARDING_COLORS.textPrimary,
  },
  authorRole: {
    fontSize: 12,
    color: ONBOARDING_COLORS.textSecondary,
  },
});
