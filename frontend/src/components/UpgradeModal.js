/**
 * UpgradeModal Component
 * Shown when user hits their project limit
 * Prompts user to upgrade to a higher tier
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSubscription } from '../hooks/useSubscription';
import { useTheme } from '../contexts/ThemeContext';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import subscriptionService from '../services/subscriptionService';
import { useTranslation } from 'react-i18next';

export default function UpgradeModal({ visible, onClose }) {
  const { isDark } = useTheme();
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  const {
    planTier,
    activeProjectCount,
    projectLimit,
    getPlanName,
    getSuggestedUpgrade,
    getProjectLimitDisplay,
  } = useSubscription();

  const nextPlan = getSuggestedUpgrade();

  const handleUpgrade = async () => {
    try {
      setLoading(true);
      await subscriptionService.startCheckout(nextPlan.tier);
      onClose();
    } catch (error) {
      Alert.alert(
        t('subscription.error', 'Error'),
        t('subscription.upgradeFailed', 'Failed to start upgrade. Please try again.')
      );
    } finally {
      setLoading(false);
    }
  };

  // Don't render if not visible
  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.modal, { backgroundColor: Colors.cardBackground }]}>
          {/* Close button */}
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={24} color={Colors.secondaryText} />
          </TouchableOpacity>

          {/* Icon */}
          <View style={[styles.iconContainer, { backgroundColor: Colors.warning + '20' }]}>
            <Ionicons name="alert-circle" size={48} color={Colors.warning} />
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            {t('subscription.limitReached', 'Project Limit Reached')}
          </Text>

          {/* Description */}
          <Text style={[styles.description, { color: Colors.secondaryText }]}>
            {t(
              'subscription.limitDescription',
              "You've reached your limit of {{limit}} active projects on the {{plan}} plan.",
              { limit: getProjectLimitDisplay(), plan: getPlanName() }
            )}
          </Text>

          {/* Current usage */}
          <View style={[styles.usageBar, { backgroundColor: Colors.background }]}>
            <View style={styles.usageRow}>
              <Text style={[styles.usageLabel, { color: Colors.secondaryText }]}>
                Active projects
              </Text>
              <Text style={[styles.usageValue, { color: Colors.primaryText }]}>
                {activeProjectCount} / {getProjectLimitDisplay()}
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: Colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: Colors.warning,
                    width: `${Math.min(100, (activeProjectCount / projectLimit) * 100)}%`,
                  },
                ]}
              />
            </View>
          </View>

          {/* Upgrade card */}
          <View style={[styles.upgradeCard, { backgroundColor: Colors.background }]}>
            <View style={styles.upgradeHeader}>
              <Text style={[styles.upgradeName, { color: Colors.primaryText }]}>
                {t('subscription.upgradeTo', 'Upgrade to {{plan}}', { plan: nextPlan.name })}
              </Text>
              <View style={[styles.upgradeBadge, { backgroundColor: Colors.primaryBlue }]}>
                <Text style={styles.upgradeBadgeText}>
                  {nextPlan.limit === 'Unlimited' ? 'Unlimited' : `${nextPlan.limit} projects`}
                </Text>
              </View>
            </View>
            <Text style={[styles.upgradePrice, { color: Colors.primaryBlue }]}>
              ${nextPlan.price}
              <Text style={[styles.upgradePeriod, { color: Colors.secondaryText }]}>
                /month
              </Text>
            </Text>
          </View>

          {/* Buttons */}
          <TouchableOpacity
            style={[styles.upgradeButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleUpgrade}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.upgradeButtonText}>
                {t('subscription.upgradeNow', 'Upgrade Now')}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.laterButton} onPress={onClose}>
            <Text style={[styles.laterText, { color: Colors.secondaryText }]}>
              {t('subscription.completeProjectFirst', 'Complete a project first')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modal: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: Spacing.md,
    right: Spacing.md,
    padding: Spacing.xs,
    zIndex: 1,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  description: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  usageBar: {
    width: '100%',
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.lg,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  usageLabel: {
    fontSize: FontSizes.small,
  },
  usageValue: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  upgradeCard: {
    width: '100%',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  upgradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  upgradeName: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
  },
  upgradeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
  },
  upgradeBadgeText: {
    color: '#FFF',
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  upgradePrice: {
    fontSize: FontSizes.header,
    fontWeight: '700',
  },
  upgradePeriod: {
    fontSize: FontSizes.body,
    fontWeight: '400',
  },
  upgradeButton: {
    width: '100%',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  upgradeButtonText: {
    color: '#FFF',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  laterButton: {
    padding: Spacing.sm,
  },
  laterText: {
    fontSize: FontSizes.small,
  },
});
