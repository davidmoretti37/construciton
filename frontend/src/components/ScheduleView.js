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
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getColors, LightColors, Spacing, BorderRadius, FontSizes } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { fetchTasksForWorkerDateRange, fetchTasksForDateRange, fetchProjectPhases, getCurrentUserId } from '../utils/storage';
import { getProjectColor } from '../utils/calendarUtils';
import AgendaView from './schedule/AgendaView';
import MonthGridView from './schedule/MonthGridView';

const STORAGE_KEY_VIEW_MODE = 'schedule.viewMode.v1';
const STORAGE_KEY_STATUS = 'schedule.statusFilter.v1';

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'done', label: 'Done' },
];

export default function ScheduleView({ navigation, role = 'worker', onAddTaskForDate }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [viewMode, setViewMode] = useState('agenda'); // 'agenda' | 'month'
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  // Hydrate persisted UI state on mount
  useEffect(() => {
    (async () => {
      try {
        const [savedView, savedStatus] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY_VIEW_MODE),
          AsyncStorage.getItem(STORAGE_KEY_STATUS),
        ]);
        if (savedView === 'agenda' || savedView === 'month') setViewMode(savedView);
        if (savedStatus && STATUS_FILTERS.some((s) => s.id === savedStatus)) setStatusFilter(savedStatus);
      } catch (_) { /* AsyncStorage hydration is best-effort */ }
    })();
  }, []);

  // Debounce search to avoid filtering on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const persistViewMode = useCallback((mode) => {
    setViewMode(mode);
    AsyncStorage.setItem(STORAGE_KEY_VIEW_MODE, mode).catch(() => {});
  }, []);

  const persistStatus = useCallback((id) => {
    setStatusFilter(id);
    AsyncStorage.setItem(STORAGE_KEY_STATUS, id).catch(() => {});
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

        if (projectIds.length > 0) {
          const { data: projectData } = await supabase
            .from('projects')
            .select('id, name, status, working_days, non_working_dates')
            .in('id', projectIds)
            .neq('status', 'archived');
          setProjects(projectData || []);
        }

        const start = new Date();
        start.setDate(start.getDate() - 7);
        const end = new Date();
        end.setDate(end.getDate() + 365);
        const startStr = formatDate(start);
        const endStr = formatDate(end);

        const taskData = await fetchTasksForWorkerDateRange(worker.owner_id, startStr, endStr, projectIds);
        setTasks(taskData || []);
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
    const { data: projectData } = await supabase
      .from('projects')
      .select('id, name, status, start_date, end_date, working_days, non_working_dates')
      .eq('user_id', userId)
      .neq('status', 'archived')
      .order('name');
    setProjects(projectData || []);

    const start = new Date();
    start.setDate(start.getDate() - 7);
    const end = new Date();
    end.setDate(end.getDate() + 365);
    const startStr = formatDate(start);
    const endStr = formatDate(end);

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

  // Compute today / week boundaries once per filter pass
  const filteredTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDate(today);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = formatDate(weekEnd);

    return tasks.filter((t) => {
      // Project filter
      if (selectedProject && t.project_id !== selectedProject.id) return false;

      // Search filter (title, project name, description)
      if (debouncedSearch) {
        const hay = `${t.title || ''} ${t.projects?.name || ''} ${t.description || ''}`.toLowerCase();
        if (!hay.includes(debouncedSearch)) return false;
      }

      // Status / range filter
      const start = t.start_date;
      const end = t.end_date || t.start_date;
      if (!start) return statusFilter === 'all' || statusFilter === 'done';

      const isDone = t.status === 'done' || t.status === 'completed';

      switch (statusFilter) {
        case 'today':
          return start <= todayStr && end >= todayStr && !isDone;
        case 'week':
          return start <= weekEndStr && end >= todayStr && !isDone;
        case 'overdue':
          return end < todayStr && !isDone;
        case 'done':
          return isDone;
        case 'all':
        default:
          return true;
      }
    });
  }, [tasks, selectedProject, debouncedSearch, statusFilter]);

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

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Search bar */}
      <View style={[styles.searchBar, { backgroundColor: Colors.lightGray }]}>
        <Ionicons name="search" size={16} color={Colors.secondaryText} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search tasks…"
          placeholderTextColor={Colors.placeholderText}
          style={[styles.searchInput, { color: Colors.primaryText }]}
          returnKeyType="search"
          autoCorrect={false}
        />
        {searchQuery !== '' && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={16} color={Colors.secondaryText} />
          </TouchableOpacity>
        )}
      </View>

      {/* Chip row: status filters + project chip + view toggle */}
      <View style={styles.chipRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipScroll}
        >
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.id;
            return (
              <TouchableOpacity
                key={f.id}
                onPress={() => persistStatus(f.id)}
                activeOpacity={0.7}
                style={[
                  styles.chip,
                  { backgroundColor: active ? Colors.primaryBlue : Colors.lightGray },
                ]}
              >
                <Text style={[
                  styles.chipText,
                  { color: active ? Colors.white : Colors.primaryText },
                ]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Project picker chip */}
          <TouchableOpacity
            onPress={() => setShowProjectPicker(true)}
            activeOpacity={0.7}
            style={[
              styles.chip,
              styles.projectChip,
              { backgroundColor: selectedProject ? Colors.primaryBlue + '14' : Colors.lightGray, borderColor: selectedProject ? Colors.primaryBlue + '40' : 'transparent' },
            ]}
          >
            {selectedProject ? (
              <View style={[styles.projectChipDot, { backgroundColor: getProjectColor(selectedProject.id) }]} />
            ) : (
              <Ionicons name="folder-open-outline" size={13} color={Colors.secondaryText} style={{ marginRight: 6 }} />
            )}
            <Text
              numberOfLines={1}
              style={[
                styles.chipText,
                { color: selectedProject ? Colors.primaryBlue : Colors.primaryText, maxWidth: 110 },
              ]}
            >
              {selectedProject ? selectedProject.name : 'All projects'}
            </Text>
            <Ionicons
              name="chevron-down"
              size={12}
              color={selectedProject ? Colors.primaryBlue : Colors.secondaryText}
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>
        </ScrollView>

        {/* View toggle — icon buttons */}
        <View style={[styles.viewToggle, { backgroundColor: Colors.lightGray }]}>
          <TouchableOpacity
            onPress={() => persistViewMode('agenda')}
            style={[styles.viewToggleBtn, viewMode === 'agenda' && { backgroundColor: Colors.white, shadowOpacity: 0.06 }]}
            activeOpacity={0.7}
          >
            <Ionicons
              name="list"
              size={16}
              color={viewMode === 'agenda' ? Colors.primaryBlue : Colors.secondaryText}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => persistViewMode('month')}
            style={[styles.viewToggleBtn, viewMode === 'month' && { backgroundColor: Colors.white, shadowOpacity: 0.06 }]}
            activeOpacity={0.7}
          >
            <Ionicons
              name="grid"
              size={15}
              color={viewMode === 'month' ? Colors.primaryBlue : Colors.secondaryText}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* View Content */}
      {viewMode === 'agenda' ? (
        <AgendaView
          tasks={filteredTasks}
          theme={Colors}
          scrollToDate={selectedDate}
          onAddTaskForDate={role !== 'worker' ? onAddTaskForDate : undefined}
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: BorderRadius.sm,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    paddingVertical: 0,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 12,
    marginBottom: 6,
    gap: 8,
  },
  chipScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  projectChip: {
    paddingHorizontal: 10,
  },
  projectChipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: BorderRadius.sm,
    padding: 2,
    marginLeft: 4,
  },
  viewToggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0,
    shadowRadius: 2,
    elevation: 0,
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
});
