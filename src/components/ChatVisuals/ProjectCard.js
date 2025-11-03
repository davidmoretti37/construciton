import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function ProjectCard({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const {
    id,
    name,
    client,
    budget,
    spent,
    percentComplete = 0,
    status = 'active',
    workers = [],
    daysRemaining,
    lastActivity
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
            ${spent?.toLocaleString()} / ${budget?.toLocaleString()}
          </Text>
        </View>
        {budget && spent && (
          <Text style={[styles.budgetPercentage, { color: Colors.secondaryText }]}>
            {Math.round((spent / budget) * 100)}% spent
          </Text>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        {workers && workers.length > 0 && (
          <View style={styles.workersSection}>
            <Ionicons name="people-outline" size={14} color={Colors.secondaryText} />
            <Text style={[styles.footerText, { color: Colors.secondaryText }]}>
              {workers.join(', ')}
            </Text>
          </View>
        )}
        {daysRemaining !== undefined && (
          <Text style={[styles.footerText, { color: Colors.secondaryText }]}>
            {daysRemaining > 0 ? `${daysRemaining} days left` : 'Due today'}
          </Text>
        )}
      </View>

      {lastActivity && (
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
  footerText: {
    fontSize: FontSizes.tiny,
  },
  lastActivity: {
    fontSize: FontSizes.tiny,
    marginTop: Spacing.xs,
  },
});
