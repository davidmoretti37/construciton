import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, Spacing, FontSizes, BorderRadius, LightColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { getPhaseWorkers } from '../utils/storage';
import WorkerAssignmentModal from '../components/WorkerAssignmentModal';

export default function PhaseDetailScreen({ navigation, route }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { phaseId, phaseName } = route.params;

  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [workers, setWorkers] = useState([]);

  // Task editing states
  const [showAddTask, setShowAddTask] = useState(false);
  const [showEditTask, setShowEditTask] = useState(false);
  const [editingTaskIndex, setEditingTaskIndex] = useState(null);
  const [taskInput, setTaskInput] = useState('');

  // Worker assignment state
  const [showWorkerAssignment, setShowWorkerAssignment] = useState(false);

  useEffect(() => {
    loadPhaseDetails();
  }, [phaseId]);

  const loadPhaseDetails = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('project_phases')
        .select('*')
        .eq('id', phaseId)
        .single();

      if (error) throw error;

      setPhase(data);

      // Parse tasks from JSONB
      const phaseTasks = data.tasks || [];
      setTasks(phaseTasks);

      // Load assigned workers
      const phaseWorkers = await getPhaseWorkers(phaseId);
      setWorkers(phaseWorkers || []);
    } catch (error) {
      console.error('Error loading phase details:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'phase details' }));
    } finally {
      setLoading(false);
    }
  };

  const handleWorkersUpdated = () => {
    loadPhaseDetails();
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleToggleTask = async (taskIndex) => {
    try {
      const updatedTasks = [...tasks];
      const task = updatedTasks[taskIndex];

      task.completed = !task.completed;
      if (task.completed) {
        task.completed_date = new Date().toISOString();
      } else {
        task.completed_date = null;
      }

      // Update in database
      const { error } = await supabase
        .from('project_phases')
        .update({ tasks: updatedTasks })
        .eq('id', phaseId);

      if (error) throw error;

      setTasks(updatedTasks);

      // Reload to get updated completion percentage from trigger
      loadPhaseDetails();
    } catch (error) {
      console.error('Error updating task:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToUpdate', { item: 'task' }));
    }
  };

  const handleAddTask = async () => {
    if (!taskInput.trim()) {
      Alert.alert(t('alerts.error'), t('messages.enterTaskDescription'));
      return;
    }

    try {
      const updatedTasks = [...tasks];
      const newTask = {
        id: `task-${Date.now()}`,
        order: updatedTasks.length + 1,
        description: taskInput.trim(),
        completed: false,
      };

      updatedTasks.push(newTask);

      // Update in database
      const { error } = await supabase
        .from('project_phases')
        .update({ tasks: updatedTasks })
        .eq('id', phaseId);

      if (error) throw error;

      setTasks(updatedTasks);
      setTaskInput('');
      setShowAddTask(false);

      // Reload to get updated completion percentage
      loadPhaseDetails();
    } catch (error) {
      console.error('Error adding task:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'task' }));
    }
  };

  const handleEditTask = async () => {
    if (!taskInput.trim()) {
      Alert.alert(t('alerts.error'), t('messages.enterTaskDescription'));
      return;
    }

    try {
      const updatedTasks = [...tasks];
      updatedTasks[editingTaskIndex].description = taskInput.trim();

      // Update in database
      const { error } = await supabase
        .from('project_phases')
        .update({ tasks: updatedTasks })
        .eq('id', phaseId);

      if (error) throw error;

      setTasks(updatedTasks);
      setTaskInput('');
      setShowEditTask(false);
      setEditingTaskIndex(null);
    } catch (error) {
      console.error('Error editing task:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToUpdate', { item: 'task' }));
    }
  };

  const handleDeleteTask = async (taskIndex) => {
    Alert.alert(
      t('alerts.confirm'),
      t('alerts.deleteConfirm'),
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('buttons.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedTasks = tasks.filter((_, index) => index !== taskIndex);

              // Reorder remaining tasks
              updatedTasks.forEach((task, index) => {
                task.order = index + 1;
              });

              // Update in database
              const { error } = await supabase
                .from('project_phases')
                .update({ tasks: updatedTasks })
                .eq('id', phaseId);

              if (error) throw error;

              setTasks(updatedTasks);

              // Reload to get updated completion percentage
              loadPhaseDetails();
            } catch (error) {
              console.error('Error deleting task:', error);
              Alert.alert(t('alerts.error'), t('messages.failedToDelete', { item: 'task' }));
            }
          }
        }
      ]
    );
  };

  const openEditTask = (taskIndex) => {
    setEditingTaskIndex(taskIndex);
    setTaskInput(tasks[taskIndex].description);
    setShowEditTask(true);
  };

  const getStatusIcon = (status) => {
    const statusMap = {
      'completed': { name: 'checkmark-circle', color: Colors.successGreen },
      'in_progress': { name: 'sync-circle', color: Colors.infoBlue },
      'behind': { name: 'alert-circle', color: Colors.warningOrange },
      'not_started': { name: 'pause-circle', color: Colors.secondaryText },
    };
    return statusMap[status] || statusMap['not_started'];
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

  if (!phase) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.errorText, { color: Colors.secondaryText }]}>Phase not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusIcon = getStatusIcon(phase.status);
  const completedTasks = tasks.filter(t => t.completed).length;
  const totalTasks = tasks.length;
  const progressPercent = phase.completion_percentage || 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]} numberOfLines={1}>
          {phaseName}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={[styles.statusCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
          <View style={styles.statusRow}>
            <View style={[styles.statusIconBadge, { backgroundColor: statusIcon.color + '15' }]}>
              <Ionicons name={statusIcon.name} size={28} color={statusIcon.color} />
            </View>
            <View style={styles.statusInfo}>
              <Text style={[styles.statusLabel, { color: Colors.secondaryText }]}>Status</Text>
              <Text style={[styles.statusValue, { color: Colors.primaryText }]}>
                {phase.status?.replace('_', ' ').toUpperCase()}
              </Text>
            </View>
          </View>

          <View style={[styles.divider, { backgroundColor: Colors.border }]} />

          {/* Progress Bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={[styles.progressLabel, { color: Colors.secondaryText }]}>Progress</Text>
              <Text style={[styles.progressPercent, { color: Colors.primaryBlue }]}>
                {progressPercent}%
              </Text>
            </View>
            <View style={[styles.progressBarBackground, { backgroundColor: Colors.lightGray }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${progressPercent}%`,
                    backgroundColor: progressPercent === 100 ? Colors.successGreen : Colors.primaryBlue,
                  }
                ]}
              />
            </View>
            <Text style={[styles.progressTasks, { color: Colors.secondaryText }]}>
              {completedTasks} of {totalTasks} tasks completed
            </Text>
          </View>
        </View>

        {/* Timeline Info */}
        {(phase.start_date || phase.end_date || phase.planned_days) && (
          <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Timeline</Text>

            {phase.start_date && (
              <View style={styles.infoRow}>
                <Ionicons name="play-outline" size={18} color={Colors.successGreen} />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Start Date</Text>
                  <Text style={[styles.infoValue, { color: Colors.primaryText }]}>
                    {new Date(phase.start_date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </Text>
                </View>
              </View>
            )}

            {phase.end_date && (
              <View style={styles.infoRow}>
                <Ionicons name="flag-outline" size={18} color={Colors.errorRed} />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>End Date</Text>
                  <Text style={[styles.infoValue, { color: Colors.primaryText }]}>
                    {new Date(phase.end_date + 'T00:00:00').toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </Text>
                </View>
              </View>
            )}

            {phase.planned_days && (
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={18} color={Colors.warningOrange} />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Duration</Text>
                  <Text style={[styles.infoValue, { color: Colors.primaryText }]}>
                    {phase.planned_days} days
                  </Text>
                </View>
              </View>
            )}

            {phase.time_extensions && phase.time_extensions.length > 0 && (
              <View style={styles.infoRow}>
                <Ionicons name="alert-circle-outline" size={18} color={Colors.warningOrange} />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Time Extensions</Text>
                  <Text style={[styles.infoValue, { color: Colors.warningOrange }]}>
                    +{phase.time_extensions.reduce((sum, ext) => sum + ext.days, 0)} days
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Budget Info */}
        {(phase.budget || phase.spent) && (
          <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Budget</Text>

            {phase.budget && (
              <View style={styles.infoRow}>
                <Ionicons name="wallet-outline" size={18} color={Colors.infoBlue} />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Allocated</Text>
                  <Text style={[styles.infoValue, { color: Colors.primaryText }]}>
                    ${phase.budget.toLocaleString()}
                  </Text>
                </View>
              </View>
            )}

            {phase.spent && (
              <View style={styles.infoRow}>
                <Ionicons name="trending-down-outline" size={18} color={Colors.errorRed} />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Spent</Text>
                  <Text style={[styles.infoValue, { color: Colors.primaryText }]}>
                    ${phase.spent.toLocaleString()}
                  </Text>
                </View>
              </View>
            )}

            {phase.budget && phase.spent && (
              <View style={styles.infoRow}>
                <Ionicons
                  name={phase.spent <= phase.budget ? 'checkmark-circle-outline' : 'alert-circle-outline'}
                  size={18}
                  color={phase.spent <= phase.budget ? Colors.successGreen : Colors.errorRed}
                />
                <View style={styles.infoContent}>
                  <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Remaining</Text>
                  <Text style={[
                    styles.infoValue,
                    { color: phase.spent <= phase.budget ? Colors.successGreen : Colors.errorRed }
                  ]}>
                    ${(phase.budget - phase.spent).toLocaleString()}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Assigned Workers */}
        <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: Colors.primaryText, marginBottom: 0 }]}>
                Assigned Workers ({workers.length})
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.assignButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={() => setShowWorkerAssignment(true)}
            >
              <Ionicons name="add" size={16} color="#FFFFFF" />
              <Text style={styles.assignButtonText}>Assign</Text>
            </TouchableOpacity>
          </View>

          {workers.length === 0 ? (
            <View style={styles.emptyWorkersState}>
              <Ionicons name="people-outline" size={36} color={Colors.secondaryText} />
              <Text style={[styles.emptyWorkersText, { color: Colors.secondaryText }]}>
                No workers assigned to this phase yet
              </Text>
            </View>
          ) : (
            <View style={styles.workersGrid}>
              {workers.map((worker) => (
                <View
                  key={worker.id}
                  style={[styles.workerChip, { backgroundColor: Colors.lightGray }]}
                >
                  <View style={[styles.workerAvatar, { backgroundColor: Colors.primaryBlue }]}>
                    <Text style={styles.workerAvatarText}>{getInitials(worker.full_name)}</Text>
                  </View>
                  <View style={styles.workerChipInfo}>
                    <Text style={[styles.workerChipName, { color: Colors.primaryText }]} numberOfLines={1}>
                      {worker.full_name}
                    </Text>
                    {worker.trade && (
                      <Text style={[styles.workerChipTrade, { color: Colors.secondaryText }]} numberOfLines={1}>
                        {worker.trade}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Tasks List */}
        <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
          <View style={styles.cardHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: Colors.primaryText, marginBottom: 0 }]}>Tasks</Text>
            </View>
            <View style={[styles.taskCountBadge, { backgroundColor: Colors.primaryBlue + '15' }]}>
              <Text style={[styles.taskCountText, { color: Colors.primaryBlue }]}>
                {completedTasks}/{totalTasks}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.addTaskButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={() => setShowAddTask(true)}
            >
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {tasks.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="list-outline" size={48} color={Colors.secondaryText} />
              <Text style={[styles.emptyStateText, { color: Colors.secondaryText }]}>
                No tasks added yet
              </Text>
              <TouchableOpacity
                style={[styles.addFirstTaskButton, { backgroundColor: Colors.primaryBlue }]}
                onPress={() => setShowAddTask(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={styles.addFirstTaskText}>Add First Task</Text>
              </TouchableOpacity>
            </View>
          ) : (
            tasks
              .sort((a, b) => (a.order || 0) - (b.order || 0))
              .map((task, index) => (
                <View
                  key={task.id || index}
                  style={[
                    styles.taskItem,
                    { borderBottomColor: Colors.border },
                    index === tasks.length - 1 && styles.taskItemLast,
                  ]}
                >
                  <TouchableOpacity
                    style={styles.taskContent}
                    onPress={() => handleToggleTask(index)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.taskCheckbox,
                        {
                          borderColor: task.completed ? Colors.successGreen : Colors.border,
                          backgroundColor: task.completed ? Colors.successGreen : 'transparent',
                        }
                      ]}
                    >
                      {task.completed && (
                        <Ionicons name="checkmark" size={16} color="#fff" />
                      )}
                    </View>
                    <View style={styles.taskInfo}>
                      <Text
                        style={[
                          styles.taskDescription,
                          {
                            color: task.completed ? Colors.secondaryText : Colors.primaryText,
                            textDecorationLine: task.completed ? 'line-through' : 'none',
                          }
                        ]}
                      >
                        {task.description}
                      </Text>
                      {task.completed_date && (
                        <Text style={[styles.taskDate, { color: Colors.secondaryText }]}>
                          Completed {new Date(task.completed_date).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  <View style={styles.taskActions}>
                    <TouchableOpacity
                      style={[styles.taskActionButton, { backgroundColor: Colors.primaryBlue + '15' }]}
                      onPress={() => openEditTask(index)}
                    >
                      <Ionicons name="pencil" size={16} color={Colors.primaryBlue} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.taskActionButton, { backgroundColor: Colors.errorRed + '15' }]}
                      onPress={() => handleDeleteTask(index)}
                    >
                      <Ionicons name="trash-outline" size={16} color={Colors.errorRed} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Add Task Modal */}
      <Modal
        visible={showAddTask}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddTask(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalContainer, { backgroundColor: Colors.background }]}
        >
          <SafeAreaView style={{ flex: 1 }}>
            <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
              <TouchableOpacity onPress={() => setShowAddTask(false)}>
                <Text style={[styles.modalCancelText, { color: Colors.primaryBlue }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Add Task</Text>
              <TouchableOpacity onPress={handleAddTask}>
                <Text style={[styles.modalSaveText, { color: Colors.primaryBlue }]}>Add</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              <Text style={[styles.modalLabel, { color: Colors.secondaryText }]}>Task Description</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                value={taskInput}
                onChangeText={setTaskInput}
                placeholder="Enter task description..."
                placeholderTextColor={Colors.secondaryText}
                multiline
                numberOfLines={3}
                autoFocus
              />
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        visible={showEditTask}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditTask(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalContainer, { backgroundColor: Colors.background }]}
        >
          <SafeAreaView style={{ flex: 1 }}>
            <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
              <TouchableOpacity onPress={() => setShowEditTask(false)}>
                <Text style={[styles.modalCancelText, { color: Colors.primaryBlue }]}>Cancel</Text>
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Edit Task</Text>
              <TouchableOpacity onPress={handleEditTask}>
                <Text style={[styles.modalSaveText, { color: Colors.primaryBlue }]}>Save</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              <Text style={[styles.modalLabel, { color: Colors.secondaryText }]}>Task Description</Text>
              <TextInput
                style={[styles.modalInput, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                value={taskInput}
                onChangeText={setTaskInput}
                placeholder="Enter task description..."
                placeholderTextColor={Colors.secondaryText}
                multiline
                numberOfLines={3}
                autoFocus
              />
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Worker Assignment Modal */}
      <WorkerAssignmentModal
        visible={showWorkerAssignment}
        onClose={() => setShowWorkerAssignment(false)}
        assignmentType="phase"
        assignmentId={phaseId}
        assignmentName={phaseName}
        onAssignmentsChange={handleWorkersUpdated}
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
  errorText: {
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  content: {
    flex: 1,
  },
  statusCard: {
    margin: 20,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusIconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginBottom: 16,
  },
  progressSection: {
    gap: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  progressPercent: {
    fontSize: 16,
    fontWeight: '700',
  },
  progressBarBackground: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressTasks: {
    fontSize: 12,
  },
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
  },
  taskCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  taskCountText: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 14,
    marginTop: 12,
    marginBottom: 16,
  },
  addFirstTaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  addFirstTaskText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  taskItemLast: {
    borderBottomWidth: 0,
  },
  taskContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  taskCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  taskInfo: {
    flex: 1,
  },
  taskDescription: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  taskDate: {
    fontSize: 11,
    marginTop: 2,
  },
  taskActions: {
    flexDirection: 'row',
    gap: 8,
    marginLeft: 8,
  },
  taskActionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTaskButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
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
    padding: 20,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  assignButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyWorkersState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyWorkersText: {
    fontSize: 13,
    marginTop: 8,
  },
  workersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  workerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 10,
    borderRadius: 20,
    minWidth: 100,
    maxWidth: '48%',
  },
  workerAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  workerAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  workerChipInfo: {
    flex: 1,
  },
  workerChipName: {
    fontSize: 13,
    fontWeight: '600',
  },
  workerChipTrade: {
    fontSize: 10,
  },
});
