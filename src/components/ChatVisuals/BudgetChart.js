import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function BudgetChart({ data }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const {
    period = 'This Month',
    earned = 0,
    budgeted = 0,
    collected = 0,
    pending = 0,
    percentage = 0
  } = data;

  const formatCurrency = (amount) => {
    return `$${amount.toLocaleString()}`;
  };

  const getPercentageColor = () => {
    if (percentage >= 90) return Colors.success;
    if (percentage >= 70) return Colors.primaryBlue;
    if (percentage >= 50) return Colors.warning;
    return Colors.error;
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.period, { color: Colors.secondaryText }]}>{period}</Text>
        <View style={styles.percentageContainer}>
          <Text style={[styles.percentage, { color: getPercentageColor() }]}>
            {percentage}%
          </Text>
        </View>
      </View>

      {/* Main Budget Bar */}
      <View style={styles.mainSection}>
        <View style={styles.budgetRow}>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>Total Earned</Text>
          <Text style={[styles.value, { color: Colors.primaryText }]}>
            {formatCurrency(earned)}
          </Text>
        </View>
        <View style={styles.budgetRow}>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>Budgeted</Text>
          <Text style={[styles.value, { color: Colors.secondaryText }]}>
            {formatCurrency(budgeted)}
          </Text>
        </View>

        {/* Progress Bar */}
        <View style={[styles.progressBarBg, { backgroundColor: Colors.lightGray }]}>
          <View
            style={[
              styles.progressBarFill,
              {
                backgroundColor: getPercentageColor(),
                width: `${Math.min(percentage, 100)}%`
              }
            ]}
          />
        </View>
      </View>

      {/* Payment Status */}
      <View style={styles.paymentSection}>
        <View style={styles.paymentRow}>
          <View style={styles.paymentItem}>
            <View style={styles.iconContainer}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
            </View>
            <View>
              <Text style={[styles.paymentLabel, { color: Colors.secondaryText }]}>
                Collected
              </Text>
              <Text style={[styles.paymentValue, { color: Colors.primaryText }]}>
                {formatCurrency(collected)}
              </Text>
            </View>
          </View>

          <View style={styles.paymentItem}>
            <View style={styles.iconContainer}>
              <Ionicons name="time-outline" size={20} color={Colors.warning} />
            </View>
            <View>
              <Text style={[styles.paymentLabel, { color: Colors.secondaryText }]}>
                Pending
              </Text>
              <Text style={[styles.paymentValue, { color: Colors.primaryText }]}>
                {formatCurrency(pending)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Visual Summary */}
      <View style={styles.summaryBar}>
        <View
          style={[
            styles.collectedBar,
            {
              backgroundColor: Colors.success,
              flex: collected / (collected + pending) || 0
            }
          ]}
        />
        <View
          style={[
            styles.pendingBar,
            {
              backgroundColor: Colors.warning,
              flex: pending / (collected + pending) || 0
            }
          ]}
        />
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
  period: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  percentageContainer: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  percentage: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  mainSection: {
    marginBottom: Spacing.lg,
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  label: {
    fontSize: FontSizes.small,
  },
  value: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  progressBarBg: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: Spacing.md,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  paymentSection: {
    marginBottom: Spacing.md,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  paymentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconContainer: {
    marginRight: Spacing.xs,
  },
  paymentLabel: {
    fontSize: FontSizes.tiny,
    marginBottom: 2,
  },
  paymentValue: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  summaryBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  collectedBar: {
    height: '100%',
  },
  pendingBar: {
    height: '100%',
  },
});
