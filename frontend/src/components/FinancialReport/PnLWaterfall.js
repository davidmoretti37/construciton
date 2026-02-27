import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../utils/financialReportUtils';

const formatCurrency = (amount) => {
  const abs = Math.abs(amount);
  if (abs >= 1000000) return `${amount < 0 ? '-' : ''}$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${amount < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${amount < 0 ? '-' : ''}$${abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const SUCCESS = '#10B981';
const ERROR = '#EF4444';

export default function PnLWaterfall({ revenue, costBreakdown, totalCosts, grossProfit, grossMargin }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('owner');
  const [expanded, setExpanded] = useState(false);

  const maxAmount = Math.max(revenue, totalCosts, 1);
  const profitColor = grossProfit >= 0 ? SUCCESS : ERROR;
  const costPct = revenue > 0 ? ((totalCosts / revenue) * 100).toFixed(0) : 0;
  const profitPct = revenue > 0 ? ((Math.abs(grossProfit) / revenue) * 100).toFixed(0) : 0;

  const costCategories = Object.entries(costBreakdown || {})
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a);

  return (
    <View style={[styles.container, { backgroundColor: Colors.cardBackground }]}>
      <Text style={[styles.title, { color: Colors.primaryText }]}>{t('financial.incomeStatement')}</Text>

      {/* Revenue row */}
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Ionicons name="trending-up" size={16} color={SUCCESS} />
          <Text style={[styles.rowLabel, { color: Colors.primaryText }]}>{t('financial.totalRevenue')}</Text>
        </View>
        <Text style={[styles.rowAmount, { color: SUCCESS }]}>{formatCurrency(revenue)}</Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: Colors.lightGray }]}>
        <View style={[styles.bar, { width: `${Math.min((revenue / maxAmount) * 100, 100)}%`, backgroundColor: SUCCESS }]} />
      </View>

      {/* Connector */}
      <View style={styles.connector}>
        <View style={[styles.connectorLine, { backgroundColor: Colors.border }]} />
        <Text style={[styles.connectorText, { color: Colors.secondaryText }]}>less</Text>
        <View style={[styles.connectorLine, { backgroundColor: Colors.border }]} />
      </View>

      {/* Cost of Construction row */}
      <TouchableOpacity style={styles.row} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <View style={styles.rowLeft}>
          <Ionicons name="construct" size={16} color={ERROR} />
          <Text style={[styles.rowLabel, { color: Colors.primaryText }]}>{t('financial.costOfConstruction')}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.secondaryText} />
        </View>
        <View style={styles.rowRight}>
          <Text style={[styles.rowAmount, { color: ERROR }]}>-{formatCurrency(totalCosts)}</Text>
          {revenue > 0 && <Text style={[styles.pctLabel, { color: Colors.secondaryText }]}>{costPct}%</Text>}
        </View>
      </TouchableOpacity>
      <View style={[styles.barTrack, { backgroundColor: Colors.lightGray }]}>
        <View style={[styles.bar, { width: `${Math.min((totalCosts / maxAmount) * 100, 100)}%`, backgroundColor: ERROR }]} />
      </View>

      {/* Expanded cost breakdown */}
      {expanded && costCategories.length > 0 && (
        <View style={[styles.subRows, { borderLeftColor: Colors.border }]}>
          {costCategories.map(([cat, amount]) => (
            <View key={cat} style={styles.subRow}>
              <View style={styles.subRowLeft}>
                <View style={[styles.subDot, { backgroundColor: CATEGORY_COLORS[cat] || '#6B7280' }]} />
                <Text style={[styles.subLabel, { color: Colors.secondaryText }]}>{CATEGORY_LABELS[cat] || cat}</Text>
              </View>
              <Text style={[styles.subAmount, { color: Colors.primaryText }]}>{formatCurrency(amount)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Connector */}
      <View style={styles.connector}>
        <View style={[styles.connectorLine, { backgroundColor: Colors.border }]} />
        <Text style={[styles.connectorText, { color: Colors.secondaryText }]}>equals</Text>
        <View style={[styles.connectorLine, { backgroundColor: Colors.border }]} />
      </View>

      {/* Gross Profit row */}
      <View style={styles.row}>
        <View style={styles.rowLeft}>
          <Ionicons name={grossProfit >= 0 ? 'checkmark-circle' : 'alert-circle'} size={16} color={profitColor} />
          <Text style={[styles.rowLabel, { color: Colors.primaryText, fontWeight: '700' }]}>{t('financial.grossProfit')}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={[styles.rowAmount, { color: profitColor, fontWeight: '700' }]}>{formatCurrency(grossProfit)}</Text>
          <View style={[styles.marginBadge, { backgroundColor: profitColor + '18' }]}>
            <Text style={[styles.marginText, { color: profitColor }]}>{grossMargin.toFixed(1)}%</Text>
          </View>
        </View>
      </View>
      <View style={[styles.barTrack, { backgroundColor: Colors.lightGray }]}>
        <View
          style={[
            styles.bar,
            {
              width: `${Math.min((Math.abs(grossProfit) / maxAmount) * 100, 100)}%`,
              backgroundColor: profitColor,
            },
          ]}
        />
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
    marginBottom: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  rowLabel: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  rowAmount: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  bar: {
    height: '100%',
    borderRadius: 4,
  },
  connector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  connectorLine: {
    flex: 1,
    height: 1,
  },
  connectorText: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subRows: {
    borderLeftWidth: 2,
    marginLeft: Spacing.lg,
    paddingLeft: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  subDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subLabel: {
    fontSize: FontSizes.small,
  },
  subAmount: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  marginBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.pill,
  },
  marginText: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
  },
  pctLabel: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
    marginLeft: 4,
  },
});
