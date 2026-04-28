import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getColors, LightColors, Spacing, BorderRadius, FontSizes } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { fetchTasksForWorkerDateRange, fetchTasksForDateRange, fetchProjectPhases, getCurrentUserId, completeTask, uncompleteTask, fetchTodayChecklist, toggleChecklistEntry } from '../utils/storage';
import { createAdHocDayTask } from '../utils/storage/workerTasks';
import { getProjectColor } from '../utils/calendarUtils';
import AgendaView from './schedule/AgendaView';
import MonthGridView from './schedule/MonthGridView';

const STORAGE_KEY_VIEW_MODE = 'schedule.viewMode.v1';

export default function ScheduleView({ navigation, role = 'worker', onAddTaskForDate }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [viewMode, setViewMode] = useState('agenda'); // 'agenda' | 'month'
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [dailyChecklist, setDailyChecklist] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  // Add-task modal state — single entry point in the top bar (Option A in
  // the UX plan). Opens a modal with project + title + date range so users
  // don't get a per-day "+ Add" button polluting every section header.
  // A task can span multiple days by setting `newTaskEnd` later than
  // `newTaskStart`; defaults collapse to a single-day task.
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskProjectId, setNewTaskProjectId] = useState(null);
  const [newTaskStart, setNewTaskStart] = useState(() => formatDate(new Date()));
  const [newTaskEnd, setNewTaskEnd] = useState(() => formatDate(new Date()));
  const [datePickerMode, setDatePickerMode] = useState(null); // 'start' | 'end' | null
  const [showTaskProjectPicker, setShowTaskProjectPicker] = useState(false);
  const [savingTask, setSavingTask] = useState(false);

  // Hydrate persisted UI state on mount
  useEffect(() => {
    (async () => {
      try {
        const savedView = await AsyncStorage.getItem(STORAGE_KEY_VIEW_MODE);
        if (savedView === 'agenda' || savedView === 'month') setViewMode(savedView);
      } catch (_) { /* AsyncStorage hydration is best-effort */ }
    })();
  }, []);

  const persistViewMode = useCallback((mode) => {
    setViewMode(mode);
    AsyncStorage.setItem(STORAGE_KEY_VIEW_MODE, mode).catch(() => {});
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const userId = await getCurrentUserId();
      if (!userId) return;

      if (role === 'worker') {
        const { data: worker } = await supabase
          .from('workers')
          .select('id, owner_id')
          .eq('user_id', userId)
          .single();

        if (!worker) {
          await loadOwnerData(userId);
          return;
        }

        const { data: assignments } = await supabase
          .from('project_assignments')
          .select('project_id')
          .eq('worker_id', worker.id);

        const projectIds = (assignments || []).map((a) => a.project_id).filter(Boolean);

        let workerProjects = [];
        if (projectIds.length > 0) {
          const { data: projectData } = await supabase
            .from('projects')
            .select('id, name, status, working_days, non_working_dates')
            .in('id', projectIds)
            .neq('status', 'archived');
          workerProjects = projectData || [];
          setProjects(workerProjects);
        }

        const start = new Date();
        start.setDate(start.getDate() - 7);
        const end = new Date();
        end.setDate(end.getDate() + 365);
        const startStr = formatDate(start);
        const endStr = formatDate(end);

        const taskData = await fetchTasksForWorkerDateRange(worker.owner_id, startStr, endStr, projectIds);
        setTasks(taskData || []);

        try {
          const checklist = await fetchTodayChecklist(workerProjects, worker.owner_id, userId);
          setDailyChecklist(checklist || []);
        } catch (_) {
          setDailyChecklist([]);
        }
      } else {
        await loadOwnerData(userId);
      }
    } catch (error) {
      console.error('ScheduleView load error:', error);
    } finally {
      setLoading(false);
    }
  }, [role]);

  const loadOwnerData = async (userId) => {
    // The same `role="owner"` path is used by both owners and supervisors
    // (WorkersScreen passes "owner" regardless). Detect supervisor here and
    // re-scope the queries to their parent owner's projects/tasks, filtered
    // to only the projects they're assigned to.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, owner_id')
      .eq('id', userId)
      .single();
    const isSupervisor = profile?.role === 'supervisor' && !!profile?.owner_id;
    const ownerId = isSupervisor ? profile.owner_id : userId;

    let projectsQuery = supabase
      .from('projects')
      .select('id, name, status, start_date, end_date, working_days, non_working_dates')
      .neq('status', 'archived')
      .order('name');
    if (isSupervisor) {
      projectsQuery = projectsQuery.eq('assigned_supervisor_id', userId);
    } else {
      projectsQuery = projectsQuery.eq('user_id', userId);
    }
    const { data: projectData } = await projectsQuery;
    setProjects(projectData || []);

    const start = new Date();
    start.setDate(start.getDate() - 7);
    const end = new Date();
    end.setDate(end.getDate() + 365);
    const startStr = formatDate(start);
    const endStr = formatDate(end);

    // Tasks live on the owner's row (`worker_tasks.owner_id = ownerId`).
    // Supervisors must query against the owner id, scoped to their assigned
    // project ids — same shape as the worker path above.
    // Today's daily checklist injection — loaded for both owner and supervisor.
    try {
      const checklist = await fetchTodayChecklist(projectData || [], ownerId, userId);
      setDailyChecklist(checklist || []);
    } catch (_) {
      setDailyChecklist([]);
    }

    if (isSupervisor) {
      const projectIds = (projectData || []).map((p) => p.id).filter(Boolean);
      const taskData = projectIds.length > 0
        ? await fetchTasksForWorkerDateRange(ownerId, startStr, endStr, projectIds)
        : [];
      setTasks(taskData || []);
      return;
    }

    const taskData = await fetchTasksForDateRange(startStr, endStr);

    if (taskData && taskData.length > 0) {
      setTasks(taskData);
      return;
    }

    // Fallback: synthesize tasks from project_phases.tasks JSONB
    const phaseTasks = [];
    for (const project of (projectData || [])) {
      try {
        const phases = await fetchProjectPhases(project.id);
        if (!phases || phases.length === 0) continue;

        phases.forEach((phase) => {
          const tasks = phase.tasks || [];
          if (tasks.length === 0) return;

          const phaseStart = phase.start_date || project.start_date;
          const phaseEnd = phase.end_date || phase.start_date || project.start_date;
          if (!phaseStart) return;

          const workingDays = project.working_days || [1, 2, 3, 4, 5];
          const nonWorking = project.non_working_dates || [];
          const availableDays = [];
          const cursor = new Date(phaseStart + 'T12:00:00');
          const endDate = new Date((phaseEnd || phaseStart) + 'T12:00:00');

          while (cursor <= endDate) {
            const dateStr = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
            const jsDay = cursor.getDay();
            const isoDay = jsDay === 0 ? 7 : jsDay;
            if (workingDays.includes(isoDay) && !nonWorking.includes(dateStr)) {
              availableDays.push(dateStr);
            }
            cursor.setDate(cursor.getDate() + 1);
          }

          tasks.forEach((task, idx) => {
            const dayIndex = availableDays.length > 0
              ? Math.min(Math.floor(idx * availableDays.length / tasks.length), availableDays.length - 1)
              : 0;
            const taskDate = availableDays[dayIndex] || phaseStart;

            phaseTasks.push({
              id: task.id || `phase-${phase.id}-${task.order}`,
              title: task.description || task.name || 'Untitled',
              description: phase.name,
              status: task.status || (task.completed ? 'done' : 'not_started'),
              start_date: taskDate,
              end_date: taskDate,
              color: task.color,
              project_id: project.id,
              completed_at: task.completed_date,
              projects: {
                id: project.id,
                name: project.name,
                working_days: workingDays,
                non_working_dates: nonWorking,
              },
            });
          });
        });
      } catch (e) {
        console.error('Error loading phases for project:', project.id, e);
      }
    }
    setTasks(phaseTasks);
  };

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Only filter left is "which project" — status/time filters were removed
  // in favor of the agenda's own visual grouping (Today / Tomorrow /
  // weekday sections make date-based filters redundant).
  const filteredTasks = useMemo(() => {
    if (!selectedProject) return tasks;
    return tasks.filter((t) => t.project_id === selectedProject.id);
  }, [tasks, selectedProject]);

  const handleDayPress = useCallback((dateStr) => {
    setSelectedDate(dateStr);
    persistViewMode('agenda');
  }, [persistViewMode]);

  const handleMonthChange = useCallback((direction) => {
    setCurrentMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + direction);
      return next;
    });
  }, []);

  const handleSelectProject = useCallback((project) => {
    setSelectedProject(project);
    setShowProjectPicker(false);
  }, []);

  const openAddTask = useCallback(() => {
    // Pre-select the filtered project (if any) so it's one less tap when
    // the user was already narrowing by project. Default = today, single-day.
    const today = formatDate(new Date());
    setNewTaskTitle('');
    setNewTaskProjectId(selectedProject?.id || (projects[0]?.id || null));
    setNewTaskStart(today);
    setNewTaskEnd(today);
    setDatePickerMode(null);
    setShowTaskProjectPicker(false);
    setShowAddTask(true);
  }, [selectedProject, projects]);

  const closeAddTask = useCallback(() => {
    if (savingTask) return;
    setShowAddTask(false);
    setDatePickerMode(null);
    setShowTaskProjectPicker(false);
  }, [savingTask]);

  // Dismiss the on-screen keyboard BEFORE opening the date picker overlay.
  // Without this, the iOS keyboard (still up from the title field) sits on
  // top of the spinner and blocks the wheel from being interacted with.
  const openDatePicker = useCallback((mode) => {
    Keyboard.dismiss();
    // Defer one frame so the keyboard-hide animation doesn't compete with
    // the overlay slide-up.
    setTimeout(() => setDatePickerMode(mode), 50);
  }, []);

  const openTaskProjectPicker = useCallback(() => {
    Keyboard.dismiss();
    setTimeout(() => setShowTaskProjectPicker(true), 50);
  }, []);

  const handleSaveNewTask = useCallback(async () => {
    const title = newTaskTitle.trim();
    if (!title) {
      Alert.alert('Title required', 'Give the task a short name first.');
      return;
    }
    if (!newTaskProjectId) {
      Alert.alert('Project required', 'Pick which project this task belongs to.');
      return;
    }
    if (newTaskEnd < newTaskStart) {
      Alert.alert('Invalid range', 'End date must be on or after start date.');
      return;
    }
    setSavingTask(true);
    try {
      const created = await createAdHocDayTask(newTaskProjectId, title, newTaskStart, newTaskEnd);
      if (!created) {
        Alert.alert("Couldn't create task", 'Something went wrong. Try again.');
        return;
      }
      setShowAddTask(false);
      await loadData();
    } finally {
      setSavingTask(false);
    }
  }, [newTaskTitle, newTaskProjectId, newTaskStart, newTaskEnd, loadData]);

  const selectedTaskProject = useMemo(
    () => projects.find((p) => p.id === newTaskProjectId) || null,
    [projects, newTaskProjectId]
  );

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Top bar: [filter icon] · [Agenda / Month segmented toggle].
          Matches the OwnerProjectsScreen filter-button pattern exactly
          (40×40 icon, small active-state dot badge). The Agenda/Month
          toggle emphasizes the active mode by growing its pill and
          showing its label while shrinking the inactive one. */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => setShowProjectPicker(true)}
          activeOpacity={0.7}
          style={styles.filterButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name="filter"
            size={20}
            color={selectedProject ? Colors.primaryBlue : Colors.secondaryText}
          />
          {selectedProject && (
            <View style={[styles.filterDot, { backgroundColor: Colors.primaryBlue }]} />
          )}
        </TouchableOpacity>

        <View style={[styles.viewToggle, { backgroundColor: Colors.lightGray }]}>
          <TouchableOpacity
            onPress={() => persistViewMode('agenda')}
            activeOpacity={0.7}
            style={[
              styles.viewToggleBtn,
              viewMode === 'agenda' && [styles.viewToggleBtnActive, { backgroundColor: Colors.white }],
            ]}
          >
            <Ionicons
              name="list"
              size={viewMode === 'agenda' ? 16 : 14}
              color={viewMode === 'agenda' ? Colors.primaryBlue : Colors.secondaryText}
            />
            {viewMode === 'agenda' && (
              <Text style={[styles.viewToggleLabel, { color: Colors.primaryBlue }]}>
                Agenda
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => persistViewMode('month')}
            activeOpacity={0.7}
            style={[
              styles.viewToggleBtn,
              viewMode === 'month' && [styles.viewToggleBtnActive, { backgroundColor: Colors.white }],
            ]}
          >
            <Ionicons
              name="grid"
              size={viewMode === 'month' ? 16 : 14}
              color={viewMode === 'month' ? Colors.primaryBlue : Colors.secondaryText}
            />
            {viewMode === 'month' && (
              <Text style={[styles.viewToggleLabel, { color: Colors.primaryBlue }]}>
                Month
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Add-task trigger — mirrors the filter button on the left so the
            top bar reads [filter] [toggle] [+] like an iOS nav bar. One
            tap opens a modal that picks project + title + date. No
            collision with the screen-level quick-actions FAB. */}
        <TouchableOpacity
          onPress={openAddTask}
          activeOpacity={0.7}
          style={styles.filterButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Add task"
        >
          <Ionicons name="add" size={24} color={Colors.primaryBlue} />
        </TouchableOpacity>
      </View>

      {/* View Content */}
      {viewMode === 'agenda' ? (
        <AgendaView
          tasks={filteredTasks}
          theme={Colors}
          scrollToDate={selectedDate}
          dailyChecklist={selectedProject ? dailyChecklist.filter(c => c.project_id === selectedProject.id) : dailyChecklist}
          onToggleDailyChecklistItem={async (item) => {
            // Optimistic flip
            setDailyChecklist((prev) =>
              prev.map((c) =>
                c.template_id === item.template_id ? { ...c, completed: !c.completed } : c
              )
            );
            try {
              const userId = await getCurrentUserId();
              const updated = await toggleChecklistEntry(item, userId);
              // Replace with the canonical updated row (carries new entry_id/report_id)
              setDailyChecklist((prev) =>
                prev.map((c) => (c.template_id === item.template_id ? updated : c))
              );
            } catch (err) {
              // Roll back on failure
              setDailyChecklist((prev) =>
                prev.map((c) => (c.template_id === item.template_id ? item : c))
              );
            }
          }}
          // onAddTaskForDate intentionally omitted — the top-bar "+" button
          // (openAddTask) is now the single entry point for creating tasks,
          // so the in-agenda FAB would be redundant.
          onToggleComplete={async (item) => {
            const isDone = item.status === 'completed' || item.status === 'done';
            // Optimistic update — flip status locally so the checkbox feels instant.
            setTasks((prev) =>
              prev.map((t) =>
                t.id === item.id
                  ? { ...t, status: isDone ? 'pending' : 'completed', completed_at: isDone ? null : new Date().toISOString() }
                  : t
              )
            );
            try {
              if (isDone) {
                await uncompleteTask(item.id);
              } else {
                const userId = await getCurrentUserId();
                await completeTask(item.id, userId);
              }
            } catch (err) {
              // Rollback on failure
              setTasks((prev) => prev.map((t) => (t.id === item.id ? item : t)));
            }
          }}
        />
      ) : (
        <MonthGridView
          currentMonth={currentMonth}
          tasks={filteredTasks}
          theme={Colors}
          onDayPress={handleDayPress}
          selectedDate={selectedDate}
          onMonthChange={handleMonthChange}
          onResetToToday={() => {
            setCurrentMonth(new Date());
            setSelectedDate(formatDate(new Date()));
          }}
        />
      )}

      {/* Add Task Modal — bottom sheet with Project + Title + Date.
          Date uses a native platform picker (spinner on iOS, default on
          Android) opened in its own small overlay so it can never blow up
          the sheet's layout the way an inline calendar did. */}
      <Modal
        visible={showAddTask}
        animationType="slide"
        transparent
        onRequestClose={closeAddTask}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.addTaskBackdrop}
        >
          <View style={[styles.addTaskCard, { backgroundColor: Colors.cardBackground || Colors.white }]}>
            <View style={styles.addTaskHeader}>
              <Text style={[styles.addTaskTitle, { color: Colors.primaryText }]}>New Task</Text>
              <TouchableOpacity onPress={closeAddTask} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color={Colors.secondaryText} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.addTaskLabel, { color: Colors.secondaryText }]}>TITLE</Text>
            <TextInput
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              placeholder="e.g. Pick up tile from supplier"
              placeholderTextColor={Colors.secondaryText + '80'}
              autoFocus
              style={[styles.addTaskInput, { color: Colors.primaryText, borderColor: Colors.border, backgroundColor: Colors.background }]}
              returnKeyType="done"
              onSubmitEditing={handleSaveNewTask}
            />

            <Text style={[styles.addTaskLabel, { color: Colors.secondaryText }]}>PROJECT</Text>
            <TouchableOpacity
              onPress={openTaskProjectPicker}
              activeOpacity={0.7}
              style={[styles.addTaskRow, { borderColor: Colors.border, backgroundColor: Colors.background }]}
            >
              {selectedTaskProject ? (
                <View style={[styles.projectDot, { backgroundColor: getProjectColor(selectedTaskProject.id) }]} />
              ) : (
                <Ionicons name="folder-outline" size={16} color={Colors.secondaryText} style={{ marginRight: 10 }} />
              )}
              <Text style={[styles.addTaskRowText, { color: selectedTaskProject ? Colors.primaryText : Colors.secondaryText }]}>
                {selectedTaskProject ? selectedTaskProject.name : 'Pick a project'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />
            </TouchableOpacity>

            <Text style={[styles.addTaskLabel, { color: Colors.secondaryText }]}>WHEN</Text>
            <View style={styles.dateRangeRow}>
              <TouchableOpacity
                onPress={() => openDatePicker('start')}
                activeOpacity={0.7}
                style={[styles.dateChip, { borderColor: Colors.border, backgroundColor: Colors.background }]}
              >
                <Ionicons name="calendar-outline" size={14} color={Colors.primaryBlue} />
                <View style={{ marginLeft: 8 }}>
                  <Text style={[styles.dateChipLabel, { color: Colors.secondaryText }]}>Start</Text>
                  <Text style={[styles.dateChipValue, { color: Colors.primaryText }]}>
                    {(() => {
                      const d = new Date(newTaskStart + 'T12:00:00');
                      const today = formatDate(new Date());
                      return newTaskStart === today
                        ? 'Today'
                        : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    })()}
                  </Text>
                </View>
              </TouchableOpacity>
              <Ionicons name="arrow-forward" size={14} color={Colors.secondaryText} />
              <TouchableOpacity
                onPress={() => openDatePicker('end')}
                activeOpacity={0.7}
                style={[styles.dateChip, { borderColor: Colors.border, backgroundColor: Colors.background }]}
              >
                <Ionicons name="calendar-outline" size={14} color={Colors.primaryBlue} />
                <View style={{ marginLeft: 8 }}>
                  <Text style={[styles.dateChipLabel, { color: Colors.secondaryText }]}>End</Text>
                  <Text style={[styles.dateChipValue, { color: Colors.primaryText }]}>
                    {(() => {
                      const d = new Date(newTaskEnd + 'T12:00:00');
                      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    })()}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
            <Text style={[styles.dateRangeHint, { color: Colors.secondaryText }]}>
              {newTaskStart === newTaskEnd
                ? 'Single-day task. Tap End to span multiple days.'
                : 'Multi-day task — will appear on every day in this range.'}
            </Text>

            <View style={styles.addTaskActions}>
              <TouchableOpacity
                onPress={closeAddTask}
                disabled={savingTask}
                style={[styles.addTaskBtn, { borderColor: Colors.border, borderWidth: 1 }]}
                activeOpacity={0.7}
              >
                <Text style={[styles.addTaskBtnText, { color: Colors.primaryText }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveNewTask}
                disabled={savingTask || !newTaskTitle.trim() || !newTaskProjectId}
                style={[
                  styles.addTaskBtn,
                  { backgroundColor: (!newTaskTitle.trim() || !newTaskProjectId) ? Colors.primaryBlue + '60' : Colors.primaryBlue },
                ]}
                activeOpacity={0.8}
              >
                {savingTask ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.addTaskBtnText, { color: '#fff' }]}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* Date picker overlay — separate bottom sheet. iOS renders the
            spinner variant (compact, fits in 220px), Android uses the
            native calendar dialog which self-dismisses on pick. The
            `datePickerMode` state ('start' | 'end') controls which date
            the picker writes back to. `Keyboard.dismiss()` is called in
            openDatePicker so the wheel never sits under the keyboard. */}
        {datePickerMode && Platform.OS === 'ios' && (
          <View style={styles.datePickerOverlay} pointerEvents="box-none">
            <View style={[styles.datePickerSheet, { backgroundColor: Colors.cardBackground || Colors.white }]}>
              <View style={styles.datePickerHeader}>
                <TouchableOpacity onPress={() => setDatePickerMode(null)}>
                  <Text style={[styles.datePickerHeaderText, { color: Colors.secondaryText }]}>Cancel</Text>
                </TouchableOpacity>
                <Text style={[styles.datePickerHeaderTitle, { color: Colors.primaryText }]}>
                  {datePickerMode === 'start' ? 'Start date' : 'End date'}
                </Text>
                <TouchableOpacity onPress={() => setDatePickerMode(null)}>
                  <Text style={[styles.datePickerHeaderText, { color: Colors.primaryBlue, fontWeight: '700' }]}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={new Date((datePickerMode === 'start' ? newTaskStart : newTaskEnd) + 'T12:00:00')}
                mode="date"
                display="spinner"
                minimumDate={datePickerMode === 'end' ? new Date(newTaskStart + 'T12:00:00') : undefined}
                onChange={(_event, date) => {
                  if (!date) return;
                  const iso = formatDate(date);
                  if (datePickerMode === 'start') {
                    setNewTaskStart(iso);
                    // Pull end forward if the user pushed start past it.
                    if (newTaskEnd < iso) setNewTaskEnd(iso);
                  } else {
                    setNewTaskEnd(iso);
                  }
                }}
                style={{ height: 220 }}
                textColor={Colors.primaryText}
              />
            </View>
          </View>
        )}
        {datePickerMode && Platform.OS === 'android' && (
          <DateTimePicker
            value={new Date((datePickerMode === 'start' ? newTaskStart : newTaskEnd) + 'T12:00:00')}
            mode="date"
            display="default"
            minimumDate={datePickerMode === 'end' ? new Date(newTaskStart + 'T12:00:00') : undefined}
            onChange={(_event, date) => {
              const mode = datePickerMode;
              setDatePickerMode(null);
              if (!date) return;
              const iso = formatDate(date);
              if (mode === 'start') {
                setNewTaskStart(iso);
                if (newTaskEnd < iso) setNewTaskEnd(iso);
              } else {
                setNewTaskEnd(iso);
              }
            }}
          />
        )}

        {/* Project picker for the Add-task flow */}
        <Modal
          visible={showTaskProjectPicker}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowTaskProjectPicker(false)}
        >
          <View style={[styles.pickerContainer, { backgroundColor: Colors.background }]}>
            <View style={[styles.pickerHeader, { borderBottomColor: Colors.border }]}>
              <Text style={[styles.pickerTitle, { color: Colors.primaryText }]}>Pick Project</Text>
              <TouchableOpacity onPress={() => setShowTaskProjectPicker(false)}>
                <Ionicons name="close" size={24} color={Colors.primaryText} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={projects}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const isSelected = newTaskProjectId === item.id;
                return (
                  <TouchableOpacity
                    style={[styles.pickerItem, isSelected && { backgroundColor: Colors.primaryBlue + '10' }]}
                    onPress={() => {
                      setNewTaskProjectId(item.id);
                      setShowTaskProjectPicker(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.pickerItemLeft}>
                      <View style={[styles.projectDot, { backgroundColor: getProjectColor(item.id) }]} />
                      <Text style={[styles.pickerItemText, { color: Colors.primaryText }]}>{item.name}</Text>
                    </View>
                    {isSelected && <Ionicons name="checkmark" size={20} color={Colors.primaryBlue} />}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </Modal>
      </Modal>

      {/* Project Picker Modal */}
      <Modal
        visible={showProjectPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProjectPicker(false)}
      >
        <View style={[styles.pickerContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: Colors.border }]}>
            <Text style={[styles.pickerTitle, { color: Colors.primaryText }]}>Select Project</Text>
            <TouchableOpacity onPress={() => setShowProjectPicker(false)}>
              <Ionicons name="close" size={24} color={Colors.primaryText} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={[{ id: null, name: 'All Projects' }, ...projects]}
            keyExtractor={(item) => item.id || 'all'}
            renderItem={({ item }) => {
              const isSelected = item.id === null
                ? !selectedProject
                : selectedProject?.id === item.id;
              return (
                <TouchableOpacity
                  style={[styles.pickerItem, isSelected && { backgroundColor: Colors.primaryBlue + '10' }]}
                  onPress={() => handleSelectProject(item.id ? item : null)}
                  activeOpacity={0.7}
                >
                  <View style={styles.pickerItemLeft}>
                    {item.id && (
                      <View style={[styles.projectDot, { backgroundColor: getProjectColor(item.id) }]} />
                    )}
                    {!item.id && (
                      <Ionicons name="layers-outline" size={16} color={Colors.primaryBlue} style={{ marginRight: 10 }} />
                    )}
                    <Text style={[styles.pickerItemText, { color: Colors.primaryText }]}>{item.name}</Text>
                  </View>
                  {isSelected && (
                    <Ionicons name="checkmark" size={20} color={Colors.primaryBlue} />
                  )}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 10,
  },
  filterButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  // flex:1 so the toggle stretches from the filter icon all the way to the
  // right edge of the screen. The two inner buttons split that width via
  // their own flex weighting — active side gets flex:2 so it's ~2× the
  // size of the inactive side (bigger "selected" pill).
  viewToggle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 10,
    padding: 3,
  },
  viewToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    gap: 6,
    paddingVertical: 8,
  },
  viewToggleBtnActive: {
    flex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  viewToggleLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  pickerContainer: {
    flex: 1,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  pickerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  projectDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  pickerItemText: {
    fontSize: 15,
    fontWeight: '500',
  },

  // ─── Add Task modal ───
  addTaskBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  addTaskCard: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    maxHeight: '85%',
  },
  addTaskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  addTaskTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  addTaskLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 6,
    marginBottom: 8,
  },
  addTaskInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 14,
  },
  addTaskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  addTaskRowText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  dateRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  dateChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateChipLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  dateChipValue: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 1,
  },
  dateRangeHint: {
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 14,
    marginTop: 2,
  },
  addTaskActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  addTaskBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTaskBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },

  // ─── Date picker overlay (inside Add Task modal) ───
  datePickerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  datePickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  datePickerHeaderTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  datePickerHeaderText: {
    fontSize: 15,
  },
});
