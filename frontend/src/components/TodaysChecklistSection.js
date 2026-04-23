/**
 * TodaysChecklistSection — phase tasks scheduled for TODAY for one project.
 *
 * Distinct from DailyChecklistSection (recurring daily checks).
 * This section ONLY surfaces worker_tasks rows where today falls inside the
 * scheduled [start_date, end_date] window. Each row links back to its phase
 * via phase_task_id so we can render the phase name as a context pill.
 *
 * Hidden when no tasks today (no empty card — keeps detail screens clean).
 *
 * Roles:
 * - Owner / supervisor: read-only summary (with completion count)
 * - Worker: tap a row to mark complete / uncomplete (only their own tasks)
 *
 * Data source:
 *   worker_tasks (id, title, start_date, end_date, status, phase_task_id, worker_id)
 *   project_phases.tasks (JSONB) — joined client-side for phase pill labels
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { LightColors, getColors, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { completeTask, uncompleteTask } from '../utils/storage';

const todayLocalISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatTodayLabel = () => {
  const d = new Date();
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function TodaysChecklistSection({
  projectId,
  userRole = 'owner',     // 'owner' | 'supervisor' | 'worker'
  onChange,               // optional callback after a task toggle
}) {
  // Note: worker_tasks has no per-worker column (no worker_id field).
  // All crew assigned to a project share the same tasks. Worker access
  // is gated by project_assignments + RLS, not by per-task filter.
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [tasks, setTasks] = useState([]);
  const [phaseLookup, setPhaseLookup] = useState({}); // phase_task_id -> phaseName
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  const today = todayLocalISO();
  const canToggle = userRole === 'worker';

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      const { data, error } = await supabase
        .from('worker_tasks')
        .select('id, title, start_date, end_date, status, phase_task_id, owner_id')
        .eq('project_id', projectId)
        .lte('start_date', today)
        .gte('end_date', today)
        .order('start_date', { ascending: true });
      if (error) throw error;
      const rows = data || [];
      setTasks(rows);

      // Build phase lookup: phase_task_id (string) -> phase name
      const phaseTaskIds = rows.map(t => t.phase_task_id).filter(Boolean);
      if (phaseTaskIds.length > 0) {
        const { data: phases } = await supabase
          .from('project_phases')
          .select('name, tasks, order_index')
          .eq('project_id', projectId)
          .order('order_index', { ascending: true });

        const lookup = {};
        let globalIdx = 0;
        (phases || []).forEach(ph => {
          (ph.tasks || []).forEach((task, localIdx) => {
            // Match all three legacy phase_task_id formats
            if (task?.id) lookup[task.id] = ph.name;
            lookup[`phase-task-${globalIdx}`] = ph.name;
            lookup[`${ph.name}-${localIdx}`] = ph.name;
            globalIdx++;
          });
        });
        setPhaseLookup(lookup);
      }
    } catch (e) {
      console.error('[TodaysChecklist] load error:', e?.message);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, today]);

  // Note: load deps intentionally exclude workerId since query no longer
  // filters by it (column doesn't exist on worker_tasks).
  useEffect(() => { load(); }, [load]);

  const handleToggle = async (task) => {
    if (!canToggle || toggling === task.id) return;
    setToggling(task.id);
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';

    // Optimistic
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    try {
      if (newStatus === 'completed') await completeTask(task.id);
      else await uncompleteTask(task.id);
      if (onChange) onChange();
    } catch (e) {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: task.status } : t));
    } finally {
      setToggling(null);
    }
  };

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount = tasks.length;

  // Don't render an empty card — caller's screen stays clean.
  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
        <ActivityIndicator size="small" color="#3B82F6" />
      </View>
    );
  }
  if (tasks.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <Ionicons name="today" size={16} color="#3B82F6" />
          </View>
          <View>
            <Text style={[styles.title, { color: Colors.primaryText }]}>Today's Checklist</Text>
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
              {formatTodayLabel()} · {totalCount} task{totalCount === 1 ? '' : 's'} from phases
            </Text>
          </View>
        </View>
        <View style={[styles.countPill, { backgroundColor: completedCount === totalCount ? '#10B98115' : '#3B82F615' }]}>
          <Text style={[styles.countPillText, { color: completedCount === totalCount ? '#10B981' : '#3B82F6' }]}>
            {completedCount}/{totalCount}
          </Text>
        </View>
      </View>

      {/* Task rows */}
      <View style={styles.body}>
        {tasks.map((task, idx) => {
          const isCompleted = task.status === 'completed';
          const phaseName = task.phase_task_id ? phaseLookup[task.phase_task_id] : null;
          const isLast = idx === tasks.length - 1;

          return (
            <TouchableOpacity
              key={task.id}
              activeOpacity={canToggle ? 0.6 : 1}
              onPress={() => handleToggle(task)}
              disabled={!canToggle || toggling === task.id}
              style={[styles.taskRow, !isLast && { borderBottomColor: Colors.border, borderBottomWidth: 1 }]}
            >
              <Ionicons
                name={isCompleted ? 'checkbox' : 'square-outline'}
                size={22}
                color={isCompleted ? '#10B981' : Colors.secondaryText + (canToggle ? 'FF' : '80')}
              />
              <View style={{ flex: 1, gap: 3 }}>
                <Text
                  style={[
                    styles.taskTitle,
                    { color: Colors.primaryText },
                    isCompleted && { textDecorationLine: 'line-through', color: Colors.secondaryText },
                  ]}
                  numberOfLines={2}
                >
                  {task.title}
                </Text>
                {phaseName && (
                  <View style={[styles.phasePill, { backgroundColor: '#8B5CF615' }]}>
                    <Ionicons name="layers-outline" size={10} color="#8B5CF6" />
                    <Text style={[styles.phasePillText, { color: '#8B5CF6' }]} numberOfLines={1}>
                      {phaseName}
                    </Text>
                  </View>
                )}
              </View>
              {toggling === task.id && (
                <ActivityIndicator size="small" color="#3B82F6" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#3B82F615',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: FontSizes.md, fontWeight: '700' },
  subtitle: { fontSize: 11, marginTop: 1 },
  countPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countPillText: { fontSize: 12, fontWeight: '700' },
  body: { paddingHorizontal: 4 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  taskTitle: { fontSize: FontSizes.sm, fontWeight: '600', flexShrink: 1 },
  phasePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  phasePillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2, maxWidth: 160 },
});
