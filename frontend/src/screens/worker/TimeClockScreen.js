import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getActiveClockIn,
  clockIn,
  clockOut,
  getCurrentUserId,
  getWorkerTimesheet,
  fetchTasksForProject,
  fetchUpcomingTasks,
  completeTask,
  uncompleteTask,
  markTaskIncomplete,
  getOverdueTasks,
} from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import WorkerInviteHandler from '../../components/WorkerInviteHandler';
import IncompleteTasksModal from '../../components/IncompleteTasksModal';
import { formatHoursMinutes } from '../../utils/calculations';
import NotificationBell from '../../components/NotificationBell';

export default function TimeClockScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workerId, setWorkerId] = useState(null);
  const [ownerId, setOwnerId] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [clockOutNotes, setClockOutNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [recentEntries, setRecentEntries] = useState([]);
  const [totalHoursToday, setTotalHoursToday] = useState(0);

  // Task state
  const [todayTasks, setTodayTasks] = useState([]);
  const [upcomingTasks, setUpcomingTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showIncompleteTasksModal, setShowIncompleteTasksModal] = useState(false);
  const [pendingOverdueTasks, setPendingOverdueTasks] = useState([]);

  // Load worker data and active session
  useEffect(() => {
    loadWorkerData();
  }, []);

  // Update elapsed time every second when clocked in
  useEffect(() => {
    if (!activeSession) return;

    const interval = setInterval(() => {
      const clockInTime = new Date(activeSession.clock_in);
      const now = new Date();
      const diff = now - clockInTime;

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setElapsedTime(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession]);

  // Load tasks when clocked in
  useEffect(() => {
    if (activeSession && activeSession.project_id) {
      loadTasks(activeSession.project_id);
    } else {
      setTodayTasks([]);
      setUpcomingTasks([]);
    }
  }, [activeSession]);

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

      console.log('Worker data:', workerData);

      setWorkerId(workerData.id);
      setOwnerId(workerData.owner_id);

      // Check for active clock-in session
      const session = await getActiveClockIn(workerData.id);
      setActiveSession(session);

      // Load only projects assigned to this worker
      await loadAssignedProjects(workerData.id);

      // Load recent clock-in history and today's hours
      await loadRecentEntries(workerData.id);
    } catch (error) {
      console.error('Error loading worker data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAssignedProjects = async (wId) => {
    try {
      // Fetch projects
      const { data, error } = await supabase
        .from('project_assignments')
        .select('project_id, projects:project_id (id, name, location, status)')
        .eq('worker_id', wId)
        .not('project_id', 'is', null);

      if (error) {
        console.error('Error fetching assigned projects:', error);
        return;
      }

      const projects = (data || [])
        .map(a => a.projects)
        .filter(Boolean);

      // Fetch service plans
      const { data: spData } = await supabase
        .from('project_assignments')
        .select('service_plan_id, service_plans:service_plan_id (id, name, address, status)')
        .eq('worker_id', wId)
        .not('service_plan_id', 'is', null);

      const plans = (spData || [])
        .map(a => a.service_plans)
        .filter(Boolean)
        .map(p => ({ ...p, isServicePlan: true, location: p.address }));

      const all = [...projects, ...plans].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setAvailableProjects(all);
    } catch (error) {
      console.error('Error loading assigned projects:', error);
    }
  };

  const loadRecentEntries = async (workerId) => {
    try {
      // Get today's start time
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch recent entries (last 5)
      const allEntries = await getWorkerTimesheet(workerId, null);
      setRecentEntries(allEntries.slice(0, 5));

      // Calculate today's total hours
      const todayEntries = allEntries.filter(entry => {
        const entryDate = new Date(entry.clock_in);
        return entryDate >= today;
      });

      const todayHours = todayEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
      setTotalHoursToday(todayHours);
    } catch (error) {
      console.error('Error loading recent entries:', error);
    }
  };

  // Load tasks for the current project
  const loadTasks = async (projectId) => {
    try {
      setTasksLoading(true);

      // Get today's date in YYYY-MM-DD format
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const todayString = `${year}-${month}-${day}`;

      // Fetch today's tasks and upcoming tasks in parallel
      const [todayData, upcomingData] = await Promise.all([
        fetchTasksForProject(projectId, todayString),
        fetchUpcomingTasks(projectId, todayString)
      ]);

      setTodayTasks(todayData || []);
      setUpcomingTasks(upcomingData || []);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setTasksLoading(false);
    }
  };

  // Handle task completion toggle
  const handleToggleTask = async (task) => {
    try {
      if (task.status === 'completed') {
        // Uncomplete the task
        const result = await uncompleteTask(task.id);
        if (result) {
          // Update local state
          setTodayTasks(prev => prev.map(t =>
            t.id === task.id ? { ...t, status: 'pending', completed_at: null, completed_by: null } : t
          ));
        }
      } else {
        // Complete the task
        const result = await completeTask(task.id, workerId);
        if (result) {
          // Update local state
          setTodayTasks(prev => prev.map(t =>
            t.id === task.id ? { ...t, status: 'completed', completed_at: new Date().toISOString(), completed_by: workerId } : t
          ));
        }
      }
    } catch (error) {
      console.error('Error toggling task:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'task' }));
    }
  };

  // Check for overdue tasks before clock out
  const checkOverdueTasks = async () => {
    if (!activeSession) return true;

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayString = `${year}-${month}-${day}`;

    // Filter today's tasks to find those that are overdue (end_date = today AND status = pending)
    const overdue = todayTasks.filter(task =>
      task.end_date === todayString && task.status === 'pending'
    );

    if (overdue.length > 0) {
      setPendingOverdueTasks(overdue);
      setShowIncompleteTasksModal(true);
      return false; // Don't proceed with clock out yet
    }

    return true; // OK to clock out
  };

  // Handle submitting incomplete task reasons
  const handleSubmitIncompleteReasons = async (taskReasons) => {
    try {
      // Mark each task as incomplete with the reason
      for (const { taskId, reason } of taskReasons) {
        await markTaskIncomplete(taskId, workerId, reason);
      }

      // Close modal and proceed with clock out
      setShowIncompleteTasksModal(false);
      setPendingOverdueTasks([]);

      // Actually perform the clock out now
      await performClockOut();
    } catch (error) {
      console.error('Error submitting incomplete reasons:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'reasons' }));
    }
  };

  // Actual clock out logic (extracted from handleClockOut)
  const performClockOut = async () => {
    try {
      setActionLoading(true);

      const result = await clockOut(activeSession.id, clockOutNotes);

      if (result.success) {
        setActiveSession(null);
        setClockOutNotes('');
        setShowClockOutModal(false);
        setTodayTasks([]);
        setUpcomingTasks([]);

        // Show success message with hours worked
        if (result.hours) {
          Alert.alert(
            t('alerts.success'),
            `Hours worked: ${formatHoursMinutes(result.hours)}`
          );
        } else {
          Alert.alert(t('alerts.success'), t('messages.savedSuccessfully', { item: 'clock out' }));
        }

        // Reload data to update history and hours
        await loadWorkerData();
      } else {
        Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'clock out' }));
      }
    } catch (error) {
      console.error('Error clocking out:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'clock out' }));
    } finally {
      setActionLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWorkerData();
    setRefreshing(false);
  };

  // Get location in background and update the time tracking record (non-blocking)
  const getLocationAndUpdate = async (timeTrackingId) => {
    try {
      // Check if we already have permission
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        // Try to request permission
        const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
        if (newStatus !== 'granted') {
          console.log('Location permission not granted');
          return;
        }
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Update the time tracking record with location
      const { error } = await supabase
        .from('time_tracking')
        .update({
          location_lat: currentLocation.coords.latitude,
          location_lng: currentLocation.coords.longitude,
        })
        .eq('id', timeTrackingId);

      if (error) {
        console.error('Failed to update location:', error);
      } else {
        console.log('Location updated successfully:', currentLocation.coords);
      }
    } catch (error) {
      console.log('Background location error (non-critical):', error.message);
    }
  };

  const handleClockIn = async (project) => {
    const projectId = project.isServicePlan ? null : project.id;
    const servicePlanId = project.isServicePlan ? project.id : null;

    try {
      setActionLoading(true);
      setShowProjectPicker(false);

      // Clock in immediately without waiting for location
      const session = await clockIn(workerId, projectId, null, null, servicePlanId);
      console.log('clockIn returned:', session);

      if (session) {
        console.log('Setting activeSession:', session);
        setActiveSession(session);
        Alert.alert(t('alerts.success'), t('messages.savedSuccessfully', { item: 'clock in' }));

        // Get location in background and update the record
        getLocationAndUpdate(session.id);
      } else {
        console.log('clockIn returned null/undefined');
        Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'clock in' }));
      }
    } catch (error) {
      console.error('Error clocking in:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'clock in' }));
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    // First check for overdue tasks
    const canClockOut = await checkOverdueTasks();
    if (!canClockOut) {
      // Modal will be shown, user needs to provide reasons
      return;
    }

    // If no overdue tasks, proceed with clock out
    await performClockOut();
  };

  const formatTime = (dateString) => {
    if (!dateString) return '--';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const handleInvitesComplete = async () => {
    await loadWorkerData();
  };

  const successColor = Colors.success || '#10B981';
  const inactiveColor = Colors.secondaryText;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.topBar, { backgroundColor: Colors.background }]}>
          <Text style={[styles.topBarTitle, { color: Colors.primaryText }]}>Clock</Text>
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
      {/* Minimalist Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.background }]}>
        <Text style={[styles.topBarTitle, { color: Colors.primaryText }]}>Clock</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <NotificationBell onPress={() => navigation.navigate('Notifications')} />
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={22} color={Colors.primaryText} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryBlue} />
        }
      >
        {/* Clock Section */}
        <View style={[styles.clockSection, { backgroundColor: Colors.white }]}>
          {/* Status Display */}
          <View style={styles.statusSection}>
            <View style={[styles.statusDot, { backgroundColor: activeSession ? successColor : inactiveColor }]} />
            <Text style={[styles.statusText, { color: Colors.secondaryText }]}>
              {activeSession ? 'Active' : 'Offline'}
            </Text>
          </View>

          {/* Large Timer Display */}
          <View style={styles.timerContainer}>
            <Text style={[styles.timerText, { color: Colors.primaryText }]}>{activeSession ? elapsedTime : '--:--:--'}</Text>
            {activeSession && (activeSession.projects?.name || activeSession.service_plans?.name) && (
              <Text style={[styles.projectText, { color: Colors.secondaryText }]}>{activeSession.projects?.name || activeSession.service_plans?.name}</Text>
            )}
          </View>

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: Colors.primaryText }]}
            onPress={() => {
              if (activeSession) {
                setShowClockOutModal(true);
              } else {
                if (availableProjects.length === 0) {
                  if (!ownerId) {
                    Alert.alert(
                      t('alerts.warning'),
                      'You haven\'t been assigned to a contractor yet. Ask your contractor to send you an invite, or wait for them to add you to their team.'
                    );
                  } else {
                    Alert.alert(t('alerts.noProjects'), t('emptyStates.noProjectsYet'));
                  }
                } else {
                  setShowProjectPicker(true);
                }
              }
            }}
            disabled={actionLoading}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionButtonText, { color: Colors.white }]}>
              {activeSession ? 'Clock Out' : 'Clock In'}
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={[styles.divider, { backgroundColor: Colors.border }]} />

          {/* Today's Hours */}
          <View style={styles.todayHoursContainer}>
            <Text style={[styles.todayHoursLabel, { color: Colors.secondaryText }]}>Today's Hours</Text>
            <Text style={[styles.todayHoursValue, { color: Colors.primaryText }]}>{formatHoursMinutes(totalHoursToday)}</Text>
          </View>
        </View>

        {/* Quick actions row */}
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: '#F59E0B15', paddingVertical: 12, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
            onPress={() => navigation.navigate('DailyReportForm', { isOwner: false })}
          >
            <Ionicons name="document-text-outline" size={18} color="#F59E0B" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#F59E0B' }}>Daily Report</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: '#10B98115', paddingVertical: 12, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
            onPress={() => navigation.navigate('ExpenseForm')}
          >
            <Ionicons name="receipt-outline" size={18} color="#10B981" />
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#10B981' }}>Add Expense</Text>
          </TouchableOpacity>
        </View>

        {/* Tasks moved to Today's Work tab */}

        {/* Recent History */}
        {recentEntries.length > 0 && (
          <View style={styles.historySection}>
            <Text style={[styles.historySectionTitle, { color: Colors.primaryText }]}>Recent</Text>
            {recentEntries.map((entry) => (
              <View key={entry.id} style={[styles.historyCard, { backgroundColor: Colors.white }]}>
                <View style={styles.historyHeader}>
                  <Text style={[styles.historyDate, { color: Colors.primaryText }]}>{formatDate(entry.clock_in)}</Text>
                  <Text style={[styles.historyHours, { color: Colors.primaryText }]}>{formatHoursMinutes(entry.hours)}</Text>
                </View>
                <Text style={[styles.historyProject, { color: Colors.secondaryText }]}>{entry.projects?.name || entry.service_plans?.name || 'Unknown Project'}</Text>
                <Text style={[styles.historyTime, { color: Colors.secondaryText }]}>
                  {formatTime(entry.clock_in)} - {formatTime(entry.clock_out)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Empty State */}
        {recentEntries.length === 0 && !activeSession && (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={64} color={Colors.border} />
            <Text style={[styles.emptyStateText, { color: Colors.secondaryText }]}>No clock-ins yet</Text>
          </View>
        )}
      </ScrollView>

      {/* Project Picker Modal */}
      <Modal
        visible={showProjectPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProjectPicker(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => setShowProjectPicker(false)}>
              <Text style={[styles.modalCancelText, { color: Colors.primaryText }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Select Project</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {availableProjects.map((project) => (
              <TouchableOpacity
                key={project.id}
                style={[styles.projectOption, { backgroundColor: Colors.white }]}
                onPress={() => handleClockIn(project)}
                disabled={actionLoading}
              >
                <View style={styles.projectOptionContent}>
                  <Ionicons name="briefcase-outline" size={22} color={Colors.primaryText} />
                  <View style={styles.projectOptionText}>
                    <Text style={[styles.projectOptionName, { color: Colors.primaryText }]}>{project.name}</Text>
                    {project.location && (
                      <Text style={[styles.projectOptionLocation, { color: Colors.secondaryText }]}>{project.location}</Text>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Clock Out Modal */}
      <Modal
        visible={showClockOutModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowClockOutModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.modalHeader, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
            <View style={{ width: 60 }} />
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Clock Out</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView style={styles.modalContent} contentContainerStyle={{ flexGrow: 1 }}>
            <View style={styles.clockOutSection}>
              <Text style={[styles.clockOutLabel, { color: Colors.secondaryText }]}>Total Time Worked</Text>
              <Text style={[styles.clockOutTime, { color: Colors.primaryText }]}>{elapsedTime}</Text>
            </View>

            <View style={styles.clockOutSection}>
              <Text style={[styles.clockOutLabel, { color: Colors.secondaryText }]}>Notes (Optional)</Text>
              <TextInput
                style={[styles.notesInput, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                value={clockOutNotes}
                onChangeText={setClockOutNotes}
                placeholder="Add any notes about today's work..."
                placeholderTextColor={Colors.secondaryText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Bottom Buttons */}
            <View style={styles.clockOutButtons}>
              <TouchableOpacity
                style={[styles.clockOutCancelButton, { borderColor: Colors.border }]}
                onPress={() => setShowClockOutModal(false)}
              >
                <Text style={[styles.clockOutCancelText, { color: Colors.primaryText }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.clockOutConfirmButton, { backgroundColor: Colors.primaryText, opacity: actionLoading ? 0.5 : 1 }]}
                onPress={handleClockOut}
                disabled={actionLoading}
              >
                <Text style={[styles.clockOutConfirmText, { color: Colors.white }]}>
                  {actionLoading ? 'Saving...' : 'Confirm Clock Out'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Incomplete Tasks Modal - shown when worker tries to clock out with overdue tasks */}
      <IncompleteTasksModal
        visible={showIncompleteTasksModal}
        onClose={() => {
          setShowIncompleteTasksModal(false);
          setPendingOverdueTasks([]);
        }}
        onSubmit={handleSubmitIncompleteReasons}
        tasks={pendingOverdueTasks}
        projectName={activeSession?.projects?.name || activeSession?.service_plans?.name}
      />

      <WorkerInviteHandler onInvitesHandled={handleInvitesComplete} />
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
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  // Clock Section
  clockSection: {
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
  },
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 40,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  timerText: {
    fontSize: 72,
    fontWeight: '300',
    letterSpacing: -3,
    fontVariant: ['tabular-nums'],
  },
  projectText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 12,
    letterSpacing: -0.3,
  },
  actionButton: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  divider: {
    width: '100%',
    height: 1,
    marginVertical: 24,
  },
  todayHoursContainer: {
    alignItems: 'center',
  },
  todayHoursLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  todayHoursValue: {
    fontSize: 32,
    fontWeight: '300',
    letterSpacing: -1,
  },
  // Tasks Section
  tasksSection: {
    borderRadius: 12,
    marginBottom: 24,
    overflow: 'hidden',
  },
  tasksSectionHeader: {
    padding: 16,
    paddingBottom: 0,
  },
  tasksSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tasksSectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  taskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 4,
  },
  taskBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  noTasksContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  noTasksText: {
    fontSize: 14,
    fontWeight: '500',
  },
  tasksList: {
    paddingTop: 8,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  taskCheckbox: {
    marginRight: 12,
    marginTop: 2,
  },
  taskContent: {
    flex: 1,
  },
  taskItemTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  taskItemDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  taskItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  taskItemMetaText: {
    fontSize: 12,
  },
  upcomingSection: {
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 12,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  upcomingSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  upcomingSectionTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  upcomingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  upcomingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 10,
  },
  upcomingItemTitle: {
    flex: 1,
    fontSize: 13,
  },
  upcomingItemDate: {
    fontSize: 12,
    marginLeft: 8,
  },
  // History Section
  historySection: {
    marginBottom: 24,
  },
  historySectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  historyCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyDate: {
    fontSize: 15,
    fontWeight: '600',
  },
  historyHours: {
    fontSize: 15,
    fontWeight: '700',
  },
  historyProject: {
    fontSize: 14,
    fontWeight: '500',
  },
  historyTime: {
    fontSize: 13,
    fontWeight: '500',
  },
  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '500',
  },
  // Modals
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 24,
  },
  projectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  projectOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  projectOptionText: {
    flex: 1,
  },
  projectOptionName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  projectOptionLocation: {
    fontSize: 14,
  },
  clockOutSection: {
    marginBottom: 24,
  },
  clockOutLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  clockOutTime: {
    fontSize: 36,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 100,
  },
  clockOutButtons: {
    marginTop: 'auto',
    paddingTop: 24,
    gap: 12,
  },
  clockOutCancelButton: {
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockOutCancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
  clockOutConfirmButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockOutConfirmText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
