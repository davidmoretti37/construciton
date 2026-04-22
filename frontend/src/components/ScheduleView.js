import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { fetchTasksForWorkerDateRange, fetchTasksForDateRange, fetchProjectPhases, getCurrentUserId } from '../utils/storage';
import { getProjectColor } from '../utils/calendarUtils';
import AgendaView from './schedule/AgendaView';
import MonthGridView from './schedule/MonthGridView';

export default function ScheduleView({ navigation, role = 'worker' }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [viewMode, setViewMode] = useState('agenda'); // 'agenda' | 'month'
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null); // null = All Projects
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const userId = await getCurrentUserId();
      if (!userId) return;

      if (role === 'worker') {
        // Worker: get assigned projects + tasks
        const { data: worker } = await supabase
          .from('workers')
          .select('id, owner_id')
          .eq('user_id', userId)
          .single();

        if (!worker) {
          // Owner viewing as worker fallback
          await loadOwnerData(userId);
          return;
        }

        const { data: assignments } = await supabase
          .from('project_assignments')
          .select('project_id')
          .eq('worker_id', worker.id);

        const projectIds = (assignments || []).map((a) => a.project_id).filter(Boolean);

        // Load projects for picker
        if (projectIds.length > 0) {
          const { data: projectData } = await supabase
            .from('projects')
            .select('id, name, status')
            .in('id', projectIds)
            .neq('status', 'archived');
          setProjects(projectData || []);
        }

        // Load tasks for 60-day window
        const start = new Date();
        start.setDate(start.getDate() - 7); // 1 week back
        const end = new Date();
        end.setDate(end.getDate() + 53); // ~2 months forward
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
    // Owner: get all projects and tasks
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
    end.setDate(end.getDate() + 53);
    const startStr = formatDate(start);
    const endStr = formatDate(end);

    // Try worker_tasks first (populated by AI distribution)
    const taskData = await fetchTasksForDateRange(startStr, endStr);

    if (taskData && taskData.length > 0) {
      setTasks(taskData);
      return;
    }

    // Fallback: build tasks from project_phases.tasks (JSONB)
    // Distribute tasks across working days within each phase
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

          // Collect working days within this phase
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

          // Distribute tasks evenly across available days
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

  // Filter tasks by selected project
  const filteredTasks = useMemo(() => {
    if (!selectedProject) return tasks;
    return tasks.filter((t) => t.project_id === selectedProject.id);
  }, [tasks, selectedProject]);

  // Handlers
  const handleDayPress = (dateStr) => {
    setSelectedDate(dateStr);
    setViewMode('agenda');
  };

  const handleTaskPress = (task) => {
    // Open TaskDetailModal via navigation or direct modal
    if (navigation) {
      // The parent screen handles TaskDetailModal
    }
  };

  const handleMonthChange = (direction) => {
    setCurrentMonth((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + direction);
      return next;
    });
  };

  const handleSelectProject = (project) => {
    setSelectedProject(project);
    setShowProjectPicker(false);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Project Selector */}
      <TouchableOpacity
        style={[styles.projectSelector, { backgroundColor: Colors.white, borderColor: Colors.border }]}
        onPress={() => setShowProjectPicker(true)}
        activeOpacity={0.7}
      >
        <View style={styles.projectSelectorLeft}>
          {selectedProject && (
            <View style={[styles.projectDot, { backgroundColor: getProjectColor(selectedProject.id) }]} />
          )}
          <Text style={[styles.projectSelectorText, { color: Colors.primaryText }]} numberOfLines={1}>
            {selectedProject ? selectedProject.name : 'All Projects'}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={Colors.secondaryText} />
      </TouchableOpacity>

      {/* View Toggle */}
      <View style={[styles.viewToggle, { backgroundColor: Colors.lightGray }]}>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'agenda' && { backgroundColor: Colors.white }]}
          onPress={() => setViewMode('agenda')}
        >
          <Text style={[styles.toggleText, { color: viewMode === 'agenda' ? Colors.primaryBlue : Colors.secondaryText }]}>
            Agenda
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'month' && { backgroundColor: Colors.white }]}
          onPress={() => setViewMode('month')}
        >
          <Text style={[styles.toggleText, { color: viewMode === 'month' ? Colors.primaryBlue : Colors.secondaryText }]}>
            Month
          </Text>
        </TouchableOpacity>
      </View>

      {/* Month Navigation (only in month view) */}
      {viewMode === 'month' && (
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => handleMonthChange(-1)} style={styles.monthNavBtn}>
            <Ionicons name="chevron-back" size={20} color={Colors.primaryText} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => {
            setCurrentMonth(new Date());
            setSelectedDate(formatDate(new Date()));
          }}>
            <Text style={[styles.monthTitle, { color: Colors.primaryText }]}>
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleMonthChange(1)} style={styles.monthNavBtn}>
            <Ionicons name="chevron-forward" size={20} color={Colors.primaryText} />
          </TouchableOpacity>
        </View>
      )}

      {/* View Content */}
      {viewMode === 'agenda' ? (
        <AgendaView
          tasks={filteredTasks}
          theme={Colors}
          onTaskPress={handleTaskPress}
          scrollToDate={selectedDate}
        />
      ) : (
        <MonthGridView
          currentMonth={currentMonth}
          tasks={filteredTasks}
          theme={Colors}
          onDayPress={handleDayPress}
          selectedDate={selectedDate}
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
    // Reserve space for the floating bottom tab bar so the last week row
    // is fully visible instead of sitting under the pill.
    paddingBottom: 100,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  projectSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  projectDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  projectSelectorText: {
    fontSize: 15,
    fontWeight: '600',
  },
  viewToggle: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    padding: 3,
  },
  toggleButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  monthNavBtn: {
    padding: 4,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
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
  pickerItemText: {
    fontSize: 15,
    fontWeight: '500',
  },
});
