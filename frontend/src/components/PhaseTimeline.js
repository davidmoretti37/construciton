import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import Slider from '@react-native-community/slider';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius, TASK_STATUSES, getTaskStatus } from '../constants/theme';
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
  // Optional per-phase financial overlay used by the merged Budget Breakdown
  // card on ProjectDetailView. When `phaseSpentByName` is provided, each phase
  // header gets a "Spent $X of $Y" line; when `onViewTransactions` is provided
  // each expanded phase gets a "View Transactions" CTA that scopes to the
  // phase name as a transaction subcategory filter.
  phaseSpentByName = null,
  onViewTransactions,
  onAddTransaction,
  // Inline task authoring while editing. When `onAddTask` is provided, each
  // expanded phase renders a "+ Add Task" button in edit mode. `onTaskDelete`
  // shows a small trash icon per task; `onTaskDescriptionChange` swaps the
  // task row into a TextInput so the description can be typed directly.
  onAddTask,
  onTaskDelete,
  onTaskDescriptionChange,
  // Per-phase budget editing. When `onPhaseBudgetChange` is wired and
  // `isEditing` is true, the green "$X" chip becomes a TextInput so the
  // budget can be edited in place. Parent should mutate local phases state
  // so the next save round persists the new value via upsertProjectPhases.
  onPhaseBudgetChange,
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
    const status = getTaskStatus(task);
    const statusDef = TASK_STATUSES[status];
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
                borderColor: status === 'done' ? '#10B981' : Colors.border,
                backgroundColor: status === 'done' ? '#10B981' : 'transparent',
              }
            ]}
          >
            {status === 'done' && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
          <Text
            style={[
              styles.taskText,
              {
                color: status === 'done' ? Colors.secondaryText : Colors.primaryText,
                textDecorationLine: status === 'done' ? 'line-through' : 'none',
                flex: 1,
              }
            ]}
            numberOfLines={2}
          >
            {task.description || task.name}
          </Text>
          <View style={[styles.taskStatusBadge, { backgroundColor: statusDef.color + '18' }]}>
            <View style={[styles.taskStatusDot, { backgroundColor: statusDef.color }]} />
            <Text style={[styles.taskStatusText, { color: statusDef.color }]}>{statusDef.label}</Text>
          </View>
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

        // Optional financial overlay (Budget Breakdown context)
        const phaseBudget = parseFloat(phase.budget) || 0;
        const phaseSpent = phaseSpentByName
          ? (phaseSpentByName[String(phase.name || '').toLowerCase()] || 0)
          : null;
        const showSpentLine = phaseSpent !== null && (phaseBudget > 0 || phaseSpent > 0);
        const isOverBudget = showSpentLine && phaseBudget > 0 && phaseSpent > phaseBudget;
        const spentPct = showSpentLine && phaseBudget > 0
          ? Math.min(100, Math.round((phaseSpent / phaseBudget) * 100))
          : 0;
        const spentBarColor = isOverBudget ? '#EF4444' : spentPct > 80 ? '#F59E0B' : '#3B82F6';

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
                    {(parseFloat(phase.budget) || 0) > 0 && !isEditing && (
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#16A34A', marginLeft: 8 }}>
                        ${Number(phase.budget).toLocaleString()}
                      </Text>
                    )}
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

            {/* Dedicated budget editor row — renders only when editing so the
                progress slider above can't overlap the TextInput. Full-width. */}
            {isEditing && onPhaseBudgetChange && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border, gap: 12 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase' }}>Phase Budget</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#16A34A' }}>$</Text>
                  <TextInput
                    style={{ fontSize: 16, fontWeight: '700', color: '#16A34A', minWidth: 100, textAlign: 'right', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 2, borderBottomColor: '#16A34A' }}
                    value={String(phase.budget || '')}
                    onChangeText={(v) => onPhaseBudgetChange(phase.id, String(v).replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#CBD5E1"
                  />
                </View>
              </View>
            )}

            {/* Spend overlay (Budget Breakdown context only) */}
            {showSpentLine && (
              <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase' }}>Spent</Text>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: isOverBudget ? '#EF4444' : Colors.primaryText }}>
                    ${phaseSpent.toLocaleString()}{phaseBudget > 0 ? ` of $${phaseBudget.toLocaleString()}` : ''}
                  </Text>
                </View>
                {phaseBudget > 0 && (
                  <View style={{ height: 5, backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ height: 5, borderRadius: 3, width: `${spentPct}%`, backgroundColor: spentBarColor }} />
                  </View>
                )}
                {phaseBudget > 0 && (
                  <Text style={{ fontSize: 11, color: isOverBudget ? '#EF4444' : '#94A3B8', marginTop: 4 }}>
                    {isOverBudget
                      ? `Over by $${(phaseSpent - phaseBudget).toLocaleString()}`
                      : `$${(phaseBudget - phaseSpent).toLocaleString()} left · ${spentPct}%`}
                  </Text>
                )}
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

            {/* Inline Add Task — only when editing AND parent wired onAddTask */}
            {isExpanded && isEditing && onAddTask && (
              <TouchableOpacity
                onPress={() => onAddTask(phase)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: Colors.border }}
              >
                <Ionicons name="add-circle-outline" size={16} color="#7C3AED" />
                <Text style={{ color: '#7C3AED', fontSize: 13, fontWeight: '700' }}>Add Task</Text>
              </TouchableOpacity>
            )}

            {/* Per-phase Transactions CTAs (only when expanded + parent supplied handlers) */}
            {isExpanded && (onViewTransactions || onAddTransaction) && (
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12, borderTopWidth: 1, borderTopColor: Colors.border }}>
                {onViewTransactions && (
                  <TouchableOpacity
                    onPress={() => onViewTransactions(phase)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EFF6FF', paddingVertical: 10, borderRadius: 10 }}
                  >
                    <Ionicons name="receipt-outline" size={14} color="#3B82F6" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#3B82F6' }}>View Transactions</Text>
                  </TouchableOpacity>
                )}
                {onAddTransaction && (
                  <TouchableOpacity
                    onPress={() => onAddTransaction(phase)}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F0FDF4', paddingVertical: 10, borderRadius: 10 }}
                  >
                    <Ionicons name="add-circle-outline" size={14} color="#16A34A" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#16A34A' }}>Add Transaction</Text>
                  </TouchableOpacity>
                )}
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
  taskStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 4,
    gap: 3,
  },
  taskStatusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  taskStatusText: {
    fontSize: 10,
    fontWeight: '600',
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
