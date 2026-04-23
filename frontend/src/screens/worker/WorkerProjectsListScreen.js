/**
 * WorkerProjectsListScreen — worker's "My Projects" tab
 *
 * Lists every project the worker is assigned to (via project_assignments).
 * Each card shows project name, client, address, current phase pill, and
 * the worker's next scheduled task. Tap a card → existing
 * WorkerProjectDetailScreen (already field-restricted; no budget leaks).
 *
 * Selects only worker-safe columns from `projects`; never queries
 * contract_amount, budget, or financial fields.
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from '../../utils/storage/auth';

export default function WorkerProjectsListScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const userId = await getCurrentUserId();
      if (!userId) { setLoading(false); return; }

      const { data: workerData } = await supabase
        .from('workers')
        .select('id, owner_id')
        .eq('user_id', userId)
        .single();
      if (!workerData?.id) { setProjects([]); setLoading(false); return; }

      const { data: assignments } = await supabase
        .from('project_assignments')
        .select('project_id')
        .eq('worker_id', workerData.id)
        .not('project_id', 'is', null);

      const projectIds = [...new Set((assignments || []).map(a => a.project_id).filter(Boolean))];
      if (projectIds.length === 0) { setProjects([]); setLoading(false); return; }

      // Worker-safe columns only — NO contract_amount, NO budget fields.
      const { data: rows } = await supabase
        .from('projects')
        .select('id, name, client_name, client_phone, location, status, start_date, end_date')
        .in('id', projectIds)
        .neq('status', 'archived')
        .order('created_at', { ascending: false });

      const enriched = await Promise.all((rows || []).map(async (p) => {
        const today = new Date().toISOString().split('T')[0];

        const { data: phases } = await supabase
          .from('project_phases')
          .select('id, name, status, order_index, completion_percentage')
          .eq('project_id', p.id)
          .order('order_index', { ascending: true });

        let currentPhase = null;
        if (phases && phases.length > 0) {
          currentPhase =
            phases.find(ph => ph.status === 'in_progress') ||
            phases.find(ph => (ph.completion_percentage || 0) < 100) ||
            phases[0];
        }

        // Today's tasks (scheduled for TODAY) — preferred surface on the card.
        // Note: worker_tasks has no per-worker column. All crew on a project
        // share the same task pool; access is gated by project_assignments + RLS.
        const { data: todayTasks } = await supabase
          .from('worker_tasks')
          .select('id, title, status, start_date, end_date')
          .eq('project_id', p.id)
          .lte('start_date', today)
          .gte('end_date', today)
          .order('start_date', { ascending: true });

        // Fallback: next upcoming task when nothing today.
        let nextTask = null;
        if (!todayTasks || todayTasks.length === 0) {
          const { data: nextRows } = await supabase
            .from('worker_tasks')
            .select('id, title, start_date, end_date, status')
            .eq('project_id', p.id)
            .gte('start_date', today)
            .neq('status', 'completed')
            .order('start_date', { ascending: true })
            .limit(1);
          nextTask = nextRows && nextRows[0] ? nextRows[0] : null;
        }

        // Daily Crew Checks — recurring items + today's completion state.
        // Templates: any active row whose specific_date is null (recurring)
        // or matches today (one-off). Done count: completed entries from
        // today's daily_service_report (lazy-created on first submit).
        const { data: templates } = await supabase
          .from('daily_checklist_templates')
          .select('id, specific_date')
          .eq('project_id', p.id)
          .eq('is_active', true);
        const activeTemplates = (templates || []).filter(t =>
          !t.specific_date || t.specific_date === today
        );
        const dailyTotal = activeTemplates.length;

        let dailyDone = 0;
        if (dailyTotal > 0) {
          const { data: todayReport } = await supabase
            .from('daily_service_reports')
            .select('id')
            .eq('project_id', p.id)
            .eq('report_date', today)
            .maybeSingle();
          if (todayReport?.id) {
            const { data: entries } = await supabase
              .from('daily_report_entries')
              .select('id')
              .eq('report_id', todayReport.id)
              .eq('entry_type', 'checklist')
              .eq('completed', true);
            dailyDone = (entries || []).length;
          }
        }

        return {
          ...p,
          currentPhase: currentPhase?.name || null,
          currentPhaseProgress: currentPhase?.completion_percentage || 0,
          todayTasks: todayTasks || [],
          nextTask,
          dailyTotal,
          dailyDone,
        };
      }));

      setProjects(enriched);
    } catch (e) {
      console.error('[WorkerProjects] load error:', e?.message);
      setProjects([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadProjects();
  }, [loadProjects]));

  const onRefresh = () => {
    setRefreshing(true);
    loadProjects();
  };

  const openProject = (project) => {
    navigation.navigate('WorkerProjectDetail', { project });
  };

  const formatDate = (iso) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
      .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    header: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm },
    title: { fontSize: FontSizes.xl + 2, fontWeight: '700', color: Colors.primaryText, letterSpacing: -0.5 },
    subtitle: { fontSize: FontSizes.sm, color: Colors.secondaryText, marginTop: 2 },
    list: { paddingHorizontal: Spacing.md, paddingBottom: 120 },
    card: {
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      marginBottom: Spacing.sm,
      overflow: 'hidden',
      flexDirection: 'row',
    },
    cardAccent: { width: 4 },
    cardBody: { flex: 1, padding: Spacing.md, gap: 6 },
    cardTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    projectName: { fontSize: FontSizes.md + 1, fontWeight: '700', flex: 1, letterSpacing: -0.2 },
    phasePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      maxWidth: 160,
    },
    phasePillText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 2 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '60%' },
    metaText: { fontSize: FontSizes.sm, flexShrink: 1 },
    todayBlock: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      gap: 6,
    },
    todayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    todayLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    todayCount: { fontSize: 11, fontWeight: '600' },
    todayTaskRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    todayTaskText: { fontSize: FontSizes.sm, flexShrink: 1 },
    moreText: { fontSize: 11, fontWeight: '600', marginLeft: 24 },
    dailyBlock: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
    },
    dailyLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
    dailyLabel: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    dailyCountPill: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
    },
    dailyCountText: { fontSize: 11, fontWeight: '700' },
    nextTaskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
    },
    nextTaskText: { fontSize: FontSizes.sm, flexShrink: 1 },
    chevronRow: {
      position: 'absolute',
      top: Spacing.md,
      right: Spacing.md,
    },
    emptyState: { alignItems: 'center', padding: Spacing.xl, gap: 8 },
    emptyTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.primaryText },
    emptyText: { fontSize: FontSizes.sm, color: Colors.secondaryText, textAlign: 'center' },
  });

  const renderCard = ({ item }) => {
    const today = item.todayTasks || [];
    const todayCompleted = today.filter(t => t.status === 'completed').length;
    const next = item.nextTask;
    const phaseColor = '#059669';

    return (
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={() => openProject(item)}
        style={[styles.card, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}
      >
        {/* Phase-color accent stripe on the left */}
        <View style={[styles.cardAccent, { backgroundColor: phaseColor }]} />

        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text style={[styles.projectName, { color: Colors.primaryText }]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.currentPhase && (
              <View style={[styles.phasePill, { backgroundColor: phaseColor + '15' }]}>
                <Ionicons name="layers-outline" size={11} color={phaseColor} />
                <Text style={[styles.phasePillText, { color: phaseColor }]} numberOfLines={1}>
                  {item.currentPhase}
                  {item.currentPhaseProgress > 0 ? ` · ${item.currentPhaseProgress}%` : ''}
                </Text>
              </View>
            )}
          </View>

          {(item.client_name || item.location) && (
            <View style={styles.metaRow}>
              {item.client_name && (
                <View style={styles.metaItem}>
                  <Ionicons name="person-outline" size={14} color={Colors.secondaryText} />
                  <Text style={[styles.metaText, { color: Colors.secondaryText }]} numberOfLines={1}>
                    {item.client_name}
                  </Text>
                </View>
              )}
              {item.location && (
                <View style={styles.metaItem}>
                  <Ionicons name="location-outline" size={14} color={Colors.secondaryText} />
                  <Text style={[styles.metaText, { color: Colors.secondaryText }]} numberOfLines={1}>
                    {item.location}
                  </Text>
                </View>
              )}
            </View>
          )}

          {today.length > 0 ? (
            <View style={[styles.todayBlock, { borderTopColor: Colors.border }]}>
              <View style={styles.todayHeader}>
                <Text style={[styles.todayLabel, { color: '#3B82F6' }]}>
                  Today · {today.length} task{today.length === 1 ? '' : 's'}
                </Text>
                <Text style={[styles.todayCount, { color: Colors.secondaryText }]}>
                  {todayCompleted}/{today.length}
                </Text>
              </View>
              {today.slice(0, 3).map(t => {
                const done = t.status === 'completed';
                return (
                  <View key={t.id} style={styles.todayTaskRow}>
                    <Ionicons
                      name={done ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={done ? '#10B981' : Colors.secondaryText}
                    />
                    <Text
                      style={[
                        styles.todayTaskText,
                        { color: Colors.primaryText },
                        done && { textDecorationLine: 'line-through', color: Colors.secondaryText },
                      ]}
                      numberOfLines={1}
                    >
                      {t.title}
                    </Text>
                  </View>
                );
              })}
              {today.length > 3 && (
                <Text style={[styles.moreText, { color: Colors.secondaryText }]}>+{today.length - 3} more</Text>
              )}
            </View>
          ) : (
            <View style={[styles.nextTaskRow, { borderTopColor: Colors.border }]}>
              <Ionicons
                name={next ? 'time-outline' : 'checkmark-done-outline'}
                size={14}
                color={next ? '#3B82F6' : Colors.secondaryText}
              />
              <Text
                style={[
                  styles.nextTaskText,
                  { color: next ? Colors.primaryText : Colors.secondaryText },
                ]}
                numberOfLines={1}
              >
                {next ? `Next: ${next.title} · ${formatDate(next.start_date)}` : 'No upcoming tasks'}
              </Text>
            </View>
          )}

          {/* Daily Crew Checks summary — recurring items workers tick every day.
              Hidden when no checklist templates configured for this project. */}
          {(item.dailyTotal || 0) > 0 && (() => {
            const dailyDone = item.dailyDone || 0;
            const dailyTotal = item.dailyTotal || 0;
            const allDone = dailyDone === dailyTotal;
            const purple = '#8B5CF6';
            return (
              <View style={[styles.dailyBlock, { borderTopColor: Colors.border }]}>
                <View style={styles.dailyLeft}>
                  <Ionicons name="checkbox-outline" size={14} color={purple} />
                  <Text style={[styles.dailyLabel, { color: purple }]} numberOfLines={1}>
                    Daily Checks · {dailyTotal} item{dailyTotal === 1 ? '' : 's'}
                  </Text>
                </View>
                <View style={[styles.dailyCountPill, { backgroundColor: allDone ? '#10B98115' : purple + '15' }]}>
                  <Text style={[styles.dailyCountText, { color: allDone ? '#10B981' : purple }]}>
                    {dailyDone}/{dailyTotal}
                  </Text>
                </View>
              </View>
            );
          })()}
        </View>

        <Ionicons
          name="chevron-forward"
          size={16}
          color={Colors.secondaryText}
          style={styles.chevronRow}
        />
      </TouchableOpacity>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.emptyState, { flex: 1, justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color="#059669" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Projects</Text>
        <Text style={styles.subtitle}>
          {projects.length === 0 ? 'No projects assigned yet' : `${projects.length} active`}
        </Text>
      </View>
      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={48} color={(Colors.secondaryText || '#666') + '80'} />
            <Text style={styles.emptyTitle}>No projects yet</Text>
            <Text style={styles.emptyText}>
              When your supervisor assigns you to a project, it'll show up here.
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
