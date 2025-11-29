import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function PhaseTimeline({
  phases,
  onPhasePress,
  compact = false,
  expandedPhaseId = null,
  projectProgress = null,
  isEditing = false,
  progressValues = {},
  onProgressChange,
  onProgressSave,
}) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  if (!phases || phases.length === 0) {
    return null;
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed':
        return '#22C55E'; // Green
      case 'in_progress':
        return '#3B82F6'; // Blue
      case 'behind':
        return '#EF4444'; // Red
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
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Use project timeline progress if provided, otherwise calculate from phases
  const overallCompletion = projectProgress !== null
    ? projectProgress
    : (phases.length > 0
        ? Math.round(phases.reduce((sum, p) => sum + (p.completion_percentage || 0), 0) / phases.length)
        : 0);

  if (compact) {
    // Compact view: Just show segmented progress bar
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
                    backgroundColor: statusColor + '40', // Increased opacity from 20 to 40
                    borderLeftWidth: index > 0 ? 1 : 0,
                    borderColor: Colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${completion}%`,
                      backgroundColor: statusColor,
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
        <View style={styles.compactLabels}>
          <Text style={[styles.compactLabel, { color: Colors.secondaryText }]}>
            {phases.length} phases
          </Text>
          <Text style={[styles.compactLabel, { color: Colors.primaryText, fontWeight: '600' }]}>
            {overallCompletion}% complete
          </Text>
        </View>
      </View>
    );
  }

  // Full view: Show detailed phase list
  return (
    <View style={styles.container}>
      {/* Overall Progress Label */}
      <View style={styles.overallLabelRow}>
        <Text style={[styles.overallLabel, { color: Colors.secondaryText }]}>
          Overall Progress
        </Text>
        <Text style={[styles.overallPercentage, { color: Colors.primaryText }]}>
          {overallCompletion}%
        </Text>
      </View>

      {/* Segmented Progress Bar - Shows each phase */}
      <View style={styles.segmentedProgressBar}>
        {phases.map((phase, index) => {
          const completion = phase.completion_percentage || 0;

          return (
            <View
              key={phase.id || index}
              style={[
                styles.progressSegment,
                {
                  flex: 1,
                  backgroundColor: '#FFFFFF',
                  borderLeftWidth: index > 0 ? 1 : 0,
                  borderColor: '#D1D5DB',
                },
              ]}
            >
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${completion}%`,
                    backgroundColor: '#10B981',
                  },
                ]}
              />
            </View>
          );
        })}
      </View>

      {/* Phase List */}
      <View style={styles.phaseList}>
        {phases.map((phase, index) => {
          const statusColor = getStatusColor(phase.status);
          const isLast = index === phases.length - 1;
          const isExpanded = expandedPhaseId === phase.id;
          const phaseTasks = phase.tasks || [];

          return (
            <View key={phase.id || index}>
              <TouchableOpacity
                style={[
                  styles.phaseItem,
                  { borderBottomColor: Colors.border },
                  (isLast && !isExpanded) && styles.lastPhaseItem,
                ]}
                onPress={() => onPhasePress && onPhasePress(phase)}
                activeOpacity={0.7}
              >
                {/* Left: Status Icon */}
                <View style={styles.phaseIconContainer}>
                  <Ionicons
                    name={getStatusIcon(phase.status)}
                    size={24}
                    color={statusColor}
                  />
                  {!isLast && (
                    <View
                      style={[
                        styles.connector,
                        { backgroundColor: Colors.border },
                      ]}
                    />
                  )}
                </View>

                {/* Middle: Phase Info */}
                <View style={styles.phaseInfo}>
                  <View style={styles.phaseHeader}>
                    <Text style={[styles.phaseName, { color: Colors.primaryText }]}>
                      {phase.name}
                    </Text>
                    <Text style={[styles.phasePercentage, { color: Colors.primaryText }]}>
                      {phase.completion_percentage || 0}%
                    </Text>
                  </View>

                  {/* Progress Bar or Slider */}
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
                    <View style={[styles.phaseProgressBar, { backgroundColor: '#E5E7EB' }]}>
                      <View
                        style={[
                          styles.phaseProgressFill,
                          {
                            width: `${phase.completion_percentage || 0}%`,
                            backgroundColor: '#10B981',
                          },
                        ]}
                      />
                    </View>
                  )}

                  {/* Dates */}
                  <View style={styles.phaseDates}>
                    {phase.start_date && (
                      <Text style={[styles.dateText, { color: Colors.secondaryText }]}>
                        {formatDate(phase.start_date)}
                      </Text>
                    )}
                    {phase.start_date && phase.end_date && (
                      <Ionicons name="arrow-forward" size={12} color={Colors.secondaryText} />
                    )}
                    {phase.end_date && (
                      <Text style={[styles.dateText, { color: Colors.secondaryText }]}>
                        {formatDate(phase.end_date)}
                      </Text>
                    )}
                    {phase.planned_days && (
                      <Text style={[styles.daysText, { color: Colors.secondaryText }]}>
                        ({phase.planned_days} days)
                      </Text>
                    )}
                  </View>
                </View>

                {/* Right: Chevron */}
                {onPhasePress && (
                  <Ionicons
                    name={isExpanded ? "chevron-down" : "chevron-forward"}
                    size={20}
                    color={Colors.secondaryText}
                  />
                )}
              </TouchableOpacity>

              {/* Expanded Tasks List */}
              {isExpanded && phaseTasks.length > 0 && (
                <View style={[styles.tasksContainer, { backgroundColor: Colors.lightGray + '50' }]}>
                  {phaseTasks.map((task, taskIndex) => (
                    <View
                      key={task.id || taskIndex}
                      style={[
                        styles.taskItem,
                        { borderBottomColor: Colors.border },
                        taskIndex === phaseTasks.length - 1 && styles.lastTaskItem,
                      ]}
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
                          <Ionicons name="checkmark" size={14} color="#fff" />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.taskText,
                          {
                            color: task.completed ? Colors.secondaryText : Colors.primaryText,
                            textDecorationLine: task.completed ? 'line-through' : 'none',
                          }
                        ]}
                      >
                        {task.description || task.name}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* No tasks message */}
              {isExpanded && phaseTasks.length === 0 && (
                <View style={[styles.emptyTasksContainer, { backgroundColor: Colors.lightGray + '50' }]}>
                  <Text style={[styles.emptyTasksText, { color: Colors.secondaryText }]}>
                    No tasks yet
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
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
  overallProgressBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  overallProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  overallPercentage: {
    fontSize: FontSizes.small,
    fontWeight: '700',
    textAlign: 'right',
  },
  segmentedProgressBar: {
    flexDirection: 'row',
    height: 16, // Increased from 12 to 16
    borderRadius: 8, // Increased from 6 to 8 to match new height
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: '#D1D5DB', // Light gray border
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
  phaseList: {
    marginTop: Spacing.sm,
  },
  phaseItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  lastPhaseItem: {
    borderBottomWidth: 0,
  },
  phaseIconContainer: {
    alignItems: 'center',
    marginRight: Spacing.md,
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    top: 30,
    bottom: -16,
    width: 2,
    left: 11,
  },
  phaseInfo: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  phaseName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    flex: 1,
  },
  phasePercentage: {
    fontSize: FontSizes.small,
    fontWeight: '700',
    marginLeft: Spacing.sm,
  },
  phaseProgressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  phaseProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  slider: {
    flex: 1,
    height: 40,
  },
  sliderValue: {
    width: 45,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
  },
  phaseDates: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  dateText: {
    fontSize: FontSizes.tiny,
  },
  daysText: {
    fontSize: FontSizes.tiny,
  },
  behindBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
  },
  behindText: {
    fontSize: FontSizes.tiny,
    color: '#EF4444',
    fontWeight: '600',
  },
  extensionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: Spacing.xs,
  },
  extensionText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  tasksContainer: {
    paddingLeft: 50,
    paddingRight: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
  },
  lastTaskItem: {
    borderBottomWidth: 0,
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
  },
  emptyTasksContainer: {
    paddingLeft: 50,
    paddingRight: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    alignItems: 'center',
  },
  emptyTasksText: {
    fontSize: FontSizes.small,
    fontStyle: 'italic',
  },
});
