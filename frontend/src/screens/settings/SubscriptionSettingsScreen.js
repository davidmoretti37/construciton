/**
 * SubscriptionSettingsScreen
 * Shows subscription details and management options
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useSubscription } from '../../hooks/useSubscription';
import subscriptionService from '../../services/subscriptionService';
import { useTranslation } from 'react-i18next';

export default function SubscriptionSettingsScreen({ navigation }) {
  const { isDark } = useTheme();
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const [loading, setLoading] = useState(false);

  const {
    hasActiveSubscription,
    planTier,
    status,
    trialDaysRemaining,
    cancelAtPeriodEnd,
    activeProjectCount,
    projectLimit,
    getPlanName,
    getPlanPrice,
    isTrialing,
    getProjectLimitDisplay,
    subscription,
  } = useSubscription();

  const handleManageSubscription = async () => {
    try {
      setLoading(true);
      await subscriptionService.openCustomerPortal();
    } catch (error) {
      Alert.alert(
        t('subscription.error', 'Error'),
        t('subscription.portalFailed', 'Failed to open subscription management.')
      );
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    // Handle both date-only strings (YYYY-MM-DD) and ISO timestamps
    const dateOnly = dateString.split('T')[0];
    const [year, month, day] = dateOnly.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Get status badge color and text
  const getStatusBadge = () => {
    switch (status) {
      case 'trialing':
        return { color: Colors.primaryBlue, text: t('subscriptionSettings.trial') };
      case 'active':
        return { color: Colors.success, text: t('subscriptionSettings.active') };
      case 'past_due':
        return { color: Colors.warning, text: t('subscriptionSettings.pastDue') };
      case 'canceled':
        return { color: Colors.error, text: t('subscriptionSettings.canceled') };
      default:
        return { color: Colors.secondaryText, text: t('subscriptionSettings.inactive') };
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
          {t('subscriptionSettings.title')}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Current Plan Card */}
        <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.planHeader}>
            <View>
              <Text style={[styles.planLabel, { color: Colors.secondaryText }]}>
                {t('subscriptionSettings.currentPlan')}
              </Text>
              <Text style={[styles.planName, { color: Colors.primaryText }]}>
                {getPlanName()}
              </Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusBadge.color + '20' },
              ]}
            >
              <Text style={[styles.statusText, { color: statusBadge.color }]}>
                {statusBadge.text}
              </Text>
            </View>
          </View>

          {hasActiveSubscription && (
            <>
              <View style={[styles.divider, { backgroundColor: Colors.border }]} />

              {/* Price */}
              <View style={styles.infoRow}>
                <Ionicons name="card-outline" size={20} color={Colors.secondaryText} />
                <Text style={[styles.infoText, { color: Colors.primaryText }]}>
                  ${getPlanPrice()}{t('subscriptionSettings.perMonth')}
                </Text>
              </View>

              {/* Project usage */}
              <View style={styles.infoRow}>
                <Ionicons name="folder-outline" size={20} color={Colors.secondaryText} />
                <Text style={[styles.infoText, { color: Colors.primaryText }]}>
                  {t('subscriptionSettings.projectsUsed', {
                    used: activeProjectCount,
                    total: projectLimit === 999999 ? t('subscriptionSettings.unlimited') : projectLimit
                  })}
                </Text>
              </View>

              {/* Trial info */}
              {isTrialing() && trialDaysRemaining !== null && (
                <View style={styles.infoRow}>
                  <Ionicons
                    name="time-outline"
                    size={20}
                    color={trialDaysRemaining <= 2 ? Colors.warning : Colors.primaryBlue}
                  />
                  <Text
                    style={[
                      styles.infoText,
                      {
                        color:
                          trialDaysRemaining <= 2 ? Colors.warning : Colors.primaryText,
                      },
                    ]}
                  >
                    {t('subscriptionSettings.trialEndsIn', { days: trialDaysRemaining })}
                  </Text>
                </View>
              )}

              {/* Billing period */}
              {subscription?.currentPeriodEnd && !isTrialing() && (
                <View style={styles.infoRow}>
                  <Ionicons name="calendar-outline" size={20} color={Colors.secondaryText} />
                  <Text style={[styles.infoText, { color: Colors.primaryText }]}>
                    {cancelAtPeriodEnd
                      ? t('subscriptionSettings.cancelsOn', { date: formatDate(subscription.currentPeriodEnd) })
                      : t('subscriptionSettings.renewsOn', { date: formatDate(subscription.currentPeriodEnd) })}
                  </Text>
                </View>
              )}

              {/* Cancel warning */}
              {cancelAtPeriodEnd && (
                <View
                  style={[
                    styles.warningBox,
                    { backgroundColor: Colors.warning + '15' },
                  ]}
                >
                  <Ionicons name="warning-outline" size={20} color={Colors.warning} />
                  <Text style={[styles.warningText, { color: Colors.warning }]}>
                    {t(
                      'subscription.cancelWarning',
                      'Your subscription will not renew after the current period.'
                    )}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Actions */}
        {hasActiveSubscription ? (
          <>
            {/* Manage Billing */}
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: Colors.cardBackground }]}
              onPress={handleManageSubscription}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.actionText, { color: Colors.primaryText }]}>
                {t('subscriptionSettings.manageBilling')}
              </Text>
              {loading ? (
                <ActivityIndicator size="small" color={Colors.primaryBlue} />
              ) : (
                <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
              )}
            </TouchableOpacity>

            {/* Help text */}
            <Text style={[styles.helpText, { color: Colors.secondaryText }]}>
              {t('subscriptionSettings.billingDescription')}
            </Text>
          </>
        ) : (
          <>
            {/* Subscribe button */}
            <TouchableOpacity
              style={[styles.subscribeButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={() => navigation.navigate('Paywall')}
              activeOpacity={0.8}
            >
              <Text style={styles.subscribeText}>
                {t('subscription.subscribeNow')}
              </Text>
            </TouchableOpacity>

            <Text style={[styles.helpText, { color: Colors.secondaryText }]}>
              {t('subscriptionSettings.noSubscriptionHelp')}
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
  },
  content: {
    padding: Spacing.lg,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  planLabel: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.xs,
  },
  planName: {
    fontSize: FontSizes.header,
    fontWeight: '700',
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
  },
  statusText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: Spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  infoText: {
    fontSize: FontSizes.body,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  warningText: {
    flex: 1,
    fontSize: FontSizes.small,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
  },
  actionText: {
    flex: 1,
    fontSize: FontSizes.body,
    fontWeight: '500',
  },
  helpText: {
    fontSize: FontSizes.small,
    textAlign: 'center',
    marginTop: Spacing.md,
    lineHeight: 20,
    paddingHorizontal: Spacing.lg,
  },
  subscribeButton: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  subscribeText: {
    color: '#FFF',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
