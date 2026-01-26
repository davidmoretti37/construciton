/**
 * TrialBanner Component
 * Shows trial status and days remaining
 * Displayed on HomeScreen when user is in trial period
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSubscription } from '../hooks/useSubscription';
import { useTheme } from '../contexts/ThemeContext';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTranslation } from 'react-i18next';

export default function TrialBanner({ onPress }) {
  const { isDark } = useTheme();
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation();
  const { trialDaysRemaining, isTrialing, hasActiveSubscription } = useSubscription();

  // Don't show if not trialing or no days remaining
  if (!isTrialing() || trialDaysRemaining === null) {
    return null;
  }

  const isUrgent = trialDaysRemaining <= 2;

  // Get appropriate message
  const getMessage = () => {
    if (trialDaysRemaining === 0) {
      return t('subscription.trialEndsToday', 'Your trial ends today!');
    }
    if (trialDaysRemaining === 1) {
      return t('subscription.trialEnds1Day', '1 day left in your trial');
    }
    return t('subscription.trialEndsDays', '{{days}} days left in your trial', {
      days: trialDaysRemaining,
    });
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: isUrgent
            ? Colors.warning + '20'
            : Colors.primaryBlue + '15',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Ionicons
        name={isUrgent ? 'warning' : 'time-outline'}
        size={20}
        color={isUrgent ? Colors.warning : Colors.primaryBlue}
      />
      <Text
        style={[
          styles.text,
          { color: isUrgent ? Colors.warning : Colors.primaryBlue },
        ]}
      >
        {getMessage()}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.sm,
  },
  text: {
    flex: 1,
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
});
