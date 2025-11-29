import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getWorkerAssignments, getCurrentUserId } from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import WorkerInviteHandler from '../../components/WorkerInviteHandler';

export default function WorkerAssignmentsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState([]);
  const [phases, setPhases] = useState([]);

  useEffect(() => {
    loadAssignments();
  }, []);

  const loadAssignments = async () => {
    try {
      setLoading(true);
      const currentUserId = await getCurrentUserId();

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

  const handleProjectPress = async (project) => {
    // Fetch full project details including phases
    try {
      const { data: fullProject, error } = await supabase
        .from('projects')
        .select(`
          *,
          project_phases (
            id,
            name,
            order_index,
            completion_percentage,
            status,
            start_date,
            end_date,
            planned_days,
            tasks,
            services
          )
        `)
        .eq('id', project.id)
        .single();

      if (error) {
        console.error('Error fetching project details:', error);
        return;
      }

      console.log('Full project data:', JSON.stringify(fullProject, null, 2));

      navigation.navigate('WorkerProjectDetail', { project: fullProject });
    } catch (error) {
      console.error('Error navigating to project:', error);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Assignments</Text>
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

  const hasNoAssignments = projects.length === 0 && phases.length === 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Minimalist Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Assignments</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Ionicons name="settings-outline" size={22} color="#1F2937" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={hasNoAssignments ? styles.emptyContent : styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1F2937" />
        }
      >
        {hasNoAssignments ? (
          <View style={styles.emptyState}>
            <Ionicons name="briefcase-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateText}>No active assignments</Text>
          </View>
        ) : (
          <>
            {/* Projects */}
            {projects.map((project) => (
              <TouchableOpacity
                key={project.id}
                style={styles.card}
                onPress={() => handleProjectPress(project)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{project.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </View>
                {project.location && (
                  <View style={styles.cardRow}>
                    <Ionicons name="location-outline" size={14} color="#9CA3AF" />
                    <Text style={styles.cardSubtext}>{project.location}</Text>
                  </View>
                )}
                {project.status && (
                  <View style={styles.cardRow}>
                    <View style={[styles.statusDot, {
                      backgroundColor: project.status === 'active' ? '#10B981' : '#9CA3AF'
                    }]} />
                    <Text style={styles.cardSubtext}>{project.status}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}

            {/* Phases */}
            {phases.map((phase) => (
              <TouchableOpacity
                key={phase.id}
                style={styles.card}
                onPress={() => {
                  // Navigate to the parent project when phase is clicked
                  if (phase.project_id) {
                    const parentProject = projects.find(p => p.id === phase.project_id);
                    if (parentProject) {
                      handleProjectPress(parentProject);
                    }
                  }
                }}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{phase.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </View>
                {phase.projects?.name && (
                  <View style={styles.cardRow}>
                    <Ionicons name="briefcase-outline" size={14} color="#9CA3AF" />
                    <Text style={styles.cardSubtext}>{phase.projects.name}</Text>
                  </View>
                )}
                {phase.completion_percentage !== null && (
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${phase.completion_percentage}%` }
                        ]}
                      />
                    </View>
                    <Text style={styles.progressText}>{phase.completion_percentage}%</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      <WorkerInviteHandler onInvitesHandled={loadAssignments} />
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
    padding: 24,
    paddingBottom: 40,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    gap: 12,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 12,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
    letterSpacing: -0.3,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardSubtext: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1F2937',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    minWidth: 38,
    textAlign: 'right',
  },
});
