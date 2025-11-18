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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getActiveClockIn,
  clockIn,
  clockOut,
  getWorkerAssignments,
  getCurrentUserId,
  getPendingInvites,
} from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import InvitePopup from '../../components/InvitePopup';

export default function TimeClockScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [loading, setLoading] = useState(true);
  const [workerId, setWorkerId] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userEmail, setUserEmail] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [showClockOutModal, setShowClockOutModal] = useState(false);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [clockOutNotes, setClockOutNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);

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
      setUserId(currentUserId);

      // Get user email for invite check
      const { data: { user } } = await supabase.auth.getUser();
      const email = user?.email;
      setUserEmail(email);

      // Check for pending invites
      if (email) {
        console.log('=====================');
        console.log('Checking for invites with email:', email);
        const invites = await getPendingInvites(email);
        console.log('Found invites:', invites);
        console.log('=====================');
        if (invites && invites.length > 0) {
          setPendingInvites(invites);
          setLoading(false);
          return; // Stop loading other data until invites are handled
        }
      }

      // Get worker ID from profiles/workers table
      const { data: workerData, error: workerError } = await supabase
        .from('workers')
        .select('id')
        .eq('user_id', currentUserId)
        .single();

      if (workerError || !workerData) {
        console.error('Error fetching worker:', workerError);
        setLoading(false);
        return;
      }

      setWorkerId(workerData.id);

      // Check for active clock-in session
      const session = await getActiveClockIn(workerData.id);
      setActiveSession(session);

      // Load assigned projects for clock-in
      const assignments = await getWorkerAssignments(workerData.id);
      setAvailableProjects(assignments.projects || []);
    } catch (error) {
      console.error('Error loading worker data:', error);
    } finally {
      setLoading(false);
    }
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

      const success = await clockOut(activeSession.id, clockOutNotes);

      if (success) {
        setActiveSession(null);
        setClockOutNotes('');
        setShowClockOutModal(false);
        Alert.alert('Success', 'Clocked out successfully');
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

  const handleInvitesComplete = async () => {
    // Clear invites and reload worker data
    setPendingInvites([]);
    await loadWorkerData();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <Text style={[styles.topBarTitle, { color: Colors.primaryText }]}>Time Clock</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Status Card */}
        <View style={[styles.statusCard, { backgroundColor: Colors.white }]}>
          <View style={[styles.statusIconContainer, { backgroundColor: activeSession ? '#10B981' : '#6B7280' }]}>
            <Ionicons
              name={activeSession ? 'checkmark-circle' : 'time-outline'}
              size={48}
              color="#FFFFFF"
            />
          </View>

          <Text style={[styles.statusTitle, { color: Colors.primaryText }]}>
            {activeSession ? 'Clocked In' : 'Not Clocked In'}
          </Text>

          {activeSession && (
            <>
              <Text style={[styles.elapsedTime, { color: Colors.primaryBlue }]}>{elapsedTime}</Text>
              <View style={styles.projectInfo}>
                <Ionicons name="briefcase-outline" size={16} color={Colors.secondaryText} />
                <Text style={[styles.projectName, { color: Colors.secondaryText }]}>
                  {activeSession.projects?.name || 'Unknown Project'}
                </Text>
              </View>
              {activeSession.projects?.client && (
                <View style={styles.projectInfo}>
                  <Ionicons name="person-outline" size={16} color={Colors.secondaryText} />
                  <Text style={[styles.clientName, { color: Colors.secondaryText }]}>
                    {activeSession.projects.client}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        {/* Action Button */}
        {activeSession ? (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: '#EF4444' }]}
            onPress={() => setShowClockOutModal(true)}
            disabled={actionLoading}
          >
            <Ionicons name="log-out-outline" size={24} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Clock Out</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={() => {
              if (availableProjects.length === 0) {
                Alert.alert('No Projects', 'You are not assigned to any projects yet.');
              } else {
                setShowProjectPicker(true);
              }
            }}
            disabled={actionLoading}
          >
            <Ionicons name="log-in-outline" size={24} color="#FFFFFF" />
            <Text style={styles.actionButtonText}>Clock In</Text>
          </TouchableOpacity>
        )}

        {/* Info Box */}
        <View style={[styles.infoBox, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
          <Text style={[styles.infoText, { color: Colors.primaryBlue }]}>
            {activeSession
              ? 'Your location was captured when you clocked in. Remember to clock out when you finish work.'
              : 'Select a project to clock in. Your location will be captured for attendance tracking.'}
          </Text>
        </View>
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
              <Text style={[styles.modalCancelText, { color: Colors.primaryBlue }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Select Project</Text>
            <View style={{ width: 60 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {availableProjects.map((project) => (
              <TouchableOpacity
                key={project.id}
                style={[styles.projectOption, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                onPress={() => handleClockIn(project.id)}
                disabled={actionLoading}
              >
                <View style={styles.projectOptionContent}>
                  <Ionicons name="briefcase" size={24} color={Colors.primaryBlue} />
                  <View style={styles.projectOptionText}>
                    <Text style={[styles.projectOptionName, { color: Colors.primaryText }]}>
                      {project.name}
                    </Text>
                    {project.client && (
                      <Text style={[styles.projectOptionClient, { color: Colors.secondaryText }]}>
                        {project.client}
                      </Text>
                    )}
                    {project.location && (
                      <View style={styles.locationRow}>
                        <Ionicons name="location-outline" size={14} color={Colors.secondaryText} />
                        <Text style={[styles.projectOptionLocation, { color: Colors.secondaryText }]}>
                          {project.location}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
              </TouchableOpacity>
            ))}

            {availableProjects.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="folder-open-outline" size={64} color={Colors.secondaryText} />
                <Text style={[styles.emptyStateText, { color: Colors.secondaryText }]}>
                  No assigned projects
                </Text>
              </View>
            )}
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
            <TouchableOpacity onPress={() => setShowClockOutModal(false)}>
              <Text style={[styles.modalCancelText, { color: Colors.primaryBlue }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Clock Out</Text>
            <TouchableOpacity onPress={handleClockOut} disabled={actionLoading}>
              <Text style={[styles.modalSaveText, { color: Colors.primaryBlue, opacity: actionLoading ? 0.5 : 1 }]}>
                {actionLoading ? 'Saving...' : 'Confirm'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.clockOutSection}>
              <Text style={[styles.clockOutLabel, { color: Colors.secondaryText }]}>
                Total Time Worked
              </Text>
              <Text style={[styles.clockOutTime, { color: Colors.primaryText }]}>
                {elapsedTime}
              </Text>
            </View>

            <View style={styles.clockOutSection}>
              <Text style={[styles.clockOutLabel, { color: Colors.secondaryText }]}>
                Notes (Optional)
              </Text>
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

            <View style={[styles.infoBox, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.infoText, { color: Colors.primaryBlue }]}>
                Your hours will be recorded and visible in your timesheet.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Invite Popup - Shown when there are pending invites */}
      {pendingInvites.length > 0 && (
        <InvitePopup
          invites={pendingInvites}
          userId={userId}
          onComplete={handleInvitesComplete}
        />
      )}
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
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.large,
    borderBottomWidth: 1,
  },
  topBarTitle: {
    fontSize: FontSizes.large,
    fontWeight: '700',
  },
  settingsButton: {
    padding: Spacing.small,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.large,
  },
  statusCard: {
    borderRadius: BorderRadius.large,
    padding: Spacing.xlarge,
    alignItems: 'center',
    marginBottom: Spacing.large,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.medium,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: Spacing.small,
  },
  elapsedTime: {
    fontSize: 48,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    marginVertical: Spacing.medium,
  },
  projectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  projectName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  clientName: {
    fontSize: FontSizes.small,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: Spacing.large,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.large,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.large,
    fontWeight: '700',
  },
  infoBox: {
    flexDirection: 'row',
    padding: Spacing.medium,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    gap: 10,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.large,
    paddingVertical: Spacing.medium,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: FontSizes.large,
    fontWeight: '700',
  },
  modalCancelText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  modalSaveText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: Spacing.large,
  },
  projectOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.medium,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    marginBottom: Spacing.medium,
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
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  projectOptionClient: {
    fontSize: FontSizes.small,
    marginBottom: 2,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  projectOptionLocation: {
    fontSize: FontSizes.small,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xlarge * 2,
  },
  emptyStateText: {
    fontSize: FontSizes.body,
    marginTop: Spacing.medium,
  },
  clockOutSection: {
    marginBottom: Spacing.large,
  },
  clockOutLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: Spacing.small,
  },
  clockOutTime: {
    fontSize: 36,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  notesInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.medium,
    paddingHorizontal: Spacing.medium,
    paddingVertical: Spacing.medium,
    fontSize: FontSizes.body,
    minHeight: 100,
  },
});
