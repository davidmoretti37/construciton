import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import PhaseTimeline from '../PhaseTimeline';

export default function ProjectCard({ data, onAction }) {
  const { t } = useTranslation('projects');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [expandedPhases, setExpandedPhases] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState(data);

  const togglePhaseExpansion = (phaseId) => {
    setExpandedPhases(prev => ({
      ...prev,
      [phaseId]: !prev[phaseId]
    }));
  };

  // Edit mode handlers
  const handleStartEdit = () => {
    setEditedData({ ...data });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditedData(data);
    setIsEditing(false);
  };

  const handleSaveEdit = () => {
    if (onAction) {
      onAction({ type: 'update-project', data: editedData });
    }
    setIsEditing(false);
  };

  const handleUpdateField = (field, value) => {
    setEditedData({ ...editedData, [field]: value });
  };

  if (!data) {
    console.error('ProjectCard: No data provided');
    return null;
  }

  // Extract all fields from data (use editedData when editing)
  const currentData = isEditing ? editedData : data;
  const {
    id,
    name = t('card.unnamedProject'),
    percentComplete = 0,
    status = 'active',
    workers = [],
    daysRemaining = null,
    lastActivity = '',
    phases = [],
    hasPhases = false
  } = currentData;

  // Extras/Additions support (for history display only)
  const extras = currentData.extras || [];
  const baseContract = currentData.baseContract || 0;

  // New financial model - contractAmount is ALREADY calculated by database (base + extras)
  // DO NOT add extras again here!
  const contractAmount = currentData.contractAmount || currentData.budget || 0;
  const incomeCollected = currentData.incomeCollected || 0;
  const expenses = currentData.expenses || currentData.spent || 0;
  const profit = incomeCollected - expenses;

  // Legacy fields
  const budget = currentData.budget || contractAmount;
  const spent = currentData.spent || expenses;

  const getStatusColor = () => {
    switch (status) {
      case 'on-track':
        return '#10B981'; // Green
      case 'behind':
        return '#F59E0B'; // Orange
      case 'over-budget':
        return '#EF4444'; // Red
      default:
        return '#3B82F6'; // Blue
    }
  };

  // Calculate progress values
  const progressWidth = Math.min(percentComplete, 100);
  const progressColor = getStatusColor();

  // Helper function to render a single phase
  const renderPhase = (phase, index) => {
    const isExpanded = expandedPhases[phase.id || index];
    const hasPayment = currentData.payment_structure === 'per_phase' && phase.payment_amount;
    const hasTasks = phase.tasks && phase.tasks.length > 0;

    return (
      <View key={phase.id || index} style={[styles.phaseCard, { borderColor: Colors.border }]}>
        {/* Phase Header - Clickable to expand/collapse */}
        <TouchableOpacity
          style={[styles.phaseHeader, { backgroundColor: Colors.cardBackground }]}
          onPress={() => togglePhaseExpansion(phase.id || index)}
          activeOpacity={0.7}
        >
          <View style={styles.phaseHeaderLeft}>
            <Ionicons
              name={isExpanded ? "chevron-down" : "chevron-forward"}
              size={20}
              color={Colors.primaryBlue}
            />
            <Text style={[styles.phaseName, { color: Colors.primaryText }]}>
              {phase.name}
            </Text>
          </View>
          <View style={styles.phaseHeaderRight}>
            {hasPayment && (
              <Text style={[styles.phasePayment, { color: Colors.primaryBlue }]}>
                ${phase.payment_amount.toLocaleString()}
              </Text>
            )}
            <Text style={[styles.phaseProgress, { color: Colors.secondaryText }]}>
              {phase.completion_percentage || 0}%
            </Text>
          </View>
        </TouchableOpacity>

        {/* Expandable Content */}
        {isExpanded && (
          <View style={styles.phaseContent}>
            {/* Progress Bar */}
            <View style={styles.phaseProgressBar}>
              <View style={[styles.phaseProgressBg, { backgroundColor: Colors.lightGray }]}>
                <View
                  style={[
                    styles.phaseProgressFill,
                    {
                      backgroundColor: Colors.primaryBlue,
                      width: `${phase.completion_percentage || 0}%`
                    }
                  ]}
                />
              </View>
            </View>

            {/* Phase Dates */}
            {phase.start_date && phase.end_date && (
              <View style={styles.phaseDates}>
                <Ionicons name="calendar-outline" size={14} color={Colors.secondaryText} />
                <Text style={[styles.phaseDateText, { color: Colors.secondaryText }]}>
                  {(() => {
                    const [y, m, d] = phase.start_date.split('-').map(Number);
                    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  })()}
                  {' → '}
                  {(() => {
                    const [y, m, d] = phase.end_date.split('-').map(Number);
                    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  })()}
                </Text>
              </View>
            )}

            {/* Tasks Checklist */}
            {hasTasks && (
              <View style={styles.tasksContainer}>
                <Text style={[styles.tasksHeader, { color: Colors.primaryText }]}>
                  {t('card.tasks')}
                </Text>
                {phase.tasks.map((task, taskIndex) => (
                  <View key={taskIndex} style={styles.taskItem}>
                    <Ionicons
                      name={task.completed ? "checkmark-circle" : "ellipse-outline"}
                      size={18}
                      color={task.completed ? Colors.success : Colors.lightGray}
                    />
                    <Text style={[
                      styles.taskText,
                      {
                        color: task.completed ? Colors.secondaryText : Colors.primaryText,
                        textDecorationLine: task.completed ? 'line-through' : 'none'
                      }
                    ]}>
                      {task.description || task.name}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'on-track':
        return 'checkmark-circle';
      case 'behind':
        return 'time-outline';
      case 'over-budget':
        return 'alert-circle';
      default:
        return 'construct-outline';
    }
  };

  const handlePress = () => {
    if (onAction) {
      onAction({ label: 'View Details', type: 'view-project', data: { projectId: id } });
    }
  };

  const renderTimeline = () => {
    // If daysRemaining is a number, use it
    if (typeof daysRemaining === 'number') {
      if (daysRemaining === 0) {
        return (
          <View style={styles.timelineContainer}>
            <Ionicons name="flag" size={14} color={Colors.warning} />
            <Text style={[styles.footerText, { color: Colors.warning, fontWeight: '600' }]}>
              {t('card.dueToday')}
            </Text>
          </View>
        );
      } else if (daysRemaining < 0) {
        return (
          <View style={styles.timelineContainer}>
            <Ionicons name="alert-circle" size={14} color={Colors.error} />
            <Text style={[styles.footerText, { color: Colors.error, fontWeight: '600' }]}>
              {t('card.daysOverdue', { days: Math.abs(daysRemaining) })}
            </Text>
          </View>
        );
      } else {
        return (
          <Text style={[styles.footerText, { color: Colors.primaryText }]}>
            {t('card.daysLeft', { days: daysRemaining, unit: daysRemaining === 1 ? t('card.day') : t('card.dayPlural') })}
          </Text>
        );
      }
    }

    // If no daysRemaining but we have an endDate, show it
    if (currentData.endDate) {
      // Parse date as local time to avoid timezone issues
      const [year, month, day] = currentData.endDate.split('-');
      const endDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      endDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const diffTime = endDate - today;
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        return (
          <View style={styles.timelineContainer}>
            <Ionicons name="flag" size={14} color={Colors.warning} />
            <Text style={[styles.footerText, { color: Colors.warning, fontWeight: '600' }]}>
              {t('card.dueToday')}
            </Text>
          </View>
        );
      } else if (diffDays < 0) {
        return (
          <View style={styles.timelineContainer}>
            <Ionicons name="alert-circle" size={14} color={Colors.error} />
            <Text style={[styles.footerText, { color: Colors.error, fontWeight: '600' }]}>
              {t('card.daysOverdue', { days: Math.abs(diffDays) })}
            </Text>
          </View>
        );
      } else {
        return (
          <Text style={[styles.footerText, { color: Colors.primaryText }]}>
            {t('card.daysLeft', { days: diffDays, unit: diffDays === 1 ? t('card.day') : t('card.dayPlural') })}
          </Text>
        );
      }
    }

    return null;
  };

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          {isEditing ? (
            <TextInput
              style={[styles.editInput, styles.projectName, { color: Colors.primaryText, borderColor: Colors.border }]}
              value={name}
              onChangeText={(value) => handleUpdateField('name', value)}
              placeholder="Project Name"
              placeholderTextColor={Colors.secondaryText}
            />
          ) : (
            <Text style={[styles.projectName, { color: Colors.primaryText }]}>{name}</Text>
          )}
        </View>
        <View style={styles.headerActions}>
          {!isEditing ? (
            <TouchableOpacity
              style={[styles.editIconButton, { backgroundColor: Colors.primaryBlue + '15' }]}
              onPress={handleStartEdit}
              activeOpacity={0.7}
            >
              <Ionicons name="create-outline" size={20} color={Colors.primaryBlue} />
            </TouchableOpacity>
          ) : (
            <View style={styles.editActions}>
              <TouchableOpacity onPress={handleCancelEdit} style={styles.editActionButton}>
                <Ionicons name="close" size={20} color={Colors.error} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleSaveEdit} style={styles.editActionButton}>
                <Ionicons name="checkmark" size={20} color={Colors.success} />
              </TouchableOpacity>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '20' }]}>
            <Ionicons name={getStatusIcon()} size={16} color={getStatusColor()} />
          </View>
        </View>
      </View>

      {/* Payment Structure Badge */}
      {currentData.payment_structure && (
        <View style={styles.paymentBadgeContainer}>
          <View style={[styles.paymentBadge, { backgroundColor: Colors.primaryBlue + '15', borderColor: Colors.primaryBlue + '30' }]}>
            <Ionicons
              name={currentData.payment_structure === 'per_phase' ? 'layers-outline' : 'wallet-outline'}
              size={14}
              color={Colors.primaryBlue}
            />
            <Text style={[styles.paymentBadgeText, { color: Colors.primaryBlue }]}>
              {currentData.payment_structure === 'per_phase' ? t('card.payPerPhase') : t('card.payInFull')}
            </Text>
          </View>
        </View>
      )}

      {/* Timeline Progress Bar - Show phases if available, otherwise simple bar */}
      {hasPhases && phases && phases.length > 0 ? (
        <View style={styles.progressSection}>
          <PhaseTimeline phases={phases} compact={true} projectProgress={percentComplete} />

          {/* Expandable Phase Details */}
          <View style={styles.phasesContainer}>
            {/* Group phases by scope if multiple scopes exist */}
            {(() => {
              // Check if there are multiple scopes
              const hasMultipleScopes = phases.some(p => p.scope_id);

              if (!hasMultipleScopes) {
                // Single scope - render normally
                return phases.map((phase, index) => renderPhase(phase, index));
              }

              // Multiple scopes - group by scope
              const scopes = {};
              phases.forEach(phase => {
                const scopeId = phase.scope_id || 'original';
                if (!scopes[scopeId]) {
                  scopes[scopeId] = {
                    id: scopeId,
                    name: phase.scope_name || t('card.originalWork'),
                    phases: []
                  };
                }
                scopes[scopeId].phases.push(phase);
              });

              return Object.values(scopes).map((scope, scopeIndex) => (
                <View key={scope.id} style={styles.scopeSection}>
                  {/* Scope Header */}
                  <View style={[styles.scopeHeader, { backgroundColor: Colors.lightBackground }]}>
                    <Ionicons name="folder-outline" size={16} color={Colors.primaryBlue} />
                    <Text style={[styles.scopeName, { color: Colors.primaryText }]}>
                      {scope.name}
                    </Text>
                    <Text style={[styles.scopePhaseCount, { color: Colors.secondaryText }]}>
                      {scope.phases.length} {scope.phases.length !== 1 ? t('card.phasePlural') : t('card.phase')}
                    </Text>
                  </View>

                  {/* Scope Phases */}
                  {scope.phases.map((phase, phaseIndex) => renderPhase(phase, `${scope.id}-${phaseIndex}`))}
                </View>
              ));
            })()}
          </View>
        </View>
      ) : (
        <View style={styles.progressSection}>
          {/* Timeline Progress Bar (Bold) - Time-based */}
          <View style={styles.progressBarContainer}>
            <View style={styles.progressBarHeader}>
              <Text style={[styles.progressLabel, { color: Colors.primaryText, fontWeight: '600' }]}>
                {t('card.timeline')}
              </Text>
              <Text style={[styles.progressPercentage, { color: Colors.primaryText, fontWeight: '700' }]}>
                {percentComplete}%
              </Text>
            </View>
            <View style={[styles.progressBarBg, { backgroundColor: Colors.lightGray }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: getStatusColor(),
                    width: `${Math.min(percentComplete, 100)}%`
                  }
                ]}
              />
            </View>
          </View>

          {/* Actual Work Progress Bar (Faded) - Task-based */}
          {hasPhases && (
            <View style={[styles.progressBarContainer, { opacity: 0.65, marginTop: 8 }]}>
              <View style={styles.progressBarHeader}>
                <Text style={[styles.progressLabel, { color: Colors.secondaryText, fontWeight: '500' }]}>
                  {t('card.workComplete')}
                </Text>
                <Text style={[styles.progressPercentage, { color: Colors.secondaryText, fontWeight: '600' }]}>
                  {currentData.actual_progress || 0}%
                </Text>
              </View>
              <View style={[styles.progressBarBg, { backgroundColor: Colors.lightGray }]}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      backgroundColor: Colors.primaryBlue,
                      width: `${Math.min(currentData.actual_progress || 0, 100)}%`
                    }
                  ]}
                />
              </View>
            </View>
          )}

          {/* Timeline Note */}
          {!currentData.startDate || !currentData.endDate ? (
            <Text style={[styles.progressNote, { color: Colors.secondaryText }]}>
              {t('card.noTimeline')}
            </Text>
          ) : null}

          {/* Variance Alert */}
          {hasPhases && currentData.estimated_completion_date && currentData.endDate && (() => {
            const variance = percentComplete - (currentData.actual_progress || 0);
            const estimatedDate = new Date(currentData.estimated_completion_date);
            const plannedDate = new Date(currentData.endDate);
            const daysLate = Math.ceil((estimatedDate - plannedDate) / (1000 * 60 * 60 * 24));

            if (Math.abs(variance) > 15 || Math.abs(daysLate) > 3) {
              const isBehind = variance > 15 || daysLate > 3;
              return (
                <View style={[styles.varianceAlert, {
                  backgroundColor: isBehind ? '#EF4444' + '15' : '#10B981' + '15',
                  borderColor: isBehind ? '#EF4444' : '#10B981'
                }]}>
                  <Ionicons
                    name={isBehind ? "alert-circle" : "rocket"}
                    size={16}
                    color={isBehind ? "#EF4444" : "#10B981"}
                  />
                  <Text style={[styles.varianceText, { color: isBehind ? "#EF4444" : "#10B981" }]}>
                    {isBehind
                      ? t('card.behindWithDate', { percent: Math.round(variance), date: estimatedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), days: daysLate })
                      : t('card.aheadOfSchedule', { percent: Math.round(Math.abs(variance)) })
                    }
                  </Text>
                </View>
              );
            }
            return null;
          })()}
        </View>
      )}

      {/* Days Remaining */}
      <View style={styles.daysRemainingSection}>
        {renderTimeline()}
      </View>

      {/* Financial Section */}
      <View style={styles.financialSection}>
        {/* Contract Amount Header */}
        <View style={styles.financialRow}>
          <Text style={[styles.financialLabel, { color: Colors.primaryText }]}>
            {extras.length > 0 ? t('financial.totalContractAmount') : t('financial.contractAmount')}
          </Text>
          <Text style={[styles.financialValue, { color: Colors.primaryText }]}>
            ${(contractAmount || 0).toLocaleString()}
          </Text>
        </View>

        {/* Extras/Additions Breakdown */}
        {extras.length > 0 && (
          <View style={styles.extrasContainer}>
            <Text style={[styles.extrasHeader, { color: Colors.primaryText }]}>
              • {t('card.baseContract')}: ${baseContract.toLocaleString()}
            </Text>
            {extras.map((extra, index) => (
              <Text key={index} style={[styles.extrasItem, { color: Colors.primaryText }]}>
                • {extra.description || t('card.additionalWork')}: ${(extra.amount || 0).toLocaleString()}
                {extra.daysAdded ? ` (+${extra.daysAdded} ${t('card.dayPlural')})` : ''}
              </Text>
            ))}
          </View>
        )}

        {/* Financial Progress Bar showing Income (Green), Expenses (Red), Pending (Grey) - Always show */}
        <View style={styles.compoundProgressContainer}>
            {/* Legend */}
            <View style={styles.progressLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.error }]} />
                <Text style={[styles.legendText, { color: Colors.primaryText, fontSize: FontSizes.small }]}>
                  {t('financial.expenses')} <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: FontSizes.medium }}>${(expenses || 0).toLocaleString()}</Text> <Text style={{ fontSize: FontSizes.tiny }}>({Math.round((expenses / contractAmount) * 100)}%)</Text>
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
                <Text style={[styles.legendText, { color: Colors.primaryText, fontSize: FontSizes.small }]}>
                  {t('financial.netAvailable')} <Text style={{ color: '#22C55E', fontWeight: '700', fontSize: FontSizes.medium }}>${Math.max(0, (incomeCollected || 0) - (expenses || 0)).toLocaleString()}</Text> <Text style={{ fontSize: FontSizes.tiny }}>({Math.round(Math.max(0, (incomeCollected - expenses) / contractAmount) * 100)}%)</Text>
                </Text>
              </View>
              <View style={[styles.legendItem, { alignItems: 'center' }]}>
                <View style={{ width: 8, marginRight: 6 }} />
                <Text style={[styles.legendText, { color: Colors.primaryText, fontSize: FontSizes.small, flex: 1 }]}>
                  {t('financial.pending')} <Text style={{ color: '#9CA3AF', fontWeight: '700', fontSize: FontSizes.medium }}>${((contractAmount || 0) - (incomeCollected || 0)).toLocaleString()}</Text> <Text style={{ fontSize: FontSizes.tiny }}>({Math.round(((contractAmount - incomeCollected) / contractAmount) * 100)}%)</Text>
                </Text>
              </View>
            </View>

            {/* Main Progress Bar */}
            <View style={[styles.compoundProgressBg, { borderWidth: 1, borderColor: Colors.border }]}>
              {/* Red: Expenses (Fixed - shows as % of total budget) */}
              {expenses > 0 && (
                <View
                  style={[
                    styles.expensesBar,
                    {
                      backgroundColor: '#EF4444', // Bright red
                      width: `${Math.min((expenses / contractAmount) * 100, 100)}%`
                    }
                  ]}
                />
              )}
              {/* Green: Net Profit (Income - Expenses) */}
              {(incomeCollected - expenses) > 0 && (
                <View
                  style={[
                    styles.incomeBar,
                    {
                      backgroundColor: '#22C55E', // Bright green
                      width: `${Math.min(((incomeCollected - expenses) / contractAmount) * 100, 100)}%`
                    }
                  ]}
                />
              )}
              {/* Grey: Pending/Uncollected */}
              {(contractAmount - incomeCollected) > 0 && (
                <View
                  style={[
                    styles.remainingBar,
                    {
                      backgroundColor: Colors.secondaryText,
                      width: `${Math.min(((contractAmount - incomeCollected) / contractAmount) * 100, 100)}%`
                    }
                  ]}
                />
              )}
            </View>
          </View>

        {/* Profit Display */}
        <View style={styles.profitContainer}>
          <View style={styles.financialRow}>
            <Text style={[styles.financialLabel, { color: Colors.primaryText, fontWeight: '600' }]}>
              {t('financial.currentProfit')}
            </Text>
            <Text
              style={[
                styles.financialValue,
                {
                  color: profit >= 0 ? Colors.success : Colors.error,
                  fontWeight: '700'
                }
              ]}
            >
              ${(profit || 0).toLocaleString()} {profit >= 0 ? '✅' : '⚠️'}
            </Text>
          </View>
        </View>
      </View>

      {/* Footer - Workers only */}
      {Array.isArray(workers) && workers.length > 0 && (
        <View style={styles.footer}>
          <View style={styles.workersSection}>
            <Ionicons name="people-outline" size={14} color={Colors.primaryText} />
            <Text style={[styles.footerText, { color: Colors.primaryText }]}>
              {workers.join(', ')}
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  titleContainer: {
    flex: 1,
  },
  projectName: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginBottom: 2,
  },
  clientName: {
    fontSize: FontSizes.small,
  },
  statusBadge: {
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
  },
  progressSection: {
    marginBottom: Spacing.md,
  },
  progressBarContainer: {
    marginBottom: Spacing.sm,
  },
  progressBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: FontSizes.tiny,
  },
  progressPercentage: {
    fontSize: FontSizes.small,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: FontSizes.tiny,
  },
  progressNote: {
    fontSize: FontSizes.tiny,
    marginTop: 4,
    fontStyle: 'italic',
  },
  varianceAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 8,
  },
  varianceText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    flex: 1,
  },
  paymentBadgeContainer: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  paymentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: 4,
  },
  paymentBadgeText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  daysRemainingSection: {
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  financialSection: {
    marginBottom: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  financialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  financialLabel: {
    fontSize: FontSizes.small,
  },
  financialValue: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  extrasContainer: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
    paddingLeft: Spacing.sm,
  },
  extrasHeader: {
    fontSize: FontSizes.tiny,
    marginBottom: 2,
  },
  extrasItem: {
    fontSize: FontSizes.tiny,
    marginBottom: 2,
  },
  compoundProgressContainer: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  compoundProgressBg: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    marginTop: Spacing.sm,
  },
  incomeBar: {
    height: 12,
  },
  expensesBar: {
    height: 12,
  },
  remainingBar: {
    height: 12,
  },
  progressLegend: {
    gap: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: FontSizes.tiny,
  },
  profitContainer: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.05)',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  workersSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  timelineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  footerText: {
    fontSize: FontSizes.tiny,
  },
  lastActivity: {
    fontSize: FontSizes.tiny,
    marginTop: Spacing.xs,
  },
  // Expandable Phase Styles
  phasesContainer: {
    marginTop: Spacing.md,
  },
  phaseCard: {
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
  },
  phaseHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  phaseName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  phaseHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  phasePayment: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  phaseProgress: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  phaseContent: {
    padding: Spacing.md,
    paddingTop: Spacing.sm,
  },
  phaseProgressBar: {
    marginBottom: Spacing.sm,
  },
  phaseProgressBg: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  phaseProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  phaseDates: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  phaseDateText: {
    fontSize: FontSizes.tiny,
  },
  tasksContainer: {
    marginTop: Spacing.sm,
  },
  tasksHeader: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  taskText: {
    fontSize: FontSizes.small,
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  editIconButton: {
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  editActionButton: {
    padding: Spacing.xs,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    minHeight: 36,
  },
  // Scope Section Styles (for multiple estimates/scopes)
  scopeSection: {
    marginBottom: Spacing.md,
  },
  scopeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  scopeName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    flex: 1,
  },
  scopePhaseCount: {
    fontSize: FontSizes.small,
  },
});
