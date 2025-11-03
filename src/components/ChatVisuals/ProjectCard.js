import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function ProjectCard({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  if (!data) {
    console.error('ProjectCard: No data provided');
    return null;
  }

  const {
    id,
    name = 'Unnamed Project',
    client = '',
    budget = 0,
    spent = 0,
    percentComplete = 0,
    status = 'draft',
    workers = [],
    daysRemaining = null,
    lastActivity = ''
  } = data;

  const getStatusColor = () => {
    switch (status) {
      case 'on-track':
        return Colors.success;
      case 'behind':
        return Colors.warning;
      case 'over-budget':
        return Colors.error;
      default:
        return Colors.primaryBlue;
    }
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
              Due today
            </Text>
          </View>
        );
      } else if (daysRemaining < 0) {
        return (
          <View style={styles.timelineContainer}>
            <Ionicons name="alert-circle" size={14} color={Colors.error} />
            <Text style={[styles.footerText, { color: Colors.error, fontWeight: '600' }]}>
              {Math.abs(daysRemaining)} days overdue
            </Text>
          </View>
        );
      } else {
        return (
          <Text style={[styles.footerText, { color: Colors.secondaryText }]}>
            {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left
          </Text>
        );
      }
    }

    // If no daysRemaining but we have an endDate, show it
    if (data.endDate) {
      // Parse date as local time to avoid timezone issues
      const [year, month, day] = data.endDate.split('-');
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
              Due today
            </Text>
          </View>
        );
      } else if (diffDays < 0) {
        return (
          <View style={styles.timelineContainer}>
            <Ionicons name="alert-circle" size={14} color={Colors.error} />
            <Text style={[styles.footerText, { color: Colors.error, fontWeight: '600' }]}>
              {Math.abs(diffDays)} days overdue
            </Text>
          </View>
        );
      } else {
        return (
          <Text style={[styles.footerText, { color: Colors.secondaryText }]}>
            {diffDays} {diffDays === 1 ? 'day' : 'days'} left
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
          <Text style={[styles.projectName, { color: Colors.primaryText }]}>{name}</Text>
          {client && <Text style={[styles.clientName, { color: Colors.secondaryText }]}>{client}</Text>}
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + '20' }]}>
          <Ionicons name={getStatusIcon()} size={16} color={getStatusColor()} />
        </View>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressSection}>
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
        <Text style={[styles.progressText, { color: Colors.secondaryText }]}>
          {percentComplete}% complete
        </Text>
      </View>

      {/* Budget */}
      <View style={styles.budgetSection}>
        <View style={styles.budgetRow}>
          <Text style={[styles.budgetLabel, { color: Colors.secondaryText }]}>Budget</Text>
          <Text style={[styles.budgetValue, { color: Colors.primaryText }]}>
            ${(spent || 0).toLocaleString()} / ${(budget || 0).toLocaleString()}
          </Text>
        </View>
        {budget > 0 && (
          <Text style={[styles.budgetPercentage, { color: Colors.secondaryText }]}>
            {Math.round((spent / budget) * 100)}% spent
          </Text>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        {Array.isArray(workers) && workers.length > 0 && (
          <View style={styles.workersSection}>
            <Ionicons name="people-outline" size={14} color={Colors.secondaryText} />
            <Text style={[styles.footerText, { color: Colors.secondaryText }]}>
              {workers.join(', ')}
            </Text>
          </View>
        )}
        {renderTimeline()}
      </View>

      {lastActivity && typeof lastActivity === 'string' && lastActivity.trim() && (
        <Text style={[styles.lastActivity, { color: Colors.secondaryText }]}>
          Last activity: {lastActivity}
        </Text>
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
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: FontSizes.tiny,
  },
  budgetSection: {
    marginBottom: Spacing.md,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  budgetLabel: {
    fontSize: FontSizes.small,
  },
  budgetValue: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  budgetPercentage: {
    fontSize: FontSizes.tiny,
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
});
