import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { CATEGORY_COLORS } from '../../utils/financialReportUtils';

const SUCCESS = '#10B981';
const ERROR = '#EF4444';
const WARNING = '#F59E0B';

const formatCurrency = (amount) => {
  const abs = Math.abs(amount);
  if (abs >= 1000000) return `${amount < 0 ? '-' : ''}$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${amount < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${amount < 0 ? '-' : ''}$${abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function ProjectPnLCard({ project, onPress, onExportPDF }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('owner');

  const {
    name,
    contractAmount = 0,
    incomeCollected = 0,
    expenses = 0,
    grossProfit = 0,
    grossMargin = 0,
    budgetUsed = 0,
    costBreakdown = {},
    status,
  } = project;

  const profitColor = grossProfit >= 0 ? SUCCESS : ERROR;
  const budgetColor = budgetUsed > 100 ? ERROR : budgetUsed > 85 ? WARNING : SUCCESS;
  const totalCosts = expenses;
  const outstanding = contractAmount - incomeCollected;

  const categories = Object.entries(costBreakdown)
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: Colors.cardBackground }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.name, { color: Colors.primaryText }]} numberOfLines={1}>{name}</Text>
          {status && (
            <View style={[styles.statusBadge, {
              backgroundColor: status === 'completed' ? SUCCESS + '18' : status === 'on_hold' ? WARNING + '18' : '#3B82F618',
            }]}>
              <Text style={[styles.statusText, {
                color: status === 'completed' ? SUCCESS : status === 'on_hold' ? WARNING : '#3B82F6',
              }]}>
                {status === 'completed' ? 'Completed' : status === 'on_hold' ? 'On Hold' : 'Active'}
              </Text>
            </View>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {onExportPDF && (
            <TouchableOpacity
              onPress={onExportPDF}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="download-outline" size={18} color="#1E40AF" />
            </TouchableOpacity>
          )}
          <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />
        </View>
      </View>

      {/* Financial rows */}
      <View style={styles.statsGrid}>
        <View style={styles.statRow}>
          <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>{t('financial.contractValue')}</Text>
          <Text style={[styles.statValue, { color: Colors.primaryText }]}>{formatCurrency(contractAmount)}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>{t('financial.revenueCollected')}</Text>
          <Text style={[styles.statValue, { color: SUCCESS }]}>{formatCurrency(incomeCollected)}</Text>
        </View>
        {outstanding > 0 && (
          <View style={styles.statRow}>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>{t('financial.outstanding')}</Text>
            <Text style={[styles.statValue, { color: WARNING }]}>{formatCurrency(outstanding)}</Text>
          </View>
        )}
        <View style={styles.statRow}>
          <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>{t('financial.costOfConstruction')}</Text>
          <Text style={[styles.statValue, { color: ERROR }]}>{formatCurrency(expenses)}</Text>
        </View>
        <View style={[styles.statRow, styles.profitRow]}>
          <Text style={[styles.statLabel, { color: Colors.primaryText, fontWeight: '600' }]}>{t('financial.grossProfit')}</Text>
          <View style={styles.profitValue}>
            <Text style={[styles.statValue, { color: profitColor, fontWeight: '700' }]}>{formatCurrency(grossProfit)}</Text>
            <View style={[styles.marginBadge, { backgroundColor: profitColor + '18' }]}>
              <Text style={[styles.marginText, { color: profitColor }]}>{grossMargin.toFixed(1)}%</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Mini category bar */}
      {totalCosts > 0 && categories.length > 0 && (
        <View style={[styles.miniBar, { backgroundColor: Colors.lightGray }]}>
          {categories.map(([cat, amount]) => (
            <View
              key={cat}
              style={{ flex: amount / totalCosts, height: '100%', backgroundColor: CATEGORY_COLORS[cat] || '#6B7280' }}
            />
          ))}
        </View>
      )}

      {/* Budget progress */}
      {project.budget > 0 && (
        <View style={styles.budgetSection}>
          <View style={styles.budgetHeader}>
            <Text style={[styles.budgetLabel, { color: Colors.secondaryText }]}>{t('financial.budgetUtilization')}</Text>
            <Text style={[styles.budgetPct, { color: budgetColor }]}>{budgetUsed.toFixed(0)}%</Text>
          </View>
          <View style={[styles.budgetTrack, { backgroundColor: Colors.lightGray }]}>
            <View style={[styles.budgetFill, { width: `${Math.min(budgetUsed, 100)}%`, backgroundColor: budgetColor }]} />
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginRight: Spacing.sm,
  },
  name: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    flexShrink: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statsGrid: {
    gap: Spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profitRow: {
    marginTop: Spacing.xs,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  statLabel: {
    fontSize: FontSizes.small,
  },
  statValue: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  profitValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  marginBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
  },
  marginText: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
  },
  miniBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: Spacing.md,
  },
  budgetSection: {
    marginTop: Spacing.md,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  budgetLabel: {
    fontSize: FontSizes.tiny,
  },
  budgetPct: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  budgetTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    borderRadius: 3,
  },
});
