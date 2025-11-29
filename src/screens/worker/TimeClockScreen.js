import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  getActiveClockIn,
  clockIn,
  clockOut,
  getCurrentUserId,
  getWorkerTimesheet,
} from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import WorkerInviteHandler from '../../components/WorkerInviteHandler';

export default function TimeClockScreen({ navigation }) {
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

      // Load owner's projects (not just assigned ones)
      if (workerData.owner_id) {
        await loadOwnerProjects(workerData.owner_id);
      } else {
        console.error('No owner_id found for worker');
      }

      // Load recent clock-in history and today's hours
      await loadRecentEntries(workerData.id);
    } catch (error) {
      console.error('Error loading worker data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadOwnerProjects = async (ownerId) => {
    try {
      console.log('Loading projects for owner:', ownerId);

      const { data, error } = await supabase
        .from('projects')
        .select('id, name, location, status')
        .eq('user_id', ownerId)
        .order('name');

      if (error) {
        console.error('Error fetching owner projects:', error);
        return;
      }

      console.log('Found projects:', data);
      setAvailableProjects(data || []);
    } catch (error) {
      console.error('Error loading owner projects:', error);
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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWorkerData();
    setRefreshing(false);
  };

  const handleClockIn = async (projectId) => {
    try {
      setActionLoading(true);
      setShowProjectPicker(false);

      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      let location = null;

      if (status === 'granted') {
        const currentLocation = await Location.getCurrentPositionAsync({});
        location = {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
        };
      }

      // Clock in
      const session = await clockIn(workerId, projectId, location);

      if (session) {
        setActiveSession({
          ...session,
          projects: availableProjects.find(p => p.id === projectId),
        });
        Alert.alert('Success', 'Clocked in successfully');
      } else {
        Alert.alert('Error', 'Failed to clock in. Please try again.');
      }
    } catch (error) {
      console.error('Error clocking in:', error);
      Alert.alert('Error', 'Failed to clock in');
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = async () => {
    try {
      setActionLoading(true);

      const result = await clockOut(activeSession.id, clockOutNotes);

      if (result.success) {
        setActiveSession(null);
        setClockOutNotes('');
        setShowClockOutModal(false);

        // Show success message with labor cost if calculated
        if (result.laborCost && result.laborCost > 0) {
          Alert.alert(
            'Clocked Out',
            `Hours worked: ${result.hours.toFixed(2)}\nLabor cost: $${result.laborCost.toFixed(2)}`
          );
        } else {
          Alert.alert('Success', 'Clocked out successfully');
        }

        // Reload data to update history and hours
        await loadWorkerData();
      } else {
        Alert.alert('Error', 'Failed to clock out. Please try again.');
      }
    } catch (error) {
      console.error('Error clocking out:', error);
      Alert.alert('Error', 'Failed to clock out');
    } finally {
      setActionLoading(false);
    }
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Clock</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={22} color="#1F2937" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1F2937" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Minimalist Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Clock</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Ionicons name="settings-outline" size={22} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1F2937" />
        }
      >
        {/* Clock Section */}
        <View style={styles.clockSection}>
          {/* Status Display */}
          <View style={styles.statusSection}>
            <View style={[styles.statusDot, { backgroundColor: activeSession ? '#10B981' : '#9CA3AF' }]} />
            <Text style={styles.statusText}>
              {activeSession ? 'Active' : 'Offline'}
            </Text>
          </View>

          {/* Large Timer Display */}
          <View style={styles.timerContainer}>
            <Text style={styles.timerText}>{activeSession ? elapsedTime : '--:--:--'}</Text>
            {activeSession && activeSession.projects?.name && (
              <Text style={styles.projectText}>{activeSession.projects.name}</Text>
            )}
          </View>

          {/* Action Button */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              if (activeSession) {
                setShowClockOutModal(true);
              } else {
                if (availableProjects.length === 0) {
                  Alert.alert('No Projects', 'Your manager has not created any projects yet.');
                } else {
                  setShowProjectPicker(true);
                }
              }
            }}
            disabled={actionLoading}
            activeOpacity={0.7}
          >
            <Text style={styles.actionButtonText}>
              {activeSession ? 'Clock Out' : 'Clock In'}
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Today's Hours */}
          <View style={styles.todayHoursContainer}>
            <Text style={styles.todayHoursLabel}>Today's Hours</Text>
            <Text style={styles.todayHoursValue}>{totalHoursToday.toFixed(1)}</Text>
          </View>
        </View>

        {/* Recent History */}
        {recentEntries.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.historySectionTitle}>Recent</Text>
            {recentEntries.map((entry) => (
              <View key={entry.id} style={styles.historyCard}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDate}>{formatDate(entry.clock_in)}</Text>
                  <Text style={styles.historyHours}>{entry.hours?.toFixed(1) || '0.0'} hrs</Text>
                </View>
                <Text style={styles.historyProject}>{entry.projects?.name || 'Unknown Project'}</Text>
                <Text style={styles.historyTime}>
                  {formatTime(entry.clock_in)} - {formatTime(entry.clock_out)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Empty State */}
        {recentEntries.length === 0 && !activeSession && (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateText}>No clock-ins yet</Text>
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
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowProjectPicker(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Project</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {availableProjects.map((project) => (
              <TouchableOpacity
                key={project.id}
                style={styles.projectOption}
                onPress={() => handleClockIn(project.id)}
                disabled={actionLoading}
              >
                <View style={styles.projectOptionContent}>
                  <Ionicons name="briefcase-outline" size={22} color="#1F2937" />
                  <View style={styles.projectOptionText}>
                    <Text style={styles.projectOptionName}>{project.name}</Text>
                    {project.location && (
                      <Text style={styles.projectOptionLocation}>{project.location}</Text>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
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
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowClockOutModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Clock Out</Text>
            <TouchableOpacity onPress={handleClockOut} disabled={actionLoading}>
              <Text style={[styles.modalSaveText, { opacity: actionLoading ? 0.5 : 1 }]}>
                {actionLoading ? 'Saving...' : 'Confirm'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.clockOutSection}>
              <Text style={styles.clockOutLabel}>Total Time Worked</Text>
              <Text style={styles.clockOutTime}>{elapsedTime}</Text>
            </View>

            <View style={styles.clockOutSection}>
              <Text style={styles.clockOutLabel}>Notes (Optional)</Text>
              <TextInput
                style={styles.notesInput}
                value={clockOutNotes}
                onChangeText={setClockOutNotes}
                placeholder="Add any notes about today's work..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <WorkerInviteHandler onInvitesHandled={handleInvitesComplete} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
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
    backgroundColor: 'transparent',
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
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
    backgroundColor: '#FFFFFF',
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
    color: '#6B7280',
    letterSpacing: 0.5,
  },
  timerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  timerText: {
    fontSize: 72,
    fontWeight: '300',
    color: '#1F2937',
    letterSpacing: -3,
    fontVariant: ['tabular-nums'],
  },
  projectText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6B7280',
    marginTop: 12,
    letterSpacing: -0.3,
  },
  actionButton: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1F2937',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  divider: {
    width: '100%',
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 24,
  },
  todayHoursContainer: {
    alignItems: 'center',
  },
  todayHoursLabel: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
    marginBottom: 8,
  },
  todayHoursValue: {
    fontSize: 32,
    fontWeight: '300',
    color: '#1F2937',
    letterSpacing: -1,
  },
  // History Section
  historySection: {
    marginBottom: 24,
  },
  historySectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
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
    color: '#1F2937',
  },
  historyHours: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  historyProject: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  historyTime: {
    fontSize: 13,
    color: '#9CA3AF',
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
    color: '#9CA3AF',
    fontWeight: '500',
  },
  // Modals
  modalContainer: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalContent: {
    flex: 1,
    padding: 24,
  },
  projectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
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
    color: '#1F2937',
    marginBottom: 4,
  },
  projectOptionLocation: {
    fontSize: 14,
    color: '#6B7280',
  },
  clockOutSection: {
    marginBottom: 24,
  },
  clockOutLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  clockOutTime: {
    fontSize: 36,
    fontWeight: '300',
    color: '#1F2937',
    fontVariant: ['tabular-nums'],
  },
  notesInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1F2937',
    minHeight: 100,
  },
});
