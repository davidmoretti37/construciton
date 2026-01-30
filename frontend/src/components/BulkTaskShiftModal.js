import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { fetchTasksForSelection, bulkShiftTasks } from '../utils/storage/workerTasks';
import { getProjectWorkingDays, getProjectNonWorkingDates } from '../utils/storage/projects';

export default function BulkTaskShiftModal({
  visible,
  onClose,
  projectId,
  projectName,
  onTasksShifted,
}) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [loading, setLoading] = useState(true);
  const [shifting, setShifting] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [daysToShift, setDaysToShift] = useState('1');
  const [useWorkingDays, setUseWorkingDays] = useState(true);
  const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5]);
  const [nonWorkingDates, setNonWorkingDates] = useState([]);

  useEffect(() => {
    if (visible && projectId) {
      loadTasks();
      loadWorkingDays();
    }
  }, [visible, projectId]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const data = await fetchTasksForSelection(projectId);
      setTasks(data);
      setSelectedTaskIds([]);
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkingDays = async () => {
    const days = await getProjectWorkingDays(projectId);
    setWorkingDays(days);
    const dates = await getProjectNonWorkingDates(projectId);
    setNonWorkingDates(dates);
  };

  const toggleTaskSelection = (taskId) => {
    if (selectedTaskIds.includes(taskId)) {
      setSelectedTaskIds(selectedTaskIds.filter((id) => id !== taskId));
    } else {
      setSelectedTaskIds([...selectedTaskIds, taskId]);
    }
  };

  const selectAll = () => {
    setSelectedTaskIds(tasks.map((t) => t.id));
  };

  const selectNone = () => {
    setSelectedTaskIds([]);
  };

  const handleShift = async () => {
    const days = parseInt(daysToShift, 10);
    if (isNaN(days) || days === 0) {
      Alert.alert(t('alerts.invalidInput'), t('messages.enterValidDays'));
      return;
    }

    if (selectedTaskIds.length === 0) {
      Alert.alert(t('alerts.noTasksSelected'), t('messages.selectAtLeastOneTask'));
      return;
    }

    setShifting(true);
    try {
      const result = await bulkShiftTasks(
        selectedTaskIds,
        days,
        useWorkingDays ? workingDays : null,
        useWorkingDays ? nonWorkingDates : []
      );

      if (result.success || result.updatedCount > 0) {
        Alert.alert(
          t('alerts.success'),
          t('messages.updatedSuccessfully'),
          [
            {
              text: 'OK',
              onPress: () => {
                onTasksShifted?.();
                onClose();
              },
            },
          ]
        );
      } else {
        Alert.alert(t('alerts.error'), result.errors?.join('\n') || t('messages.failedToSave'));
      }
    } catch (error) {
      Alert.alert(t('alerts.error'), t('messages.failedToSave'));
    } finally {
      setShifting(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const handleClose = () => {
    setSelectedTaskIds([]);
    setDaysToShift('1');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={[styles.cancelText, { color: Colors.primaryBlue }]}>{t('buttons.cancel')}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: Colors.primaryText }]}>{t('labels.shiftTasks')}</Text>
          <TouchableOpacity
            onPress={handleShift}
            disabled={shifting || selectedTaskIds.length === 0}
          >
            {shifting ? (
              <ActivityIndicator size="small" color={Colors.primaryBlue} />
            ) : (
              <Text
                style={[
                  styles.saveText,
                  {
                    color:
                      selectedTaskIds.length > 0 ? Colors.primaryBlue : Colors.secondaryText,
                  },
                ]}
              >
                {t('labels.shift')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Project Name */}
        {projectName && (
          <View style={[styles.projectBanner, { backgroundColor: Colors.primaryBlue + '15' }]}>
            <Ionicons name="folder-outline" size={18} color={Colors.primaryBlue} />
            <Text style={[styles.projectName, { color: Colors.primaryBlue }]}>
              {projectName}
            </Text>
          </View>
        )}

        {/* Shift Controls */}
        <View style={[styles.controlsSection, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.daysInputRow}>
            <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>{t('labels.shiftBy')}</Text>
            <TextInput
              style={[
                styles.daysInput,
                { backgroundColor: Colors.inputBackground, color: Colors.primaryText },
              ]}
              value={daysToShift}
              onChangeText={setDaysToShift}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={Colors.placeholderText}
            />
            <Text style={[styles.inputLabel, { color: Colors.primaryText }]}>{t('labels.days')}</Text>
          </View>

          <Text style={[styles.helpText, { color: Colors.secondaryText }]}>
            {t('labels.shiftHelpText')}
          </Text>

          <TouchableOpacity
            style={styles.workingDaysToggle}
            onPress={() => setUseWorkingDays(!useWorkingDays)}
          >
            <Ionicons
              name={useWorkingDays ? 'checkbox' : 'square-outline'}
              size={24}
              color={Colors.primaryBlue}
            />
            <Text style={[styles.toggleLabel, { color: Colors.primaryText }]}>
              {t('labels.skipNonWorkingDays')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Selection Controls */}
        <View style={[styles.selectionControls, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={selectAll} style={styles.selectButton}>
            <Text style={[styles.selectButtonText, { color: Colors.primaryBlue }]}>
              {t('labels.selectAll')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={selectNone} style={styles.selectButton}>
            <Text style={[styles.selectButtonText, { color: Colors.primaryBlue }]}>
              {t('labels.selectNone')}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.selectedCount, { color: Colors.secondaryText }]}>
            {t('labels.selectedCount', { selected: selectedTaskIds.length, total: tasks.length })}
          </Text>
        </View>

        {/* Task List */}
        <ScrollView style={styles.taskList} contentContainerStyle={styles.taskListContent}>
          {loading ? (
            <ActivityIndicator
              size="large"
              color={Colors.primaryBlue}
              style={{ marginTop: 40 }}
            />
          ) : tasks.length === 0 ? (
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
              {t('emptyStates.noTasks')}
            </Text>
          ) : (
            tasks.map((task) => {
              const isSelected = selectedTaskIds.includes(task.id);
              return (
                <TouchableOpacity
                  key={task.id}
                  style={[
                    styles.taskItem,
                    { backgroundColor: Colors.cardBackground, borderColor: Colors.border },
                    isSelected && {
                      borderColor: Colors.primaryBlue,
                      backgroundColor: Colors.primaryBlue + '10',
                    },
                  ]}
                  onPress={() => toggleTaskSelection(task.id)}
                >
                  <Ionicons
                    name={isSelected ? 'checkbox' : 'square-outline'}
                    size={24}
                    color={isSelected ? Colors.primaryBlue : Colors.secondaryText}
                  />
                  <View style={styles.taskInfo}>
                    <Text style={[styles.taskTitle, { color: Colors.primaryText }]}>
                      {task.title}
                    </Text>
                    <Text style={[styles.taskDates, { color: Colors.secondaryText }]}>
                      {formatDate(task.start_date)} - {formatDate(task.end_date)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          task.status === 'completed'
                            ? Colors.successGreen + '20'
                            : Colors.warningOrange + '20',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            task.status === 'completed'
                              ? Colors.successGreen
                              : Colors.warningOrange,
                        },
                      ]}
                    >
                      {task.status}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  cancelText: {
    fontSize: 16,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
  },
  projectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  projectName: {
    fontSize: FontSizes.body,
    fontWeight: '500',
  },
  controlsSection: {
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  daysInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: Spacing.xs,
  },
  inputLabel: {
    fontSize: 16,
  },
  daysInput: {
    width: 70,
    height: 44,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  helpText: {
    fontSize: FontSizes.small,
    marginBottom: Spacing.md,
  },
  workingDaysToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  toggleLabel: {
    fontSize: 15,
  },
  selectionControls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    gap: 16,
    borderBottomWidth: 1,
  },
  selectButton: {},
  selectButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  selectedCount: {
    fontSize: 13,
    marginLeft: 'auto',
  },
  taskList: {
    flex: 1,
  },
  taskListContent: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  taskDates: {
    fontSize: 13,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 40,
  },
});
