/**
 * ServicePlanDetailScreen — Rich detail view matching ProjectDetailView layout
 * Hero (client info) → Financials → Locations (work sections) → Visit History → Workers
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchServicePlanDetail } from '../../utils/storage/servicePlans';

const SERVICE_TYPE_CONFIG = {
  pest_control: { label: 'Pest Control', icon: 'bug-outline', color: '#EF4444' },
  cleaning: { label: 'Cleaning', icon: 'sparkles-outline', color: '#8B5CF6' },
  landscaping: { label: 'Landscaping', icon: 'leaf-outline', color: '#10B981' },
  pool_service: { label: 'Pool Service', icon: 'water-outline', color: '#3B82F6' },
  lawn_care: { label: 'Lawn Care', icon: 'flower-outline', color: '#22C55E' },
  hvac: { label: 'HVAC', icon: 'thermometer-outline', color: '#F59E0B' },
  other: { label: 'Service', icon: 'construct-outline', color: '#6B7280' },
};

const STATUS_CONFIG = {
  active: { color: '#10B981', bg: '#10B98115' },
  paused: { color: '#F59E0B', bg: '#F59E0B15' },
  cancelled: { color: '#EF4444', bg: '#EF444415' },
};

const VISIT_STATUS = {
  scheduled: { color: '#9CA3AF', label: 'Scheduled' },
  in_progress: { color: '#3B82F6', label: 'In Progress' },
  completed: { color: '#10B981', label: 'Completed' },
  skipped: { color: '#F59E0B', label: 'Skipped' },
  cancelled: { color: '#EF4444', label: 'Cancelled' },
};

const DAY_ABBREV = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' };

function formatSchedule(schedule) {
  if (!schedule) return null;
  const days = (schedule.scheduled_days || []).map(d => DAY_ABBREV[d] || d.slice(0, 3)).join(', ');
  if (schedule.frequency === 'weekly') return `${days} weekly`;
  if (schedule.frequency === 'biweekly') return `${days} biweekly`;
  if (schedule.frequency === 'monthly') return `Day ${schedule.day_of_month} monthly`;
  return schedule.frequency;
}

export default function ServicePlanDetailScreen({ route }) {
  const { planId, plan: initialPlan } = route.params || {};
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();

  const [plan, setPlan] = useState(initialPlan || null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedLocationIds, setExpandedLocationIds] = useState(new Set());

  const resolvedId = planId || initialPlan?.id;

  const loadDetail = useCallback(async () => {
    if (!resolvedId) return;
    const detail = await fetchServicePlanDetail(resolvedId);
    if (detail) setPlan(detail);
    setLoading(false);
  }, [resolvedId]);

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

  const toggleLocation = (locId) => {
    setExpandedLocationIds(prev => {
      const next = new Set(prev);
      next.has(locId) ? next.delete(locId) : next.add(locId);
      return next;
    });
  };

  if (loading && !plan) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
        <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 100 }} />
      </SafeAreaView>
    );
  }

  const typeConfig = SERVICE_TYPE_CONFIG[plan?.service_type] || SERVICE_TYPE_CONFIG.other;
  const statusConfig = STATUS_CONFIG[plan?.status] || STATUS_CONFIG.active;
  const financials = plan?.financials || { total_income: 0, total_expenses: 0, profit: 0 };
  const visitStats = plan?.visit_stats || { completed_this_month: 0, total_this_month: 0 };

  // Derive client contact from plan.client or first location
  const client = plan?.client;
  const firstLoc = plan?.locations?.[0];
  const contactName = client?.full_name || firstLoc?.contact_name || null;
  const contactPhone = client?.phone || firstLoc?.contact_phone || null;
  const contactEmail = client?.email || null;
  const contactAddress = firstLoc?.address || null;

  const rate = plan?.billing_cycle === 'per_visit'
    ? plan?.price_per_visit || 0
    : plan?.monthly_rate || 0;
  const rateLabel = plan?.billing_cycle === 'per_visit' ? 'Per Visit' : plan?.billing_cycle === 'quarterly' ? 'Quarterly' : 'Monthly';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
      >
        {/* ═══ HERO SECTION ═══ */}
        <View style={[styles.hero, { backgroundColor: typeConfig.color + '12' }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={22} color={Colors.primaryText} />
          </TouchableOpacity>

          <View style={styles.heroContent}>
            <View style={styles.heroTop}>
              <Ionicons name={typeConfig.icon} size={28} color={typeConfig.color} />
              <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
                <Text style={[styles.statusText, { color: statusConfig.color }]}>
                  {plan?.status?.charAt(0).toUpperCase() + plan?.status?.slice(1)}
                </Text>
              </View>
            </View>

            <Text style={[styles.heroTitle, { color: Colors.primaryText }]}>{plan?.name}</Text>

            {contactName && (
              <Text style={[styles.heroSubtitle, { color: Colors.secondaryText }]}>{contactName}</Text>
            )}

            {/* Contact info row */}
            <View style={styles.contactRow}>
              {contactAddress && (
                <TouchableOpacity
                  style={styles.contactItem}
                  onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(contactAddress)}`)}
                >
                  <Ionicons name="location-outline" size={14} color={typeConfig.color} />
                  <Text style={[styles.contactText, { color: Colors.secondaryText }]} numberOfLines={1}>
                    {contactAddress}
                  </Text>
                </TouchableOpacity>
              )}
              {contactPhone && (
                <TouchableOpacity
                  style={styles.contactItem}
                  onPress={() => Linking.openURL(`tel:${contactPhone}`)}
                >
                  <Ionicons name="call-outline" size={14} color={typeConfig.color} />
                  <Text style={[styles.contactText, { color: '#1E40AF' }]}>{contactPhone}</Text>
                </TouchableOpacity>
              )}
              {contactEmail && (
                <TouchableOpacity
                  style={styles.contactItem}
                  onPress={() => Linking.openURL(`mailto:${contactEmail}`)}
                >
                  <Ionicons name="mail-outline" size={14} color={typeConfig.color} />
                  <Text style={[styles.contactText, { color: '#1E40AF' }]}>{contactEmail}</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Visit stats badge */}
            {visitStats.total_this_month > 0 && (
              <View style={[styles.visitStatsBadge, { backgroundColor: Colors.cardBackground }]}>
                <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                <Text style={[styles.visitStatsText, { color: Colors.primaryText }]}>
                  {visitStats.completed_this_month}/{visitStats.total_this_month} visits this month
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ═══ FINANCIAL SUMMARY ═══ */}
        <View style={styles.financialGrid}>
          <View style={[styles.finCard, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.finLabel, { color: Colors.secondaryText }]}>{rateLabel} Rate</Text>
            <Text style={[styles.finValue, { color: typeConfig.color }]}>${rate.toFixed(2)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.finCard, { backgroundColor: Colors.cardBackground }]}
            onPress={() => navigation.navigate('ProjectTransactions', { servicePlanId: plan?.id, servicePlanName: plan?.name, filterType: 'income' })}
          >
            <Text style={[styles.finLabel, { color: Colors.secondaryText }]}>Income</Text>
            <Text style={[styles.finValue, { color: '#10B981' }]}>${financials.total_income.toFixed(2)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.finCard, { backgroundColor: Colors.cardBackground }]}
            onPress={() => navigation.navigate('ProjectTransactions', { servicePlanId: plan?.id, servicePlanName: plan?.name, filterType: 'expense' })}
          >
            <Text style={[styles.finLabel, { color: Colors.secondaryText }]}>Expenses</Text>
            <Text style={[styles.finValue, { color: '#EF4444' }]}>${financials.total_expenses.toFixed(2)}</Text>
          </TouchableOpacity>
          <View style={[styles.finCard, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.finLabel, { color: Colors.secondaryText }]}>Profit</Text>
            <Text style={[styles.finValue, { color: financials.profit >= 0 ? '#10B981' : '#EF4444' }]}>
              ${financials.profit.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* ═══ LOCATIONS (WORK SECTIONS) ═══ */}
        <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              Locations ({plan?.locations?.length || 0})
            </Text>
          </View>

          {(plan?.locations || []).map(loc => {
            const isExpanded = expandedLocationIds.has(loc.id);
            const scheduleText = formatSchedule(loc.schedule);
            const checklistCount = loc.checklist_templates?.length || 0;

            return (
              <TouchableOpacity
                key={loc.id}
                activeOpacity={0.7}
                onPress={() => toggleLocation(loc.id)}
                style={[styles.locationCard, { borderColor: Colors.border }]}
              >
                {/* Location header */}
                <View style={styles.locationHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.locationName, { color: Colors.primaryText }]}>{loc.name}</Text>
                    <Text style={[styles.locationAddress, { color: Colors.secondaryText }]} numberOfLines={1}>
                      {loc.address}
                    </Text>
                    <View style={styles.locationBadges}>
                      {scheduleText && (
                        <View style={[styles.badge, { backgroundColor: '#3B82F615' }]}>
                          <Ionicons name="calendar-outline" size={10} color="#3B82F6" />
                          <Text style={[styles.badgeText, { color: '#3B82F6' }]}>{scheduleText}</Text>
                        </View>
                      )}
                      {checklistCount > 0 && (
                        <View style={[styles.badge, { backgroundColor: '#8B5CF615' }]}>
                          <Ionicons name="checkbox-outline" size={10} color="#8B5CF6" />
                          <Text style={[styles.badgeText, { color: '#8B5CF6' }]}>{checklistCount} tasks</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={Colors.secondaryText}
                  />
                </View>

                {/* Expanded: checklist + contact info */}
                {isExpanded && (
                  <View style={styles.locationExpanded}>
                    {/* Contact info */}
                    {(loc.contact_name || loc.contact_phone) && (
                      <View style={[styles.contactCard, { backgroundColor: Colors.background }]}>
                        {loc.contact_name && (
                          <View style={styles.contactItem}>
                            <Ionicons name="person-outline" size={13} color={Colors.secondaryText} />
                            <Text style={[styles.contactText, { color: Colors.primaryText }]}>{loc.contact_name}</Text>
                          </View>
                        )}
                        {loc.contact_phone && (
                          <TouchableOpacity style={styles.contactItem} onPress={() => Linking.openURL(`tel:${loc.contact_phone}`)}>
                            <Ionicons name="call-outline" size={13} color="#1E40AF" />
                            <Text style={[styles.contactText, { color: '#1E40AF' }]}>{loc.contact_phone}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}

                    {/* Access notes */}
                    {loc.access_notes && (
                      <View style={[styles.accessNotes, { backgroundColor: '#F59E0B10' }]}>
                        <Ionicons name="key-outline" size={13} color="#F59E0B" />
                        <Text style={[styles.accessNotesText, { color: Colors.secondaryText }]}>{loc.access_notes}</Text>
                      </View>
                    )}

                    {/* Checklist templates */}
                    {checklistCount > 0 && (
                      <View style={styles.checklistSection}>
                        <Text style={[styles.checklistTitle, { color: Colors.secondaryText }]}>Daily Tasks</Text>
                        {loc.checklist_templates.map((item, i) => (
                          <View key={item.id || i} style={styles.checklistItem}>
                            <View style={[styles.checkDot, { borderColor: typeConfig.color }]} />
                            <Text style={[styles.checklistText, { color: Colors.primaryText }]}>{item.title}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          {(!plan?.locations || plan.locations.length === 0) && (
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              No locations added yet
            </Text>
          )}
        </View>

        {/* ═══ VISIT HISTORY ═══ */}
        {plan?.recent_visits?.length > 0 && (
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Recent Visits</Text>
            {plan.recent_visits.map(visit => {
              const vs = VISIT_STATUS[visit.status] || VISIT_STATUS.scheduled;
              return (
                <View key={visit.id} style={[styles.visitRow, { borderColor: Colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.visitTop}>
                      <Text style={[styles.visitDate, { color: Colors.primaryText }]}>
                        {new Date(visit.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                      <View style={[styles.visitBadge, { backgroundColor: vs.color + '18' }]}>
                        <Text style={[styles.visitBadgeText, { color: vs.color }]}>{vs.label}</Text>
                      </View>
                    </View>
                    <Text style={[styles.visitLocation, { color: Colors.secondaryText }]}>
                      {visit.location_name}
                    </Text>
                    {visit.worker && (
                      <Text style={[styles.visitWorker, { color: Colors.secondaryText }]}>
                        {visit.worker.full_name}
                        {visit.duration_minutes ? ` · ${visit.duration_minutes}min` : ''}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ═══ WORKERS ═══ */}
        {plan?.workers?.length > 0 && (
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Workers</Text>
            <View style={styles.workersRow}>
              {plan.workers.map(w => (
                <View key={w.id} style={styles.workerChip}>
                  <View style={[styles.workerAvatar, { backgroundColor: typeConfig.color + '20' }]}>
                    <Text style={[styles.workerInitial, { color: typeConfig.color }]}>
                      {(w.full_name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={[styles.workerName, { color: Colors.primaryText }]}>{w.full_name}</Text>
                    {w.trade && <Text style={[styles.workerTrade, { color: Colors.secondaryText }]}>{w.trade}</Text>}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ═══ ACTION BUTTONS ═══ */}
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
  scrollContent: { paddingBottom: 40 },

  // Hero
  hero: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backButton: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  heroContent: { paddingLeft: 4 },
  heroTop: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 8,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', marginBottom: 2 },
  heroSubtitle: { fontSize: 15, fontWeight: '500', marginBottom: 12 },
  contactRow: { gap: 6, marginBottom: 12 },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contactText: { fontSize: 13, flex: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '600' },
  visitStatsBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10,
  },
  visitStatsText: { fontSize: 12, fontWeight: '600' },

  // Financials
  financialGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    paddingHorizontal: Spacing.lg, marginTop: -12,
    marginBottom: Spacing.lg,
  },
  finCard: {
    flex: 1, minWidth: '45%',
    borderRadius: BorderRadius.lg, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  finLabel: { fontSize: 11, fontWeight: '500', textTransform: 'uppercase', letterSpacing: 0.5 },
  finValue: { fontSize: 20, fontWeight: '800', marginTop: 4 },

  // Sections
  section: {
    marginHorizontal: Spacing.lg, marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg, padding: Spacing.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: { fontSize: FontSizes.body, fontWeight: '700', marginBottom: Spacing.sm },

  // Locations
  locationCard: {
    borderBottomWidth: 1, paddingVertical: Spacing.md,
  },
  locationHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  locationName: { fontSize: 14, fontWeight: '600' },
  locationAddress: { fontSize: 12, marginTop: 2 },
  locationBadges: { flexDirection: 'row', gap: 6, marginTop: 6 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  badgeText: { fontSize: 10, fontWeight: '600' },
  locationExpanded: { marginTop: 12, gap: 8 },
  contactCard: {
    borderRadius: 10, padding: 10, gap: 6,
  },
  accessNotes: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    borderRadius: 10, padding: 10,
  },
  accessNotesText: { fontSize: 12, flex: 1 },
  checklistSection: { gap: 4 },
  checklistTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  checklistItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  checkDot: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
  checklistText: { fontSize: 13 },

  // Visits
  visitRow: { borderBottomWidth: 1, paddingVertical: 10 },
  visitTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  visitDate: { fontSize: 14, fontWeight: '600' },
  visitBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  visitBadgeText: { fontSize: 10, fontWeight: '600' },
  visitLocation: { fontSize: 12, marginTop: 2 },
  visitWorker: { fontSize: 11, marginTop: 2 },

  // Workers
  workersRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  workerChip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  workerAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  workerInitial: { fontSize: 14, fontWeight: '700' },
  workerName: { fontSize: 13, fontWeight: '600' },
  workerTrade: { fontSize: 11 },

  // Actions
  actionRow: { flexDirection: 'row', gap: 12, marginTop: Spacing.md, paddingHorizontal: Spacing.lg },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: BorderRadius.lg,
  },
  actionBtnText: { color: '#fff', fontSize: FontSizes.small, fontWeight: '700' },

  emptyText: { fontSize: FontSizes.small, textAlign: 'center', paddingVertical: Spacing.xl },
});
