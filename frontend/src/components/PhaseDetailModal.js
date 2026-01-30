import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import {
  updatePhaseProgress,
  extendPhaseTimeline,
  updatePhaseDates,
  startPhase,
  completePhase,
  calculatePhaseStatus,
  updatePhaseTask,
  addTaskToPhase,
} from '../utils/storage';

export default function PhaseDetailModal({ visible, onClose, phase, onUpdate }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  // Local state for editing
  const [completion, setCompletion] = useState(phase?.completion_percentage || 0);
  const [extensionDays, setExtensionDays] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [startDate, setStartDate] = useState(phase?.start_date || '');
  const [endDate, setEndDate] = useState(phase?.end_date || '');
  const [tasks, setTasks] = useState(phase?.tasks || []);
  const [newTaskName, setNewTaskName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Update local state when phase changes
  useEffect(() => {
    if (phase) {
      setCompletion(phase.completion_percentage || 0);
      setStartDate(phase.start_date || '');
      setEndDate(phase.end_date || '');
      setTasks(phase.tasks || []);
    }
  }, [phase]);

  if (!phase) return null;

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#22C55E';
      case 'in_progress':
        return '#3B82F6';
      case 'behind':
        return '#EF4444';
      case 'not_started':
      default:
        return Colors.lightGray;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return 'checkmark-circle';
      case 'in_progress':
        return 'play-circle';
      case 'behind':
        return 'alert-circle';
      case 'not_started':
      default:
        return 'ellipse-outline';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Not set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const handleUpdateProgress = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      await updatePhaseProgress(phase.id, completion);
      Alert.alert(t('alerts.success'), t('messages.progressUpdated'));
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error updating progress:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleExtendTimeline = async () => {
    if (!extensionDays || isNaN(parseInt(extensionDays))) {
      Alert.alert(t('alerts.error'), t('messages.enterValidDays'));
      return;
    }

    if (isLoading) return;
    setIsLoading(true);

    try {
      const days = parseInt(extensionDays);
      await extendPhaseTimeline(phase.id, days, extensionReason);
      Alert.alert(t('alerts.success'), t('messages.updatedSuccessfully'));
      setExtensionDays('');
      setExtensionReason('');
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error extending timeline:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateDates = async () => {
    if (!startDate || !endDate) {
      Alert.alert(t('alerts.error'), t('alerts.required'));
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      Alert.alert(t('alerts.error'), t('alerts.invalidInput'));
      return;
    }

    if (isLoading) return;
    setIsLoading(true);

    try {
      await updatePhaseDates(phase.id, { start_date: startDate, end_date: endDate });
      Alert.alert(t('alerts.success'), t('messages.updatedSuccessfully'));
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error updating dates:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartPhase = async () => {
    if (isLoading) return;
    setIsLoading(true);

    try {
      await startPhase(phase.id);
      Alert.alert(t('alerts.success'), t('messages.phaseStarted'));
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error starting phase:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompletePhase = async () => {
    Alert.alert(
      t('alerts.completePhase'),
      t('messages.confirmComplete'),
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('buttons.complete'),
          onPress: async () => {
            if (isLoading) return;
            setIsLoading(true);

            try {
              await completePhase(phase.id);
              Alert.alert(t('alerts.success'), t('messages.phaseCompleted'));
              if (onUpdate) onUpdate();
            } catch (error) {
              console.error('Error completing phase:', error);
              Alert.alert(t('alerts.error'), t('messages.failedToSave'));
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleAddTask = async () => {
    if (!newTaskName.trim()) {
      Alert.alert(t('alerts.error'), t('messages.enterTaskDescription'));
      return;
    }

    setIsLoading(true);
    try {
      const updatedPhase = await addTaskToPhase(
        phase.id,
        newTaskName.trim(),
        tasks.length + 1
      );

      if (updatedPhase) {
        setTasks(updatedPhase.tasks || []);
        setNewTaskName('');
        if (onUpdate) onUpdate();
      } else {
        Alert.alert(t('alerts.error'), t('messages.failedToSave'));
      }
    } catch (error) {
      console.error('Error adding task:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTask = async (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setIsLoading(true);
    try {
      const updatedPhase = await updatePhaseTask(phase.id, taskId, {
        completed: !task.completed,
        completed_date: !task.completed ? new Date().toISOString() : null,
      });

      if (updatedPhase) {
        setTasks(updatedPhase.tasks || []);
        if (onUpdate) onUpdate();
      } else {
        Alert.alert(t('alerts.error'), t('messages.failedToSave'));
      }
    } catch (error) {
      console.error('Error toggling task:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveTask = async (taskId) => {
    Alert.alert(
      t('alerts.removeTask'),
      t('messages.confirmRemove'),
      [
        { text: t('buttons.cancel'), style: 'cancel' },
        {
          text: t('buttons.remove'),
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);
            try {
              const updatedPhase = await updatePhaseTask(phase.id, taskId, {
                _remove: true, // Special flag to indicate removal
              });

              // Manually filter since we're using a flag
              const updatedTasks = tasks.filter(t => t.id !== taskId);
              setTasks(updatedTasks);

              if (onUpdate) onUpdate();
            } catch (error) {
              console.error('Error removing task:', error);
              Alert.alert(t('alerts.error'), t('messages.failedToSave'));
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  // Calculate task-based completion if tasks exist
  const taskCompletion = tasks.length > 0
    ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100)
    : null;

  const statusColor = getStatusColor(phase.status);
  const totalExtendedDays = phase.time_extensions?.reduce((sum, ext) => sum + ext.days, 0) || 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]} numberOfLines={1}>
            {phase.name}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Status Card */}
          <View style={[styles.statusCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <View style={styles.statusRow}>
              <View style={[styles.statusIconBadge, { backgroundColor: statusColor + '15' }]}>
                <Ionicons name={getStatusIcon(phase.status)} size={28} color={statusColor} />
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
                  {completion}%
                </Text>
              </View>
              <View style={[styles.progressBarBackground, { backgroundColor: Colors.lightGray }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${completion}%`,
                      backgroundColor: completion === 100 ? '#10B981' : Colors.primaryBlue,
                    }
                  ]}
                />
              </View>
              <Text style={[styles.progressTasks, { color: Colors.secondaryText }]}>
                {tasks.filter(t => t.completed).length} of {tasks.length} tasks completed
              </Text>
            </View>
          </View>

          {/* Timeline Info */}
          {(phase.start_date || phase.end_date || phase.planned_days) && (
            <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Timeline</Text>

              {phase.start_date && (
                <View style={styles.infoRow}>
                  <Ionicons name="play-outline" size={18} color="#10B981" />
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
                  <Ionicons name="flag-outline" size={18} color="#EF4444" />
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
                  <Ionicons name="time-outline" size={18} color="#F59E0B" />
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
                  <Ionicons name="alert-circle-outline" size={18} color="#F59E0B" />
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Time Extensions</Text>
                    <Text style={[styles.infoValue, { color: '#F59E0B' }]}>
                      +{totalExtendedDays} days
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
                  <Ionicons name="wallet-outline" size={18} color="#3B82F6" />
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
                  <Ionicons name="trending-down-outline" size={18} color="#EF4444" />
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
                    color={phase.spent <= phase.budget ? '#10B981' : '#EF4444'}
                  />
                  <View style={styles.infoContent}>
                    <Text style={[styles.infoLabel, { color: Colors.secondaryText }]}>Remaining</Text>
                    <Text style={[
                      styles.infoValue,
                      { color: phase.spent <= phase.budget ? '#10B981' : '#EF4444' }
                    ]}>
                      ${(phase.budget - phase.spent).toLocaleString()}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Tasks List */}
          <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: Colors.primaryText, marginBottom: 0 }]}>Tasks</Text>
              </View>
              <View style={[styles.taskCountBadge, { backgroundColor: Colors.primaryBlue + '15' }]}>
                <Text style={[styles.taskCountText, { color: Colors.primaryBlue }]}>
                  {tasks.filter(t => t.completed).length}/{tasks.length}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.addTaskButtonSmall, { backgroundColor: Colors.primaryBlue }]}
                onPress={() => setNewTaskName('')}
              >
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            {tasks.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="list-outline" size={48} color={Colors.secondaryText} />
                <Text style={[styles.emptyStateText, { color: Colors.secondaryText }]}>
                  {t('emptyStates.noTasks')}
                </Text>
              </View>
            ) : (
              tasks.map((task, index) => (
                <View
                  key={task.id || index}
                  style={[
                    styles.taskItem,
                    { borderBottomColor: Colors.border },
                    index === tasks.length - 1 && styles.taskItemLast,
                  ]}
                >
                  <TouchableOpacity
                    style={styles.taskContentRow}
                    onPress={() => handleToggleTask(task.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.taskCheckbox,
                        {
                          borderColor: task.completed ? '#10B981' : Colors.border,
                          backgroundColor: task.completed ? '#10B981' : 'transparent',
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
                        {task.description || task.name}
                      </Text>
                      {task.completed_date && (
                        <Text style={[styles.taskDate, { color: Colors.secondaryText }]}>
                          Completed {new Date(task.completed_date).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.taskActionButton, { backgroundColor: '#EF4444' + '15' }]}
                    onPress={() => handleRemoveTask(task.id)}
                  >
                    <Ionicons name="trash-outline" size={16} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))
            )}

            {/* Add New Task */}
            <View style={styles.addTaskContainer}>
              <TextInput
                style={[styles.taskInput, {
                  backgroundColor: Colors.card,
                  color: Colors.primaryText,
                  borderColor: Colors.border
                }]}
                placeholder="Add a task..."
                placeholderTextColor={Colors.secondaryText}
                value={newTaskName}
                onChangeText={setNewTaskName}
                onSubmitEditing={handleAddTask}
              />
              <TouchableOpacity
                style={[styles.addTaskButton, { backgroundColor: Colors.primaryBlue }]}
                onPress={handleAddTask}
              >
                <Ionicons name="add" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '90%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  title: {
    fontSize: FontSizes.large,
    fontWeight: '700',
    flex: 1,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: FontSizes.small,
    fontWeight: '700',
  },
  quickActions: {
    gap: Spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  timelineGrid: {
    gap: Spacing.md,
  },
  timelineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineLabel: {
    fontSize: FontSizes.small,
  },
  timelineValue: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  extensionItem: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  extensionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  extensionDays: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  extensionDate: {
    fontSize: FontSizes.tiny,
    marginLeft: 'auto',
  },
  extensionReason: {
    fontSize: FontSizes.small,
    marginTop: Spacing.xs,
    marginLeft: 26,
  },
  extensionInputs: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  daysInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.body,
  },
  reasonInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.body,
  },
  extendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  extendButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  progressPercentage: {
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  progressBar: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  sliderButton: {
    padding: Spacing.sm,
  },
  sliderInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.body,
    textAlign: 'center',
  },
  updateButton: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  taskCheckbox: {
    padding: Spacing.xs,
  },
  taskContent: {
    flex: 1,
  },
  taskName: {
    fontSize: FontSizes.body,
  },
  taskCompleted: {
    textDecorationLine: 'line-through',
  },
  taskCompletedInfo: {
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
  addTaskContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  taskInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.body,
  },
  addTaskButton: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
