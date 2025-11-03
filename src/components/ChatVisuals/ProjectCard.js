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

  // Extract all fields from data
  const {
    id,
    name = 'Unnamed Project',
    client = '',
    percentComplete = 0,
    status = 'draft',
    workers = [],
    daysRemaining = null,
    lastActivity = ''
  } = data;

  // Extras/Additions support
  const extras = data.extras || [];
  const extrasTotal = extras.reduce((sum, extra) => sum + (extra.amount || 0), 0);

  // New financial model - properly read from data object with fallbacks
  const baseContractAmount = data.contractAmount || data.budget || 0;
  const contractAmount = baseContractAmount + extrasTotal; // Total includes extras
  const incomeCollected = data.incomeCollected || 0;
  const expenses = data.expenses || data.spent || 0;
  const profit = incomeCollected - expenses;

  // Legacy fields
  const budget = data.budget || baseContractAmount;
  const spent = data.spent || expenses;

  // Debug logging to see what values we're getting
  console.log('ProjectCard data:', {
    name,
    contractAmount,
    incomeCollected,
    expenses,
    profit,
    rawData: data
  });

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
          <Text style={[styles.footerText, { color: Colors.primaryText }]}>
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
          <Text style={[styles.footerText, { color: Colors.primaryText }]}>
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
          {client && <Text style={[styles.clientName, { color: Colors.primaryText }]}>{client}</Text>}
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
        <Text style={[styles.progressText, { color: Colors.primaryText }]}>
          {percentComplete}% complete
        </Text>
      </View>

      {/* Days Remaining */}
      <View style={styles.daysRemainingSection}>
        {renderTimeline()}
      </View>

      {/* Financial Section */}
      <View style={styles.financialSection}>
        {/* Contract Amount Header */}
        <View style={styles.financialRow}>
          <Text style={[styles.financialLabel, { color: Colors.primaryText }]}>
            {extras.length > 0 ? 'Total Contract Amount' : 'Contract Amount'}
          </Text>
          <Text style={[styles.financialValue, { color: Colors.primaryText }]}>
            ${(contractAmount || 0).toLocaleString()}
          </Text>
        </View>

        {/* Extras/Additions Breakdown */}
        {extras.length > 0 && (
          <View style={styles.extrasContainer}>
            <Text style={[styles.extrasHeader, { color: Colors.primaryText }]}>
              • Base Contract: ${baseContractAmount.toLocaleString()}
            </Text>
            {extras.map((extra, index) => (
              <Text key={index} style={[styles.extrasItem, { color: Colors.primaryText }]}>
                • {extra.description || 'Additional Work'}: ${(extra.amount || 0).toLocaleString()}
                {extra.daysAdded ? ` (+${extra.daysAdded} days)` : ''}
              </Text>
            ))}
          </View>
        )}

        {/* Financial Progress Bar showing Income (Green), Expenses (Red), Pending (Grey) */}
        {contractAmount > 0 && (
          <View style={styles.compoundProgressContainer}>
            {/* Legend */}
            <View style={styles.progressLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.error }]} />
                <Text style={[styles.legendText, { color: Colors.primaryText, fontSize: FontSizes.small }]}>
                  Expenses: <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: FontSizes.medium }}>${(expenses || 0).toLocaleString()}</Text> <Text style={{ fontSize: FontSizes.tiny }}>({Math.round((expenses / contractAmount) * 100)}%)</Text>
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
                <Text style={[styles.legendText, { color: Colors.primaryText, fontSize: FontSizes.small }]}>
                  Net Available: <Text style={{ color: '#22C55E', fontWeight: '700', fontSize: FontSizes.medium }}>${Math.max(0, (incomeCollected || 0) - (expenses || 0)).toLocaleString()}</Text> <Text style={{ fontSize: FontSizes.tiny }}>({Math.round(Math.max(0, (incomeCollected - expenses) / contractAmount) * 100)}%)</Text>
                </Text>
              </View>
              <View style={[styles.legendItem, { alignItems: 'center' }]}>
                <View style={{ width: 8, marginRight: 6 }} />
                <Text style={[styles.legendText, { color: Colors.primaryText, fontSize: FontSizes.small, flex: 1 }]}>
                  Pending: <Text style={{ color: '#9CA3AF', fontWeight: '700', fontSize: FontSizes.medium }}>${((contractAmount || 0) - (incomeCollected || 0)).toLocaleString()}</Text> <Text style={{ fontSize: FontSizes.tiny }}>({Math.round(((contractAmount - incomeCollected) / contractAmount) * 100)}%)</Text>
                </Text>
              </View>
            </View>

            {/* Main Progress Bar */}
            <View style={[styles.compoundProgressBg, { borderWidth: 1, borderColor: '#E5E5E5' }]}>
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
                      backgroundColor: '#D1D5DB', // Light grey
                      width: `${Math.min(((contractAmount - incomeCollected) / contractAmount) * 100, 100)}%`
                    }
                  ]}
                />
              )}
            </View>
          </View>
        )}

        {/* Profit Display */}
        <View style={styles.profitContainer}>
          <View style={styles.financialRow}>
            <Text style={[styles.financialLabel, { color: Colors.primaryText, fontWeight: '600' }]}>
              Current Profit
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
});
