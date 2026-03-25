/**
 * ServicePlanCard — Card component for service plan list items
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 32 - 12) / 2;

const SERVICE_TYPE_CONFIG = {
  pest_control: { label: 'Pest Control', icon: 'bug-outline', color: '#EF4444' },
  cleaning: { label: 'Cleaning', icon: 'sparkles-outline', color: '#8B5CF6' },
  landscaping: { label: 'Landscaping', icon: 'leaf-outline', color: '#10B981' },
  pool_service: { label: 'Pool', icon: 'water-outline', color: '#3B82F6' },
  lawn_care: { label: 'Lawn Care', icon: 'flower-outline', color: '#22C55E' },
  hvac: { label: 'HVAC', icon: 'thermometer-outline', color: '#F59E0B' },
  other: { label: 'Service', icon: 'construct-outline', color: '#6B7280' },
};

const ServicePlanCard = ({ plan, onPress }) => {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const typeConfig = SERVICE_TYPE_CONFIG[plan.service_type] || SERVICE_TYPE_CONFIG.other;
  const isActive = plan.status === 'active';
  const isPaused = plan.status === 'paused';

  return (
    <TouchableOpacity
      style={[styles.card, {
        backgroundColor: Colors.cardBackground,
        borderColor: isPaused ? '#F59E0B' : Colors.border,
        borderWidth: isPaused ? 1.5 : 1,
        opacity: isPaused ? 0.8 : 1,
      }]}
      onPress={() => onPress?.(plan)}
      activeOpacity={0.8}
    >
      {/* Type badge */}
      <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + '18' }]}>
        <Ionicons name={typeConfig.icon} size={14} color={typeConfig.color} />
        <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>
          {typeConfig.label}
        </Text>
      </View>

      {/* Plan name */}
      <Text style={[styles.planName, { color: Colors.primaryText }]} numberOfLines={2}>
        {plan.name}
      </Text>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Ionicons name="location-outline" size={13} color={Colors.secondaryText} />
          <Text style={[styles.statText, { color: Colors.secondaryText }]}>
            {plan.location_count} {plan.location_count === 1 ? 'location' : 'locations'}
          </Text>
        </View>
      </View>

      {/* Visits this month */}
      <View style={styles.visitsRow}>
        <Text style={[styles.visitsText, { color: Colors.secondaryText }]}>
          {plan.completed_this_month}/{plan.visits_this_month} visits
        </Text>
        {plan.visits_this_month > 0 && (
          <View style={[styles.progressBar, { backgroundColor: Colors.border }]}>
            <View style={[styles.progressFill, {
              backgroundColor: '#10B981',
              width: `${Math.min((plan.completed_this_month / plan.visits_this_month) * 100, 100)}%`,
            }]} />
          </View>
        )}
      </View>

      {/* Pricing */}
      <Text style={[styles.pricing, { color: '#1E40AF' }]}>
        {plan.billing_cycle === 'per_visit'
          ? `$${plan.price_per_visit?.toFixed(0) || '0'}/visit`
          : `$${plan.monthly_rate?.toFixed(0) || '0'}/mo`
        }
      </Text>

      {/* Paused indicator */}
      {isPaused && (
        <View style={styles.pausedBadge}>
          <Ionicons name="pause-circle" size={12} color="#F59E0B" />
          <Text style={styles.pausedText}>Paused</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
    marginBottom: 8,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  planName: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: 8,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: 12,
  },
  visitsRow: {
    marginBottom: 8,
  },
  visitsText: {
    fontSize: 11,
    marginBottom: 4,
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  pricing: {
    fontSize: FontSizes.small,
    fontWeight: '700',
  },
  pausedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  pausedText: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '600',
  },
});

export default ServicePlanCard;
