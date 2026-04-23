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

        const { data: nextTasks } = await supabase
          .from('worker_tasks')
          .select('id, title, start_date, end_date, status')
          .eq('project_id', p.id)
          .eq('worker_id', workerData.id)
          .gte('end_date', today)
          .neq('status', 'completed')
          .order('start_date', { ascending: true })
          .limit(1);

        return {
          ...p,
          currentPhase: currentPhase?.name || null,
          nextTask: nextTasks && nextTasks[0] ? nextTasks[0] : null,
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
    title: { fontSize: FontSizes.xl, fontWeight: '700', color: Colors.primaryText },
    subtitle: { fontSize: FontSizes.sm, color: Colors.secondaryText, marginTop: 2 },
    list: { paddingHorizontal: Spacing.md, paddingBottom: 120 },
    card: {
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      padding: Spacing.md,
      marginBottom: Spacing.sm,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    projectName: { fontSize: FontSizes.md, fontWeight: '700', flex: 1 },
    phasePill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, maxWidth: 140 },
    phasePillText: { fontSize: 11, fontWeight: '700' },
    metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '60%' },
    metaText: { fontSize: FontSizes.sm, flexShrink: 1 },
    nextTaskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
    },
    nextTaskText: { fontSize: FontSizes.sm, flexShrink: 1 },
    emptyState: { alignItems: 'center', padding: Spacing.xl, gap: 8 },
    emptyTitle: { fontSize: FontSizes.md, fontWeight: '600', color: Colors.primaryText },
    emptyText: { fontSize: FontSizes.sm, color: Colors.secondaryText, textAlign: 'center' },
  });

  const renderCard = ({ item }) => {
    const next = item.nextTask;
    const nextLabel = next
      ? `Next: ${next.title} · ${formatDate(next.start_date)}`
      : 'No upcoming tasks';

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => openProject(item)}
        style={[styles.card, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}
      >
        <View style={styles.cardTopRow}>
          <Text style={[styles.projectName, { color: Colors.primaryText }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.currentPhase && (
            <View style={[styles.phasePill, { backgroundColor: '#05966915' }]}>
              <Text style={[styles.phasePillText, { color: '#059669' }]} numberOfLines={1}>
                {item.currentPhase}
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

        <View style={[styles.nextTaskRow, { borderTopColor: Colors.border }]}>
          <Ionicons
            name={next ? 'checkbox-outline' : 'checkmark-done-outline'}
            size={14}
            color={next ? '#059669' : Colors.secondaryText}
          />
          <Text style={[styles.nextTaskText, { color: next ? Colors.primaryText : Colors.secondaryText }]} numberOfLines={1}>
            {nextLabel}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} style={{ marginLeft: 'auto' }} />
        </View>
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
