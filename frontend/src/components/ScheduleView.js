import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
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

export default function ScheduleView({ navigation, role = 'worker', onAddTaskForDate }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [viewMode, setViewMode] = useState('agenda'); // 'agenda' | 'month'
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
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
  viewToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    padding: 3,
  },
  viewToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 6,
  },
  // Active state: slightly wider padding + shadow so the pill visibly
  // grows vs the inactive side. Label only appears when active.
  viewToggleBtnActive: {
    paddingHorizontal: 14,
    paddingVertical: 8,
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
});
