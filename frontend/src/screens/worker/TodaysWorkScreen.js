/**
 * TodaysWorkScreen — Unified daily work view for workers
 * Shows all assigned projects + service plans as collapsible cards
 * with inline tasks, visits, checklists. Toggle to calendar view.
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
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from '../../utils/storage/auth';
import { fetchTasksForWorker, completeTask, uncompleteTask } from '../../utils/storage';
import DailyChecklistSection from '../../components/DailyChecklistSection';
import WorkerScheduleScreen from './WorkerScheduleScreen';

export default function TodaysWorkScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();
  const { profile } = useAuth() || {};

  const [viewMode, setViewMode] = useState('today'); // 'today' | 'calendar'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [projectCards, setProjectCards] = useState([]); // { id, name, location, tasks: [], user_id }
  const [planCards, setPlanCards] = useState([]); // { id, name, visits: [], owner_id }
  const [expandedCards, setExpandedCards] = useState(new Set());

  const toggleCard = (cardId) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(cardId) ? next.delete(cardId) : next.add(cardId);
      return next;
    });
  };

  const loadData = useCallback(async () => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) return;

      const { data: workerData } = await supabase
        .from('workers')
        .select('id, owner_id')
        .eq('user_id', userId)
        .single();
      if (!workerData) { setLoading(false); return; }

      const today = new Date().toISOString().split('T')[0];
      const workerId = workerData.id;
      const ownerId = workerData.owner_id;

      // Get assignments
      const { data: assignments } = await supabase
        .from('project_assignments')
        .select('project_id, service_plan_id')
        .eq('worker_id', workerId);

      const projectIds = (assignments || []).map(a => a.project_id).filter(Boolean);
      const planIds = (assignments || []).map(a => a.service_plan_id).filter(Boolean);

      // Fetch project tasks for today
      let projects = [];
      if (ownerId && typeof ownerId === 'string' && ownerId.length > 30 && projectIds.length > 0) {
        const tasks = await fetchTasksForWorker(ownerId, today, projectIds);
        // Group by project
        const grouped = {};
        (tasks || []).forEach(t => {
          const pName = t.projects?.name || 'Project';
          const pId = t.project_id;
          if (!grouped[pId]) grouped[pId] = { id: pId, name: pName, tasks: [], user_id: ownerId };
          grouped[pId].tasks.push(t);
        });
        projects = Object.values(grouped);
      }

      // Also add projects with no tasks today but assigned
      if (projectIds.length > 0) {
        const { data: allProjects } = await supabase
          .from('projects')
          .select('id, name, location, user_id')
          .in('id', projectIds)
          .eq('status', 'active');
        (allProjects || []).forEach(p => {
          if (!projects.find(ep => ep.id === p.id)) {
            projects.push({ id: p.id, name: p.name, location: p.location, tasks: [], user_id: p.user_id });
          } else {
            // Merge location
            const existing = projects.find(ep => ep.id === p.id);
            if (existing) existing.location = p.location;
          }
        });
      }
      setProjectCards(projects);

      // Fetch service plan visits for today
      let plans = [];
      if (planIds.length > 0) {
        const { data: planData } = await supabase
          .from('service_plans')
          .select('id, name, owner_id')
          .in('id', planIds)
          .eq('status', 'active');

        // Fetch visits for today
        const orFilters = [];
        if (workerId) orFilters.push(`assigned_worker_id.eq.${workerId}`);
        orFilters.push(`service_plan_id.in.(${planIds.join(',')})`);

        const { data: visits } = await supabase
          .from('service_visits')
          .select('id, service_plan_id, scheduled_date, scheduled_time, status, service_locations(id, name, address, access_notes)')
          .eq('scheduled_date', today)
          .neq('status', 'cancelled')
          .or(orFilters.join(','))
          .order('scheduled_time', { ascending: true });

        // Group visits by plan
        const visitsByPlan = {};
        (visits || []).forEach(v => {
          if (!visitsByPlan[v.service_plan_id]) visitsByPlan[v.service_plan_id] = [];
          visitsByPlan[v.service_plan_id].push(v);
        });

        plans = (planData || []).map(p => ({
          ...p,
          visits: visitsByPlan[p.id] || [],
        }));
      }
      setPlanCards(plans);

      // Auto-expand cards that have items
      const autoExpand = new Set();
      projects.forEach(p => { if (p.tasks.length > 0) autoExpand.add(`proj-${p.id}`); });
      plans.forEach(p => { if (p.visits.length > 0) autoExpand.add(`plan-${p.id}`); });
      setExpandedCards(autoExpand);

    } catch (e) {
      console.error('[TodaysWork] Load error:', e);
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

  const handleToggleTask = async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    // Optimistic update — flip UI immediately
    setProjectCards(prev => prev.map(p => ({
      ...p,
      tasks: p.tasks.map(t => t.id === task.id ? { ...t, status: newStatus } : t),
    })));
    try {
      if (task.status === 'completed') {
        await uncompleteTask(task.id);
      } else {
        await completeTask(task.id);
      }
    } catch (e) {
      // Revert on failure
      setProjectCards(prev => prev.map(p => ({
        ...p,
        tasks: p.tasks.map(t => t.id === task.id ? { ...t, status: task.status } : t),
      })));
      Alert.alert('Error', 'Failed to update task.');
    }
  };

  const totalItems = projectCards.reduce((sum, p) => sum + p.tasks.length, 0) + planCards.reduce((sum, p) => sum + p.visits.length, 0);
  const completedItems = projectCards.reduce((sum, p) => sum + p.tasks.filter(t => t.status === 'completed').length, 0) + planCards.reduce((sum, p) => sum + p.visits.filter(v => v.status === 'completed').length, 0);

  // Calendar view — render existing WorkerScheduleScreen
  if (viewMode === 'calendar') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Schedule</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity style={[styles.toggleBtn, { backgroundColor: Colors.lightGray }]} onPress={() => setViewMode('today')}>
              <Text style={[styles.toggleText, { color: Colors.secondaryText }]}>Today</Text>
            </TouchableOpacity>
            <View style={[styles.toggleBtn, { backgroundColor: '#059669' }]}>
              <Text style={[styles.toggleText, { color: '#fff' }]}>Calendar</Text>
            </View>
          </View>
        </View>
        <WorkerScheduleScreen embedded navigation={navigation} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Today's Work</Text>
          {totalItems > 0 && (
            <Text style={[styles.headerSub, { color: Colors.secondaryText }]}>
              {completedItems}/{totalItems} items done
            </Text>
          )}
        </View>
        <View style={styles.toggleRow}>
          <View style={[styles.toggleBtn, { backgroundColor: '#059669' }]}>
            <Text style={[styles.toggleText, { color: '#fff' }]}>Today</Text>
          </View>
          <TouchableOpacity style={[styles.toggleBtn, { backgroundColor: Colors.lightGray }]} onPress={() => setViewMode('calendar')}>
            <Text style={[styles.toggleText, { color: Colors.secondaryText }]}>Calendar</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Progress */}
      {totalItems > 0 && (
        <View style={styles.progressWrap}>
          <View style={[styles.progressBar, { backgroundColor: Colors.border }]}>
            <View style={[styles.progressFill, { width: `${totalItems > 0 ? (completedItems / totalItems) * 100 : 0}%` }]} />
          </View>
        </View>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#059669" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />}
        >
          {projectCards.length === 0 && planCards.length === 0 && (
            <View style={styles.empty}>
              <Ionicons name="sunny-outline" size={48} color={Colors.secondaryText + '60'} />
              <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>Nothing scheduled</Text>
              <Text style={[styles.emptySub, { color: Colors.secondaryText }]}>No tasks or visits for today</Text>
              <TouchableOpacity style={styles.calLink} onPress={() => setViewMode('calendar')}>
                <Ionicons name="calendar-outline" size={16} color="#059669" />
                <Text style={styles.calLinkText}>View Calendar</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══ PROJECT CARDS ═══ */}
          {projectCards.map(proj => {
            const cardId = `proj-${proj.id}`;
            const isOpen = expandedCards.has(cardId);
            const tasksDone = proj.tasks.filter(t => t.status === 'completed').length;

            return (
              <View key={cardId} style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
                <TouchableOpacity style={styles.cardHeader} onPress={() => toggleCard(cardId)} activeOpacity={0.7}>
                  <View style={[styles.cardIcon, { backgroundColor: '#F59E0B15' }]}>
                    <Ionicons name="construct" size={18} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: Colors.primaryText }]} numberOfLines={1}>{proj.name}</Text>
                    {proj.tasks.length > 0 && (
                      <Text style={[styles.cardMeta, { color: Colors.secondaryText }]}>{tasksDone}/{proj.tasks.length} tasks</Text>
                    )}
                  </View>
                  {proj.location && (
                    <TouchableOpacity onPress={() => openMaps(proj.location)} style={styles.navBtn}>
                      <Ionicons name="navigate" size={16} color="#3B82F6" />
                    </TouchableOpacity>
                  )}
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.secondaryText} />
                </TouchableOpacity>

                {isOpen && (
                  <View style={[styles.cardBody, { borderTopColor: Colors.border }]}>
                    {/* Tasks */}
                    {proj.tasks.map(task => (
                      <TouchableOpacity key={task.id} style={styles.taskRow} onPress={() => handleToggleTask(task)}>
                        <Ionicons
                          name={task.status === 'completed' ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={task.status === 'completed' ? '#10B981' : Colors.secondaryText}
                        />
                        {task.color && (
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: task.color }} />
                        )}
                        <Text style={[styles.taskText, { color: Colors.primaryText }, task.status === 'completed' && styles.taskDone]} numberOfLines={2}>
                          {task.title}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    {proj.tasks.length === 0 && (
                      <Text style={[styles.noItems, { color: Colors.secondaryText }]}>No tasks for today</Text>
                    )}

                    {/* Checklist */}
                    <DailyChecklistSection
                      projectId={proj.id}
                      ownerId={proj.user_id}
                      userRole="worker"
                      userId={profile?.id}
                    />

                    {/* Details link */}
                    <TouchableOpacity style={styles.detailsLink} onPress={() => navigation.navigate('WorkerProjectDetail', { project: { id: proj.id, name: proj.name } })}>
                      <Text style={styles.detailsText}>View Details</Text>
                      <Ionicons name="arrow-forward" size={14} color="#3B82F6" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          {/* ═══ SERVICE PLAN CARDS ═══ */}
          {planCards.map(plan => {
            const cardId = `plan-${plan.id}`;
            const isOpen = expandedCards.has(cardId);
            const visitsDone = plan.visits.filter(v => v.status === 'completed').length;

            return (
              <View key={cardId} style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
                <TouchableOpacity style={styles.cardHeader} onPress={() => toggleCard(cardId)} activeOpacity={0.7}>
                  <View style={[styles.cardIcon, { backgroundColor: '#05966915' }]}>
                    <Ionicons name="leaf" size={18} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: Colors.primaryText }]} numberOfLines={1}>{plan.name}</Text>
                    {plan.visits.length > 0 ? (
                      <Text style={[styles.cardMeta, { color: Colors.secondaryText }]}>{visitsDone}/{plan.visits.length} visits today</Text>
                    ) : (
                      <Text style={[styles.cardMeta, { color: Colors.secondaryText }]}>No visits today</Text>
                    )}
                  </View>
                  <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.secondaryText} />
                </TouchableOpacity>

                {isOpen && (
                  <View style={[styles.cardBody, { borderTopColor: Colors.border }]}>
                    {/* Visits */}
                    {plan.visits.map(visit => {
                      const loc = visit.service_locations || {};
                      return (
                        <TouchableOpacity
                          key={visit.id}
                          style={styles.visitRow}
                          onPress={() => navigation.navigate('VisitDetail', { visit })}
                          activeOpacity={0.7}
                        >
                          <Ionicons
                            name={visit.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'}
                            size={20}
                            color={visit.status === 'completed' ? '#10B981' : Colors.secondaryText}
                          />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.visitName, { color: Colors.primaryText }]} numberOfLines={1}>{loc.name || 'Visit'}</Text>
                            {loc.address && <Text style={[styles.visitAddr, { color: Colors.secondaryText }]} numberOfLines={1}>{loc.address}</Text>}
                          </View>
                          {visit.scheduled_time && (
                            <Text style={[styles.visitTime, { color: Colors.secondaryText }]}>{visit.scheduled_time.slice(0, 5)}</Text>
                          )}
                          {loc.address && (
                            <TouchableOpacity onPress={() => openMaps(loc.address)} style={styles.navBtn}>
                              <Ionicons name="navigate" size={16} color="#3B82F6" />
                            </TouchableOpacity>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                    {plan.visits.length === 0 && (
                      <Text style={[styles.noItems, { color: Colors.secondaryText }]}>No visits scheduled for today</Text>
                    )}

                    {/* Checklist */}
                    <DailyChecklistSection
                      servicePlanId={plan.id}
                      ownerId={plan.owner_id}
                      userRole="worker"
                      userId={profile?.id}
                    />

                    {/* Details link */}
                    <TouchableOpacity style={styles.detailsLink} onPress={() => navigation.navigate('ServicePlanDetail', { planId: plan.id })}>
                      <Text style={styles.detailsText}>View Details</Text>
                      <Ionicons name="arrow-forward" size={14} color="#3B82F6" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          <View style={{ height: 120 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12,
  },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  headerSub: { fontSize: 13, marginTop: 2 },
  toggleRow: { flexDirection: 'row', gap: 4 },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16 },
  toggleText: { fontSize: 13, fontWeight: '600' },
  progressWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  progressBar: { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#059669', borderRadius: 3 },
  scroll: { paddingHorizontal: 16 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub: { fontSize: 14 },
  calLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  calLinkText: { fontSize: 14, fontWeight: '600', color: '#059669' },
  card: {
    borderRadius: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14,
  },
  cardIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardMeta: { fontSize: 12, marginTop: 1 },
  cardBody: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingBottom: 10 },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  taskText: { flex: 1, fontSize: 14 },
  taskDone: { textDecorationLine: 'line-through', opacity: 0.5 },
  visitRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  visitName: { fontSize: 14, fontWeight: '600' },
  visitAddr: { fontSize: 12, marginTop: 1 },
  visitTime: { fontSize: 12, fontWeight: '600' },
  navBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#EFF6FF', justifyContent: 'center', alignItems: 'center',
  },
  noItems: { fontSize: 13, fontStyle: 'italic', paddingVertical: 10 },
  detailsLink: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 8, paddingBottom: 4 },
  detailsText: { fontSize: 13, fontWeight: '600', color: '#3B82F6' },
});
