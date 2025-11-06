import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function ExpenseCard({ data }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const {
    jobs = [],
    totalExpenses = 0,
    period = 'All Projects'
  } = data;

  const formatCurrency = (amount) => {
    return `$${amount.toLocaleString()}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="cash-outline" size={20} color="#EF4444" />
          <Text style={[styles.period, { color: Colors.secondaryText }]}>{period}</Text>
        </View>
      </View>

      {/* Job List */}
      <View style={styles.jobList}>
        {jobs.map((job, index) => (
          <View key={index} style={styles.jobRow}>
            {/* Job Header */}
            <View style={styles.jobHeader}>
              <Text style={[styles.jobName, { color: Colors.primaryText }]}>
                {job.name}
              </Text>
              <View style={styles.jobAmounts}>
                <Text style={[styles.expenseAmount, { color: '#EF4444' }]}>
                  {formatCurrency(job.expenses)}
                </Text>
                <View style={[styles.percentageBadge, { backgroundColor: '#EF4444' + '20' }]}>
                  <Text style={[styles.percentage, { color: '#EF4444' }]}>
                    {job.percentage}%
                  </Text>
                </View>
              </View>
            </View>

            {/* Financial Details */}
            <View style={styles.financialDetails}>
              <Text style={[styles.detailText, { color: Colors.secondaryText }]}>
                Contract: {formatCurrency(job.contractAmount || 0)} | Collected: {formatCurrency(job.incomeCollected)} | Profit: {formatCurrency(job.profit || 0)}
              </Text>
            </View>

            {/* Compound Progress Bar (Red: Expenses, Green: Profit, Grey: Pending) */}
            <View style={[styles.compoundProgressBg, { borderWidth: 1, borderColor: '#E5E5E5', backgroundColor: '#F3F4F6' }]}>
              {/* Red: Expenses */}
              {job.expenses > 0 && job.contractAmount > 0 && (
                <View
                  style={[
                    styles.progressSegment,
                    {
                      backgroundColor: '#EF4444',
                      width: `${Math.min((job.expenses / job.contractAmount) * 100, 100)}%`
                    }
                  ]}
                />
              )}
              {/* Green: Net Profit (Income - Expenses) */}
              {job.profit > 0 && job.contractAmount > 0 && (
                <View
                  style={[
                    styles.progressSegment,
                    {
                      backgroundColor: '#22C55E',
                      width: `${Math.min((job.profit / job.contractAmount) * 100, 100)}%`
                    }
                  ]}
                />
              )}
              {/* Grey: Pending (Contract - Income) */}
              {(job.contractAmount - job.incomeCollected) > 0 && job.contractAmount > 0 && (
                <View
                  style={[
                    styles.progressSegment,
                    {
                      backgroundColor: '#D1D5DB',
                      width: `${Math.min(((job.contractAmount - job.incomeCollected) / job.contractAmount) * 100, 100)}%`
                    }
                  ]}
                />
              )}
            </View>

            {/* Legend */}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                <Text style={[styles.legendText, { color: Colors.secondaryText }]}>
                  Expenses: {formatCurrency(job.expenses)}
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#22C55E' }]} />
                <Text style={[styles.legendText, { color: Colors.secondaryText }]}>
                  Profit: {formatCurrency(job.profit || 0)}
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#D1D5DB' }]} />
                <Text style={[styles.legendText, { color: Colors.secondaryText }]}>
                  Pending: {formatCurrency((job.contractAmount || 0) - job.incomeCollected)}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Total Summary */}
      <View style={[styles.totalSection, { borderTopColor: Colors.border }]}>
        <View style={styles.totalRow}>
          <Text style={[styles.totalLabel, { color: Colors.secondaryText }]}>
            Total Expenses
          </Text>
          <Text style={[styles.totalAmount, { color: '#EF4444' }]}>
            {formatCurrency(totalExpenses)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginVertical: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  period: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  jobList: {
    gap: Spacing.lg,
  },
  jobRow: {
    marginBottom: Spacing.md,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  jobName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    flex: 1,
  },
  jobAmounts: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  expenseAmount: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  percentageBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  percentage: {
    fontSize: FontSizes.small,
    fontWeight: '700',
  },
  financialDetails: {
    marginBottom: Spacing.xs,
  },
  detailText: {
    fontSize: FontSizes.tiny,
  },
  compoundProgressBg: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  progressSegment: {
    height: '100%',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: FontSizes.tiny,
  },
  totalSection: {
    borderTopWidth: 1,
    paddingTop: Spacing.md,
    marginTop: Spacing.md,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
});
