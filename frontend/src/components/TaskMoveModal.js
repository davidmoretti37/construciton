import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { updateTask, bulkShiftTasks, fetchTasksForSelection } from '../utils/storage/workerTasks';
import { getProjectWorkingDays, getProjectNonWorkingDates } from '../utils/storage/projects';

export default function TaskMoveModal({
  visible,
  onClose,
  task,
  onTaskMoved,
}) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [loading, setLoading] = useState(false);
  const [targetDate, setTargetDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [moveMode, setMoveMode] = useState('single'); // 'single' or 'cascade'
  const [workingDays, setWorkingDays] = useState([1, 2, 3, 4, 5]);
  const [nonWorkingDates, setNonWorkingDates] = useState([]);

  useEffect(() => {
    if (visible && task) {
      // Initialize target date to task's current start date
      const taskDate = task.start_date ? new Date(task.start_date + 'T00:00:00') : new Date();
      setTargetDate(taskDate);
      setMoveMode('single');
      loadWorkingDays();
    }
  }, [visible, task]);

  const loadWorkingDays = async () => {
    if (task?.project_id) {
      const days = await getProjectWorkingDays(task.project_id);
      setWorkingDays(days);
      const dates = await getProjectNonWorkingDates(task.project_id);
      setNonWorkingDates(dates);
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDateString = (date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const handleDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setTargetDate(selectedDate);
    }
  };

  const calculateDaysDifference = () => {
    if (!task?.start_date) return 0;
    const currentDate = new Date(task.start_date + 'T00:00:00');
    const diffTime = targetDate.getTime() - currentDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleMove = async () => {
    if (!task) return;

    const newDateString = formatDateString(targetDate);
    const daysDiff = calculateDaysDifference();

    if (daysDiff === 0) {
      Alert.alert(t('alerts.sameDate'), t('messages.taskAlreadyOnDate'));
      return;
    }

    setLoading(true);
    try {
      if (moveMode === 'single') {
        // Move just this task
        const taskDuration = task.end_date && task.start_date
          ? Math.round(
              (new Date(task.end_date + 'T00:00:00').getTime() - new Date(task.start_date + 'T00:00:00').getTime())
              / (1000 * 60 * 60 * 24)
            )
          : 0;

        const newEndDate = new Date(targetDate);
        newEndDate.setDate(newEndDate.getDate() + taskDuration);

        const result = await updateTask(task.id, {
          start_date: newDateString,
          end_date: formatDateString(newEndDate),
        });

        if (result) {
          Alert.alert(
            t('alerts.success'),
            t('messages.updatedSuccessfully'),
            [{ text: 'OK', onPress: () => { onTaskMoved?.(); onClose(); } }]
          );
        } else {
          Alert.alert(t('alerts.error'), t('messages.failedToSave'));
        }
      } else {
        // Cascade: move this task and shift all subsequent tasks
        if (!task.project_id) {
          Alert.alert(t('alerts.error'), t('alerts.invalidInput'));
          setLoading(false);
          return;
        }

        // Get all tasks for the project that come after this task
        const allTasks = await fetchTasksForSelection(task.project_id);
        const currentTaskDate = new Date(task.start_date + 'T00:00:00');

        // Find tasks on or after this task's date (including this task)
        const tasksToShift = (allTasks || []).filter(t => {
          if (!t.start_date) return false;
          const taskStartDate = new Date(t.start_date + 'T00:00:00');
          return taskStartDate >= currentTaskDate;
        });

        const taskIds = tasksToShift.map(t => t.id);

        if (taskIds.length === 0) {
          Alert.alert(t('alerts.noTasks'), t('messages.noTasksToShift'));
          setLoading(false);
          return;
        }

        const result = await bulkShiftTasks(taskIds, daysDiff, workingDays, nonWorkingDates);

        if (result.success || result.updatedCount > 0) {
          Alert.alert(
            t('alerts.success'),
            t('messages.updatedSuccessfully'),
            [{ text: 'OK', onPress: () => { onTaskMoved?.(); onClose(); } }]
          );
        } else {
          Alert.alert(t('alerts.error'), result.errors?.join('\n') || t('messages.failedToSave'));
        }
      }
    } catch (error) {
      console.error('Error moving task:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setShowDatePicker(false);
    onClose();
  };

  if (!task) return null;

  const daysDiff = calculateDaysDifference();
  const direction = daysDiff > 0 ? 'later' : daysDiff < 0 ? 'earlier' : '';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={[styles.cancelText, { color: Colors.primaryBlue }]}>{t('buttons.cancel')}</Text>
          </TouchableOpacity>
          <Text style={[styles.title, { color: Colors.primaryText }]}>{t('labels.moveTask')}</Text>
          <TouchableOpacity onPress={handleMove} disabled={loading || daysDiff === 0}>
            {loading ? (
              <ActivityIndicator size="small" color={Colors.primaryBlue} />
            ) : (
              <Text
                style={[
                  styles.saveText,
                  { color: daysDiff !== 0 ? Colors.primaryBlue : Colors.secondaryText },
                ]}
              >
                {t('labels.move')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Task Info */}
        <View style={[styles.taskInfo, { backgroundColor: Colors.cardBackground }]}>
          <View style={[styles.iconBadge, { backgroundColor: Colors.primaryBlue + '15' }]}>
            <Ionicons name="checkbox-outline" size={20} color={Colors.primaryBlue} />
          </View>
          <View style={styles.taskDetails}>
            <Text style={[styles.taskTitle, { color: Colors.primaryText }]} numberOfLines={2}>
              {task.title}
            </Text>
            <Text style={[styles.currentDate, { color: Colors.secondaryText }]}>
              Currently: {task.start_date ? formatDate(new Date(task.start_date + 'T00:00:00')) : 'No date'}
            </Text>
          </View>
        </View>

        {/* Date Picker */}
        <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Move to</Text>

          <TouchableOpacity
            style={[styles.dateButton, { backgroundColor: Colors.inputBackground }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color={Colors.primaryBlue} />
            <Text style={[styles.dateText, { color: Colors.primaryText }]}>
              {formatDate(targetDate)}
            </Text>
            <Ionicons name="chevron-down" size={18} color={Colors.secondaryText} />
          </TouchableOpacity>

          {daysDiff !== 0 && (
            <Text style={[styles.diffText, { color: Colors.primaryBlue }]}>
              {Math.abs(daysDiff)} day{Math.abs(daysDiff) !== 1 ? 's' : ''} {direction}
            </Text>
          )}

          {(showDatePicker || Platform.OS === 'ios') && (
            <DateTimePicker
              value={targetDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              themeVariant="light"
              onChange={handleDateChange}
              style={styles.datePicker}
            />
          )}
        </View>

        {/* Move Mode Options */}
        <View style={[styles.section, { backgroundColor: Colors.cardBackground }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Options</Text>

          <TouchableOpacity
            style={[
              styles.optionItem,
              moveMode === 'single' && { backgroundColor: Colors.primaryBlue + '10' },
            ]}
            onPress={() => setMoveMode('single')}
          >
            <Ionicons
              name={moveMode === 'single' ? 'radio-button-on' : 'radio-button-off'}
              size={24}
              color={moveMode === 'single' ? Colors.primaryBlue : Colors.secondaryText}
            />
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: Colors.primaryText }]}>
                Move this task only
              </Text>
              <Text style={[styles.optionDesc, { color: Colors.secondaryText }]}>
                Other tasks stay where they are
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.optionItem,
              moveMode === 'cascade' && { backgroundColor: Colors.primaryBlue + '10' },
            ]}
            onPress={() => setMoveMode('cascade')}
          >
            <Ionicons
              name={moveMode === 'cascade' ? 'radio-button-on' : 'radio-button-off'}
              size={24}
              color={moveMode === 'cascade' ? Colors.primaryBlue : Colors.secondaryText}
            />
            <View style={styles.optionText}>
              <Text style={[styles.optionTitle, { color: Colors.primaryText }]}>
                Move and shift all after
              </Text>
              <Text style={[styles.optionDesc, { color: Colors.secondaryText }]}>
                Tasks on or after this date will shift by {Math.abs(daysDiff) || '...'} day{Math.abs(daysDiff) !== 1 ? 's' : ''}
              </Text>
            </View>
          </TouchableOpacity>
        </View>
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
  taskInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: 12,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskDetails: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  currentDate: {
    fontSize: 14,
    marginTop: 4,
  },
  section: {
    padding: Spacing.md,
    marginHorizontal: Spacing.md,
    marginTop: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  dateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    gap: 10,
  },
  dateText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  diffText: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  datePicker: {
    marginTop: 8,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: BorderRadius.md,
    gap: 12,
    marginTop: 8,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  optionDesc: {
    fontSize: 13,
    marginTop: 2,
  },
});
