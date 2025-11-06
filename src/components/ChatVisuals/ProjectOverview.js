import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function ProjectOverview({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const {
    projects = [],
    summary = { total: 0, onTrack: 0, behind: 0, overdue: 0 }
  } = data;

  const formatCurrency = (amount) => {
    return `$${amount.toLocaleString()}`;
  };

  const getStatusColor = (status, isOverdue) => {
    if (isOverdue) return '#EF4444'; // Red
    if (status === 'behind' || status === 'over-budget') return '#F59E0B'; // Orange
    if (status === 'on-track' || status === 'active') return '#10B981'; // Green
    return '#6B7280'; // Grey for draft
  };

  const getStatusIcon = (status, isOverdue) => {
    if (isOverdue) return 'alert-circle';
    if (status === 'behind' || status === 'over-budget') return 'warning';
    if (status === 'on-track' || status === 'active') return 'checkmark-circle';
    return 'time-outline';
  };

  const getStatusLabel = (status, isOverdue, daysRemaining) => {
    if (isOverdue) return `OVERDUE by ${Math.abs(daysRemaining)} days`;
    if (status === 'behind') return 'Behind Schedule';
    if (status === 'over-budget') return 'Over Budget';
    if (status === 'on-track') return daysRemaining > 0 ? `${daysRemaining} days left` : 'On Track';
    return 'In Progress';
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header with Summary */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="list-outline" size={20} color={Colors.primaryBlue} />
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>
            Project Overview
          </Text>
        </View>
        <Text style={[styles.projectCount, { color: Colors.secondaryText }]}>
          {summary.total} {summary.total === 1 ? 'project' : 'projects'}
        </Text>
      </View>

      {/* Summary Stats */}
      {(summary.onTrack > 0 || summary.behind > 0 || summary.overdue > 0) && (
        <View style={styles.summaryRow}>
          {summary.onTrack > 0 && (
            <View style={styles.summaryItem}>
              <Ionicons name="checkmark-circle" size={16} color="#10B981" />
              <Text style={[styles.summaryText, { color: '#10B981' }]}>
                {summary.onTrack} on track
              </Text>
            </View>
          )}
          {summary.behind > 0 && (
            <View style={styles.summaryItem}>
              <Ionicons name="warning" size={16} color="#F59E0B" />
              <Text style={[styles.summaryText, { color: '#F59E0B' }]}>
                {summary.behind} behind
              </Text>
            </View>
          )}
          {summary.overdue > 0 && (
            <View style={styles.summaryItem}>
              <Ionicons name="alert-circle" size={16} color="#EF4444" />
              <Text style={[styles.summaryText, { color: '#EF4444' }]}>
                {summary.overdue} overdue
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Project List */}
      <View style={styles.projectList}>
        {projects.map((project, index) => {
          const statusColor = getStatusColor(project.status, project.isOverdue);
          const statusIcon = getStatusIcon(project.status, project.isOverdue);
          const statusLabel = getStatusLabel(project.status, project.isOverdue, project.daysRemaining);

          return (
            <TouchableOpacity
              key={project.id || index}
              style={[
                styles.projectRow,
                { borderLeftColor: statusColor, borderBottomColor: Colors.border }
              ]}
              onPress={() => onAction?.({ type: 'view-project', data: { projectId: project.id } })}
              activeOpacity={0.7}
            >
              {/* Project Info */}
              <View style={styles.projectInfo}>
                <View style={styles.projectHeader}>
                  <Text style={[styles.projectName, { color: Colors.primaryText }]}>
                    {project.name}
                  </Text>
                  {project.client && (
                    <Text style={[styles.clientName, { color: Colors.secondaryText }]}>
                      {project.client}
                    </Text>
                  )}
                </View>

                {/* Status Badge */}
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
                  <Ionicons name={statusIcon} size={14} color={statusColor} />
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {statusLabel}
                  </Text>
                </View>

                {/* Metrics Row */}
                <View style={styles.metricsRow}>
                  {/* Progress */}
                  <View style={styles.metric}>
                    <Ionicons name="checkmark-circle-outline" size={14} color={Colors.secondaryText} />
                    <Text style={[styles.metricText, { color: Colors.secondaryText }]}>
                      {project.percentComplete}% complete
                    </Text>
                  </View>

                  {/* Profit */}
                  {project.profit !== undefined && (
                    <View style={styles.metric}>
                      <Ionicons
                        name={project.profit >= 0 ? "trending-up" : "trending-down"}
                        size={14}
                        color={project.profit >= 0 ? '#10B981' : '#EF4444'}
                      />
                      <Text style={[
                        styles.metricText,
                        { color: project.profit >= 0 ? '#10B981' : '#EF4444' }
                      ]}>
                        {formatCurrency(Math.abs(project.profit))} {project.profit >= 0 ? 'profit' : 'loss'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Last Activity */}
                {project.lastActivity && (
                  <Text style={[styles.lastActivity, { color: Colors.secondaryText }]}>
                    Last update: {project.lastActivity}
                  </Text>
                )}
              </View>

              {/* Arrow */}
              <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginVertical: Spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  projectCount: {
    fontSize: FontSizes.small,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    padding: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: '#F9FAFB',
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  summaryText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  projectList: {
    padding: Spacing.sm,
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderLeftWidth: 4,
    borderBottomWidth: 1,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  projectInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  projectHeader: {
    marginBottom: Spacing.xs,
  },
  projectName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  clientName: {
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  statusText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  metric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricText: {
    fontSize: FontSizes.tiny,
  },
  lastActivity: {
    fontSize: FontSizes.tiny,
    marginTop: 4,
  },
});
