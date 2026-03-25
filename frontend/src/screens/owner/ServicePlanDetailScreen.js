/**
 * ServicePlanDetailScreen — Matches ProjectDetailView layout exactly
 * Hero → Financial Cards → Details → Work Sections → Workers → Visits → Actions
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
  pest_control: { label: 'Pest Control', icon: 'bug-outline', color: '#3B82F6' },
  cleaning: { label: 'Cleaning', icon: 'sparkles-outline', color: '#8B5CF6' },
  landscaping: { label: 'Landscaping', icon: 'leaf-outline', color: '#10B981' },
  pool_service: { label: 'Pool Service', icon: 'water-outline', color: '#3B82F6' },
  lawn_care: { label: 'Lawn Care', icon: 'flower-outline', color: '#22C55E' },
  hvac: { label: 'HVAC', icon: 'thermometer-outline', color: '#F59E0B' },
  other: { label: 'Service', icon: 'construct-outline', color: '#3B82F6' },
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

  useFocusEffect(useCallback(() => { loadDetail(); }, [loadDetail]));

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
  const financials = plan?.financials || { total_income: 0, total_expenses: 0, profit: 0 };
  const statusColor = typeConfig.color;

  // Client contact — from plan fields, client FK, or first location
  const client = plan?.client;
  const firstLoc = plan?.locations?.[0];
  const clientName = plan?.client_name || client?.full_name || firstLoc?.contact_name || null;
  const clientPhone = plan?.client_phone || client?.phone || firstLoc?.contact_phone || null;
  const clientEmail = plan?.client_email || client?.email || null;
  const address = plan?.address || firstLoc?.address || null;

  const rate = plan?.billing_cycle === 'per_visit'
    ? plan?.price_per_visit || 0
    : plan?.monthly_rate || 0;
  const rateLabel = plan?.billing_cycle === 'per_visit' ? 'Per Visit' : plan?.billing_cycle === 'quarterly' ? 'Quarterly' : 'Monthly';
  const profit = financials.profit;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
      >
        {/* ═══ HERO SECTION — matches ProjectDetailView exactly ═══ */}
        <View style={[styles.heroSection, { backgroundColor: statusColor }]}>
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {clientName ? `${clientName} - ` : ''}{plan?.name}
            </Text>

            {/* Contact info */}
            <View style={styles.contactContainer}>
              {address ? (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address)}`)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="location" size={16} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.contactText} numberOfLines={2}>{address}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.contactRow}>
                  <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.6)" />
                  <Text style={[styles.contactText, { fontStyle: 'italic', opacity: 0.6 }]}>No address added</Text>
                </View>
              )}

              {clientPhone ? (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(`tel:${clientPhone}`)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="call" size={16} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.contactText}>{clientPhone}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.contactRow}>
                  <Ionicons name="call-outline" size={16} color="rgba(255,255,255,0.6)" />
                  <Text style={[styles.contactText, { fontStyle: 'italic', opacity: 0.6 }]}>No phone added</Text>
                </View>
              )}

              {clientEmail ? (
                <TouchableOpacity
                  style={styles.contactRow}
                  onPress={() => Linking.openURL(`mailto:${clientEmail}`)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="mail" size={16} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.contactText}>{clientEmail}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.contactRow}>
                  <Ionicons name="mail-outline" size={16} color="rgba(255,255,255,0.6)" />
                  <Text style={[styles.contactText, { fontStyle: 'italic', opacity: 0.6 }]}>No email added</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ═══ FINANCIAL CARDS — 2x2 grid matching ProjectDetailView ═══ */}
        <View style={styles.financialContainer}>
          <View style={styles.financialRow}>
            {/* Rate / Contract */}
            <View style={[styles.financialCard, { backgroundColor: Colors.cardBackground }]}>
              <View style={[styles.iconBadge, { backgroundColor: '#3B82F615' }]}>
                <Ionicons name="document-text" size={18} color="#3B82F6" />
              </View>
              <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>{rateLabel}</Text>
              <Text style={[styles.financialValue, { color: Colors.primaryText }]} numberOfLines={1}>
                ${rate.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </Text>
            </View>

            {/* Income */}
            <TouchableOpacity
              style={[styles.financialCard, { backgroundColor: Colors.cardBackground }]}
              onPress={() => navigation.navigate('ProjectTransactions', {
                servicePlanId: plan?.id,
                servicePlanName: plan?.name,
                filterType: 'income',
              })}
              activeOpacity={0.7}
            >
              <View style={[styles.iconBadge, { backgroundColor: '#10B98115' }]}>
                <Ionicons name="cash" size={18} color="#10B981" />
              </View>
              <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>Income</Text>
              <Text style={[styles.financialValue, { color: Colors.primaryText }]} numberOfLines={1}>
                ${financials.total_income.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.financialRow}>
            {/* Expenses */}
            <TouchableOpacity
              style={[styles.financialCard, { backgroundColor: Colors.cardBackground }]}
              onPress={() => navigation.navigate('ProjectTransactions', {
                servicePlanId: plan?.id,
                servicePlanName: plan?.name,
                filterType: 'expense',
              })}
              activeOpacity={0.7}
            >
              <View style={[styles.iconBadge, { backgroundColor: '#EF444415' }]}>
                <Ionicons name="trending-down" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>Expenses</Text>
              <Text style={[styles.financialValue, { color: Colors.primaryText }]} numberOfLines={1}>
                ${financials.total_expenses.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </Text>
            </TouchableOpacity>

            {/* Profit */}
            <View style={[styles.financialCard, { backgroundColor: Colors.cardBackground }]}>
              <View style={[styles.iconBadge, { backgroundColor: profit >= 0 ? '#10B98115' : '#EF444415' }]}>
                <Ionicons name={profit >= 0 ? 'trending-up' : 'trending-down'} size={18} color={profit >= 0 ? '#10B981' : '#EF4444'} />
              </View>
              <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>Profit</Text>
              <Text style={[styles.financialValue, { color: profit >= 0 ? '#10B981' : '#EF4444' }]} numberOfLines={1}>
                ${profit.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </Text>
            </View>
          </View>
        </View>

        {/* ═══ PLAN DETAILS ═══ */}
        {(plan?.description || plan?.task_description) && (
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Plan Details</Text>
            {plan.description && (
              <View style={styles.detailRow}>
                <Ionicons name="document-text-outline" size={18} color={statusColor} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Description</Text>
                  <Text style={[styles.detailValue, { color: Colors.primaryText }]}>{plan.description}</Text>
                </View>
              </View>
            )}
            {plan.task_description && (
              <View style={styles.detailRow}>
                <Ionicons name="clipboard-outline" size={18} color={statusColor} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Scope</Text>
                  <Text style={[styles.detailValue, { color: Colors.primaryText }]}>{plan.task_description}</Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* ═══ WORK SECTIONS — Locations with checklists ═══ */}
        <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="layers-outline" size={20} color={statusColor} style={{ marginRight: 8 }} />
            <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginBottom: 0, flex: 1 }]}>
              Work Sections
            </Text>
            <View style={[styles.countBadge, { backgroundColor: statusColor + '15' }]}>
              <Text style={[styles.countBadgeText, { color: statusColor }]}>{plan?.locations?.length || 0}</Text>
            </View>
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
                <View style={styles.locationHeader}>
                  <View style={[styles.locationDot, { backgroundColor: statusColor }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.locationName, { color: Colors.primaryText }]}>{loc.name}</Text>
                    <Text style={[styles.locationMeta, { color: Colors.secondaryText }]}>
                      {scheduleText || 'No schedule'}{checklistCount > 0 ? ` · ${checklistCount} tasks` : ''}
                    </Text>
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.secondaryText} />
                </View>

                {isExpanded && (
                  <View style={styles.locationExpanded}>
                    {loc.address && (
                      <TouchableOpacity
                        style={styles.locDetailRow}
                        onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(loc.address)}`)}
                      >
                        <Ionicons name="location-outline" size={14} color="#3B82F6" />
                        <Text style={[styles.locDetailText, { color: '#3B82F6' }]}>{loc.address}</Text>
                      </TouchableOpacity>
                    )}
                    {loc.contact_name && (
                      <View style={styles.locDetailRow}>
                        <Ionicons name="person-outline" size={14} color={Colors.secondaryText} />
                        <Text style={[styles.locDetailText, { color: Colors.primaryText }]}>{loc.contact_name}</Text>
                      </View>
                    )}
                    {loc.contact_phone && (
                      <TouchableOpacity style={styles.locDetailRow} onPress={() => Linking.openURL(`tel:${loc.contact_phone}`)}>
                        <Ionicons name="call-outline" size={14} color="#3B82F6" />
                        <Text style={[styles.locDetailText, { color: '#3B82F6' }]}>{loc.contact_phone}</Text>
                      </TouchableOpacity>
                    )}
                    {loc.access_notes && (
                      <View style={[styles.accessNotesBox, { backgroundColor: '#F59E0B10' }]}>
                        <Ionicons name="key-outline" size={13} color="#F59E0B" />
                        <Text style={[styles.locDetailText, { color: Colors.secondaryText }]}>{loc.access_notes}</Text>
                      </View>
                    )}
                    {checklistCount > 0 && (
                      <View style={styles.checklistSection}>
                        {loc.checklist_templates.map((item, i) => (
                          <View key={item.id || i} style={styles.checklistItem}>
                            <Ionicons name="checkbox-outline" size={16} color={statusColor} />
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
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>No locations added yet</Text>
          )}
        </View>

        {/* ═══ RECURRING DAILY TASKS ═══ */}
        {plan?.recurring_tasks?.length > 0 && (
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="repeat-outline" size={20} color="#8B5CF6" style={{ marginRight: 8 }} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginBottom: 0, flex: 1 }]}>
                Daily Tasks
              </Text>
              <View style={[styles.countBadge, { backgroundColor: '#8B5CF615' }]}>
                <Text style={[styles.countBadgeText, { color: '#8B5CF6' }]}>{plan.recurring_tasks.length}</Text>
              </View>
            </View>
            {plan.recurring_tasks.map((task, i) => (
              <View key={task.id || i} style={[styles.taskRow, { borderColor: Colors.border }]}>
                <Ionicons name="ellipse-outline" size={18} color={Colors.secondaryText} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.taskTitle, { color: Colors.primaryText }]}>{task.title}</Text>
                  {task.quantity_unit && (
                    <Text style={[styles.taskUnit, { color: Colors.secondaryText }]}>Tracks: {task.quantity_unit}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ═══ ASSIGNED WORKERS ═══ */}
        <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="people-outline" size={20} color={statusColor} style={{ marginRight: 8 }} />
            <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginBottom: 0, flex: 1 }]}>
              Assigned ({plan?.workers?.length || 0})
            </Text>
          </View>

          {plan?.workers?.length > 0 ? (
            plan.workers.map(w => (
              <View key={w.id} style={[styles.workerRow, { backgroundColor: Colors.background }]}>
                <View style={[styles.workerAvatar, { backgroundColor: statusColor + '20' }]}>
                  <Text style={[styles.workerInitial, { color: statusColor }]}>
                    {(w.full_name || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.workerName, { color: Colors.primaryText }]}>{w.full_name}</Text>
                  {w.trade && <Text style={[styles.workerTrade, { color: Colors.secondaryText }]}>{w.trade}</Text>}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptySection}>
              <Ionicons name="people-outline" size={32} color={Colors.secondaryText + '40'} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>No workers assigned yet</Text>
            </View>
          )}
        </View>

        {/* ═══ RECENT VISITS ═══ */}
        {plan?.recent_visits?.length > 0 && (
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="clipboard-outline" size={20} color={statusColor} style={{ marginRight: 8 }} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginBottom: 0, flex: 1 }]}>
                Recent Visits
              </Text>
            </View>
            {plan.recent_visits.map(visit => {
              const vs = VISIT_STATUS[visit.status] || VISIT_STATUS.scheduled;
              return (
                <View key={visit.id} style={[styles.visitRow, { borderColor: Colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.visitDate, { color: Colors.primaryText }]}>
                        {new Date(visit.scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                      <View style={[styles.visitBadge, { backgroundColor: vs.color + '18' }]}>
                        <Text style={[styles.visitBadgeText, { color: vs.color }]}>{vs.label}</Text>
                      </View>
                    </View>
                    <Text style={[styles.visitMeta, { color: Colors.secondaryText }]}>
                      {visit.location_name}
                      {visit.worker ? ` · ${visit.worker.full_name}` : ''}
                      {visit.duration_minutes ? ` · ${visit.duration_minutes}min` : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },

  // Hero — matches ProjectDetailView exactly
  heroSection: {
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroContent: { flex: 1, marginRight: 12 },
  heroTitle: {
    fontSize: 20, fontWeight: '700', color: '#FFFFFF',
    marginBottom: 6, lineHeight: 24,
  },
  contactContainer: { marginTop: 4, gap: 4 },
  contactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3,
  },
  contactText: {
    fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '500', flex: 1,
  },

  // Financial cards — matches ProjectDetailView exactly
  financialContainer: { padding: 12 },
  financialRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  financialCard: {
    flex: 1, padding: 14, borderRadius: 14,
    elevation: 3, shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6,
    borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.12)',
  },
  iconBadge: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  financialLabel: { fontSize: 11, fontWeight: '500', marginBottom: 3 },
  financialValue: { fontSize: 18, fontWeight: '700' },

  // Sections — matches ProjectDetailView
  section: {
    marginHorizontal: 12, marginBottom: 12,
    borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 14,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', marginBottom: 14 },
  countBadge: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  countBadgeText: { fontSize: 12, fontWeight: '700' },

  // Plan details
  detailRow: {
    flexDirection: 'row', gap: 10, paddingVertical: 8,
  },
  detailLabel: { fontSize: 11, fontWeight: '500', marginBottom: 2 },
  detailValue: { fontSize: 14, fontWeight: '500', lineHeight: 20 },

  // Locations
  locationCard: { borderBottomWidth: 1, paddingVertical: 12 },
  locationHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationDot: { width: 10, height: 10, borderRadius: 5 },
  locationName: { fontSize: 15, fontWeight: '600' },
  locationMeta: { fontSize: 12, marginTop: 2 },
  locationExpanded: { marginTop: 10, marginLeft: 20, gap: 6 },
  locDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locDetailText: { fontSize: 13, flex: 1 },
  accessNotesBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    borderRadius: 8, padding: 8,
  },
  checklistSection: { marginTop: 6, gap: 4 },
  checklistItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  checklistText: { fontSize: 13 },

  // Recurring tasks
  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1,
  },
  taskTitle: { fontSize: 14, fontWeight: '500' },
  taskUnit: { fontSize: 11, marginTop: 2 },

  // Workers
  workerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 10, marginBottom: 6,
  },
  workerAvatar: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  workerInitial: { fontSize: 15, fontWeight: '700' },
  workerName: { fontSize: 14, fontWeight: '600' },
  workerTrade: { fontSize: 11, marginTop: 1 },

  // Visits
  visitRow: { paddingVertical: 10, borderBottomWidth: 1 },
  visitDate: { fontSize: 14, fontWeight: '600' },
  visitBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  visitBadgeText: { fontSize: 10, fontWeight: '600' },
  visitMeta: { fontSize: 12, marginTop: 3 },

  // Actions
  actionRow: {
    flexDirection: 'row', gap: 12, marginTop: 12, paddingHorizontal: 12,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 14,
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Empty states
  emptySection: { alignItems: 'center', paddingVertical: 20, gap: 8 },
  emptyText: { fontSize: 13, textAlign: 'center' },
});
