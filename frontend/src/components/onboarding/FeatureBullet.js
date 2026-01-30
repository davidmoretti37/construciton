/**
 * FeatureBullet
 * Icon + text bullet point (no animation)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ONBOARDING_COLORS,
  ONBOARDING_TYPOGRAPHY,
} from '../../screens/onboarding/slides/constants';

export default function FeatureBullet({
  icon,
  title,
  description,
  iconColor = ONBOARDING_COLORS.primaryLight,
}) {
  return (
    <View style={styles.container}>
      <View style={[styles.iconContainer, { backgroundColor: `${iconColor}20` }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{title}</Text>
        {description && (
          <Text style={styles.description}>{description}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    ...ONBOARDING_TYPOGRAPHY.sectionTitle,
    marginBottom: 2,
  },
  description: {
    fontSize: 14,
    color: ONBOARDING_COLORS.textSecondary,
    lineHeight: 18,
  },
});
