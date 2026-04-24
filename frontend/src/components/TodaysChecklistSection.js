/**
 * TodaysChecklistSection — phase tasks scheduled for TODAY for one project.
 *
 * Distinct from DailyChecklistSection (recurring daily checks).
 * Surfaces worker_tasks rows where today falls inside [start_date, end_date].
 * Each row links back to its phase via phase_task_id so we render the phase
 * name as a context pill.
 *
 * Always renders the header (even with zero tasks) so owner/supervisor have
 * a tap target to add a task on a quiet day. Worker view: read-only when
 * empty (no add button).
 *
 * Roles:
 * - Owner / supervisor: read-only task list + Add Task button (multi-day)
 * - Worker: tap a row to mark complete / uncomplete
 *
 * Data source:
 *   worker_tasks (id, title, start_date, end_date, status, phase_task_id, owner_id)
 *   project_phases.tasks (JSONB) — joined client-side for phase pill labels
 */

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { LightColors, getColors, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { completeTask, uncompleteTask, createAdHocDayTask } from '../utils/storage';

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

const parseISO = (iso) => {
  if (!iso) return new Date();
  const [y, m, d] = iso.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
};

const toISOLocal = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatPickerLabel = (iso) => {
  const d = parseISO(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export default function TodaysChecklistSection({
  projectId,
  userRole = 'owner',     // 'owner' | 'supervisor' | 'worker'
  onChange,               // optional callback after a task toggle / add
}) {
  // Note: worker_tasks has no per-worker column. All crew on a project share
  // the same task pool; access is gated by project_assignments + RLS.
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [tasks, setTasks] = useState([]);
  const [phaseLookup, setPhaseLookup] = useState({});
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(null);

  // Add-task modal state. `newTitles` is the list of in-progress task rows
  // the user is typing — the `+` button appends a row, Save creates all of
  // them as separate tasks with the shared date range.
  const [addOpen, setAddOpen] = useState(false);
  const [newTitles, setNewTitles] = useState(['']);
  const [newStart, setNewStart] = useState(todayLocalISO());
  const [newEnd, setNewEnd] = useState(todayLocalISO());
  const rowRefs = useRef([]);
  const [pickerMode, setPickerMode] = useState(null); // 'start' | 'end' | null
  const [saving, setSaving] = useState(false);

  const today = todayLocalISO();
  // Anyone viewing this card (owner / supervisor / worker) can tick tasks off.
  // The previous owner/supervisor lockout blocked solo owners from completing
  // tasks they created for themselves, matching the behavior of the sibling
  // Daily Checklist card.
  const canToggle = true;
  const canAdd = userRole === 'owner' || userRole === 'supervisor';

  const styles = useMemo(() => createStyles(Colors), [Colors]);

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
            if (task?.id) lookup[task.id] = ph.name;
            lookup[`phase-task-${globalIdx}`] = ph.name;
            lookup[`${ph.name}-${localIdx}`] = ph.name;
            globalIdx++;
          });
        });
        setPhaseLookup(lookup);
      } else {
        setPhaseLookup({});
      }
    } catch (e) {
      console.error('[TodaysChecklist] load error:', e?.message);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, today]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (task) => {
    if (!canToggle || toggling === task.id) return;
    setToggling(task.id);
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
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

  const openAdd = () => {
    setNewTitles(['']);
    setNewStart(today);
    setNewEnd(today);
    setPickerMode(null);
    setAddOpen(true);
  };

  const closeAdd = () => {
    if (saving) return;
    setAddOpen(false);
    setPickerMode(null);
  };

  const handleTitleChange = (index, value) => {
    setNewTitles(prev => prev.map((t, i) => (i === index ? value : t)));
  };

  const handleAddRow = () => {
    setNewTitles(prev => [...prev, '']);
    // Focus the newly-appended row after React flushes.
    setTimeout(() => {
      const next = rowRefs.current[newTitles.length];
      next?.focus?.();
    }, 50);
  };

  const handleRemoveRow = (index) => {
    setNewTitles(prev => (prev.length <= 1 ? [''] : prev.filter((_, i) => i !== index)));
  };

  const handleSaveTask = async () => {
    const titles = newTitles.map(t => t.trim()).filter(Boolean);
    if (titles.length === 0) {
      Alert.alert('Title required', 'Give at least one task a name first.');
      return;
    }
    if (newEnd < newStart) {
      Alert.alert('Invalid range', 'End date must be on or after start date.');
      return;
    }
    setSaving(true);
    try {
      // Create all rows sequentially — the API is a single-row insert. If
      // any row fails we bail early so the user can retry the remainder
      // instead of silently dropping tasks.
      for (const title of titles) {
        const created = await createAdHocDayTask(projectId, title, newStart, newEnd);
        if (!created) {
          Alert.alert('Couldn\'t create task', `Failed on "${title}". The rest were saved.`);
          break;
        }
      }
      await load();
      if (onChange) onChange();
      setAddOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handlePickerChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setPickerMode(null);
    if (event?.type === 'dismissed') return;
    if (!selectedDate) return;
    const iso = toISOLocal(selectedDate);
    if (pickerMode === 'start') {
      setNewStart(iso);
      // Bump end forward if it's now before start
      if (newEnd < iso) setNewEnd(iso);
    } else if (pickerMode === 'end') {
      setNewEnd(iso);
    }
  };

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const totalCount = tasks.length;
  const isComplete = totalCount > 0 && completedCount === totalCount;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
        <ActivityIndicator size="small" color="#3B82F6" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconCircle}>
            <Ionicons name="today" size={16} color="#3B82F6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: Colors.primaryText }]}>Today's Checklist</Text>
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]} numberOfLines={1}>
              {formatTodayLabel()}
              {totalCount > 0
                ? ` · ${totalCount} task${totalCount === 1 ? '' : 's'}`
                : ' · nothing scheduled yet'}
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          {totalCount > 0 && (
            <View style={[styles.countPill, { backgroundColor: isComplete ? '#10B98115' : '#3B82F615' }]}>
              <Text style={[styles.countPillText, { color: isComplete ? '#10B981' : '#3B82F6' }]}>
                {completedCount}/{totalCount}
              </Text>
            </View>
          )}
          {canAdd && (
            <TouchableOpacity
              onPress={openAdd}
              style={[styles.addBtn, { backgroundColor: '#3B82F6' }]}
              activeOpacity={0.8}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Body */}
      {totalCount === 0 ? (
        <View style={styles.emptyBody}>
          <Ionicons name="calendar-outline" size={28} color={Colors.secondaryText + '60'} />
          <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>Nothing scheduled today</Text>
          <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
            {canAdd
              ? 'Tap Add to drop a task on today (or pick a date range for multi-day work).'
              : 'Check back later or jump in on the daily crew checks below.'}
          </Text>
        </View>
      ) : (
        <View style={styles.body}>
          {tasks.map((task, idx) => {
            const isCompleted = task.status === 'completed';
            const phaseName = task.phase_task_id ? phaseLookup[task.phase_task_id] : null;
            const isMultiDay = task.start_date !== task.end_date;
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
                <View style={{ flex: 1, gap: 4 }}>
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
                  <View style={styles.taskMetaRow}>
                    {phaseName ? (
                      <View style={[styles.phasePill, { backgroundColor: '#8B5CF615' }]}>
                        <Ionicons name="layers-outline" size={10} color="#8B5CF6" />
                        <Text style={[styles.phasePillText, { color: '#8B5CF6' }]} numberOfLines={1}>
                          {phaseName}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.phasePill, { backgroundColor: '#F59E0B15' }]}>
                        <Ionicons name="bookmark-outline" size={10} color="#F59E0B" />
                        <Text style={[styles.phasePillText, { color: '#F59E0B' }]} numberOfLines={1}>
                          Custom
                        </Text>
                      </View>
                    )}
                    {isMultiDay && (
                      <View style={[styles.rangePill, { backgroundColor: Colors.lightGray || '#F3F4F6' }]}>
                        <Ionicons name="calendar-outline" size={10} color={Colors.secondaryText} />
                        <Text style={[styles.rangePillText, { color: Colors.secondaryText }]} numberOfLines={1}>
                          {formatPickerLabel(task.start_date)} – {formatPickerLabel(task.end_date)}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                {toggling === task.id && (
                  <ActivityIndicator size="small" color="#3B82F6" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Add Task Modal */}
      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={closeAdd}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKav}
          >
            <View style={[styles.modalCard, { backgroundColor: Colors.cardBackground }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Add Task</Text>
                <TouchableOpacity onPress={closeAdd} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={22} color={Colors.secondaryText} />
                </TouchableOpacity>
              </View>

              <Text style={[styles.modalLabel, { color: Colors.secondaryText }]}>TASKS</Text>
              {newTitles.map((title, i) => (
                <View key={`task-row-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <TextInput
                    ref={(el) => { rowRefs.current[i] = el; }}
                    value={title}
                    onChangeText={(v) => handleTitleChange(i, v)}
                    placeholder={i === 0 ? 'e.g. Pick up tile from supplier' : 'Another task…'}
                    placeholderTextColor={Colors.secondaryText + '80'}
                    autoFocus={i === 0}
                    style={[styles.modalInput, { flex: 1, color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.background, marginBottom: 0 }]}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={handleAddRow}
                  />
                  {newTitles.length > 1 && (
                    <TouchableOpacity
                      onPress={() => handleRemoveRow(i)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity
                onPress={handleAddRow}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.primaryBlue + '60', borderStyle: 'dashed', marginBottom: 4 }}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={16} color={Colors.primaryBlue} />
                <Text style={{ fontSize: 13, color: Colors.primaryBlue, fontWeight: '600' }}>Add another task</Text>
              </TouchableOpacity>

              <Text style={[styles.modalLabel, { color: Colors.secondaryText, marginTop: 14 }]}>WHEN</Text>
              <View style={styles.dateRow}>
                <TouchableOpacity
                  onPress={() => setPickerMode('start')}
                  style={[styles.dateChip, { borderColor: Colors.border, backgroundColor: Colors.background }]}
                  activeOpacity={0.7}
                >
                  <Ionicons name="calendar-outline" size={14} color="#3B82F6" />
                  <View>
                    <Text style={[styles.dateChipLabel, { color: Colors.secondaryText }]}>Start</Text>
                    <Text style={[styles.dateChipValue, { color: Colors.primaryText }]}>{formatPickerLabel(newStart)}</Text>
                  </View>
                </TouchableOpacity>
                <Ionicons name="arrow-forward" size={14} color={Colors.secondaryText} />
                <TouchableOpacity
                  onPress={() => setPickerMode('end')}
                  style={[styles.dateChip, { borderColor: Colors.border, backgroundColor: Colors.background }]}
                  activeOpacity={0.7}
                >
                  <Ionicons name="calendar-outline" size={14} color="#3B82F6" />
                  <View>
                    <Text style={[styles.dateChipLabel, { color: Colors.secondaryText }]}>End</Text>
                    <Text style={[styles.dateChipValue, { color: Colors.primaryText }]}>{formatPickerLabel(newEnd)}</Text>
                  </View>
                </TouchableOpacity>
              </View>
              <Text style={[styles.modalHint, { color: Colors.secondaryText }]}>
                {newStart === newEnd
                  ? 'Single-day task. Tap End to span multiple days.'
                  : `Multi-day task — shows on every day in this range.`}
              </Text>

              {pickerMode && (
                <DateTimePicker
                  value={parseISO(pickerMode === 'start' ? newStart : newEnd)}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  minimumDate={pickerMode === 'end' ? parseISO(newStart) : undefined}
                  onChange={handlePickerChange}
                />
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={closeAdd}
                  disabled={saving}
                  style={[styles.modalBtn, { backgroundColor: 'transparent', borderColor: Colors.border, borderWidth: 1 }]}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.modalBtnText, { color: Colors.primaryText }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveTask}
                  disabled={saving || !newTitles.some(t => t.trim())}
                  style={[
                    styles.modalBtn,
                    { backgroundColor: !newTitles.some(t => t.trim()) ? '#3B82F660' : '#3B82F6' },
                  ]}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (Colors) => StyleSheet.create({
  container: {
    // Layout-neutral: parent controls horizontal position so every host
    // (owner ProjectDetailView, worker screens, nested cards) can place
    // the card correctly without double-margins.
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  countPillText: { fontSize: 12, fontWeight: '700' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  addBtnText: { color: '#fff', fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  body: { paddingHorizontal: 4 },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  taskTitle: { fontSize: FontSizes.sm, fontWeight: '600', flexShrink: 1 },
  taskMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
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
  rangePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  rangePillText: { fontSize: 10, fontWeight: '600' },
  emptyBody: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 24,
    gap: 6,
  },
  emptyTitle: { fontSize: FontSizes.sm, fontWeight: '700' },
  emptyText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalKav: { width: '100%' },
  modalCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: { fontSize: FontSizes.lg, fontWeight: '700' },
  modalLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: FontSizes.md,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateChipLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  dateChipValue: { fontSize: FontSizes.sm, fontWeight: '600' },
  modalHint: { fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  modalBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  modalBtnText: { fontSize: FontSizes.md, fontWeight: '700' },
});
