import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchTasksForWorker, completeTask, uncompleteTask, getCurrentUserId } from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import WeeklyCalendar from '../../components/WeeklyCalendar';
import TaskMoveModal from '../../components/TaskMoveModal';

export default function WorkerScheduleScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workerId, setWorkerId] = useState(null);
  const [ownerId, setOwnerId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tasks, setTasks] = useState([]);
  const [taskDates, setTaskDates] = useState([]);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);

  // Load worker data on mount
  useEffect(() => {
    loadWorkerData();
  }, []);

  // Load tasks when date changes
  useEffect(() => {
    if (ownerId) {
      loadTasks();
    }
  }, [selectedDate, ownerId]);

  const loadWorkerData = async () => {
    try {
      setLoading(true);
      const currentUserId = await getCurrentUserId();

      // Get worker ID and owner ID
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
    } catch (error) {
      console.error('Error loading worker data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    try {
      // Format date as YYYY-MM-DD
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      const data = await fetchTasksForWorker(ownerId, dateString);
      setTasks(data || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTasks();
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
          setTasks(prev => prev.map(t =>
            t.id === task.id ? { ...t, status: 'pending', completed_at: null, completed_by: null } : t
          ));
        }
      } else {
        const result = await completeTask(task.id, workerId);
        if (result) {
          setTasks(prev => prev.map(t =>
            t.id === task.id ? { ...t, status: 'completed', completed_at: new Date().toISOString(), completed_by: workerId } : t
          ));
        }
      }
    } catch (error) {
      console.error('Error toggling task:', error);
    }
  };

  const handleLongPressTask = (task) => {
    setSelectedTask(task);
    setMoveModalVisible(true);
  };

  const handleTaskMoved = () => {
    loadTasks();
  };

  const formatDateHeader = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);

    if (selected.getTime() === today.getTime()) {
      return "Today's Tasks";
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (selected.getTime() === tomorrow.getTime()) {
      return "Tomorrow's Tasks";
    }

    return selectedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    });
  };

  // Group tasks by project
  const groupedTasks = tasks.reduce((acc, task) => {
    const projectName = task.projects?.name || 'Unknown Project';
    if (!acc[projectName]) {
      acc[projectName] = [];
    }
    acc[projectName].push(task);
    return acc;
  }, {});

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.topBar, { backgroundColor: Colors.background }]}>
          <Text style={[styles.topBarTitle, { color: Colors.primaryText }]}>Schedule</Text>
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
        <Text style={[styles.topBarTitle, { color: Colors.primaryText }]}>Schedule</Text>
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
        {/* Weekly Calendar */}
        <View style={[styles.calendarCard, { backgroundColor: Colors.white }]}>
          <WeeklyCalendar
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            theme={{
              primaryBlue: Colors.primaryBlue,
              primaryText: Colors.primaryText,
              secondaryText: Colors.secondaryText,
              white: Colors.white,
              border: Colors.border,
            }}
            eventDates={taskDates}
          />
        </View>

        {/* Tasks Section */}
        <View style={styles.tasksSection}>
          <View style={styles.tasksSectionHeader}>
            <Ionicons name="checkbox-outline" size={22} color={Colors.primaryBlue} />
            <Text style={[styles.tasksSectionTitle, { color: Colors.primaryText }]}>
              {formatDateHeader()}
            </Text>
            {tasks.length > 0 && (
              <View style={[styles.taskCountBadge, { backgroundColor: Colors.primaryBlue }]}>
                <Text style={styles.taskCountText}>{tasks.length}</Text>
              </View>
            )}
          </View>

          {tasks.length === 0 ? (
            <View style={[styles.emptyState, { backgroundColor: Colors.white }]}>
              <Ionicons name="calendar-outline" size={48} color={Colors.secondaryText} />
              <Text style={[styles.emptyStateTitle, { color: Colors.primaryText }]}>
                No tasks scheduled
              </Text>
              <Text style={[styles.emptyStateSubtext, { color: Colors.secondaryText }]}>
                Check back later or select a different day
              </Text>
            </View>
          ) : (
            Object.entries(groupedTasks).map(([projectName, projectTasks]) => (
              <View key={projectName} style={styles.projectGroup}>
                <View style={[styles.projectHeader, { backgroundColor: Colors.white, borderLeftWidth: 4, borderLeftColor: Colors.primaryBlue, borderWidth: 1, borderColor: Colors.border }]}>
                  <Ionicons name="business-outline" size={18} color={Colors.primaryBlue} />
                  <Text style={[styles.projectName, { color: Colors.primaryText }]}>
                    {projectName}
                  </Text>
                </View>

                <View style={[styles.tasksList, { backgroundColor: Colors.white }]}>
                  {projectTasks.map((task, index) => (
                    <TouchableOpacity
                      key={task.id}
                      style={[
                        styles.taskItem,
                        { borderBottomColor: Colors.border },
                        index === projectTasks.length - 1 && { borderBottomWidth: 0 }
                      ]}
                      onPress={() => handleToggleTask(task)}
                      onLongPress={() => handleLongPressTask(task)}
                      delayLongPress={400}
                      activeOpacity={0.7}
                    >
                      <View style={styles.taskCheckbox}>
                        <Ionicons
                          name={task.status === 'completed' ? 'checkbox' : 'square-outline'}
                          size={24}
                          color={task.status === 'completed' ? Colors.successGreen : Colors.secondaryText}
                        />
                      </View>
                      <View style={styles.taskContent}>
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
                        {task.start_date !== task.end_date && (
                          <View style={styles.taskMeta}>
                            <Ionicons name="calendar-outline" size={12} color={Colors.secondaryText} />
                            <Text style={[styles.taskMetaText, { color: Colors.secondaryText }]}>
                              Due {new Date(task.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

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
  calendarCard: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tasksSection: {
    marginTop: 8,
  },
  tasksSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  tasksSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  taskCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  taskCountText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  projectGroup: {
    marginBottom: 16,
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 25,
    borderRadius: 14,
    marginBottom: 0,
  },
  projectName: {
    fontSize: 16,
    fontWeight: '600',
  },
  tasksList: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderBottomWidth: 1,
  },
  taskCheckbox: {
    marginRight: 12,
    marginTop: 2,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  taskDescription: {
    fontSize: 14,
    marginTop: 4,
    lineHeight: 20,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  taskMetaText: {
    fontSize: 12,
  },
});
