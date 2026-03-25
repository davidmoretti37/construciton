/**
 * ServicePlanDetailScreen — Detail view for a service plan
 * Shows plan info, locations, visits, routes, and billing
 * (Full implementation in Phase 8)
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchServicePlanDetail } from '../../utils/storage/servicePlans';

const SERVICE_TYPE_CONFIG = {
  pest_control: { label: 'Pest Control', color: '#EF4444' },
  cleaning: { label: 'Cleaning', color: '#8B5CF6' },
  landscaping: { label: 'Landscaping', color: '#10B981' },
  pool_service: { label: 'Pool Service', color: '#3B82F6' },
  lawn_care: { label: 'Lawn Care', color: '#22C55E' },
  hvac: { label: 'HVAC', color: '#F59E0B' },
  other: { label: 'Service', color: '#6B7280' },
};

export default function ServicePlanDetailScreen({ route }) {
  const { plan: initialPlan } = route.params || {};
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();

  const [plan, setPlan] = useState(initialPlan);
  const [refreshing, setRefreshing] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!initialPlan?.id) return;
    const detail = await fetchServicePlanDetail(initialPlan.id);
    if (detail) setPlan(detail);
  }, [initialPlan?.id]);

  useFocusEffect(
    useCallback(() => {
      loadDetail();
    }, [loadDetail])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDetail();
    setRefreshing(false);
  };

  const typeConfig = SERVICE_TYPE_CONFIG[plan?.service_type] || SERVICE_TYPE_CONFIG.other;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]} numberOfLines={1}>
            {plan?.name || 'Service Plan'}
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: typeConfig.color + '18' }]}>
            <Text style={[styles.typeBadgeText, { color: typeConfig.color }]}>{typeConfig.label}</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, {
          backgroundColor: plan?.status === 'active' ? '#10B98118' : '#F59E0B18',
        }]}>
          <Text style={[styles.statusText, {
            color: plan?.status === 'active' ? '#10B981' : '#F59E0B',
          }]}>
            {plan?.status?.charAt(0).toUpperCase() + plan?.status?.slice(1)}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
      >
        {/* Billing Info */}
        <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
          <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Billing</Text>
          <View style={styles.billingRow}>
            <Text style={[styles.billingLabel, { color: Colors.secondaryText }]}>
              {plan?.billing_cycle === 'per_visit' ? 'Per Visit' : plan?.billing_cycle === 'monthly' ? 'Monthly' : 'Quarterly'}
            </Text>
            <Text style={[styles.billingValue, { color: '#1E40AF' }]}>
              ${plan?.billing_cycle === 'per_visit'
                ? (plan?.price_per_visit || 0).toFixed(2)
                : (plan?.monthly_rate || 0).toFixed(2)
              }
            </Text>
          </View>
        </View>

        {/* Locations */}
        <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>
              Locations ({plan?.locations?.length || 0})
            </Text>
          </View>
          {(plan?.locations || []).map(loc => (
            <View key={loc.id} style={[styles.locationItem, { borderColor: Colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.locationName, { color: Colors.primaryText }]}>{loc.name}</Text>
                <Text style={[styles.locationAddress, { color: Colors.secondaryText }]} numberOfLines={1}>
                  {loc.address}
                </Text>
                {loc.schedule && (
                  <View style={styles.scheduleBadge}>
                    <Ionicons name="calendar-outline" size={12} color="#3B82F6" />
                    <Text style={styles.scheduleText}>
                      {loc.schedule.frequency === 'weekly' && `${(loc.schedule.scheduled_days || []).map(d => d.charAt(0).toUpperCase() + d.slice(0, 2)).join('/')} weekly`}
                      {loc.schedule.frequency === 'biweekly' && `${(loc.schedule.scheduled_days || []).map(d => d.charAt(0).toUpperCase() + d.slice(0, 2)).join('/')} biweekly`}
                      {loc.schedule.frequency === 'monthly' && `Day ${loc.schedule.day_of_month} monthly`}
                      {loc.schedule.frequency === 'custom' && 'Custom'}
                    </Text>
                  </View>
                )}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
            </View>
          ))}
          {(!plan?.locations || plan.locations.length === 0) && (
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              No locations added yet
            </Text>
          )}
        </View>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#1E40AF' }]}
            onPress={() => navigation.navigate('Billing', { plan })}
          >
            <Ionicons name="receipt-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Billing</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#059669' }]}
            onPress={() => navigation.navigate('DailyRoute')}
          >
            <Ionicons name="navigate-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Routes</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '600' },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  cardTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  billingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billingLabel: { fontSize: FontSizes.small },
  billingValue: { fontSize: 20, fontWeight: '800' },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    gap: 8,
  },
  locationName: { fontSize: FontSizes.small, fontWeight: '600' },
  locationAddress: { fontSize: 12, marginTop: 2 },
  scheduleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  scheduleText: { fontSize: 11, color: '#3B82F6', fontWeight: '500' },
  emptyText: { fontSize: FontSizes.small, textAlign: 'center', paddingVertical: Spacing.xl },
  actionRow: { flexDirection: 'row', gap: 12, marginTop: Spacing.md },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: BorderRadius.lg,
  },
  actionBtnText: { color: '#fff', fontSize: FontSizes.small, fontWeight: '700' },
});
