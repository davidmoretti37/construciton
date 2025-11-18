import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

/**
 * PhaseOverview - Chat visual component for displaying project phases
 * Used in AI chat responses to show phase status and progress
 */
export default function PhaseOverview({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  if (!data || !data.phases || data.phases.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
        <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
          No phases configured for this project
        </Text>
      </View>
    );
  }

  const { projectName, phases } = data;

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
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Calculate overall completion
  const overallCompletion = phases.length > 0
    ? Math.round(phases.reduce((sum, p) => sum + (p.completion_percentage || 0), 0) / phases.length)
    : 0;

  const handleViewDetails = () => {
    if (onAction) {
      onAction({
        type: 'view-project-phases',
        data: { projectId: data.projectId }
      });
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="layers" size={24} color={Colors.primaryBlue} />
          <View style={{ flex: 1 }}>
            {projectName && (
              <Text style={[styles.projectName, { color: Colors.secondaryText }]}>
                {projectName}
              </Text>
            )}
            <Text style={[styles.title, { color: Colors.primaryText }]}>
              Project Phases
            </Text>
          </View>
        </View>
        <Text style={[styles.overallPercentage, { color: Colors.primaryBlue }]}>
          {overallCompletion}%
        </Text>
      </View>

      {/* Segmented Progress Bar */}
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
                  backgroundColor: statusColor + '20',
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

      {/* Phase List */}
      <View style={styles.phaseList}>
        {phases.map((phase, index) => {
          const statusColor = getStatusColor(phase.status);
          const isLast = index === phases.length - 1;

          return (
            <View
              key={phase.id || index}
              style={[
                styles.phaseItem,
                { borderBottomColor: Colors.border },
                isLast && styles.lastPhaseItem,
              ]}
            >
              {/* Icon */}
              <Ionicons
                name={getStatusIcon(phase.status)}
                size={20}
                color={statusColor}
                style={styles.phaseIcon}
              />

              {/* Phase Info */}
              <View style={styles.phaseInfo}>
                <View style={styles.phaseHeader}>
                  <Text style={[styles.phaseName, { color: Colors.primaryText }]}>
                    {phase.name}
                  </Text>
                  <Text style={[styles.phasePercentage, { color: statusColor }]}>
                    {phase.completion_percentage || 0}%
                  </Text>
                </View>

                {/* Dates & Status */}
                <View style={styles.phaseDetails}>
                  {phase.start_date && phase.end_date && (
                    <Text style={[styles.dateText, { color: Colors.secondaryText }]}>
                      {formatDate(phase.start_date)} → {formatDate(phase.end_date)}
                    </Text>
                  )}
                  {phase.status === 'behind' && (
                    <View style={styles.behindBadge}>
                      <Ionicons name="alert-circle" size={12} color="#EF4444" />
                      <Text style={styles.behindText}>Behind</Text>
                    </View>
                  )}
                  {phase.time_extensions && phase.time_extensions.length > 0 && (
                    <View style={styles.extensionBadge}>
                      <Ionicons name="time-outline" size={12} color={Colors.primaryBlue} />
                      <Text style={[styles.extensionText, { color: Colors.primaryBlue }]}>
                        +{phase.time_extensions.reduce((sum, ext) => sum + ext.days, 0)}d
                      </Text>
                    </View>
                  )}
                </View>

                {/* Tasks Summary */}
                {phase.tasks && phase.tasks.length > 0 && (
                  <View style={styles.tasksRow}>
                    <Ionicons name="list-outline" size={14} color={Colors.secondaryText} />
                    <Text style={[styles.tasksText, { color: Colors.secondaryText }]}>
                      {phase.tasks.filter(t => t.completed).length}/{phase.tasks.length} tasks done
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Action Button */}
      {onAction && (
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleViewDetails}
          activeOpacity={0.7}
        >
          <Text style={styles.actionButtonText}>View Project Details</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
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
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    flex: 1,
  },
  projectName: {
    fontSize: FontSizes.tiny,
    marginBottom: 2,
  },
  title: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  overallPercentage: {
    fontSize: FontSizes.title,
    fontWeight: '700',
  },
  segmentedProgressBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  progressSegment: {
    position: 'relative',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  phaseList: {
    marginBottom: Spacing.md,
  },
  phaseItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  lastPhaseItem: {
    borderBottomWidth: 0,
  },
  phaseIcon: {
    marginRight: Spacing.sm,
    marginTop: 2,
  },
  phaseInfo: {
    flex: 1,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  phaseName: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    flex: 1,
  },
  phasePercentage: {
    fontSize: FontSizes.small,
    fontWeight: '700',
    marginLeft: Spacing.sm,
  },
  phaseDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  dateText: {
    fontSize: FontSizes.tiny,
  },
  behindBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
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
  },
  extensionText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  tasksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  tasksText: {
    fontSize: FontSizes.tiny,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.sm,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: FontSizes.small,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
});
