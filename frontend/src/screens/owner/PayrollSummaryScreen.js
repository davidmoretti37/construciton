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
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchProjectsForOwner } from '../../utils/storage/projects';
import { fetchAllOwnerTransactions } from '../../utils/financialReportUtils';
import { exportPayrollCSV } from '../../utils/csvExport';
import { supabase } from '../../lib/supabase';

const formatCurrency = (amount) => {
  return `$${parseFloat(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

const PERIODS = ['week', 'month', 'custom'];

export default function PayrollSummaryScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();
  const route = useRoute();
  const { t } = useTranslation('owner');

  // Optional project scope from FinancialReportScreen's By-Project view.
  const projectId = route?.params?.projectId || null;
  const projectName = route?.params?.projectName || null;

  const [period, setPeriod] = useState('month');
  const [workers, setWorkers] = useState([]);
  const [totals, setTotals] = useState({ hours: 0, grossPay: 0, workerCount: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [groupByProject, setGroupByProject] = useState(false);

  const getDateRange = (p) => {
    const now = new Date();
    if (p === 'week') {
      const start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] };
    }
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] };
  };

  const loadData = useCallback(async () => {
    try {
      const projects = await fetchProjectsForOwner();
      // Restrict to selected project when in By-Project mode.
      const projectIds = projectId
        ? [projectId]
        : (projects || []).map(p => p.id);
      const projectMap = {};
      (projects || []).forEach(p => { projectMap[p.id] = p.name; });

      const transactions = await fetchAllOwnerTransactions(projectIds);
      const { start, end } = getDateRange(period);

      // Get worker info
      const { data: workerData } = await supabase
        .from('workers')
        .select('id, full_name, trade, payment_type, hourly_rate, daily_rate, weekly_salary, project_rate')
        .in('id', [...new Set(transactions.filter(t => t.worker_id).map(t => t.worker_id))]);

      const workerMap = {};
      (workerData || []).forEach(w => { workerMap[w.id] = w; });

      // Filter labor transactions for the period (project filter already
      // applied upstream via projectIds passed to fetchAllOwnerTransactions).
      const laborTxs = transactions.filter(tx =>
        tx.type === 'expense' &&
        tx.category === 'labor' &&
        tx.date >= start &&
        tx.date <= end
      );

      // Group by worker (or by worker+project if groupByProject)
      const workerPayMap = {};
      laborTxs.forEach(tx => {
        const amount = parseFloat(tx.amount || 0);
        const workerInfo = tx.worker_id ? workerMap[tx.worker_id] : null;
        const workerName = workerInfo?.full_name || tx.description || 'Unknown Worker';
        const key = groupByProject ? `${workerName}___${tx.project_id}` : workerName;

        if (!workerPayMap[key]) {
          workerPayMap[key] = {
            workerName,
            trade: workerInfo?.trade || '',
            projectName: projectMap[tx.project_id] || '',
            rate: workerInfo?.hourly_rate || workerInfo?.daily_rate || 0,
            paymentType: workerInfo?.payment_type || 'hourly',
            grossPay: 0,
            hours: null,
            transactionCount: 0,
          };
        }
        workerPayMap[key].grossPay += amount;
        workerPayMap[key].transactionCount += 1;
      });

      // Try to get time clock data for hours
      try {
        const { data: clockData } = await supabase
          .from('clock_in_records')
          .select('worker_id, clock_in_time, clock_out_time')
          .in('worker_id', Object.keys(workerMap))
          .gte('clock_in_time', start)
          .lte('clock_in_time', end + 'T23:59:59')
          .not('clock_out_time', 'is', null);

        const hoursByWorker = {};
        (clockData || []).forEach(r => {
          const hours = (new Date(r.clock_out_time) - new Date(r.clock_in_time)) / (1000 * 60 * 60);
          const name = workerMap[r.worker_id]?.full_name || 'Unknown';
          hoursByWorker[name] = (hoursByWorker[name] || 0) + hours;
        });

        Object.values(workerPayMap).forEach(w => {
          if (hoursByWorker[w.workerName]) {
            w.hours = hoursByWorker[w.workerName];
          }
        });
      } catch (e) {
        // Clock data is optional
      }

      const workerList = Object.values(workerPayMap).sort((a, b) => b.grossPay - a.grossPay);
      const totalHours = workerList.reduce((s, w) => s + (w.hours || 0), 0);
      const totalGrossPay = workerList.reduce((s, w) => s + w.grossPay, 0);

      setWorkers(workerList);
      setTotals({ hours: totalHours, grossPay: totalGrossPay, workerCount: workerList.length });
    } catch (error) {
      console.error('Error loading payroll data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, groupByProject, projectId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleExportCSV = useCallback(async () => {
    const periodLabels = { week: t('payroll.thisWeek'), month: t('payroll.thisMonth') };
    await exportPayrollCSV(workers, periodLabels[period] || '', `payroll-${period}.csv`);
  }, [workers, period, t]);

  const periodLabels = { week: t('payroll.thisWeek'), month: t('payroll.thisMonth') };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('payroll.title')}</Text>
          <Text style={{ fontSize: 11, color: Colors.secondaryText, marginTop: 1 }} numberOfLines={1}>
            {projectId ? (projectName || 'This Project') : 'All Projects'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleExportCSV} style={styles.headerBtn} activeOpacity={0.7}>
          <Ionicons name="download-outline" size={22} color="#1E40AF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1E40AF" />}
      >
        {/* Period Filter */}
        <View style={styles.periodRow}>
          {PERIODS.filter(p => p !== 'custom').map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.periodPill, period === p && { backgroundColor: '#1E40AF' }]}
              onPress={() => setPeriod(p)}
              activeOpacity={0.7}
            >
              <Text style={[styles.periodText, { color: period === p ? '#FFF' : Colors.secondaryText }]}>
                {periodLabels[p] || p}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={[styles.groupToggle, groupByProject && { backgroundColor: '#EFF6FF' }]}
            onPress={() => setGroupByProject(!groupByProject)}
            activeOpacity={0.7}
          >
            <Ionicons name="layers-outline" size={16} color={groupByProject ? '#1E40AF' : Colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Totals Card */}
        <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
          <View style={styles.totalsGrid}>
            <View style={styles.totalItem}>
              <Text style={[styles.totalNum, { color: Colors.primaryText }]}>{totals.workerCount}</Text>
              <Text style={[styles.totalLabel, { color: Colors.secondaryText }]}>{t('payroll.workers')}</Text>
            </View>
            {totals.hours > 0 && (
              <View style={styles.totalItem}>
                <Text style={[styles.totalNum, { color: '#3B82F6' }]}>{totals.hours.toFixed(1)}</Text>
                <Text style={[styles.totalLabel, { color: Colors.secondaryText }]}>{t('payroll.hours')}</Text>
              </View>
            )}
            <View style={styles.totalItem}>
              <Text style={[styles.totalNum, { color: '#EF4444' }]}>{formatCurrency(totals.grossPay)}</Text>
              <Text style={[styles.totalLabel, { color: Colors.secondaryText }]}>{t('payroll.totalGrossPay')}</Text>
            </View>
          </View>
        </View>

        {/* Worker List */}
        {workers.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: Colors.cardBackground }]}>
            <Ionicons name="people-outline" size={48} color={Colors.secondaryText} />
            <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>{t('payroll.noPayroll')}</Text>
            <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>{t('payroll.noPayrollDesc')}</Text>
          </View>
        ) : (
          workers.map((w, i) => (
            <View key={i} style={[styles.workerCard, { backgroundColor: Colors.cardBackground }]}>
              <View style={styles.workerHeader}>
                <View style={styles.workerInfo}>
                  <Text style={[styles.workerName, { color: Colors.primaryText }]} numberOfLines={1}>{w.workerName}</Text>
                  {w.trade ? (
                    <Text style={[styles.workerTrade, { color: Colors.secondaryText }]}>{w.trade}</Text>
                  ) : null}
                </View>
                <Text style={[styles.workerPay, { color: '#EF4444' }]}>{formatCurrency(w.grossPay)}</Text>
              </View>
              <View style={styles.workerDetails}>
                {w.hours != null && w.hours > 0 && (
                  <View style={styles.detailChip}>
                    <Ionicons name="time-outline" size={12} color={Colors.secondaryText} />
                    <Text style={[styles.detailText, { color: Colors.secondaryText }]}>{w.hours.toFixed(1)}h</Text>
                  </View>
                )}
                {w.rate > 0 && (
                  <View style={styles.detailChip}>
                    <Ionicons name="cash-outline" size={12} color={Colors.secondaryText} />
                    <Text style={[styles.detailText, { color: Colors.secondaryText }]}>${w.rate}/{w.paymentType === 'hourly' ? 'hr' : w.paymentType === 'daily' ? 'day' : 'wk'}</Text>
                  </View>
                )}
                {groupByProject && w.projectName ? (
                  <View style={styles.detailChip}>
                    <Ionicons name="briefcase-outline" size={12} color={Colors.secondaryText} />
                    <Text style={[styles.detailText, { color: Colors.secondaryText }]} numberOfLines={1}>{w.projectName}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSizes.subheader, fontWeight: '700', letterSpacing: -0.3 },
  scroll: { flex: 1 },
  scrollContent: { padding: Spacing.lg, gap: Spacing.lg },
  periodRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center' },
  periodPill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
    backgroundColor: '#E5E7EB',
  },
  periodText: { fontSize: FontSizes.small, fontWeight: '600' },
  groupToggle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  totalsGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  totalItem: { alignItems: 'center', gap: 4 },
  totalNum: { fontSize: 22, fontWeight: '700' },
  totalLabel: { fontSize: FontSizes.tiny, fontWeight: '500' },
  workerCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  workerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  workerInfo: { flex: 1, marginRight: Spacing.sm },
  workerName: { fontSize: FontSizes.body, fontWeight: '600' },
  workerTrade: { fontSize: FontSizes.tiny, marginTop: 2 },
  workerPay: { fontSize: FontSizes.body, fontWeight: '700' },
  workerDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  detailText: { fontSize: FontSizes.tiny, fontWeight: '500' },
  emptyCard: { alignItems: 'center', padding: Spacing.xxl, borderRadius: BorderRadius.lg, gap: Spacing.sm },
  emptyTitle: { fontSize: FontSizes.body, fontWeight: '600' },
  emptyText: { fontSize: FontSizes.small, textAlign: 'center' },
});
