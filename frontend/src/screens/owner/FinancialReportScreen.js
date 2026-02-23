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
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchProjectsForOwner } from '../../utils/storage/projects';
import {
  getDateRangeForPeriod,
  fetchAllOwnerTransactions,
  aggregatePnL,
} from '../../utils/financialReportUtils';

import PeriodFilter from '../../components/FinancialReport/PeriodFilter';
import MetricCard from '../../components/FinancialReport/MetricCard';
import PnLWaterfall from '../../components/FinancialReport/PnLWaterfall';
import CategoryBreakdownBar from '../../components/FinancialReport/CategoryBreakdownBar';
import ProjectPnLCard from '../../components/FinancialReport/ProjectPnLCard';

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

  const [period, setPeriod] = useState('all');
  const [view, setView] = useState('company');
  const [projects, setProjects] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const projectsData = await fetchProjectsForOwner();
      setProjects(projectsData || []);

      const projectIds = (projectsData || []).map((p) => p.id);
      const txData = await fetchAllOwnerTransactions(projectIds);
      setTransactions(txData || []);
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

  const { startDate, endDate } = getDateRangeForPeriod(period);
  const pnl = aggregatePnL(transactions, projects, startDate, endDate);

  const profitColor = pnl.grossProfit >= 0 ? OWNER_COLORS.success : OWNER_COLORS.error;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={OWNER_COLORS.primary} />
        </View>
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
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Financial Report</Text>
        <View style={styles.headerSpacer} />
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
            <Text style={[styles.toggleText, { color: view === 'company' ? '#FFF' : Colors.secondaryText }]}>Company</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'project' && { backgroundColor: OWNER_COLORS.primary }]}
            onPress={() => setView('project')}
            activeOpacity={0.7}
          >
            <Ionicons name="folder" size={14} color={view === 'project' ? '#FFF' : Colors.secondaryText} />
            <Text style={[styles.toggleText, { color: view === 'project' ? '#FFF' : Colors.secondaryText }]}>By Project</Text>
          </TouchableOpacity>
        </View>

        {/* Metric Cards */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricsRow}>
            <MetricCard
              label="Total Revenue"
              value={formatCurrency(pnl.totalRevenue)}
              icon="wallet-outline"
              color={OWNER_COLORS.success}
            />
            <View style={{ width: Spacing.md }} />
            <MetricCard
              label="Total Expenses"
              value={formatCurrency(pnl.totalCosts)}
              icon="card-outline"
              color={OWNER_COLORS.error}
            />
          </View>
          <View style={styles.metricsRow}>
            <MetricCard
              label="Gross Profit"
              value={formatCurrency(pnl.grossProfit)}
              icon="trending-up"
              color={profitColor}
            />
            <View style={{ width: Spacing.md }} />
            <MetricCard
              label="Gross Margin"
              value={`${pnl.grossMargin.toFixed(1)}%`}
              icon="pie-chart-outline"
              color={profitColor}
              subtitle={pnl.grossMargin >= 20 ? 'Healthy' : pnl.grossMargin >= 10 ? 'Average' : 'Low'}
            />
          </View>
        </View>

        {view === 'company' ? (
          <>
            {/* P&L Waterfall */}
            <PnLWaterfall
              revenue={pnl.totalRevenue}
              costBreakdown={pnl.costBreakdown}
              totalCosts={pnl.totalCosts}
              grossProfit={pnl.grossProfit}
              grossMargin={pnl.grossMargin}
            />

            {/* Category Breakdown */}
            {pnl.totalCosts > 0 && (
              <CategoryBreakdownBar breakdown={pnl.costBreakdown} total={pnl.totalCosts} />
            )}

            {/* Contract value note */}
            <View style={[styles.noteCard, { backgroundColor: Colors.cardBackground }]}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.secondaryText} />
              <Text style={[styles.noteText, { color: Colors.secondaryText }]}>
                Total contract value across {projects.length} project{projects.length !== 1 ? 's' : ''}: {formatCurrency(pnl.totalContractValue)}
              </Text>
            </View>
          </>
        ) : (
          <>
            {/* Project list */}
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              Projects ({pnl.projectBreakdowns.length})
            </Text>
            {pnl.projectBreakdowns.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: Colors.cardBackground }]}>
                <Ionicons name="folder-open-outline" size={40} color={Colors.secondaryText} />
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>No projects found</Text>
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
                    />
                  ))}
              </View>
            )}
          </>
        )}

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
});
