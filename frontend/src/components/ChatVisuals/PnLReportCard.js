import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { CATEGORY_LABELS, CATEGORY_COLORS } from '../../utils/financialReportUtils';
import { generatePnLPDFFromAgent } from '../../utils/financialReportPDF';

const fmtCurrency = (n) => {
  const v = Number(n) || 0;
  return v < 0
    ? `-$${Math.abs(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

const fmtRange = (startStr, endStr) => {
  if (!startStr || !endStr) return '';
  const s = new Date(startStr + 'T12:00:00');
  const e = new Date(endStr + 'T12:00:00');
  const fmt = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${s.toLocaleDateString('en-US', fmt)} – ${e.toLocaleDateString('en-US', fmt)}`;
};

export default function PnLReportCard({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [downloading, setDownloading] = useState(false);

  const safe = data || {};
  const {
    scope = 'company',
    projectName,
    startDate,
    endDate,
    revenue = 0,
    costs = 0,
    costBreakdown = {},
    grossProfit = 0,
    grossMargin = 0,
    overhead = 0,
    netProfit = 0,
    outstandingReceivables = 0,
    projectBreakdowns = [],
  } = safe;

  // Stable cost-bar segments for the breakdown strip
  const costSegments = useMemo(() => {
    const entries = Object.entries(costBreakdown || {})
      .filter(([, v]) => Number(v) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]));
    if (entries.length === 0 || costs <= 0) return [];
    return entries.map(([cat, amount]) => ({
      cat,
      amount: Number(amount),
      pct: (Number(amount) / costs) * 100,
      color: CATEGORY_COLORS?.[cat] || '#94A3B8',
      label: CATEGORY_LABELS?.[cat] || cat,
    }));
  }, [costBreakdown, costs]);

  const profitColor = grossProfit >= 0 ? '#10B981' : '#EF4444';
  const netColor = netProfit >= 0 ? '#10B981' : '#EF4444';
  const marginHealthColor = grossMargin >= 20 ? '#10B981' : grossMargin >= 10 ? '#F59E0B' : '#EF4444';

  const handleDownload = useCallback(async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await generatePnLPDFFromAgent(safe);
      onAction?.({ type: 'download-pnl-pdf', data: safe });
    } catch (e) {
      Alert.alert('Could not export', e?.message || 'Failed to generate the P&L PDF.');
    } finally {
      setDownloading(false);
    }
  }, [downloading, safe, onAction]);

  return (
    <View style={[styles.container, { backgroundColor: Colors.cardBackground || Colors.white, borderColor: Colors.border }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <Ionicons name="trending-up" size={18} color={Colors.primaryBlue} />
            <Text style={[styles.title, { color: Colors.primaryText }]}>
              Profit & Loss
            </Text>
          </View>
          <Text style={[styles.subtitle, { color: Colors.secondaryText }]} numberOfLines={1}>
            {scope === 'project' && projectName ? projectName : 'Company-wide'}
          </Text>
          <Text style={[styles.range, { color: Colors.placeholderText || Colors.secondaryText }]} numberOfLines={1}>
            {fmtRange(startDate, endDate)}
          </Text>
        </View>
        <View style={[styles.marginPill, { backgroundColor: marginHealthColor + '18', borderColor: marginHealthColor + '40' }]}>
          <Text style={[styles.marginPillText, { color: marginHealthColor }]}>
            {grossMargin.toFixed(1)}% margin
          </Text>
        </View>
      </View>

      {/* Top-line metrics */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCell, { borderRightColor: Colors.border, borderBottomColor: Colors.border }]}>
          <Text style={[styles.metricLabel, { color: Colors.secondaryText }]}>Revenue</Text>
          <Text style={[styles.metricValue, { color: Colors.primaryText }]}>{fmtCurrency(revenue)}</Text>
        </View>
        <View style={[styles.metricCell, { borderBottomColor: Colors.border }]}>
          <Text style={[styles.metricLabel, { color: Colors.secondaryText }]}>Costs</Text>
          <Text style={[styles.metricValue, { color: Colors.primaryText }]}>{fmtCurrency(costs)}</Text>
        </View>
        <View style={[styles.metricCell, { borderRightColor: Colors.border }]}>
          <Text style={[styles.metricLabel, { color: Colors.secondaryText }]}>Gross Profit</Text>
          <Text style={[styles.metricValue, { color: profitColor }]}>{fmtCurrency(grossProfit)}</Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={[styles.metricLabel, { color: Colors.secondaryText }]}>Net Profit</Text>
          <Text style={[styles.metricValue, { color: netColor }]}>{fmtCurrency(netProfit)}</Text>
        </View>
      </View>

      {/* Cost breakdown bar */}
      {costSegments.length > 0 && (
        <View style={[styles.section, { borderTopColor: Colors.border }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Cost Breakdown</Text>
          <View style={[styles.barTrack, { backgroundColor: Colors.lightGray }]}>
            {costSegments.map((s) => (
              <View key={s.cat} style={{ flex: s.pct, height: '100%', backgroundColor: s.color }} />
            ))}
          </View>
          <View style={styles.legendList}>
            {costSegments.map((s) => (
              <View key={s.cat} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <Text style={[styles.legendLabel, { color: Colors.primaryText }]} numberOfLines={1}>
                  {s.label}
                </Text>
                <Text style={[styles.legendValue, { color: Colors.secondaryText }]}>
                  {fmtCurrency(s.amount)}
                  <Text style={{ color: Colors.placeholderText }}> · {s.pct.toFixed(0)}%</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Overhead + receivables row */}
      {(overhead > 0 || outstandingReceivables > 0) && (
        <View style={[styles.subRow, { borderTopColor: Colors.border }]}>
          {overhead > 0 && (
            <View style={styles.subItem}>
              <Text style={[styles.subLabel, { color: Colors.secondaryText }]}>Overhead</Text>
              <Text style={[styles.subValue, { color: Colors.primaryText }]}>{fmtCurrency(overhead)}</Text>
            </View>
          )}
          {outstandingReceivables > 0 && (
            <View style={styles.subItem}>
              <Text style={[styles.subLabel, { color: Colors.secondaryText }]}>AR Outstanding</Text>
              <Text style={[styles.subValue, { color: Colors.primaryText }]}>{fmtCurrency(outstandingReceivables)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Per-project breakdown (only when company-wide or explicitly requested) */}
      {Array.isArray(projectBreakdowns) && projectBreakdowns.length > 0 && scope !== 'project' && (
        <View style={[styles.section, { borderTopColor: Colors.border }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>By Project</Text>
          {projectBreakdowns.slice(0, 6).map((p) => {
            const pProfit = Number(p.grossProfit) || 0;
            const pColor = pProfit >= 0 ? '#10B981' : '#EF4444';
            return (
              <View key={p.id} style={[styles.projectRow, { borderBottomColor: Colors.border + '40' }]}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={[styles.projectName, { color: Colors.primaryText }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={[styles.projectMeta, { color: Colors.secondaryText }]}>
                    Rev {fmtCurrency(p.revenue)} · Cost {fmtCurrency(p.costs)}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.projectProfit, { color: pColor }]}>{fmtCurrency(pProfit)}</Text>
                  <Text style={[styles.projectMargin, { color: Colors.secondaryText }]}>
                    {p.grossMargin?.toFixed(1) || 0}% margin
                  </Text>
                </View>
              </View>
            );
          })}
          {projectBreakdowns.length > 6 && (
            <Text style={[styles.moreNote, { color: Colors.secondaryText }]}>
              +{projectBreakdowns.length - 6} more projects in the PDF
            </Text>
          )}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleDownload}
          activeOpacity={0.85}
          disabled={downloading}
        >
          {downloading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="download-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Download PDF</Text>
            </>
          )}
        </TouchableOpacity>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginTop: 4,
  },
  range: {
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
  marginPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    marginLeft: Spacing.sm,
  },
  marginPillText: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metricCell: {
    width: '50%',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  metricLabel: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: -0.4,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  sectionTitle: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  barTrack: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.sm,
  },
  legendList: {
    gap: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    flex: 1,
    fontSize: FontSizes.small,
  },
  legendValue: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  subRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    gap: Spacing.lg,
  },
  subItem: {
    flex: 1,
  },
  subLabel: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  subValue: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginTop: 2,
  },
  projectRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  projectName: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  projectMeta: {
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
  projectProfit: {
    fontSize: FontSizes.small,
    fontWeight: '700',
  },
  projectMargin: {
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
  moreNote: {
    fontSize: FontSizes.tiny,
    fontStyle: 'italic',
    marginTop: 6,
    textAlign: 'center',
  },
  actions: {
    padding: Spacing.lg,
    paddingTop: Spacing.md,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: 8,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: '700',
  },
});
