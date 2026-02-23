import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../utils/financialReportUtils';

const formatCurrency = (amount) => {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function CategoryBreakdownBar({ breakdown, total }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  if (!total || total === 0) return null;

  const categories = Object.entries(breakdown)
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <View style={[styles.container, { backgroundColor: Colors.cardBackground }]}>
      <Text style={[styles.title, { color: Colors.primaryText }]}>Cost Breakdown</Text>

      {/* Stacked bar */}
      <View style={[styles.barContainer, { backgroundColor: Colors.lightGray }]}>
        {categories.map(([cat, amount]) => (
          <View
            key={cat}
            style={[styles.barSegment, { flex: amount / total, backgroundColor: CATEGORY_COLORS[cat] || '#6B7280' }]}
          />
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        {categories.map(([cat, amount]) => {
          const pct = ((amount / total) * 100).toFixed(1);
          return (
            <View key={cat} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: CATEGORY_COLORS[cat] || '#6B7280' }]} />
              <Text style={[styles.legendLabel, { color: Colors.secondaryText }]}>
                {CATEGORY_LABELS[cat] || cat}
              </Text>
              <Text style={[styles.legendValue, { color: Colors.primaryText }]}>
                {formatCurrency(amount)} ({pct}%)
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  barContainer: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  barSegment: {
    height: '100%',
  },
  legend: {
    gap: Spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: Spacing.sm,
  },
  legendLabel: {
    fontSize: FontSizes.small,
    flex: 1,
  },
  legendValue: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
});
