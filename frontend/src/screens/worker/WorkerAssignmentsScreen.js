import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getWorkerAssignments, getCurrentUserId } from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import WorkerInviteHandler from '../../components/WorkerInviteHandler';

export default function WorkerAssignmentsScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('workers');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState([]);
  const [servicePlans, setServicePlans] = useState([]);
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
      setProjects((assignments.projects || []).filter(p => p && p.id && p.name));
      setServicePlans((assignments.servicePlans || []).filter(p => p && p.id && p.name));
      setPhases((assignments.phases || []).filter(p => p && p.id));
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

  const successColor = Colors.success || '#10B981';
  const inactiveColor = Colors.secondaryText;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.topBar, { backgroundColor: Colors.background }]}>
          <Text style={[styles.topBarTitle, { color: Colors.primaryText }]}>{t('assignments.title')}</Text>
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

  const hasNoAssignments = projects.length === 0 && servicePlans.length === 0 && phases.length === 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Minimalist Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.background }]}>
        <Text style={[styles.topBarTitle, { color: Colors.primaryText }]}>{t('assignments.title')}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Ionicons name="settings-outline" size={22} color={Colors.primaryText} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={hasNoAssignments ? styles.emptyContent : styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryBlue} />
        }
      >
        {hasNoAssignments ? (
          <View style={styles.emptyState}>
            <Ionicons name="briefcase-outline" size={64} color={Colors.border} />
            <Text style={[styles.emptyStateText, { color: Colors.secondaryText }]}>{t('assignments.noActiveAssignments')}</Text>
          </View>
        ) : (
          <>
            {/* Projects */}
            {projects.map((project) => (
              <TouchableOpacity
                key={project.id}
                style={[styles.card, { backgroundColor: Colors.white }]}
                onPress={() => handleProjectPress(project)}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>{project.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                </View>
                {project.location && (
                  <View style={styles.cardRow}>
                    <Ionicons name="location-outline" size={14} color={Colors.secondaryText} />
                    <Text style={[styles.cardSubtext, { color: Colors.secondaryText }]}>{project.location}</Text>
                  </View>
                )}
                {project.status && (
                  <View style={styles.cardRow}>
                    <View style={[styles.statusDot, {
                      backgroundColor: project.status === 'active' ? successColor : inactiveColor
                    }]} />
                    <Text style={[styles.cardSubtext, { color: Colors.secondaryText }]}>{project.status}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}

            {/* Service Plans */}
            {servicePlans.map((plan) => (
              <TouchableOpacity
                key={plan.id}
                style={[styles.card, { backgroundColor: Colors.white }]}
                onPress={() => navigation.navigate('ServicePlanDetail', { planId: plan.id })}
                activeOpacity={0.7}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>{plan.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                </View>
                {plan.client_name && (
                  <View style={styles.cardRow}>
                    <Ionicons name="person-outline" size={14} color={Colors.secondaryText} />
                    <Text style={[styles.cardSubtext, { color: Colors.secondaryText }]}>{plan.client_name}</Text>
                  </View>
                )}
                {plan.address && (
                  <View style={styles.cardRow}>
                    <Ionicons name="location-outline" size={14} color={Colors.secondaryText} />
                    <Text style={[styles.cardSubtext, { color: Colors.secondaryText }]}>{plan.address}</Text>
                  </View>
                )}
                <View style={styles.cardRow}>
                  <View style={[styles.statusDot, { backgroundColor: plan.status === 'active' ? successColor : inactiveColor }]} />
                  <Text style={[styles.cardSubtext, { color: Colors.secondaryText }]}>
                    {plan.service_type?.replace(/_/g, ' ')} • {plan.billing_cycle}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            {/* Phases */}
            {phases.map((phase) => (
              <TouchableOpacity
                key={phase.id}
                style={[styles.card, { backgroundColor: Colors.white }]}
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
                  <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>{phase.name}</Text>
                  <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                </View>
                {phase.projects?.name && (
                  <View style={styles.cardRow}>
                    <Ionicons name="briefcase-outline" size={14} color={Colors.secondaryText} />
                    <Text style={[styles.cardSubtext, { color: Colors.secondaryText }]}>{phase.projects.name}</Text>
                  </View>
                )}
                {phase.completion_percentage !== null && (
                  <View style={styles.progressContainer}>
                    <View style={[styles.progressBar, { backgroundColor: Colors.border }]}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${phase.completion_percentage}%`, backgroundColor: Colors.primaryText }
                        ]}
                      />
                    </View>
                    <Text style={[styles.progressText, { color: Colors.secondaryText }]}>{phase.completion_percentage}%</Text>
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
    fontWeight: '500',
  },
  card: {
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
    letterSpacing: -0.3,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardSubtext: {
    fontSize: 14,
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
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 38,
    textAlign: 'right',
  },
});
