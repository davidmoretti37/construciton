import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { fetchWorkers, getWorkerAssignmentCounts } from '../../utils/storage/workers';
import { getCurrentUserContext } from '../../utils/storage/auth';

export default function AssignWorkerModal({ visible, onClose, onSuccess }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = createStyles(Colors);
  const { user, isSupervisor } = useAuth() || {};

  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [assignedWorkerIds, setAssignedWorkerIds] = useState(new Set());

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  // Fetch assigned workers when project selection changes
  useEffect(() => {
    const fetchAssignedWorkers = async () => {
      if (!selectedProjectId) {
        setAssignedWorkerIds(new Set());
        return;
      }

      try {
        const { data: existingAssignments } = await supabase
          .from('project_assignments')
          .select('worker_id')
          .eq('project_id', selectedProjectId);

        const assignedIds = new Set(
          (existingAssignments || []).map(a => a.worker_id)
        );
        setAssignedWorkerIds(assignedIds);
      } catch (error) {
        console.error('Error fetching assigned workers:', error);
        setAssignedWorkerIds(new Set());
      }
    };

    if (visible) {
      fetchAssignedWorkers();
    }
  }, [selectedProjectId, visible]);

  const loadData = async () => {
    try {
      setLoading(true);
      const currentUserId = user?.id;

      if (!currentUserId) {
        Alert.alert('Error', 'User not authenticated');
        return;
      }

      // Debug: Check user context
      const userContext = await getCurrentUserContext();
      console.log('📊 User Context:', userContext);
      console.log('📊 Current User ID:', currentUserId);
      console.log('📊 Is Supervisor:', isSupervisor);

      // Fetch workers using shared utility (includes all parent owner's workers)
      console.log('📊 Fetching workers...');
      const workersData = await fetchWorkers();
      console.log('📊 Workers fetched:', workersData?.length || 0, workersData);

      // Fetch assignment counts for all workers (with error handling)
      console.log('📊 Fetching assignment counts...');
      let assignmentCounts = {};
      try {
        const countsData = await getWorkerAssignmentCounts();
        console.log('📊 Assignment counts:', countsData);
        assignmentCounts = countsData || {};
      } catch (error) {
        console.error('Error fetching assignment counts:', error);
        // Continue without assignment counts
      }

      // Merge assignment counts with workers (with null checks)
      // Filter out supervisors - they should not be assignable as workers
      const workersWithAssignments = (workersData || [])
        .filter(w => w && w.id && w.full_name) // Filter out invalid workers
        .filter(w => w.trade !== 'Supervisor') // Filter out supervisors
        .map(worker => ({
          ...worker,
          assignmentCount: assignmentCounts[worker.id] || 0
        }));
      console.log('📊 Workers with assignments:', workersWithAssignments?.length || 0);
      console.log('📊 Filtered out supervisors');

      // Fetch supervisor's assigned projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('projects')
        .select('*')
        .or(`assigned_supervisor_id.eq.${currentUserId},user_id.eq.${currentUserId}`)
        .in('status', ['active', 'scheduled', 'on-track', 'behind', 'over-budget'])
        .order('name');

      if (projectsError) throw projectsError;

      // Fetch active service plans
      const { data: plansData } = await supabase
        .from('service_plans')
        .select('id, name, service_type, status')
        .eq('status', 'active')
        .order('name', { ascending: true });

      const planItems = (plansData || []).map(p => ({ ...p, isServicePlan: true }));

      setWorkers(workersWithAssignments || []);
      setProjects([...(projectsData || []), ...planItems]);

      // Auto-select first items if available
      if (workersWithAssignments?.length > 0) {
        setSelectedWorkerId(workersData[0].id);
      }
      if (projectsData?.length > 0) {
        setSelectedProjectId(projectsData[0].id);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load workers and projects');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedWorkerId || !selectedProjectId) {
      Alert.alert('Error', 'Please select both a worker and a project');
      return;
    }

    try {
      setAssigning(true);

      // Check if already assigned
      const { data: existing } = await supabase
        .from('project_assignments')
        .select('id')
        .eq('project_id', selectedProjectId)
        .eq('worker_id', selectedWorkerId)
        .single();

      if (existing) {
        Alert.alert('Already Assigned', 'This worker is already assigned to this project');
        return;
      }

      // Create assignment
      const { error: assignError } = await supabase
        .from('project_assignments')
        .insert({
          project_id: selectedProjectId,
          worker_id: selectedWorkerId,
        });

      if (assignError) throw assignError;

      const worker = workers.find(w => w.id === selectedWorkerId);
      const project = projects.find(p => p.id === selectedProjectId);

      Alert.alert(
        'Success',
        `${worker?.full_name || 'Worker'} assigned to ${project?.name || 'project'}`,
        [{ text: 'OK', onPress: () => {
          if (onSuccess) onSuccess();
          onClose();
        }}]
      );
    } catch (error) {
      console.error('Error assigning worker:', error);
      Alert.alert('Error', 'Failed to assign worker to project');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={28} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Assign Worker to Project</Text>
          <View style={{ width: 28 }} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        ) : workers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>No workers available</Text>
            <Text style={styles.emptySubtext}>Ask your owner to add workers first</Text>
          </View>
        ) : projects.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-outline" size={64} color={Colors.textSecondary} />
            <Text style={styles.emptyText}>No assigned projects</Text>
            <Text style={styles.emptySubtext}>You're not assigned to any projects yet</Text>
          </View>
        ) : (
          <ScrollView style={styles.content}>
            <View style={styles.section}>
              <Text style={styles.label}>Select Worker:</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedWorkerId}
                  onValueChange={(value) => setSelectedWorkerId(value)}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                >
                  {workers.filter(w => w?.id && w?.full_name).map((worker) => {
                    const isAssigned = assignedWorkerIds.has(worker.id);
                    const assignmentCount = worker.assignmentCount || 0;
                    const assignmentText = assignmentCount > 0 ? ` (${assignmentCount})` : '';
                    const statusText = isAssigned ? ' ✓ Assigned' : '';
                    const trade = worker.trade || '';

                    return (
                      <Picker.Item
                        key={worker.id}
                        label={`${worker.full_name}${trade ? ` - ${trade}` : ''}${assignmentText}${statusText}`}
                        value={worker.id}
                        enabled={!isAssigned}
                        color={isAssigned ? '#999999' : '#000000'}
                      />
                    );
                  })}
                </Picker>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Select Project:</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedProjectId}
                  onValueChange={(value) => setSelectedProjectId(value)}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                >
                  {projects.filter(p => p?.id && p?.name).map((project) => (
                    <Picker.Item
                      key={project.id}
                      label={project.name || 'Unnamed Project'}
                      value={project.id}
                      color="#000000"
                    />
                  ))}
                </Picker>
              </View>
            </View>
          </ScrollView>
        )}

        {!loading && workers.length > 0 && projects.length > 0 && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={assigning}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.assignButton]}
              onPress={handleAssign}
              disabled={assigning || !selectedWorkerId || !selectedProjectId}
            >
              {assigning ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.assignButtonText}>Assign</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const createStyles = (Colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: Colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    closeButton: {
      padding: Spacing.xs,
    },
    title: {
      fontSize: FontSizes.lg,
      fontWeight: '600',
      color: Colors.text,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: Spacing.md,
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: Spacing.xl,
    },
    emptyText: {
      fontSize: FontSizes.lg,
      fontWeight: '600',
      color: Colors.text,
      marginTop: Spacing.md,
    },
    emptySubtext: {
      fontSize: FontSizes.md,
      color: Colors.textSecondary,
      marginTop: Spacing.xs,
      textAlign: 'center',
    },
    content: {
      flex: 1,
      padding: Spacing.lg,
    },
    section: {
      marginBottom: Spacing.xl,
    },
    label: {
      fontSize: FontSizes.md,
      fontWeight: '600',
      color: Colors.text,
      marginBottom: Spacing.sm,
    },
    pickerContainer: {
      backgroundColor: Colors.card,
      borderRadius: BorderRadius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      overflow: 'hidden',
      minHeight: 50,
    },
    picker: {
      height: 50,
      width: '100%',
    },
    pickerItem: {
      fontSize: FontSizes.md,
      color: Colors.text,
      height: 50,
    },
    footer: {
      flexDirection: 'row',
      padding: Spacing.lg,
      gap: Spacing.md,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
    },
    button: {
      flex: 1,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelButton: {
      backgroundColor: Colors.card,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    cancelButtonText: {
      fontSize: FontSizes.md,
      fontWeight: '600',
      color: Colors.text,
    },
    assignButton: {
      backgroundColor: '#EC4899',
    },
    assignButtonText: {
      fontSize: FontSizes.md,
      fontWeight: '600',
      color: '#fff',
    },
  });
