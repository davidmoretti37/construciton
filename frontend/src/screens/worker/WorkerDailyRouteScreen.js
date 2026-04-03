/**
 * WorkerDailyRouteScreen — Unified "Today's Route"
 * Shows ALL of today's work: project tasks + service visits in one list.
 * Single source of truth for "what do I do today?"
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from '../../utils/storage/auth';
import { fetchTasksForWorker, completeTask, uncompleteTask } from '../../utils/storage';
import DailyChecklistSection from '../../components/DailyChecklistSection';
import { useAuth } from '../../contexts/AuthContext';

export default function WorkerDailyRouteScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();
  const { profile } = useAuth() || {};

  const [stops, setStops] = useState([]);
  const [assignedPlans, setAssignedPlans] = useState([]); // { id, name, owner_id }
  const [assignedProjects, setAssignedProjects] = useState([]); // { id, name, user_id }
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return;

      // Get worker record
      const { data: workerData } = await supabase
        .from('workers')
        .select('id, owner_id')
        .eq('user_id', userId)
        .single();

      if (!workerData) { setLoading(false); return; }

      const today = new Date().toISOString().split('T')[0];
      const workerId = workerData.id;
      const ownerId = workerData.owner_id;

      // Get assigned project IDs
      const { data: projAssign } = await supabase
        .from('project_assignments')
        .select('project_id')
        .eq('worker_id', workerId);
      const projectIds = (projAssign || []).map(a => a.project_id).filter(Boolean);

      // Get assigned service plan IDs
      const { data: planAssign } = await supabase
        .from('project_assignments')
        .select('service_plan_id')
        .eq('worker_id', workerId)
        .not('service_plan_id', 'is', null);
      const planIds = (planAssign || []).map(a => a.service_plan_id).filter(Boolean);

      // Fetch project tasks for today
      let taskStops = [];
      if (ownerId && typeof ownerId === 'string' && ownerId.length > 30) {
        const tasks = await fetchTasksForWorker(ownerId, today, projectIds);
        taskStops = (tasks || []).map(t => ({
          id: `task-${t.id}`,
          rawId: t.id,
          type: 'task',
          title: t.title || 'Task',
          subtitle: t.projects?.name || 'Project',
          address: null,
          time: null,
          status: t.status === 'completed' ? 'completed' : 'pending',
          data: t,
        }));
      }

      // Fetch service visits for today
      let visitStops = [];
      const orFilters = [];
      if (workerId) orFilters.push(`assigned_worker_id.eq.${workerId}`);
      if (planIds.length > 0) orFilters.push(`service_plan_id.in.(${planIds.join(',')})`);

      if (orFilters.length > 0) {
        const { data: visits } = await supabase
          .from('service_visits')
          .select('id, scheduled_date, scheduled_time, status, started_at, completed_at, service_locations(id, name, address, access_notes, latitude, longitude), service_plans(name)')
          .eq('scheduled_date', today)
          .neq('status', 'cancelled')
          .or(orFilters.join(','))
          .order('scheduled_time', { ascending: true });

        visitStops = (visits || []).map(v => ({
          id: `visit-${v.id}`,
          rawId: v.id,
          type: 'visit',
          title: v.service_locations?.name || 'Visit',
          subtitle: v.service_plans?.name || 'Service',
          address: v.service_locations?.address || null,
          accessNotes: v.service_locations?.access_notes || null,
          time: v.scheduled_time ? v.scheduled_time.slice(0, 5) : null,
          status: v.status === 'completed' ? 'completed' : v.status === 'in_progress' ? 'in_progress' : 'pending',
          data: v,
        }));
      }

      // Fetch plan + project details for checklists
      if (planIds.length > 0) {
        const { data: plans } = await supabase
          .from('service_plans')
          .select('id, name, owner_id')
          .in('id', planIds);
        setAssignedPlans(plans || []);
      } else {
        setAssignedPlans([]);
      }

      if (projectIds.length > 0) {
        const { data: projects } = await supabase
          .from('projects')
          .select('id, name, user_id')
          .in('id', projectIds)
          .eq('status', 'active');
        setAssignedProjects(projects || []);
      } else {
        setAssignedProjects([]);
      }

      // Merge: visits with time first (sorted by time), then tasks
      const withTime = visitStops.filter(s => s.time).sort((a, b) => a.time.localeCompare(b.time));
      const withoutTime = [...visitStops.filter(s => !s.time), ...taskStops];
      setStops([...withTime, ...withoutTime]);
    } catch (e) {
      console.error('[DailyRoute] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const openMaps = (address) => {
    if (!address) return;
    const encoded = encodeURIComponent(address);
    const url = Platform.select({
      ios: `maps://app?daddr=${encoded}`,
      android: `google.navigation:q=${encoded}`,
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
    });
  };

  const handleStopPress = (stop) => {
    if (stop.type === 'visit') {
      navigation.navigate('VisitDetail', { visit: stop.data });
    } else {
      // Toggle task completion
      const isCompleted = stop.status === 'completed';
      Alert.alert(
        isCompleted ? 'Undo Completion?' : 'Mark Complete?',
        stop.title,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: isCompleted ? 'Undo' : 'Complete',
            onPress: async () => {
              try {
                if (isCompleted) {
                  await uncompleteTask(stop.rawId);
                } else {
                  await completeTask(stop.rawId);
                }
                await loadData();
              } catch (e) {
                Alert.alert('Error', 'Failed to update task.');
              }
            },
          },
        ]
      );
    }
  };

  const completedCount = stops.filter(s => s.status === 'completed').length;
  const totalCount = stops.length;

  const getStatusStyle = (status) => {
    switch (status) {
      case 'completed': return { color: '#10B981', bg: '#ECFDF5', icon: 'checkmark-circle', label: 'Done' };
      case 'in_progress': return { color: '#3B82F6', bg: '#EFF6FF', icon: 'play-circle', label: 'In Progress' };
      default: return { color: '#9CA3AF', bg: '#F3F4F6', icon: 'time-outline', label: 'Pending' };
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Today's Route</Text>
          {totalCount > 0 && (
            <Text style={[styles.headerSubtitle, { color: Colors.secondaryText }]}>
              {completedCount}/{totalCount} stops completed
            </Text>
          )}
        </View>
      </View>

      {/* Progress bar */}
      {totalCount > 0 && (
        <View style={styles.progressWrapper}>
          <View style={[styles.progressBar, { backgroundColor: Colors.border }]}>
            <View style={[styles.progressFill, { width: `${(completedCount / totalCount) * 100}%` }]} />
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />}
        >
          {totalCount === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="sunny-outline" size={56} color={Colors.secondaryText} />
              <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>Nothing scheduled</Text>
              <Text style={[styles.emptySubtitle, { color: Colors.secondaryText }]}>
                You don't have any tasks or visits for today.
              </Text>
            </View>
          )}

          {stops.map((stop, index) => {
            const ss = getStatusStyle(stop.status);
            const isVisit = stop.type === 'visit';

            return (
              <TouchableOpacity
                key={stop.id}
                style={[styles.stopCard, { backgroundColor: Colors.cardBackground }]}
                onPress={() => handleStopPress(stop)}
                activeOpacity={0.8}
              >
                {/* Stop number */}
                <View style={[styles.stopBadge, { backgroundColor: isVisit ? '#059669' : '#F59E0B' }]}>
                  <Text style={styles.stopBadgeText}>{index + 1}</Text>
                </View>

                <View style={styles.stopContent}>
                  {/* Type label + time */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <View style={[styles.typePill, { backgroundColor: isVisit ? '#05966915' : '#F59E0B15' }]}>
                      <Ionicons name={isVisit ? 'location' : 'construct'} size={11} color={isVisit ? '#059669' : '#F59E0B'} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: isVisit ? '#059669' : '#F59E0B' }}>
                        {isVisit ? 'Visit' : 'Task'}
                      </Text>
                    </View>
                    {stop.time && (
                      <Text style={{ fontSize: 12, fontWeight: '600', color: Colors.secondaryText }}>
                        {stop.time}
                      </Text>
                    )}
                    <View style={[styles.statusDot, { backgroundColor: ss.color }]} />
                  </View>

                  {/* Title */}
                  <Text style={[styles.stopTitle, { color: Colors.primaryText }, stop.status === 'completed' && { textDecorationLine: 'line-through', opacity: 0.6 }]} numberOfLines={1}>
                    {stop.title}
                  </Text>

                  {/* Subtitle (plan name or project name) */}
                  <Text style={[styles.stopSubtitle, { color: Colors.secondaryText }]} numberOfLines={1}>
                    {stop.subtitle}
                  </Text>

                  {/* Address */}
                  {stop.address && (
                    <Text style={[styles.stopAddress, { color: Colors.secondaryText }]} numberOfLines={1}>
                      {stop.address}
                    </Text>
                  )}

                  {/* Access notes */}
                  {stop.accessNotes && (
                    <View style={styles.accessRow}>
                      <Ionicons name="key-outline" size={11} color="#F59E0B" />
                      <Text style={styles.accessText} numberOfLines={1}>{stop.accessNotes}</Text>
                    </View>
                  )}
                </View>

                {/* Navigate button (visits with address) or chevron */}
                {isVisit && stop.address ? (
                  <TouchableOpacity
                    style={styles.navBtn}
                    onPress={() => openMaps(stop.address)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="navigate" size={20} color="#3B82F6" />
                  </TouchableOpacity>
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} style={{ marginTop: 16 }} />
                )}
              </TouchableOpacity>
            );
          })}

          {/* Daily Checklists — grouped by plan/project name */}
          {assignedPlans.map(plan => (
            <View key={`checklist-plan-${plan.id}`} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, paddingHorizontal: 4 }}>
                <Ionicons name="leaf" size={14} color="#059669" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669' }}>{plan.name}</Text>
              </View>
              <DailyChecklistSection
                servicePlanId={plan.id}
                ownerId={plan.owner_id}
                userRole="worker"
                userId={profile?.id}
              />
            </View>
          ))}
          {assignedProjects.map(proj => (
            <View key={`checklist-proj-${proj.id}`} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, paddingHorizontal: 4 }}>
                <Ionicons name="construct" size={14} color="#F59E0B" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#F59E0B' }}>{proj.name}</Text>
              </View>
              <DailyChecklistSection
                projectId={proj.id}
                ownerId={proj.user_id}
                userRole="worker"
                userId={profile?.id}
              />
            </View>
          ))}

          <View style={{ height: 120 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  progressWrapper: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#059669', borderRadius: 3 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: Spacing.lg },
  emptyState: { alignItems: 'center', paddingTop: 100, gap: 12 },
  emptyTitle: { fontSize: FontSizes.subheader, fontWeight: '700' },
  emptySubtitle: { fontSize: FontSizes.small, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  stopCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderRadius: 14, padding: 14, marginBottom: 10, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  stopBadge: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginTop: 4,
  },
  stopBadgeText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  stopContent: { flex: 1 },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  statusDot: { width: 7, height: 7, borderRadius: 3.5 },
  stopTitle: { fontSize: 15, fontWeight: '700', marginBottom: 1 },
  stopSubtitle: { fontSize: 13, marginBottom: 2 },
  stopAddress: { fontSize: 12, marginBottom: 2 },
  accessRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFFBEB', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, alignSelf: 'flex-start', marginTop: 2,
  },
  accessText: { fontSize: 11, color: '#92400E' },
  navBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center', marginTop: 4,
  },
});
