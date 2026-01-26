import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getWorkerAssignments, getCurrentUserId } from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import WorkerInviteHandler from '../../components/WorkerInviteHandler';

export default function WorkerAssignmentsScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workerId, setWorkerId] = useState(null);
  const [projects, setProjects] = useState([]);
  const [phases, setPhases] = useState([]);

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAssignments = async () => {
    try {
      setLoading(true);
      const userId = await getCurrentUserId();

      // Get worker ID
      const { data: workerData, error: workerError } = await supabase
        .from('workers')
        .select('id')
        .eq('user_id', userId)
        .single();

      if (workerError || !workerData) {
        console.error('Error fetching worker:', workerError);
        setLoading(false);
        return;
      }

      setWorkerId(workerData.id);

      // Load assignments
      const assignments = await getWorkerAssignments(workerData.id);
      setProjects(assignments.projects || []);
      setPhases(assignments.phases || []);
    } catch (error) {
      console.error('Error loading assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAssignments();
    setRefreshing(false);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#10B981';
      case 'active':
      case 'in_progress':
        return '#3B82F6';
      case 'behind':
        return '#F59E0B';
      case 'not_started':
        return '#6B7280';
      default:
        return Colors.primaryBlue;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const calculateDaysRemaining = (endDate) => {
    if (!endDate) return null;
    const end = new Date(endDate);
    const today = new Date();
    const diffTime = end - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.topBar, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
          <Text style={[styles.topBarTitle, { color: Colors.primaryText }]}>My Assignments</Text>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  const hasNoAssignments = projects.length === 0 && phases.length === 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#FAFAFA' }]}>
      {/* Minimalist Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Assignments</Text>
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
        {hasNoAssignments ? (
          <View style={styles.emptyState}>
            <Ionicons name="briefcase-outline" size={80} color={Colors.secondaryText} />
            <Text style={[styles.emptyStateTitle, { color: Colors.primaryText }]}>No Assignments Yet</Text>
            <Text style={[styles.emptyStateText, { color: Colors.secondaryText }]}>
              You haven't been assigned to any projects or phases yet. Check back later.
            </Text>
          </View>
        ) : (
          <>
            {/* Project Assignments */}
            {projects.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="briefcase" size={20} color={Colors.primaryBlue} />
                  <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                    Projects ({projects.length})
                  </Text>
                </View>

                {projects.map((project) => {
                  const daysRemaining = calculateDaysRemaining(project.end_date);

                  return (
                    <View
                      key={project.id}
                      style={styles.projectCard}
                    >
                      <View style={styles.projectHeader}>
                        <Text style={styles.projectName} numberOfLines={2}>
                          {project.name}
                        </Text>

                        {project.location && (
                          <Text style={styles.projectLocation} numberOfLines={1}>
                            {project.location}
                          </Text>
                        )}
                      </View>

                      {/* Timeline */}
                      <View style={[styles.timelineSection, { borderTopColor: Colors.border }]}>
                        <View style={styles.timelineItem}>
                          <Ionicons name="calendar-outline" size={16} color={Colors.secondaryText} />
                          <View style={styles.timelineText}>
                            <Text style={[styles.timelineLabel, { color: Colors.secondaryText }]}>Timeline</Text>
                            <Text style={[styles.timelineValue, { color: Colors.primaryText }]}>
                              {formatDate(project.start_date)} - {formatDate(project.end_date)}
                            </Text>
                          </View>
                        </View>

                        {daysRemaining !== null && (
                          <View style={styles.timelineItem}>
                            <Ionicons
                              name={daysRemaining < 0 ? 'alert-circle' : 'time-outline'}
                              size={16}
                              color={daysRemaining < 0 ? '#EF4444' : Colors.secondaryText}
                            />
                            <View style={styles.timelineText}>
                              <Text style={[styles.timelineLabel, { color: Colors.secondaryText }]}>
                                {daysRemaining < 0 ? 'Overdue' : 'Days Left'}
                              </Text>
                              <Text
                                style={[
                                  styles.timelineValue,
                                  { color: daysRemaining < 0 ? '#EF4444' : Colors.primaryText },
                                ]}
                              >
                                {Math.abs(daysRemaining)} days
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Phase Assignments */}
            {phases.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons name="layers" size={20} color={Colors.primaryBlue} />
                  <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                    Phases ({phases.length})
                  </Text>
                </View>

                {phases.map((phase) => {
                  const statusColor = getStatusColor(phase.status);
                  const completion = phase.completion_percentage || 0;

                  return (
                    <View
                      key={phase.id}
                      style={[styles.phaseCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                    >
                      {/* Phase Header */}
                      <View style={styles.phaseHeader}>
                        <View style={styles.phaseTitleRow}>
                          <View style={[styles.phaseIcon, { backgroundColor: statusColor + '20' }]}>
                            <Ionicons name="layers-outline" size={20} color={statusColor} />
                          </View>
                          <View style={styles.phaseInfo}>
                            <Text style={[styles.phaseName, { color: Colors.primaryText }]} numberOfLines={1}>
                              {phase.name}
                            </Text>
                            <Text style={[styles.phaseProject, { color: Colors.secondaryText }]} numberOfLines={1}>
                              {phase.projects?.name || 'Unknown Project'}
                            </Text>
                          </View>
                        </View>

                        {phase.assignmentNotes && (
                          <View style={[styles.noteBox, { backgroundColor: Colors.lightGray }]}>
                            <Ionicons name="document-text-outline" size={14} color={Colors.secondaryText} />
                            <Text style={[styles.noteText, { color: Colors.secondaryText }]} numberOfLines={2}>
                              {phase.assignmentNotes}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Progress Bar */}
                      <View style={styles.progressSection}>
                        <View style={styles.progressHeader}>
                          <Text style={[styles.progressLabel, { color: Colors.secondaryText }]}>Progress</Text>
                          <Text style={[styles.progressPercent, { color: Colors.primaryText }]}>{completion}%</Text>
                        </View>
                        <View style={[styles.progressBarBg, { backgroundColor: Colors.lightGray }]}>
                          <View
                            style={[styles.progressBarFill, { width: `${completion}%`, backgroundColor: statusColor }]}
                          />
                        </View>
                      </View>

                      {/* Phase Details */}
                      <View style={styles.phaseDetails}>
                        <View style={styles.phaseDetailItem}>
                          <Ionicons name="calendar-outline" size={14} color={Colors.secondaryText} />
                          <Text style={[styles.phaseDetailText, { color: Colors.secondaryText }]}>
                            {formatDate(phase.start_date)} - {formatDate(phase.end_date)}
                          </Text>
                        </View>

                        {phase.budget && (
                          <View style={styles.phaseDetailItem}>
                            <Ionicons name="cash-outline" size={14} color={Colors.secondaryText} />
                            <Text style={[styles.phaseDetailText, { color: Colors.secondaryText }]}>
                              ${parseFloat(phase.budget).toLocaleString()} budget
                            </Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Info Box */}
            <View
              style={[
                styles.infoBox,
                { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' },
              ]}
            >
              <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.infoBoxText, { color: Colors.primaryBlue }]}>
                These are all the projects and phases you're currently assigned to. Contact your manager if you have
                questions.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      {/* Worker Invite Handler - Checks for and shows pending invitations */}
      <WorkerInviteHandler onInvitesHandled={loadAssignments} />
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
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xlarge * 3,
  },
  emptyStateTitle: {
    fontSize: FontSizes.xlarge,
    fontWeight: '700',
    marginTop: Spacing.large,
    marginBottom: Spacing.small,
  },
  emptyStateText: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.xlarge,
  },
  section: {
    marginBottom: Spacing.large,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: Spacing.medium,
  },
  sectionTitle: {
    fontSize: FontSizes.large,
    fontWeight: '700',
  },
  projectCard: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    marginBottom: Spacing.medium,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  statusBar: {
    height: 4,
  },
  projectHeader: {
    padding: Spacing.medium,
  },
  projectTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.small,
    gap: 8,
  },
  projectName: {
    fontSize: FontSizes.large,
    fontWeight: '700',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  infoText: {
    fontSize: FontSizes.small,
    flex: 1,
  },
  timelineSection: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.medium,
    paddingVertical: Spacing.medium,
    borderTopWidth: 1,
    gap: Spacing.medium,
  },
  timelineItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  timelineText: {
    flex: 1,
  },
  timelineLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  timelineValue: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  phaseCard: {
    borderRadius: BorderRadius.large,
    borderWidth: 1,
    padding: Spacing.medium,
    marginBottom: Spacing.medium,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  phaseHeader: {
    marginBottom: Spacing.medium,
  },
  phaseTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.small,
  },
  phaseIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseInfo: {
    flex: 1,
  },
  phaseName: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: 2,
  },
  phaseProject: {
    fontSize: FontSizes.small,
  },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: Spacing.small,
    borderRadius: BorderRadius.small,
    marginTop: Spacing.small,
  },
  noteText: {
    flex: 1,
    fontSize: FontSizes.small,
  },
  progressSection: {
    marginBottom: Spacing.medium,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: FontSizes.small,
  },
  progressPercent: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  phaseDetails: {
    gap: 6,
  },
  phaseDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  phaseDetailText: {
    fontSize: FontSizes.small,
  },
  infoBox: {
    flexDirection: 'row',
    padding: Spacing.medium,
    borderRadius: BorderRadius.medium,
    borderWidth: 1,
    gap: 10,
    alignItems: 'flex-start',
    marginTop: Spacing.medium,
  },
  infoBoxText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
});
