import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import { LightColors, getColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchTasksForWorker, fetchTasksForWorkerDateRange, completeTask, uncompleteTask, getCurrentUserId } from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import AppleCalendarMonth from '../../components/AppleCalendarMonth';
import TaskMoveModal from '../../components/TaskMoveModal';
import TaskDetailModal from '../../components/TaskDetailModal';

export default function WorkerScheduleScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('workers');

  const [loading, setLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [workerId, setWorkerId] = useState(null);
  const [ownerId, setOwnerId] = useState(null);
  const [assignedProjectIds, setAssignedProjectIds] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [monthTasks, setMonthTasks] = useState([]);
  const [dayTasks, setDayTasks] = useState([]);
  const [expandedProjects, setExpandedProjects] = useState({});
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showTaskDetailModal, setShowTaskDetailModal] = useState(false);
  const [detailTask, setDetailTask] = useState(null);
  const [dayVisits, setDayVisits] = useState([]);

  // Load worker data on mount
  useEffect(() => {
    loadWorkerData();
  }, []);

  // Load month data when month changes or assignments load
  useEffect(() => {
    if (ownerId && assignedProjectIds) {
      loadMonthData(currentMonth);
    }
  }, [currentMonth, ownerId, assignedProjectIds]);

  // Filter day tasks when selected date or month tasks change
  useEffect(() => {
    if (monthTasks.length > 0 || (ownerId && assignedProjectIds)) {
      filterDayTasks(selectedDate, monthTasks);
    }
  }, [selectedDate, monthTasks]);

  // Refresh when screen gains focus
  useFocusEffect(
    useCallback(() => {
      if (ownerId && assignedProjectIds) {
        loadMonthData(currentMonth);
      }
    }, [ownerId, currentMonth, assignedProjectIds])
  );

  const loadWorkerData = async () => {
    try {
      setLoading(true);
      const currentUserId = await getCurrentUserId();

      const { data: workerData, error: workerError } = await supabase
        .from('workers')
        .select('id, owner_id')
        .eq('user_id', currentUserId)
        .single();

      if (workerError || !workerData) {
        console.error('Error fetching worker:', workerError);
        setLoading(false);
        return;
      }

      setWorkerId(workerData.id);
      setOwnerId(workerData.owner_id);

      const { data: assignments } = await supabase
        .from('project_assignments')
        .select('project_id')
        .eq('worker_id', workerData.id);
      setAssignedProjectIds((assignments || []).map(a => a.project_id));
    } catch (error) {
      console.error('Error loading worker data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadMonthData = async (monthDate) => {
    try {
      setScheduleLoading(true);
      const yr = monthDate.getFullYear();
      const mo = monthDate.getMonth();
      const monthStart = `${yr}-${String(mo + 1).padStart(2, '0')}-01`;
      const lastDay = new Date(yr, mo + 1, 0).getDate();
      const monthEnd = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const tasks = await fetchTasksForWorkerDateRange(ownerId, monthStart, monthEnd, assignedProjectIds);
      setMonthTasks(tasks || []);
      filterDayTasks(selectedDate, tasks || []);
    } catch (error) {
      console.error('Error loading month data:', error);
    } finally {
      setScheduleLoading(false);
    }
  };

  const filterDayTasks = (date, mTasks) => {
    const yr = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const dy = String(date.getDate()).padStart(2, '0');
    const dateString = `${yr}-${mo}-${dy}`;

    const filtered = (mTasks || monthTasks).filter(task => {
      if (task.start_date > dateString || task.end_date < dateString) return false;
      const project = task.projects;
      if (!project) return true;
      const workingDays = project.working_days || [1, 2, 3, 4, 5];
      const nonWorkingDates = project.non_working_dates || [];
      if (nonWorkingDates.includes(dateString)) return false;
      const dateObj = new Date(dateString + 'T00:00:00');
      const jsDay = dateObj.getDay();
      const isoDay = jsDay === 0 ? 7 : jsDay;
      return workingDays.includes(isoDay);
    });

    setDayTasks(filtered);
    // Auto-expand all projects
    const projects = {};
    filtered.forEach(task => {
      const name = task.projects?.name || 'Unknown Project';
      projects[name] = true;
    });
    setExpandedProjects(projects);

    // Fetch service visits for this day
    if (workerId) {
      supabase
        .from('service_visits')
        .select('id, scheduled_date, scheduled_time, status, started_at, completed_at, service_locations(id, name, address, latitude, longitude, access_notes), service_plans(name)')
        .eq('scheduled_date', dateString)
        .eq('assigned_worker_id', workerId)
        .order('scheduled_time', { ascending: true })
        .then(({ data }) => setDayVisits(data || []))
        .catch(() => setDayVisits([]));
    } else {
      // Also fetch visits assigned to the owner (for owner-operators)
      supabase
        .from('service_visits')
        .select('id, scheduled_date, scheduled_time, status, started_at, completed_at, service_locations(id, name, address, latitude, longitude, access_notes), service_plans(name)')
        .eq('scheduled_date', dateString)
        .order('scheduled_time', { ascending: true })
        .then(({ data }) => setDayVisits(data || []))
        .catch(() => setDayVisits([]));
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMonthData(currentMonth);
    setRefreshing(false);
  };

  const handleDateSelect = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    setSelectedDate(new Date(year, month - 1, day));
  };

  const handleToggleTask = async (task) => {
    try {
      if (task.status === 'completed') {
        const result = await uncompleteTask(task.id);
        if (result) {
          const update = t => ({ ...t, status: 'pending', completed_at: null, completed_by: null });
          setDayTasks(prev => prev.map(t => t.id === task.id ? update(t) : t));
          setMonthTasks(prev => prev.map(t => t.id === task.id ? update(t) : t));
        }
      } else {
        const result = await completeTask(task.id, workerId);
        if (result) {
          const update = t => ({ ...t, status: 'completed', completed_at: new Date().toISOString(), completed_by: workerId });
          setDayTasks(prev => prev.map(t => t.id === task.id ? update(t) : t));
          setMonthTasks(prev => prev.map(t => t.id === task.id ? update(t) : t));
        }
      }
    } catch (error) {
      console.error('Error toggling task:', error);
    }
  };

  const handleMoveTask = (task) => {
    setSelectedTask(task);
    setMoveModalVisible(true);
  };

  const handleTaskMoved = () => {
    loadMonthData(currentMonth);
  };

  const handleToggleVisit = async (visit) => {
    const newStatus = visit.status === 'completed' ? 'scheduled' : 'completed';
    setDayVisits(prev => prev.map(v => v.id === visit.id ? { ...v, status: newStatus } : v));
    try {
      await supabase.from('service_visits').update({
        status: newStatus,
        completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        started_at: newStatus === 'completed' && !visit.started_at ? new Date().toISOString() : visit.started_at,
      }).eq('id', visit.id);

      // Trigger rolling visit regeneration if completed
      if (newStatus === 'completed' && visit.service_plans?.name) {
        const visitId = visit.id.replace('visit-', '');
        const { data: v } = await supabase.from('service_visits').select('service_plan_id').eq('id', visitId).single();
        if (v?.service_plan_id) {
          const { EXPO_PUBLIC_BACKEND_URL } = require('@env');
          const { data: { session } } = await supabase.auth.getSession();
          fetch(`${EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000'}/api/service-visits/generate/${v.service_plan_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify({ weeksAhead: 8 }),
          }).catch(() => {});
        }
      }
    } catch (e) {
      setDayVisits(prev => prev.map(v => v.id === visit.id ? { ...v, status: visit.status } : v));
    }
  };

  // Group day tasks by project
  const groupedTasks = dayTasks.reduce((acc, task) => {
    const projectName = task.projects?.name || 'Unknown Project';
    if (!acc[projectName]) acc[projectName] = [];
    acc[projectName].push(task);
    return acc;
  }, {});

  const selectedDateString = (() => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  })();

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.topBar, { backgroundColor: Colors.background }]}>
          <Text style={[styles.topBarTitle, { color: Colors.primaryText }]}>{t('schedule.title')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={22} color={Colors.primaryText} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.background }]}>
        <Text style={[styles.topBarTitle, { color: Colors.primaryText }]}>{t('schedule.title')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Ionicons name="settings-outline" size={22} color={Colors.primaryText} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryBlue} />
        }
      >
        {/* Month Calendar */}
        <View style={[styles.calendarContainer, { backgroundColor: Colors.white }]}>
          <AppleCalendarMonth
            currentMonth={currentMonth}
            selectedDate={selectedDateString}
            onDateSelect={handleDateSelect}
            onMonthChange={(newMonth) => setCurrentMonth(newMonth)}
            tasks={monthTasks}
            events={[]}
            theme={{
              primaryBlue: Colors.primaryBlue,
              primaryText: Colors.primaryText,
              secondaryText: Colors.secondaryText,
              white: Colors.white,
              border: Colors.border,
              lightGray: Colors.lightGray,
              errorRed: Colors.errorRed,
            }}
          />
        </View>

        {/* Day Detail Section */}
        <View style={styles.dayDetailSection}>
          {/* Date Header */}
          <Text style={[styles.dayDetailDate, { color: Colors.primaryText }]}>
            {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>

          {/* Loading */}
          {scheduleLoading && (
            <View style={{ paddingTop: 16 }}>
              <ActivityIndicator size="small" color={Colors.primaryBlue} />
            </View>
          )}

          {/* Tasks Section */}
          {!scheduleLoading && (
            <View style={styles.scheduleCategory}>
              <Text style={[styles.categoryLabel, { color: Colors.warningOrange }]}>
                Tasks
              </Text>

              {dayTasks.length === 0 ? (
                <View style={[styles.emptyState, { backgroundColor: Colors.white }]}>
                  <Ionicons name="calendar-outline" size={64} color={Colors.secondaryText} />
                  <Text style={[styles.emptyStateTitle, { color: Colors.primaryText }]}>
                    {t('schedule.noTasksScheduled', 'Nothing Scheduled')}
                  </Text>
                  <Text style={[styles.emptyStateSubtext, { color: Colors.secondaryText }]}>
                    {t('schedule.checkBackLater', 'No tasks scheduled for this day')}
                  </Text>
                </View>
              ) : (
                Object.entries(groupedTasks).map(([projectName, tasks]) => {
                  const isExpanded = expandedProjects[projectName];
                  const completedCount = tasks.filter(t => t.status === 'completed').length;
                  return (
                    <View key={projectName} style={styles.projectGroup}>
                      <TouchableOpacity
                        style={[styles.projectHeader, { backgroundColor: Colors.white, borderLeftWidth: 4, borderLeftColor: Colors.warningOrange, borderWidth: 1, borderColor: Colors.border }]}
                        onPress={() => setExpandedProjects(prev => ({ ...prev, [projectName]: !prev[projectName] }))}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="business-outline" size={18} color={Colors.warningOrange} />
                        <Text style={[styles.projectName, { color: Colors.primaryText }]} numberOfLines={1}>
                          {projectName}
                        </Text>
                        <Text style={{ color: Colors.secondaryText, fontSize: 13, fontWeight: '500', marginRight: 8 }}>
                          {completedCount}/{tasks.length}
                        </Text>
                        <Ionicons
                          name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                          size={20}
                          color={Colors.secondaryText}
                        />
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={[styles.tasksDropdown, { backgroundColor: (Colors.lightGray || '#F3F4F6') + '40' }]}>
                          {tasks.map((task) => (
                            <TouchableOpacity
                              key={task.id}
                              activeOpacity={0.7}
                              onPress={() => {
                                setDetailTask(task);
                                setShowTaskDetailModal(true);
                              }}
                              onLongPress={() => handleMoveTask(task)}
                              delayLongPress={400}
                              style={[styles.taskCard, { backgroundColor: Colors.white, borderLeftColor: Colors.warningOrange }]}
                            >
                              <View style={styles.taskCardContent}>
                                <TouchableOpacity
                                  style={styles.taskCheckbox}
                                  onPress={() => handleToggleTask(task)}
                                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                  <Ionicons
                                    name={task.status === 'completed' ? 'checkbox' : task.status === 'incomplete' ? 'close-circle' : 'square-outline'}
                                    size={22}
                                    color={task.status === 'completed' ? Colors.successGreen : task.status === 'incomplete' ? Colors.errorRed : Colors.secondaryText}
                                  />
                                </TouchableOpacity>
                                <View style={styles.taskDetails}>
                                  <Text style={[
                                    styles.taskTitle,
                                    { color: Colors.primaryText },
                                    task.status === 'completed' && { textDecorationLine: 'line-through', color: Colors.secondaryText }
                                  ]}>
                                    {task.title}
                                  </Text>
                                  {task.description && (
                                    <Text style={[styles.taskDescription, { color: Colors.secondaryText }]} numberOfLines={2}>
                                      {task.description}
                                    </Text>
                                  )}
                                  <View style={styles.taskMeta}>
                                    {task.start_date !== task.end_date && (
                                      <View style={[styles.taskDateBadge, { backgroundColor: Colors.lightGray || '#F3F4F6' }]}>
                                        <Ionicons name="calendar-outline" size={12} color={Colors.secondaryText} />
                                        <Text style={[styles.taskDateText, { color: Colors.secondaryText }]}>
                                          {new Date(task.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                          {' - '}
                                          {new Date(task.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </Text>
                                      </View>
                                    )}
                                    {task.status === 'incomplete' && task.incomplete_reason && (
                                      <View style={[styles.taskIncompleteBadge, { backgroundColor: Colors.errorRed + '15' }]}>
                                        <Ionicons name="alert-circle" size={12} color={Colors.errorRed} />
                                        <Text style={{ fontSize: 11, color: Colors.errorRed }} numberOfLines={1}>
                                          {task.incomplete_reason}
                                        </Text>
                                      </View>
                                    )}
                                  </View>
                                </View>
                                {/* Move action */}
                                <TouchableOpacity
                                  style={styles.taskActionButton}
                                  onPress={() => handleMoveTask(task)}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Ionicons name="swap-horizontal-outline" size={18} color={Colors.primaryBlue} />
                                </TouchableOpacity>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* Visits Section */}
          {!scheduleLoading && dayVisits.length > 0 && (
            <View style={styles.scheduleCategory}>
              <Text style={[styles.categoryLabel, { color: '#059669' }]}>
                Service Visits
              </Text>
              {dayVisits.map((visit) => (
                <TouchableOpacity
                  key={visit.id}
                  style={[styles.taskCard, { backgroundColor: Colors.white, borderLeftColor: '#059669', borderLeftWidth: 3, borderWidth: 1, borderColor: Colors.border }]}
                  onPress={() => navigation.navigate('VisitDetail', { visit })}
                  activeOpacity={0.7}
                >
                  <View style={styles.taskCardContent}>
                    <TouchableOpacity
                      style={styles.taskStatusIcon}
                      onPress={() => handleToggleVisit(visit)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons
                        name={visit.status === 'completed' ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={visit.status === 'completed' ? '#059669' : Colors.secondaryText}
                      />
                    </TouchableOpacity>
                    <View style={styles.taskDetails}>
                      <Text style={[
                        styles.taskTitle,
                        { color: Colors.primaryText },
                        visit.status === 'completed' && { textDecorationLine: 'line-through', color: Colors.secondaryText }
                      ]}>
                        {visit.service_locations?.name || 'Visit'}
                      </Text>
                      <Text style={{ fontSize: 12, color: Colors.secondaryText, marginTop: 2 }} numberOfLines={1}>
                        {visit.service_locations?.address}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                        <View style={{ backgroundColor: '#05966915', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontSize: 11, color: '#059669', fontWeight: '600' }}>
                            {visit.service_plans?.name || 'Service'}
                          </Text>
                        </View>
                        {visit.scheduled_time && (
                          <Text style={{ fontSize: 11, color: Colors.secondaryText }}>
                            {visit.scheduled_time}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Task Detail Modal */}
      <TaskDetailModal
        visible={showTaskDetailModal}
        task={detailTask}
        onClose={() => {
          setShowTaskDetailModal(false);
          setDetailTask(null);
        }}
        canComplete={true}
        onToggleComplete={(task) => {
          handleToggleTask(task);
          setShowTaskDetailModal(false);
          setDetailTask(null);
        }}
      />

      {/* Task Move Modal */}
      <TaskMoveModal
        visible={moveModalVisible}
        onClose={() => {
          setMoveModalVisible(false);
          setSelectedTask(null);
        }}
        task={selectedTask}
        onTaskMoved={handleTaskMoved}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.5,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  calendarContainer: {
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  dayDetailSection: {
    marginTop: 16,
    marginBottom: 20,
  },
  dayDetailDate: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  scheduleCategory: {
    marginBottom: 16,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  projectGroup: {
    marginBottom: 12,
    borderRadius: 14,
    overflow: 'hidden',
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
  },
  projectName: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  tasksDropdown: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
  taskCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    borderLeftWidth: 3,
  },
  taskCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  taskCheckbox: {
    marginRight: 10,
    marginTop: 1,
  },
  taskDetails: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  taskDescription: {
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
  taskMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  taskDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  taskDateText: {
    fontSize: 11,
    fontWeight: '500',
  },
  taskIncompleteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  taskActionButton: {
    padding: 6,
    marginLeft: 4,
  },
});
