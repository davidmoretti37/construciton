import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function TaskDetailModal({
  visible,
  task,
  onClose,
  onToggleComplete,
  canComplete = false,
}) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  if (!task) return null;

  const isCompleted = task.status === 'completed';
  const isIncomplete = task.status === 'incomplete';

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
            {t('labels.taskDetails', 'Task Details')}
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {/* Status Badge */}
          <View style={[
            styles.statusBadge,
            {
              backgroundColor: isCompleted
                ? '#10B981' + '20'
                : isIncomplete
                  ? Colors.errorRed + '20'
                  : Colors.primaryBlue + '20',
            }
          ]}>
            <Ionicons
              name={isCompleted ? 'checkmark-circle' : isIncomplete ? 'close-circle' : 'time-outline'}
              size={20}
              color={isCompleted ? '#10B981' : isIncomplete ? Colors.errorRed : Colors.primaryBlue}
            />
            <Text style={[
              styles.statusText,
              {
                color: isCompleted ? '#10B981' : isIncomplete ? Colors.errorRed : Colors.primaryBlue,
              }
            ]}>
              {isCompleted
                ? t('labels.done', 'Done')
                : isIncomplete
                  ? t('labels.incomplete', 'Incomplete')
                  : t('labels.pending', 'Pending')}
            </Text>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            {task.title}
          </Text>

          {/* Description */}
          {task.description ? (
            <View style={[styles.section, { backgroundColor: Colors.cardBackground || Colors.white, borderColor: Colors.border }]}>
              <Text style={[styles.sectionLabel, { color: Colors.secondaryText }]}>
                {t('labels.description', 'Description')}
              </Text>
              <Text style={[styles.descriptionText, { color: Colors.primaryText }]}>
                {task.description}
              </Text>
            </View>
          ) : null}

          {/* Dates */}
          <View style={[styles.section, { backgroundColor: Colors.cardBackground || Colors.white, borderColor: Colors.border }]}>
            <Text style={[styles.sectionLabel, { color: Colors.secondaryText }]}>
              {t('labels.dates', 'Dates')}
            </Text>
            {task.start_date && (
              <View style={styles.dateRow}>
                <Ionicons name="calendar-outline" size={16} color={Colors.secondaryText} />
                <Text style={[styles.dateText, { color: Colors.primaryText }]}>
                  {formatDate(task.start_date)}
                  {task.end_date && task.end_date !== task.start_date
                    ? `  →  ${formatDate(task.end_date)}`
                    : ''}
                </Text>
              </View>
            )}
          </View>

          {/* Project */}
          {task.projects?.name && (
            <View style={[styles.section, { backgroundColor: Colors.cardBackground || Colors.white, borderColor: Colors.border }]}>
              <Text style={[styles.sectionLabel, { color: Colors.secondaryText }]}>
                {t('labels.project', 'Project')}
              </Text>
              <View style={styles.dateRow}>
                <Ionicons name="business-outline" size={16} color={Colors.warningOrange || '#F59E0B'} />
                <Text style={[styles.dateText, { color: Colors.primaryText }]}>
                  {task.projects.name}
                </Text>
              </View>
            </View>
          )}

          {/* Completed by */}
          {isCompleted && task.completed_worker?.full_name && (
            <View style={[styles.section, { backgroundColor: Colors.cardBackground || Colors.white, borderColor: Colors.border }]}>
              <Text style={[styles.sectionLabel, { color: Colors.secondaryText }]}>
                {t('labels.completedBy', 'Completed By')}
              </Text>
              <View style={styles.dateRow}>
                <Ionicons name="person-circle-outline" size={16} color="#10B981" />
                <Text style={[styles.dateText, { color: Colors.primaryText }]}>
                  {task.completed_worker.full_name}
                </Text>
              </View>
            </View>
          )}

          {/* Incomplete reason */}
          {isIncomplete && task.incomplete_reason && (
            <View style={[styles.section, { backgroundColor: Colors.errorRed + '10', borderColor: Colors.errorRed + '30' }]}>
              <Text style={[styles.sectionLabel, { color: Colors.errorRed }]}>
                {t('labels.reason', 'Reason')}
              </Text>
              <Text style={[styles.descriptionText, { color: Colors.primaryText }]}>
                {task.incomplete_reason}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Bottom action button */}
        {canComplete && (
          <View style={[styles.bottomBar, { borderTopColor: Colors.border, backgroundColor: Colors.background }]}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: isCompleted ? Colors.secondaryText : '#10B981' },
              ]}
              onPress={() => {
                if (onToggleComplete) onToggleComplete(task);
              }}
            >
              <Ionicons
                name={isCompleted ? 'arrow-undo-outline' : 'checkmark-circle-outline'}
                size={20}
                color="#FFFFFF"
              />
              <Text style={styles.actionButtonText}>
                {isCompleted
                  ? t('actions.markPending', 'Mark as Pending')
                  : t('actions.markComplete', 'Mark as Complete')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    gap: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  section: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  descriptionText: {
    fontSize: 15,
    lineHeight: 22,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    fontSize: 15,
  },
  bottomBar: {
    padding: 16,
    borderTopWidth: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
