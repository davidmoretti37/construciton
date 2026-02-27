import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

const SUCCESS = '#10B981';
const ERROR = '#EF4444';
const BLUE = '#3B82F6';

const formatCurrency = (amount) => {
  const abs = Math.abs(amount);
  if (abs >= 1000000) return `${amount < 0 ? '-' : ''}$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${amount < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${amount < 0 ? '-' : ''}$${abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function CashFlowCard({ cashFlowData, outstandingReceivables = 0 }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('owner');

  if (!cashFlowData || cashFlowData.length === 0) return null;

  const maxVal = Math.max(
    ...cashFlowData.map(b => Math.max(b.cashIn, b.cashOut)),
    1
  );
  const barMaxHeight = 80;

  const totalCashIn = cashFlowData.reduce((s, b) => s + b.cashIn, 0);
  const totalCashOut = cashFlowData.reduce((s, b) => s + b.cashOut, 0);
  const netCashFlow = totalCashIn - totalCashOut;

  return (
    <View style={[styles.container, { backgroundColor: Colors.cardBackground }]}>
      <Text style={[styles.title, { color: Colors.primaryText }]}>{t('cashFlow.title')}</Text>

      {/* Summary row */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: SUCCESS }]} />
          <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('cashFlow.cashIn')}</Text>
          <Text style={[styles.summaryValue, { color: SUCCESS }]}>{formatCurrency(totalCashIn)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: ERROR }]} />
          <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('cashFlow.cashOut')}</Text>
          <Text style={[styles.summaryValue, { color: ERROR }]}>{formatCurrency(totalCashOut)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <View style={[styles.summaryDot, { backgroundColor: BLUE }]} />
          <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{t('cashFlow.net')}</Text>
          <Text style={[styles.summaryValue, { color: netCashFlow >= 0 ? SUCCESS : ERROR }]}>{formatCurrency(netCashFlow)}</Text>
        </View>
      </View>

      {/* Bar chart */}
      <View style={styles.chartContainer}>
        {cashFlowData.map((bucket) => {
          const inHeight = maxVal > 0 ? (bucket.cashIn / maxVal) * barMaxHeight : 0;
          const outHeight = maxVal > 0 ? (bucket.cashOut / maxVal) * barMaxHeight : 0;
          return (
            <View key={bucket.key} style={styles.barGroup}>
              <View style={styles.barsRow}>
                <View style={[styles.bar, { height: Math.max(inHeight, 2), backgroundColor: SUCCESS }]} />
                <View style={[styles.bar, { height: Math.max(outHeight, 2), backgroundColor: ERROR }]} />
              </View>
              <Text style={[styles.barLabel, { color: Colors.secondaryText }]}>{bucket.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Outstanding receivables */}
      {outstandingReceivables > 0 && (
        <View style={[styles.outstandingRow, { borderTopColor: Colors.border }]}>
          <View style={styles.outstandingInfo}>
            <Text style={[styles.outstandingLabel, { color: Colors.primaryText }]}>{t('cashFlow.outstandingReceivables')}</Text>
            <Text style={[styles.outstandingDesc, { color: Colors.secondaryText }]}>{t('cashFlow.outstandingDesc')}</Text>
          </View>
          <Text style={[styles.outstandingAmount, { color: '#F59E0B' }]}>{formatCurrency(outstandingReceivables)}</Text>
        </View>
      )}
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  summaryItem: {
    alignItems: 'center',
    gap: 4,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryLabel: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: FontSizes.small,
    fontWeight: '700',
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 110,
    paddingBottom: 20,
  },
  barGroup: {
    flex: 1,
    alignItems: 'center',
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    flex: 1,
  },
  bar: {
    width: 14,
    borderRadius: 3,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 6,
  },
  outstandingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
  },
  outstandingInfo: {
    flex: 1,
  },
  outstandingLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  outstandingDesc: {
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
  outstandingAmount: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
});
