import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchProjectsForOwner } from '../../utils/storage/projects';
import { getUserProfile } from '../../utils/storage/userProfile';
import {
  getDateRangeForPeriod,
  fetchAllOwnerTransactions,
  aggregatePnL,
} from '../../utils/financialReportUtils';

import PeriodFilter from '../../components/FinancialReport/PeriodFilter';
import MetricCard from '../../components/FinancialReport/MetricCard';
import PnLWaterfall from '../../components/FinancialReport/PnLWaterfall';
import CategoryBreakdownBar from '../../components/FinancialReport/CategoryBreakdownBar';
import CashFlowCard from '../../components/FinancialReport/CashFlowCard';
import ProjectPnLCard from '../../components/FinancialReport/ProjectPnLCard';
import SkeletonBox from '../../components/skeletons/SkeletonBox';
import SkeletonCard from '../../components/skeletons/SkeletonCard';
import { shareFinancialReportPDF, shareProjectReportPDF } from '../../utils/financialReportPDF';
import { fetchProjectTransactionsForReport, calculateCashFlow } from '../../utils/financialReportUtils';
import { fetchAgingReport } from '../../utils/storage/invoices';
import { exportTransactionsCSV } from '../../utils/csvExport';
import { processOverdueRecurring, fetchRecurringExpenses } from '../../utils/storage/recurringExpenses';

const OWNER_COLORS = {
  primary: '#1E40AF',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
};

const formatCurrency = (amount) => {
  const abs = Math.abs(amount);
  if (abs >= 1000000) return `${amount < 0 ? '-' : ''}$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${amount < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${amount < 0 ? '-' : ''}$${abs.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

export default function FinancialReportScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();
  const { t } = useTranslation('owner');

  const [period, setPeriod] = useState('all');
  const [view, setView] = useState('company');
  const [projects, setProjects] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [businessInfo, setBusinessInfo] = useState({});
  const [outstandingReceivables, setOutstandingReceivables] = useState(0);
  const [monthlyOverhead, setMonthlyOverhead] = useState(0);
  const [overheadItems, setOverheadItems] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const [projectsData, profile] = await Promise.all([
        fetchProjectsForOwner(),
        getUserProfile(),
      ]);
      setProjects(projectsData || []);
      if (profile?.businessInfo) {
        setBusinessInfo(profile.businessInfo);
      }

      const projectIds = (projectsData || []).map((p) => p.id);
      const [txData, agingData] = await Promise.all([
        fetchAllOwnerTransactions(projectIds),
        fetchAgingReport(),
      ]);
      setTransactions(txData || []);
      setOutstandingReceivables(agingData?.totals?.total || 0);

      // Load overhead
      try {
        const ohItems = await fetchRecurringExpenses();
        setOverheadItems(ohItems || []);
        const total = (ohItems || [])
          .filter(i => i.is_active)
          .reduce((sum, i) => {
            const amt = parseFloat(i.amount || 0);
            if (i.frequency === 'weekly') return sum + amt * 4.33;
            if (i.frequency === 'biweekly') return sum + amt * 2.17;
            if (i.frequency === 'quarterly') return sum + amt / 3;
            if (i.frequency === 'annually') return sum + amt / 12;
            return sum + amt;
          }, 0);
        setMonthlyOverhead(total);
      } catch (e) { /* not critical */ }

      // Process any overdue recurring expenses silently
      processOverdueRecurring().catch(() => {});
    } catch (error) {
      console.error('Error loading financial data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleExportPDF = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const periodLabels = { month: t('financial.periodMonth'), quarter: t('financial.periodQuarter'), year: t('financial.periodYear'), all: t('financial.periodAll') };
      await shareFinancialReportPDF({
        periodLabel: periodLabels[period] || t('financial.periodAll'),
        totalRevenue: pnl.totalRevenue,
        totalCosts: pnl.totalCosts,
        grossProfit: pnl.grossProfit,
        grossMargin: pnl.grossMargin,
        totalContractValue: pnl.totalContractValue,
        costBreakdown: pnl.costBreakdown,
        subcategoryBreakdown: pnl.subcategoryBreakdown,
        incomeBreakdown: pnl.incomeBreakdown,
        projectBreakdowns: pnl.projectBreakdowns,
        transactions: pnl.transactions,
        businessName: businessInfo.name || '',
        businessAddress: businessInfo.address || '',
        businessPhone: businessInfo.phone || '',
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setExporting(false);
    }
  }, [exporting, period, pnl]);

  const handleExportProjectPDF = useCallback(async (project) => {
    try {
      const periodLabels2 = { month: t('financial.periodMonth'), quarter: t('financial.periodQuarter'), year: t('financial.periodYear'), all: t('financial.periodAll') };
      const projectTxs = await fetchProjectTransactionsForReport(project.id);
      // Filter by selected period
      const { startDate: s, endDate: e } = getDateRangeForPeriod(period);
      const filteredTxs = s ? projectTxs.filter(tx => tx.date >= s && tx.date <= e) : projectTxs;
      await shareProjectReportPDF(project, filteredTxs, periodLabels2[period] || t('financial.periodAll'));
    } catch (error) {
      console.error('Error exporting project PDF:', error);
    }
  }, [period]);

  const { startDate, endDate } = getDateRangeForPeriod(period);
  const pnl = aggregatePnL(transactions, projects, startDate, endDate);
  const netProfit = pnl.grossProfit - monthlyOverhead;
  const netMargin = pnl.totalRevenue > 0 ? (netProfit / pnl.totalRevenue) * 100 : 0;

  const profitColor = pnl.grossProfit >= 0 ? OWNER_COLORS.success : OWNER_COLORS.error;
  const netProfitColor = netProfit >= 0 ? OWNER_COLORS.success : OWNER_COLORS.error;

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.header, { borderBottomColor: Colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('financial.title')}</Text>
          <View style={styles.backButton}>
            <Ionicons name="download-outline" size={22} color={Colors.border} />
          </View>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Period filter skeleton */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            {[1,2,3,4].map(i => (
              <SkeletonBox key={i} width={70} height={32} borderRadius={16} />
            ))}
          </View>
          {/* Metric cards skeleton */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
            {[1,2,3,4].map(i => (
              <View key={i} style={{ flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 12, padding: 14 }}>
                <SkeletonBox width={20} height={20} borderRadius={4} />
                <SkeletonBox width="80%" height={22} borderRadius={4} style={{ marginTop: 8 }} />
                <SkeletonBox width="50%" height={12} borderRadius={4} style={{ marginTop: 6 }} />
              </View>
            ))}
          </View>
          {/* Waterfall skeleton */}
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <SkeletonBox width="40%" height={16} borderRadius={4} style={{ marginBottom: 16 }} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, height: 120 }}>
              <SkeletonBox width={60} height={100} borderRadius={6} />
              <SkeletonBox width={60} height={70} borderRadius={6} />
              <SkeletonBox width={60} height={50} borderRadius={6} />
            </View>
          </View>
          {/* Project cards skeleton */}
          <SkeletonBox width="40%" height={16} borderRadius={4} style={{ marginBottom: 12 }} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('financial.title')}</Text>
        <TouchableOpacity
          onPress={handleExportPDF}
          style={styles.backButton}
          activeOpacity={0.7}
          disabled={exporting}
        >
          {exporting ? (
            <ActivityIndicator size="small" color={OWNER_COLORS.primary} />
          ) : (
            <Ionicons name="download-outline" size={22} color={OWNER_COLORS.primary} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={OWNER_COLORS.primary} />}
      >
        {/* Period Filter */}
        <PeriodFilter selected={period} onSelect={setPeriod} />

        {/* View Toggle */}
        <View style={[styles.toggleRow, { backgroundColor: Colors.lightGray }]}>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'company' && { backgroundColor: OWNER_COLORS.primary }]}
            onPress={() => setView('company')}
            activeOpacity={0.7}
          >
            <Ionicons name="business" size={14} color={view === 'company' ? '#FFF' : Colors.secondaryText} />
            <Text style={[styles.toggleText, { color: view === 'company' ? '#FFF' : Colors.secondaryText }]}>{t('financial.company')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'project' && { backgroundColor: OWNER_COLORS.primary }]}
            onPress={() => setView('project')}
            activeOpacity={0.7}
          >
            <Ionicons name="folder" size={14} color={view === 'project' ? '#FFF' : Colors.secondaryText} />
            <Text style={[styles.toggleText, { color: view === 'project' ? '#FFF' : Colors.secondaryText }]}>{t('financial.byProject')}</Text>
          </TouchableOpacity>
        </View>

        {/* Date Range Indicator */}
        {startDate && (
          <View style={[styles.dateRangeCard, { backgroundColor: Colors.cardBackground }]}>
            <Ionicons name="calendar-outline" size={14} color={Colors.secondaryText} />
            <Text style={[styles.dateRangeText, { color: Colors.secondaryText }]}>
              {t('financial.dateRange', {
                start: new Date(startDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                end: new Date(endDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
              })}
            </Text>
          </View>
        )}

        {/* Quick Summary */}
        <View style={[styles.summaryStrip, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>Revenue</Text>
            <Text style={[styles.summaryValue, { color: OWNER_COLORS.success }]}>{formatCurrency(pnl.totalRevenue)}</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: Colors.border }]} />
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>Expenses</Text>
            <Text style={[styles.summaryValue, { color: OWNER_COLORS.error }]}>{formatCurrency(pnl.totalCosts)}</Text>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: Colors.border }]} />
          <View style={styles.summaryStat}>
            <Text style={[styles.summaryLabel, { color: Colors.secondaryText }]}>{monthlyOverhead > 0 ? 'Net Profit' : 'Profit'}</Text>
            <Text style={[styles.summaryValue, { color: monthlyOverhead > 0 ? netProfitColor : profitColor }]}>
              {formatCurrency(monthlyOverhead > 0 ? netProfit : pnl.grossProfit)}
            </Text>
          </View>
        </View>

        {/* Income Statement */}
        {view === 'company' ? (
          <>
            <View style={[styles.isCard, { backgroundColor: Colors.cardBackground }]}>
              <Text style={[styles.isTitle, { color: Colors.primaryText }]}>Detailed Breakdown</Text>

              {/* Revenue */}
              <View style={styles.isRow}>
                <Text style={[styles.isLabel, { color: Colors.primaryText }]}>Revenue</Text>
                <Text style={[styles.isValue, { color: OWNER_COLORS.success }]}>{formatCurrency(pnl.totalRevenue)}</Text>
              </View>

              {/* Project Costs */}
              <View style={styles.isRow}>
                <Text style={[styles.isLabel, { color: Colors.primaryText }]}>Project Costs</Text>
                <Text style={[styles.isValue, { color: OWNER_COLORS.error }]}>({formatCurrency(pnl.totalCosts)})</Text>
              </View>
              {/* Cost breakdown */}
              {Object.entries(pnl.costBreakdown)
                .filter(([, amt]) => amt > 0)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, amt]) => (
                  <View key={cat} style={styles.isSubRow}>
                    <Text style={[styles.isSubLabel, { color: Colors.secondaryText }]}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</Text>
                    <Text style={[styles.isSubValue, { color: Colors.secondaryText }]}>{formatCurrency(amt)}</Text>
                  </View>
                ))
              }

              {/* Gross Profit */}
              <View style={[styles.isDivider, { backgroundColor: Colors.border }]} />
              <View style={styles.isRow}>
                <Text style={[styles.isBoldLabel, { color: Colors.primaryText }]}>Gross Profit</Text>
                <Text style={[styles.isBoldValue, { color: profitColor }]}>{formatCurrency(pnl.grossProfit)}</Text>
              </View>
              <View style={styles.isSubRow}>
                <Text style={[styles.isSubLabel, { color: Colors.secondaryText }]}>Gross Margin</Text>
                <Text style={[styles.isSubValue, { color: profitColor }]}>{pnl.grossMargin.toFixed(1)}%</Text>
              </View>

              {/* Overhead (if any) */}
              {monthlyOverhead > 0 && (
                <>
                  <View style={{ height: 8 }} />
                  <View style={styles.isRow}>
                    <Text style={[styles.isLabel, { color: Colors.primaryText }]}>Company Overhead</Text>
                    <Text style={[styles.isValue, { color: OWNER_COLORS.error }]}>({formatCurrency(monthlyOverhead)})</Text>
                  </View>
                  {overheadItems.filter(i => i.is_active).map(item => {
                    const amt = parseFloat(item.amount || 0);
                    const monthly = item.frequency === 'weekly' ? amt * 4.33
                      : item.frequency === 'biweekly' ? amt * 2.17
                      : item.frequency === 'quarterly' ? amt / 3
                      : item.frequency === 'annually' ? amt / 12
                      : amt;
                    return (
                      <View key={item.id} style={styles.isSubRow}>
                        <Text style={[styles.isSubLabel, { color: Colors.secondaryText }]}>{item.description}</Text>
                        <Text style={[styles.isSubValue, { color: Colors.secondaryText }]}>{formatCurrency(monthly)}</Text>
                      </View>
                    );
                  })}

                  {/* Net Profit */}
                  <View style={[styles.isDivider, { backgroundColor: Colors.border }]} />
                  <View style={styles.isRow}>
                    <Text style={[styles.isBoldLabel, { color: Colors.primaryText }]}>Net Profit</Text>
                    <Text style={[styles.isBoldValue, { color: netProfitColor }]}>{formatCurrency(netProfit)}</Text>
                  </View>
                  <View style={styles.isSubRow}>
                    <Text style={[styles.isSubLabel, { color: Colors.secondaryText }]}>Net Margin</Text>
                    <Text style={[styles.isSubValue, { color: netProfitColor }]}>{netMargin.toFixed(1)}%</Text>
                  </View>
                </>
              )}
            </View>

            {/* Category Breakdown */}
            {pnl.totalCosts > 0 && (
              <CategoryBreakdownBar breakdown={pnl.costBreakdown} total={pnl.totalCosts} />
            )}

            {/* Cash Flow */}
            <CashFlowCard
              cashFlowData={calculateCashFlow(transactions, 6)}
              outstandingReceivables={outstandingReceivables}
            />

            {/* Contract value note */}
            <View style={[styles.noteCard, { backgroundColor: Colors.cardBackground }]}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.secondaryText} />
              <Text style={[styles.noteText, { color: Colors.secondaryText }]}>
                {t('financial.contractValueNote', { count: projects.length, amount: formatCurrency(pnl.totalContractValue) })}
              </Text>
            </View>
          </>
        ) : (
          <>
            {/* Project list */}
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              {t('financial.projectsCount', { count: pnl.projectBreakdowns.length })}
            </Text>
            {pnl.projectBreakdowns.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: Colors.cardBackground }]}>
                <Ionicons name="folder-open-outline" size={40} color={Colors.secondaryText} />
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>{t('financial.noProjectsFound')}</Text>
              </View>
            ) : (
              <View style={styles.projectList}>
                {pnl.projectBreakdowns
                  .sort((a, b) => b.expenses - a.expenses)
                  .map((p) => (
                    <ProjectPnLCard
                      key={p.id}
                      project={p}
                      onPress={() => navigation.navigate('ProjectTransactions', { projectId: p.id, projectName: p.name })}
                      onExportPDF={() => handleExportProjectPDF(p)}
                    />
                  ))}
              </View>
            )}
          </>
        )}

        {/* Reports & Tools */}
        <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('financial.reportsTools')}</Text>
        <View style={styles.reportGrid}>
          {[
            { icon: 'receipt-outline', label: t('financial.arAging'), desc: t('financial.arAgingDesc'), route: 'ARAging', color: '#F59E0B' },
            { icon: 'document-text-outline', label: t('financial.taxSummary'), desc: t('financial.taxSummaryDesc'), route: 'TaxSummary', color: '#8B5CF6' },
            { icon: 'people-outline', label: t('financial.payrollSummary'), desc: t('financial.payrollDesc'), route: 'PayrollSummary', color: '#3B82F6' },
            { icon: 'business-outline', label: 'Company Overhead', desc: 'Manage fixed monthly costs', route: 'CompanyOverhead', color: '#10B981' },
          ].map((item) => (
            <TouchableOpacity
              key={item.route}
              style={[styles.reportCard, { backgroundColor: Colors.cardBackground }]}
              onPress={() => navigation.navigate(item.route)}
              activeOpacity={0.7}
            >
              <View style={[styles.reportIcon, { backgroundColor: item.color + '18' }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={[styles.reportLabel, { color: Colors.primaryText }]}>{item.label}</Text>
              <Text style={[styles.reportDesc, { color: Colors.secondaryText }]} numberOfLines={2}>{item.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Export CSV */}
        <TouchableOpacity
          style={[styles.exportCard, { backgroundColor: Colors.cardBackground }]}
          onPress={async () => {
            try {
              await exportTransactionsCSV(pnl.transactions, projects, `financial-export-${period}.csv`);
            } catch (e) {
              console.error('CSV export error:', e);
            }
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="cloud-download-outline" size={20} color="#1E40AF" />
          <View style={styles.exportInfo}>
            <Text style={[styles.exportLabel, { color: Colors.primaryText }]}>{t('financial.exportCSV')}</Text>
            <Text style={[styles.exportDesc, { color: Colors.secondaryText }]}>{t('financial.exportCSVDesc')}</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 36,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    borderRadius: BorderRadius.md,
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  toggleText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  metricsGrid: {
    gap: Spacing.md,
  },
  metricsRow: {
    flexDirection: 'row',
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  noteText: {
    fontSize: FontSizes.tiny,
    flex: 1,
  },
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  projectList: {
    gap: Spacing.md,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: FontSizes.small,
  },
  dateRangeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    alignSelf: 'flex-start',
  },
  dateRangeText: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
  },
  reportGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  reportCard: {
    width: '47%',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  reportIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  reportLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: 4,
  },
  reportDesc: {
    fontSize: FontSizes.tiny,
    lineHeight: 16,
  },
  exportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  exportInfo: {
    flex: 1,
  },
  exportLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  exportDesc: {
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
  // Quick Summary
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.lg,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: -0.5,
  },
  summaryDivider: {
    width: 1,
    height: 32,
  },
  // Income Statement card
  isCard: {
    borderRadius: BorderRadius.lg,
    padding: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  isTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  isRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  isLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  isValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  isSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: 16,
    paddingVertical: 1,
  },
  isSubLabel: {
    fontSize: 13,
  },
  isSubValue: {
    fontSize: 13,
    fontWeight: '500',
  },
  isDivider: {
    height: 1,
    marginVertical: 8,
  },
  isBoldLabel: {
    fontSize: 16,
    fontWeight: '800',
  },
  isBoldValue: {
    fontSize: 18,
    fontWeight: '800',
  },
});
