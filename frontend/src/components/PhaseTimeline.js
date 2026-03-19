import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import Slider from '@react-native-community/slider';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function PhaseTimeline({
  phases,
  onPhasePress,
  onTaskToggle,
  onTaskReorder,
  onTaskMove,
  compact = false,
  expandedPhaseIds = new Set(),
  projectProgress = null,
  isEditing = false,
  progressValues = {},
  onProgressChange,
  onProgressSave,
}) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  if (!phases || phases.length === 0) {
    return null;
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#22C55E';
      case 'in_progress': return '#3B82F6';
      case 'behind': return '#EF4444';
      case 'not_started':
      default: return Colors.lightGray;
    }
  };

  const overallCompletion = projectProgress !== null
    ? projectProgress
    : (phases.length > 0
        ? Math.round(phases.reduce((sum, p) => sum + (p.completion_percentage || 0), 0) / phases.length)
        : 0);

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={styles.segmentedProgressBar}>
          {phases.map((phase, index) => {
            const statusColor = getStatusColor(phase.status);
            const completion = phase.completion_percentage || 0;
            return (
              <View
                key={phase.id || index}
                style={[
                  styles.progressSegment,
                  {
                    flex: 1,
                    backgroundColor: statusColor + '40',
                    borderLeftWidth: index > 0 ? 1 : 0,
                    borderColor: Colors.border,
                  },
                ]}
              >
                <View style={[styles.progressFill, { width: `${completion}%`, backgroundColor: statusColor }]} />
              </View>
            );
          })}
        </View>
        <View style={styles.compactLabels}>
          <Text style={[styles.compactLabel, { color: Colors.secondaryText }]}>
            {phases.length} sections
          </Text>
          <Text style={[styles.compactLabel, { color: Colors.primaryText, fontWeight: '600' }]}>
            {overallCompletion}% complete
          </Text>
        </View>
      </View>
    );
  }

  const handleTaskDragEnd = useCallback((phaseId, { data }) => {
    if (onTaskReorder) {
      onTaskReorder(phaseId, data);
    }
  }, [onTaskReorder]);

  const handleMoveTask = useCallback((task, sourcePhase) => {
    const otherPhases = phases.filter(p => p.id !== sourcePhase.id);
    if (otherPhases.length === 0) return;

    Alert.alert(
      'Move Task',
      `Move "${task.description || task.name}" to:`,
      [
        ...otherPhases.map(targetPhase => ({
          text: targetPhase.name,
          onPress: () => onTaskMove && onTaskMove(task, sourcePhase, targetPhase),
        })),
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [phases, onTaskMove]);

  const renderTask = useCallback(({ item: task, drag, isActive, phase }) => {
    const hasMultipleSections = phases.length > 1;
    return (
      <ScaleDecorator>
        <TouchableOpacity
          style={[
            styles.taskItem,
            { borderBottomColor: Colors.border },
            isActive && styles.taskItemDragging,
          ]}
          activeOpacity={0.6}
          onPress={() => onTaskToggle && onTaskToggle(task, phase)}
          onLongPress={drag}
          delayLongPress={200}
        >
          <View style={styles.taskDragHandle}>
            <Ionicons name="reorder-three" size={16} color={Colors.secondaryText + '60'} />
          </View>
          <View
            style={[
              styles.taskCheckbox,
              {
                borderColor: task.completed ? '#10B981' : Colors.border,
                backgroundColor: task.completed ? '#10B981' : 'transparent',
              }
            ]}
          >
            {task.completed && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
          <Text
            style={[
              styles.taskText,
              {
                color: task.completed ? Colors.secondaryText : Colors.primaryText,
                textDecorationLine: task.completed ? 'line-through' : 'none',
              }
            ]}
            numberOfLines={2}
          >
            {task.description || task.name}
          </Text>
          {hasMultipleSections && onTaskMove && (
            <TouchableOpacity
              style={styles.taskMoveBtn}
              onPress={() => handleMoveTask(task, phase)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="swap-horizontal" size={16} color={Colors.secondaryText + '80'} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </ScaleDecorator>
    );
  }, [onTaskToggle, onTaskMove, handleMoveTask, Colors, phases.length]);

  return (
    <View style={styles.container}>
      {/* Overall Progress */}
      <View style={styles.overallLabelRow}>
        <Text style={[styles.overallLabel, { color: Colors.secondaryText }]}>Overall Progress</Text>
        <Text style={[styles.overallPercentage, { color: Colors.primaryText }]}>{overallCompletion}%</Text>
      </View>
      <View style={[styles.overallProgressBar, { backgroundColor: '#E5E7EB' }]}>
        <View style={[styles.overallProgressFill, { width: `${overallCompletion}%`, backgroundColor: '#10B981' }]} />
      </View>

      {/* Section List */}
      {phases.map((phase, index) => {
        const isExpanded = expandedPhaseIds.has(phase.id);
        const phaseTasks = phase.tasks || [];
        const completedCount = phaseTasks.filter(t => t.completed).length;
        const completion = phase.completion_percentage || (phaseTasks.length > 0 ? Math.round((completedCount / phaseTasks.length) * 100) : 0);
        // Derive status color from actual completion, not stored status
        const dotColor = completion >= 100 ? '#22C55E' : completion > 0 ? '#3B82F6' : Colors.lightGray;

        return (
          <View key={phase.id || index} style={[styles.sectionCard, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
            {/* Section Header */}
            <TouchableOpacity
              style={styles.sectionHeader}
              onPress={() => onPhasePress && onPhasePress(phase)}
              activeOpacity={0.7}
            >
              <View style={styles.sectionHeaderLeft}>
                <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                <View style={styles.sectionTitleArea}>
                  <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{phase.name}</Text>
                  <View style={styles.sectionMeta}>
                    {phase.planned_days && (
                      <Text style={[styles.sectionDays, { color: Colors.secondaryText }]}>
                        {phase.planned_days} {phase.planned_days === 1 ? 'day' : 'days'}
                      </Text>
                    )}
                    <Text style={[styles.sectionTaskCount, { color: Colors.secondaryText }]}>
                      {completedCount}/{phaseTasks.length} tasks
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.sectionHeaderRight}>
                {/* Progress or Slider */}
                {isEditing ? (
                  <View style={styles.sliderContainer}>
                    <Slider
                      style={styles.slider}
                      minimumValue={0}
                      maximumValue={100}
                      step={5}
                      value={progressValues[phase.id] ?? phase.completion_percentage ?? 0}
                      onValueChange={(value) => onProgressChange?.(phase.id, value)}
                      onSlidingComplete={(value) => onProgressSave?.(phase.id, value)}
                      minimumTrackTintColor="#10B981"
                      maximumTrackTintColor="#E5E7EB"
                      thumbTintColor="#10B981"
                    />
                    <Text style={[styles.sliderValue, { color: Colors.primaryText }]}>
                      {Math.round(progressValues[phase.id] ?? phase.completion_percentage ?? 0)}%
                    </Text>
                  </View>
                ) : (
                  <Text style={[styles.sectionPercentage, { color: dotColor }]}>
                    {completion}%
                  </Text>
                )}
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={Colors.secondaryText}
                />
              </View>
            </TouchableOpacity>

            {/* Progress Bar */}
            {!isEditing && (
              <View style={[styles.sectionProgressBar, { backgroundColor: '#E5E7EB' }]}>
                <View
                  style={[styles.sectionProgressFill, { width: `${completion}%`, backgroundColor: '#10B981' }]}
                />
              </View>
            )}

            {/* Expanded Tasks */}
            {isExpanded && phaseTasks.length > 0 && (
              <View style={[styles.tasksContainer, { borderTopColor: Colors.border }]}>
                <DraggableFlatList
                  data={phaseTasks}
                  keyExtractor={(item) => item.id || `task-${item.order}`}
                  renderItem={(props) => renderTask({ ...props, phase })}
                  onDragEnd={({ data }) => handleTaskDragEnd(phase.id, { data })}
                  containerStyle={styles.tasksList}
                  scrollEnabled={false}
                />
              </View>
            )}

            {isExpanded && phaseTasks.length === 0 && (
              <View style={[styles.emptyTasks, { borderTopColor: Colors.border }]}>
                <Text style={[styles.emptyTasksText, { color: Colors.secondaryText }]}>No tasks yet</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: Spacing.md,
  },
  compactContainer: {
    marginVertical: Spacing.sm,
  },
  segmentedProgressBar: {
    flexDirection: 'row',
    height: 16,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  progressSegment: {
    position: 'relative',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  compactLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  compactLabel: {
    fontSize: FontSizes.tiny,
  },
  overallLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  overallLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  overallPercentage: {
    fontSize: FontSizes.small,
    fontWeight: '700',
  },
  overallProgressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  overallProgressFill: {
    height: '100%',
    borderRadius: 4,
  },

  // Section card styles
  sectionCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: Spacing.md,
  },
  sectionTitleArea: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  sectionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  sectionDays: {
    fontSize: FontSizes.tiny,
  },
  sectionTaskCount: {
    fontSize: FontSizes.tiny,
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionPercentage: {
    fontSize: FontSizes.small,
    fontWeight: '700',
  },
  sectionProgressBar: {
    height: 3,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    borderRadius: 2,
    overflow: 'hidden',
  },
  sectionProgressFill: {
    height: '100%',
    borderRadius: 2,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 140,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderValue: {
    width: 35,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
  },

  // Tasks
  tasksContainer: {
    borderTopWidth: 1,
  },
  tasksList: {
    paddingHorizontal: Spacing.md,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  taskItemDragging: {
    backgroundColor: '#F0F9FF',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  taskDragHandle: {
    paddingRight: Spacing.sm,
  },
  taskCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  taskText: {
    fontSize: FontSizes.small,
    flex: 1,
    lineHeight: 20,
  },
  taskMoveBtn: {
    padding: Spacing.xs,
    marginLeft: Spacing.xs,
  },
  emptyTasks: {
    borderTopWidth: 1,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyTasksText: {
    fontSize: FontSizes.small,
    fontStyle: 'italic',
  },
});
