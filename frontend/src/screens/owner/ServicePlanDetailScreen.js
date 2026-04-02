/**
 * ServicePlanDetailScreen — 1:1 feature parity with ProjectDetailView
 * Hero → Financials → Job Details → Work Sections → Daily Tasks → Assigned →
 * Daily Reports → Documents → Estimates → Timeline → Delete
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
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { getColors, LightColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { fetchServicePlanDetail } from '../../utils/storage/servicePlans';
import { supabase } from '../../lib/supabase';
import { uploadProjectDocument } from '../../utils/storage/projectDocuments';
import WorkerAssignmentModal from '../../components/WorkerAssignmentModal';
import SupervisorAssignmentModal from '../../components/SupervisorAssignmentModal';
import DailyChecklistSection from '../../components/DailyChecklistSection';

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
const DAYS_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LETTERS = { monday: 'M', tuesday: 'T', wednesday: 'W', thursday: 'T', friday: 'F', saturday: 'S', sunday: 'S' };
const NUM_TO_DAY = { 0: 'sunday', 1: 'monday', 2: 'tuesday', 3: 'wednesday', 4: 'thursday', 5: 'friday', 6: 'saturday' };

// Normalize scheduled_days — handles strings ("monday"), numbers (1), abbreviations ("mon")
const normalizeDays = (days) => {
  if (!days || !Array.isArray(days)) return [];
  return days.map(d => {
    if (typeof d === 'number') return NUM_TO_DAY[d] || null;
    const lower = String(d).toLowerCase();
    return DAYS_ORDER.find(day => day === lower || day.startsWith(lower)) || lower;
  }).filter(Boolean);
};

function formatSchedule(schedule) {
  if (!schedule) return null;
  const normalized = normalizeDays(schedule.scheduled_days || []);
  const days = normalized.map(d => DAY_ABBREV[d] || d.charAt(0).toUpperCase() + d.slice(1, 3)).join(', ');
  if (schedule.frequency === 'weekly') return `${days} weekly`;
  if (schedule.frequency === 'biweekly') return `${days} biweekly`;
  if (schedule.frequency === 'monthly') return `Day ${schedule.day_of_month} monthly`;
  return schedule.frequency;
}

function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function ServicePlanDetailScreen({ route }) {
  const { planId, plan: initialPlan } = route.params || {};
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();
  const { profile } = useAuth() || {};
  const userRole = profile?.role || 'owner';

  const [plan, setPlan] = useState(initialPlan || null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedLocationIds, setExpandedLocationIds] = useState(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showWorkerAssignment, setShowWorkerAssignment] = useState(false);
  const [showSupervisorAssignment, setShowSupervisorAssignment] = useState(false);

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

  const handleDelete = async () => {
    try {
      const { error } = await supabase.from('service_plans').delete().eq('id', resolvedId);
      if (error) throw error;
      setShowDeleteModal(false);
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Failed to delete service plan');
    }
  };

  const handleUploadDocument = () => {
    Alert.alert('Add Document', null, [
      { text: 'Take Photo', onPress: () => pickImage('camera') },
      { text: 'Choose from Gallery', onPress: () => pickImage('gallery') },
      { text: 'Choose from Files', onPress: () => pickFile() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickImage = async (source) => {
    try {
      const result = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
      if (!result.canceled && result.assets?.[0]) {
        await uploadDoc(result.assets[0].uri, 'image');
      }
    } catch (e) { console.error('Image pick error:', e); }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (!result.canceled && result.assets?.[0]) {
        await uploadDoc(result.assets[0].uri, 'document', result.assets[0].name);
      }
    } catch (e) { console.error('File pick error:', e); }
  };

  const uploadDoc = async (uri, fileType, fileName) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const name = fileName || `${Date.now()}.${fileType === 'image' ? 'jpg' : 'pdf'}`;
      const path = `${user.id}/${resolvedId}/${name}`;
      const response = await fetch(uri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage.from('project-documents').upload(path, blob);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('project-documents').getPublicUrl(path);
      await supabase.from('project_documents').insert({
        service_plan_id: resolvedId,
        file_name: name,
        file_url: path,
        file_type: fileType,
        uploaded_by: user.id,
      });
      await loadDetail();
    } catch (e) {
      Alert.alert('Error', 'Failed to upload document');
      console.error('Upload error:', e);
    }
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
  const profit = financials.profit;

  const client = plan?.client;
  const firstLoc = plan?.locations?.[0];
  const clientName = plan?.client_name || client?.full_name || firstLoc?.contact_name || null;
  const clientPhone = plan?.client_phone || client?.phone || firstLoc?.contact_phone || null;
  const clientEmail = plan?.client_email || client?.email || null;
  const address = plan?.address || firstLoc?.address || null;

  const rate = plan?.billing_cycle === 'per_visit' ? plan?.price_per_visit || 0 : plan?.monthly_rate || 0;
  const rateLabel = plan?.billing_cycle === 'per_visit' ? 'Per Visit' : plan?.billing_cycle === 'quarterly' ? 'Quarterly' : 'Monthly';

  const reports = plan?.daily_reports || [];
  const documents = plan?.documents || [];
  const estimates = plan?.estimates || [];

  // Schedule info for timeline
  const firstSchedule = firstLoc?.schedule;
  const scheduledDays = normalizeDays(firstSchedule?.scheduled_days);

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
        {/* ═══ A. HERO ═══ */}
        <View style={[styles.heroSection, { backgroundColor: statusColor }]}>
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle} numberOfLines={2}>
              {clientName ? `${clientName} - ` : ''}{plan?.name}
            </Text>
            <View style={styles.contactContainer}>
              {address ? (
                <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address)}`)} activeOpacity={0.7}>
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
                <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL(`tel:${clientPhone}`)} activeOpacity={0.7}>
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
                <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL(`mailto:${clientEmail}`)} activeOpacity={0.7}>
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

        {/* ═══ B. FINANCIAL CARDS ═══ */}
        <View style={styles.financialContainer}>
          <View style={styles.financialRow}>
            <View style={[styles.financialCard, { backgroundColor: Colors.cardBackground }]}>
              <View style={[styles.iconBadge, { backgroundColor: '#3B82F615' }]}>
                <Ionicons name="document-text" size={18} color="#3B82F6" />
              </View>
              <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>{rateLabel}</Text>
              <Text style={[styles.financialValue, { color: Colors.primaryText }]}>${rate.toLocaleString()}</Text>
            </View>
            <TouchableOpacity style={[styles.financialCard, { backgroundColor: Colors.cardBackground }]} onPress={() => navigation.navigate('ProjectTransactions', { servicePlanId: plan?.id, servicePlanName: plan?.name, filterType: 'income' })} activeOpacity={0.7}>
              <View style={[styles.iconBadge, { backgroundColor: '#10B98115' }]}>
                <Ionicons name="cash" size={18} color="#10B981" />
              </View>
              <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>Income</Text>
              <Text style={[styles.financialValue, { color: Colors.primaryText }]}>${financials.total_income.toLocaleString()}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.financialRow}>
            <TouchableOpacity style={[styles.financialCard, { backgroundColor: Colors.cardBackground }]} onPress={() => navigation.navigate('ProjectTransactions', { servicePlanId: plan?.id, servicePlanName: plan?.name, filterType: 'expense' })} activeOpacity={0.7}>
              <View style={[styles.iconBadge, { backgroundColor: '#EF444415' }]}>
                <Ionicons name="trending-down" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>Expenses</Text>
              <Text style={[styles.financialValue, { color: Colors.primaryText }]}>${financials.total_expenses.toLocaleString()}</Text>
            </TouchableOpacity>
            <View style={[styles.financialCard, { backgroundColor: Colors.cardBackground }]}>
              <View style={[styles.iconBadge, { backgroundColor: profit >= 0 ? '#10B98115' : '#EF444415' }]}>
                <Ionicons name={profit >= 0 ? 'trending-up' : 'trending-down'} size={18} color={profit >= 0 ? '#10B981' : '#EF4444'} />
              </View>
              <Text style={[styles.financialLabel, { color: Colors.secondaryText }]}>Profit</Text>
              <Text style={[styles.financialValue, { color: profit >= 0 ? '#10B981' : '#EF4444' }]}>${profit.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        {/* ═══ ACTION BUTTONS (Billing + Routes) ═══ */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#1E40AF' }]} onPress={() => navigation.navigate('Billing', { plan })}>
            <Ionicons name="receipt-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Billing</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#059669' }]} onPress={() => navigation.navigate('MapRoute', { locations: (plan?.locations || []).filter(l => l.latitude && l.longitude) })}>
            <Ionicons name="navigate-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Routes</Text>
          </TouchableOpacity>
        </View>

        {/* ═══ C. JOB DETAILS ═══ */}
        {(plan?.description || plan?.task_description || address) && (
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.sectionTitleStandalone, { color: Colors.primaryText }]}>Job Details</Text>
            {plan?.description && (
              <View style={styles.detailRow}>
                <Ionicons name="document-text-outline" size={18} color={statusColor} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Description</Text>
                  <Text style={[styles.detailValue, { color: Colors.primaryText }]}>{plan.description}</Text>
                </View>
              </View>
            )}
            {address && (
              <TouchableOpacity style={styles.detailRow} onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(address)}`)}>
                <Ionicons name="location-outline" size={18} color={statusColor} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, { color: Colors.secondaryText }]}>Location</Text>
                  <Text style={[styles.detailValue, { color: '#3B82F6' }]}>{address}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* ═══ D. LOCATIONS & TASKS / WORK SECTIONS ═══ */}
        {plan?.has_phases && plan?.phases?.length > 0 ? (
          /* ── Project-style: phases with progress ── */
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="layers-outline" size={20} color={statusColor} />
              <Text style={[styles.sectionHeaderTitle, { color: Colors.primaryText }]}>Work Sections</Text>
            </View>
            {plan.phases.map((phase, i) => {
              const isExpanded = expandedLocationIds.has(phase.id);
              const completion = phase.completion_percentage || 0;
              return (
                <TouchableOpacity key={phase.id || i} activeOpacity={0.7} onPress={() => toggleLocation(phase.id)} style={[styles.locationCard, { borderColor: Colors.border }]}>
                  <View style={styles.locationHeader}>
                    <View style={[styles.locationDot, { backgroundColor: completion === 100 ? '#10B981' : statusColor }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.locationName, { color: Colors.primaryText }]}>{phase.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.border }}>
                          <View style={{ width: `${completion}%`, height: 4, borderRadius: 2, backgroundColor: completion === 100 ? '#10B981' : statusColor }} />
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: completion === 100 ? '#10B981' : Colors.secondaryText }}>{completion}%</Text>
                      </View>
                    </View>
                    <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.secondaryText} />
                  </View>
                  {isExpanded && phase.planned_days && (
                    <View style={styles.locationExpanded}>
                      <View style={styles.locDetailRow}>
                        <Ionicons name="calendar-outline" size={14} color={Colors.secondaryText} />
                        <Text style={[styles.locDetailText, { color: Colors.secondaryText }]}>{phase.planned_days} days planned</Text>
                      </View>
                      {phase.status && (
                        <View style={styles.locDetailRow}>
                          <Ionicons name="flag-outline" size={14} color={Colors.secondaryText} />
                          <Text style={[styles.locDetailText, { color: Colors.secondaryText }]}>{phase.status.replace('_', ' ')}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (plan?.locations || []).length > 1 ? (
          /* ── Pure service plan with multiple locations: show location details only (tasks merged into checklist) ── */
          <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.sectionHeader}>
              <Ionicons name="location-outline" size={20} color={statusColor} />
              <Text style={[styles.sectionHeaderTitle, { color: Colors.primaryText }]}>Service Locations</Text>
            </View>
            {(plan?.locations || []).map(loc => {
              const scheduleText = formatSchedule(loc.schedule);
              return (
                <View key={loc.id} style={[styles.locationCard, { borderColor: Colors.border }]}>
                  <View style={styles.locationHeader}>
                    <Ionicons name="pin-outline" size={16} color={statusColor} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.locationName, { color: Colors.primaryText }]}>{loc.name}</Text>
                      {loc.address && (
                        <TouchableOpacity onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(loc.address)}`)}>
                          <Text style={{ fontSize: 12, color: '#3B82F6', marginTop: 1 }}>{loc.address}</Text>
                        </TouchableOpacity>
                      )}
                      {scheduleText && <Text style={[styles.locationMeta, { color: Colors.secondaryText }]}>{scheduleText}</Text>}
                    </View>
                  </View>
                  {(loc.contact_name || loc.contact_phone || loc.access_notes) && (
                    <View style={{ marginTop: 6, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border }}>
                      {loc.contact_name && <View style={styles.locDetailRow}><Ionicons name="person-outline" size={13} color={Colors.secondaryText} /><Text style={[styles.locDetailText, { color: Colors.secondaryText, fontSize: 12 }]}>{loc.contact_name}</Text></View>}
                      {loc.contact_phone && <TouchableOpacity style={styles.locDetailRow} onPress={() => Linking.openURL(`tel:${loc.contact_phone}`)}><Ionicons name="call-outline" size={13} color="#3B82F6" /><Text style={[styles.locDetailText, { color: '#3B82F6', fontSize: 12 }]}>{loc.contact_phone}</Text></TouchableOpacity>}
                      {loc.access_notes && <View style={[styles.accessNotesBox, { backgroundColor: '#F59E0B10' }]}><Ionicons name="key-outline" size={12} color="#F59E0B" /><Text style={[styles.locDetailText, { color: Colors.secondaryText, fontSize: 12 }]}>{loc.access_notes}</Text></View>}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ) : null /* Single location pure service plan — tasks are in Today's Checklist */}

        {/* ═══ E. DAILY CHECKLIST (Living) ═══ */}
        {resolvedId && (
          <DailyChecklistSection
            servicePlanId={resolvedId}
            ownerId={plan?.owner_id}
            userRole={userRole}
            userId={profile?.id}
            visitTasks={!plan?.has_phases ? (plan?.locations || []).flatMap(loc => loc.checklist_templates || []) : []}
          />
        )}

        {/* ═══ F. ASSIGNED ═══ */}
        <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="people-outline" size={20} color={statusColor} />
            <Text style={[styles.sectionHeaderTitle, { color: Colors.primaryText }]}>Assigned ({plan?.workers?.length || 0})</Text>
            <View style={styles.assignButtonsRow}>
              <TouchableOpacity style={[styles.assignButton, { backgroundColor: '#1E40AF' }]} onPress={() => setShowSupervisorAssignment(true)}>
                <Ionicons name="briefcase" size={14} color="#fff" />
                <Text style={styles.assignButtonText}>Supervisor</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.assignButton, { backgroundColor: statusColor }]} onPress={() => setShowWorkerAssignment(true)}>
                <Ionicons name="person-add" size={14} color="#fff" />
                <Text style={styles.assignButtonText}>Worker</Text>
              </TouchableOpacity>
            </View>
          </View>
          {plan?.workers?.length > 0 ? plan.workers.map(w => (
            <TouchableOpacity
              key={w.id}
              style={[styles.workerCard, { backgroundColor: Colors.background }]}
              onPress={() => navigation.navigate('WorkerDetailHistory', { worker: w })}
              activeOpacity={0.7}
            >
              <View style={[styles.workerAvatar, { backgroundColor: statusColor + '20' }]}>
                <Text style={[styles.workerInitial, { color: statusColor }]}>{getInitials(w.full_name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.workerName, { color: Colors.primaryText }]}>{w.full_name}</Text>
                {w.trade && <Text style={[styles.workerTrade, { color: Colors.secondaryText }]}>{w.trade}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
            </TouchableOpacity>
          )) : (
            <View style={styles.emptySection}>
              <Ionicons name="people-outline" size={40} color={Colors.secondaryText + '40'} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>No workers assigned yet</Text>
            </View>
          )}
        </View>

        {/* ═══ G. DAILY REPORTS ═══ */}
        <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="clipboard-outline" size={20} color={statusColor} />
            <Text style={[styles.sectionHeaderTitle, { color: Colors.primaryText }]}>Daily Reports ({reports.length})</Text>
            <TouchableOpacity style={[styles.addBtnCircle, { backgroundColor: statusColor }]} onPress={() => navigation.navigate('DailyReportForm', { isOwner: true, servicePlanId: resolvedId })}>
              <Ionicons name="add" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
          {reports.length > 0 ? reports.map(r => (
            <TouchableOpacity key={r.id} style={[styles.reportRow, { borderColor: Colors.border }]} onPress={() => navigation.navigate('DailyReportDetail', { report: { ...r, _planName: plan?.name } })} activeOpacity={0.7}>
              <Text style={[styles.reportDate, { color: Colors.primaryText }]}>
                {new Date(r.report_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <View style={[styles.reporterBadge, { backgroundColor: r.reporter_type === 'owner' ? '#10B98118' : r.reporter_type === 'supervisor' ? '#3B82F618' : '#9CA3AF18' }]}>
                  <Text style={[styles.reporterBadgeText, { color: r.reporter_type === 'owner' ? '#10B981' : r.reporter_type === 'supervisor' ? '#3B82F6' : '#9CA3AF' }]}>
                    {r.reporter_type === 'owner' ? 'Owner' : r.reporter_type === 'supervisor' ? 'Supervisor' : r.workers?.full_name || 'Worker'}
                  </Text>
                </View>
                {r.photos?.length > 0 && (
                  <View style={[styles.photoBadge, { backgroundColor: '#3B82F618' }]}>
                    <Ionicons name="camera" size={10} color="#3B82F6" />
                    <Text style={{ fontSize: 10, color: '#3B82F6', fontWeight: '600' }}>{r.photos.length}</Text>
                  </View>
                )}
              </View>
              {(r.work_performed || r.tags?.[0]) && (
                <Text style={[styles.reportWork, { color: Colors.secondaryText }]} numberOfLines={2}>
                  {Array.isArray(r.work_performed) ? r.work_performed.map(w => w.description || w).join(', ') : (r.work_performed || r.tags?.[0] || '')}
                </Text>
              )}
              <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} style={{ position: 'absolute', right: 12, top: 14 }} />
            </TouchableOpacity>
          )) : (
            <View style={styles.emptySection}>
              <Ionicons name="document-outline" size={36} color={Colors.secondaryText + '40'} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>No reports yet</Text>
              <Text style={[styles.emptySubtext, { color: Colors.secondaryText }]}>Post daily reports to track work progress</Text>
            </View>
          )}
        </View>

        {/* ═══ H. DOCUMENTS ═══ */}
        <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="folder-outline" size={20} color={statusColor} />
            <Text style={[styles.sectionHeaderTitle, { color: Colors.primaryText }]}>Documents ({documents.length})</Text>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: statusColor }]} onPress={handleUploadDocument}>
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
          {documents.length > 0 ? documents.map(doc => (
            <View key={doc.id} style={[styles.docRow, { borderColor: Colors.border }]}>
              <View style={[styles.docIcon, { backgroundColor: doc.file_type === 'image' ? '#3B82F615' : '#EF444415' }]}>
                <Ionicons name={doc.file_type === 'image' ? 'image' : 'document'} size={16} color={doc.file_type === 'image' ? '#3B82F6' : '#EF4444'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.docName, { color: Colors.primaryText }]} numberOfLines={1}>{doc.file_name}</Text>
                <Text style={[styles.docDate, { color: Colors.secondaryText }]}>{new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
              </View>
              {doc.visible_to_workers && <Ionicons name="people" size={14} color="#10B981" />}
            </View>
          )) : (
            <View style={styles.emptySection}>
              <Ionicons name="folder-open-outline" size={36} color={Colors.secondaryText + '40'} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>No documents yet</Text>
              <Text style={[styles.emptySubtext, { color: Colors.secondaryText }]}>Upload documents or PDFs</Text>
            </View>
          )}
        </View>

        {/* ═══ I. ESTIMATES ═══ */}
        <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="document-text-outline" size={20} color={statusColor} />
            <Text style={[styles.sectionHeaderTitle, { color: Colors.primaryText }]}>Estimates ({estimates.length})</Text>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: statusColor }]} onPress={() => navigation.navigate('MainTabs', { screen: 'Chat', params: { initialMessage: `Create estimate for ${plan?.name}` } })}>
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={styles.addBtnText}>Create</Text>
            </TouchableOpacity>
          </View>
          {estimates.length > 0 ? estimates.map(est => {
            const statusColors = { draft: '#F59E0B', sent: '#10B981', accepted: '#3B82F6', rejected: '#EF4444' };
            const sc = statusColors[est.status] || '#9CA3AF';
            return (
              <View key={est.id} style={[styles.estRow, { borderColor: Colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.estName, { color: Colors.primaryText }]} numberOfLines={1}>{est.project_name || 'Estimate'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <View style={[styles.estBadge, { backgroundColor: sc + '18' }]}>
                      <Text style={[styles.estBadgeText, { color: sc }]}>{est.status?.charAt(0).toUpperCase() + est.status?.slice(1)}</Text>
                    </View>
                    <Text style={[styles.estDate, { color: Colors.secondaryText }]}>{new Date(est.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
                  </View>
                </View>
                <Text style={[styles.estTotal, { color: Colors.primaryText }]}>${(est.total || 0).toLocaleString()}</Text>
              </View>
            );
          }) : (
            <View style={styles.emptySection}>
              <Ionicons name="document-outline" size={36} color={Colors.secondaryText + '40'} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>No estimates yet</Text>
              <Text style={[styles.emptySubtext, { color: Colors.secondaryText }]}>Create an estimate via chat</Text>
            </View>
          )}
        </View>

        {/* ═══ J. TIMELINE ═══ */}
        <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="calendar-outline" size={20} color={statusColor} />
            <Text style={[styles.sectionHeaderTitle, { color: Colors.primaryText }]}>Timeline</Text>
          </View>

          {plan?.start_date && (
            <View style={styles.timelineRow}>
              <View style={[styles.timelineIcon, { backgroundColor: '#10B98115' }]}>
                <Ionicons name="play-outline" size={16} color="#10B981" />
              </View>
              <View>
                <Text style={[styles.timelineLabel, { color: Colors.secondaryText }]}>Start Date</Text>
                <Text style={[styles.timelineValue, { color: Colors.primaryText }]}>{new Date(plan.start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
              </View>
            </View>
          )}
          {plan?.end_date && (
            <View style={styles.timelineRow}>
              <View style={[styles.timelineIcon, { backgroundColor: '#EF444415' }]}>
                <Ionicons name="flag-outline" size={16} color="#EF4444" />
              </View>
              <View>
                <Text style={[styles.timelineLabel, { color: Colors.secondaryText }]}>End Date</Text>
                <Text style={[styles.timelineValue, { color: Colors.primaryText }]}>{new Date(plan.end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
              </View>
            </View>
          )}

          {/* Schedule / Working Days */}
          {firstSchedule && (
            <View style={styles.timelineRow}>
              <View style={[styles.timelineIcon, { backgroundColor: '#8B5CF615' }]}>
                <Ionicons name="briefcase-outline" size={16} color="#8B5CF6" />
              </View>
              <View>
                <Text style={[styles.timelineLabel, { color: Colors.secondaryText }]}>Schedule</Text>
                <Text style={[styles.timelineValue, { color: Colors.primaryText }]}>{formatSchedule(firstSchedule)}</Text>
              </View>
            </View>
          )}

          {/* Day circles */}
          {scheduledDays.length > 0 && (
            <View style={styles.dayCirclesRow}>
              {DAYS_ORDER.map(day => {
                const isActive = scheduledDays.includes(day);
                return (
                  <View key={day} style={[styles.dayCircle, isActive ? { backgroundColor: statusColor } : { backgroundColor: Colors.background }]}>
                    <Text style={[styles.dayCircleText, { color: isActive ? '#fff' : Colors.secondaryText }]}>{DAY_LETTERS[day]}</Text>
                  </View>
                );
              })}
            </View>
          )}

          {!firstSchedule && (
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>No schedule configured</Text>
          )}
        </View>

        {/* ═══ L. DELETE ═══ */}
        <TouchableOpacity style={styles.deleteLink} onPress={() => setShowDeleteModal(true)}>
          <Ionicons name="trash-outline" size={16} color="#EF444480" />
          <Text style={styles.deleteLinkText}>Delete Service Plan</Text>
        </TouchableOpacity>

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Delete "{plan?.name}"?</Text>
            <Text style={[styles.modalSubtitle, { color: Colors.secondaryText }]}>
              This action cannot be undone. All data, locations, visits, and documents will be permanently removed.
            </Text>
            <Text style={[styles.modalInstruction, { color: Colors.secondaryText }]}>Type DELETE to confirm:</Text>
            <TextInput
              style={[styles.modalInput, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.background }]}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="characters"
              placeholder="DELETE"
              placeholderTextColor={Colors.secondaryText + '40'}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: Colors.background }]} onPress={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}>
                <Text style={[styles.modalBtnText, { color: Colors.primaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: deleteConfirmText === 'DELETE' ? '#EF4444' : Colors.border }]} onPress={handleDelete} disabled={deleteConfirmText !== 'DELETE'}>
                <Text style={[styles.modalBtnText, { color: deleteConfirmText === 'DELETE' ? '#fff' : Colors.secondaryText }]}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Worker Assignment Modal */}
      <WorkerAssignmentModal
        visible={showWorkerAssignment}
        onClose={() => setShowWorkerAssignment(false)}
        assignmentType="service_plan"
        assignmentId={resolvedId}
        assignmentName={plan?.name}
        onAssignmentsChange={() => loadDetail()}
      />

      {/* Supervisor Assignment Modal */}
      <SupervisorAssignmentModal
        visible={showSupervisorAssignment}
        onClose={() => setShowSupervisorAssignment(false)}
        project={{
          id: resolvedId,
          name: plan?.name,
          assignedTo: plan?.assigned_supervisor_id,
        }}
        customAssignFn={async (planId, supervisorId) => {
          const { error } = await supabase
            .from('service_plans')
            .update({ assigned_supervisor_id: supervisorId || null })
            .eq('id', planId);
          return { success: !error, error: error?.message };
        }}
        onAssignmentChange={async () => {
          setShowSupervisorAssignment(false);
          await loadDetail();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },

  heroSection: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroContent: { flex: 1, marginRight: 12 },
  heroTitle: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 6, lineHeight: 24 },
  contactContainer: { marginTop: 4, gap: 4 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  contactText: { fontSize: 14, color: 'rgba(255,255,255,0.9)', fontWeight: '500', flex: 1 },

  financialContainer: { padding: 12 },
  financialRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  financialCard: { flex: 1, padding: 14, borderRadius: 14, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6, borderWidth: 1.5, borderColor: 'rgba(0,0,0,0.12)' },
  iconBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  financialLabel: { fontSize: 11, fontWeight: '500', marginBottom: 3 },
  financialValue: { fontSize: 18, fontWeight: '700' },

  section: { marginHorizontal: 14, marginBottom: 12, borderRadius: 12, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionHeaderTitle: { fontSize: 15, fontWeight: '700', marginLeft: 8, flex: 1 },
  sectionTitleStandalone: { fontSize: 17, fontWeight: '700', marginBottom: 14 },

  detailRow: { flexDirection: 'row', gap: 10, paddingVertical: 8 },
  detailLabel: { fontSize: 11, fontWeight: '500', marginBottom: 2 },
  detailValue: { fontSize: 14, fontWeight: '500', lineHeight: 20 },

  locationCard: { borderBottomWidth: 1, paddingVertical: 12 },
  locationHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationDot: { width: 10, height: 10, borderRadius: 5 },
  locationName: { fontSize: 15, fontWeight: '600' },
  locationMeta: { fontSize: 12, marginTop: 2 },
  locationExpanded: { marginTop: 10, marginLeft: 20, gap: 6 },
  locDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  locDetailText: { fontSize: 13, flex: 1 },
  accessNotesBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderRadius: 8, padding: 8 },
  checklistSection: { marginTop: 6, gap: 4 },
  checklistItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  checklistText: { fontSize: 13 },

  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  taskTitle: { fontSize: 14, fontWeight: '500' },
  taskUnit: { fontSize: 11, marginTop: 2 },

  assignButtonsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  assignButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  assignButtonText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  workerCard: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, marginBottom: 4 },
  workerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  workerInitial: { fontSize: 15, fontWeight: '700' },
  workerName: { fontSize: 15, fontWeight: '600' },
  workerTrade: { fontSize: 13, marginTop: 1 },

  addBtnCircle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  addBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  reportRow: { paddingVertical: 10, borderBottomWidth: 1 },
  reportDate: { fontSize: 14, fontWeight: '600' },
  reporterBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  reporterBadgeText: { fontSize: 10, fontWeight: '600' },
  photoBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  reportWork: { fontSize: 12, marginTop: 4, lineHeight: 16 },

  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  docIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  docName: { fontSize: 14, fontWeight: '500' },
  docDate: { fontSize: 11, marginTop: 2 },

  estRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  estName: { fontSize: 14, fontWeight: '600' },
  estBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  estBadgeText: { fontSize: 10, fontWeight: '600' },
  estDate: { fontSize: 11 },
  estTotal: { fontSize: 16, fontWeight: '700' },

  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  timelineIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  timelineLabel: { fontSize: 11, fontWeight: '500' },
  timelineValue: { fontSize: 14, fontWeight: '600' },
  dayCirclesRow: { flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 12 },
  dayCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayCircleText: { fontSize: 13, fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 0, marginBottom: 12, paddingHorizontal: 14 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  deleteLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 20 },
  deleteLinkText: { fontSize: 14, color: '#EF444480', fontWeight: '500' },

  emptySection: { alignItems: 'center', paddingVertical: 20, gap: 6 },
  emptyText: { fontSize: 13, textAlign: 'center' },
  emptySubtext: { fontSize: 12, textAlign: 'center', opacity: 0.7 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: { borderRadius: 16, padding: 24, width: '100%', maxWidth: 340 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalSubtitle: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  modalInstruction: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  modalInput: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, fontWeight: '700', letterSpacing: 4, textAlign: 'center', marginBottom: 16 },
  modalButtons: { flexDirection: 'row', gap: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modalBtnText: { fontSize: 15, fontWeight: '600' },
});
