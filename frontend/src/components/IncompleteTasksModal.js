import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function IncompleteTasksModal({
  visible,
  onClose,
  onSubmit,
  tasks = [],
  projectName,
}) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [reasons, setReasons] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Initialize reasons when tasks change
  useEffect(() => {
    if (visible && tasks.length > 0) {
      const initialReasons = {};
      tasks.forEach(task => {
        initialReasons[task.id] = '';
      });
      setReasons(initialReasons);
    }
  }, [visible, tasks]);

  const updateReason = (taskId, reason) => {
    setReasons(prev => ({
      ...prev,
      [taskId]: reason,
    }));
  };

  const allReasonsProvided = () => {
    return tasks.every(task => reasons[task.id]?.trim().length > 0);
  };

  const handleSubmit = async () => {
    if (!allReasonsProvided()) {
      return;
    }

    setSubmitting(true);
    try {
      // Create array of task IDs with their reasons
      const taskReasons = tasks.map(task => ({
        taskId: task.id,
        reason: reasons[task.id].trim(),
      }));
      await onSubmit(taskReasons);
    } catch (error) {
      console.error('Error submitting task reasons:', error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: Colors.border }]}>
            <View style={{ width: 60 }} />
            <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
              {t('schedule:incompleteTasks', 'Incomplete Tasks')}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={[styles.closeText, { color: Colors.secondaryText }]}>{t('schedule:later', 'Later')}</Text>
            </TouchableOpacity>
          </View>

          {/* Warning Banner */}
          <View style={[styles.warningBanner, { backgroundColor: Colors.warningOrange + '15' }]}>
            <Ionicons name="alert-circle" size={24} color={Colors.warningOrange} />
            <View style={styles.warningTextContainer}>
              <Text style={[styles.warningTitle, { color: Colors.warningOrange }]}>
                {t('schedule:tasksDueToday', 'Tasks Due Today')}
              </Text>
              <Text style={[styles.warningDescription, { color: Colors.primaryText }]}>
                {t('schedule:incompleteTasksMessage', "The following tasks were due today but weren't completed. Please provide a reason for each before clocking out.")}
              </Text>
            </View>
          </View>

          {projectName && (
            <View style={[styles.projectHeader, { backgroundColor: Colors.primaryBlue + '10' }]}>
              <Ionicons name="business-outline" size={18} color={Colors.primaryBlue} />
              <Text style={[styles.projectName, { color: Colors.primaryBlue }]}>
                {projectName}
              </Text>
            </View>
          )}

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {tasks.map((task, index) => (
              <View key={task.id} style={[styles.taskItem, { backgroundColor: Colors.white }]}>
                <View style={styles.taskHeader}>
                  <View style={[styles.taskNumber, { backgroundColor: Colors.errorRed }]}>
                    <Text style={styles.taskNumberText}>{index + 1}</Text>
                  </View>
                  <Text style={[styles.taskTitle, { color: Colors.primaryText }]}>
                    {task.title}
                  </Text>
                </View>

                {task.description && (
                  <Text style={[styles.taskDescription, { color: Colors.secondaryText }]} numberOfLines={2}>
                    {task.description}
                  </Text>
                )}

                <Text style={[styles.reasonLabel, { color: Colors.secondaryText }]}>
                  {t('schedule:whyNotCompleted', "Why wasn't this completed?")} *
                </Text>
                <TextInput
                  style={[
                    styles.reasonInput,
                    {
                      backgroundColor: Colors.lightGray,
                      color: Colors.primaryText,
                      borderColor: reasons[task.id]?.trim() ? Colors.border : Colors.errorRed,
                    }
                  ]}
                  value={reasons[task.id] || ''}
                  onChangeText={(text) => updateReason(task.id, text)}
                  placeholder={t('schedule:reasonPlaceholder', 'e.g., Waiting for materials delivery...')}
                  placeholderTextColor={Colors.secondaryText}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>
            ))}
          </ScrollView>

          {/* Submit Button */}
          <View style={[styles.footer, { borderTopColor: Colors.border }]}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                { backgroundColor: allReasonsProvided() ? Colors.primaryBlue : Colors.secondaryText }
              ]}
              onPress={handleSubmit}
              disabled={!allReasonsProvided() || submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                  <Text style={styles.submitButtonText}>
                    {t('schedule:submitAndClockOut', 'Submit & Clock Out')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={[styles.footerHint, { color: Colors.secondaryText }]}>
              {t('schedule:supervisorNotified', 'Your supervisor will be notified of these reasons')}
            </Text>
          </View>
        </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  closeButton: {
    width: 60,
    alignItems: 'flex-end',
  },
  closeText: {
    fontSize: 16,
    fontWeight: '500',
  },
  warningBanner: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    alignItems: 'flex-start',
  },
  warningTextContainer: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  warningDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
  },
  projectName: {
    fontSize: 15,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  taskItem: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  taskNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskNumberText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  taskDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
    marginLeft: 38,
  },
  reasonLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 4,
  },
  reasonInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    minHeight: 70,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  footerHint: {
    fontSize: 13,
    textAlign: 'center',
  },
});
