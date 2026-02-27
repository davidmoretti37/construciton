/**
 * OwnerDashboardScreen
 * Minimalist dashboard — P&L card, alerts, quick access grid
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import NotificationBell from '../../components/NotificationBell';
import SkeletonBox from '../../components/skeletons/SkeletonBox';
import { fetchProjectsForOwner } from '../../utils/storage/projects';
import { fetchWorkersForOwner, getSupervisorsForOwner } from '../../utils/storage/workers';
import { getReconciliationSummary } from '../../services/plaidService';
import { fetchAllOwnerTransactions, calculateCashFlow } from '../../utils/financialReportUtils';

const ACCENT = {
  primary: '#1E40AF',
  primaryLight: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
};

export default function OwnerDashboardScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { user } = useAuth();
  const navigation = useNavigation();
  const { t } = useTranslation('owner');

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalSupervisors: 0,
    totalProjects: 0,
    activeProjects: 0,
    totalWorkers: 0,
    totalRevenue: 0,
    totalContractValue: 0,
    totalExpenses: 0,
    pendingInvites: 0,
  });
  const [reconciliation, setReconciliation] = useState(null);
  const [overdueInvoices, setOverdueInvoices] = useState({ count: 0, amount: 0 });
  const [cashFlowData, setCashFlowData] = useState([]);

  const pnl = useMemo(() => {
    const revenue = stats.totalRevenue || 0;
    const expenses = stats.totalExpenses || 0;
    const profit = revenue - expenses;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, expenses, profit, margin };
  }, [stats]);

  const fetchDashboardData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [projects, workers, supervisorList] = await Promise.all([
        fetchProjectsForOwner(),
        fetchWorkersForOwner(),
        getSupervisorsForOwner(user.id),
      ]);

      let pendingInviteCount = 0;
      try {
        const { data: invitesData } = await supabase
          .from('supervisor_invites')
          .select('id')
          .eq('owner_id', user.id)
          .eq('status', 'pending');
        pendingInviteCount = (invitesData || []).length;
      } catch (e) { /* table may not exist */ }

      const totalContractValue = projects.reduce((sum, p) => sum + (p.contractAmount || 0), 0);
      const totalRevenue = projects.reduce((sum, p) => sum + (p.incomeCollected || 0), 0);
      const totalExpenses = projects.reduce((sum, p) => sum + (p.expenses || 0), 0);
      const activeProjects = projects.filter(
        (p) => ['active', 'on-track', 'over-budget', 'behind'].includes(p.status)
      ).length;

      setStats({
        totalSupervisors: supervisorList.length,
        totalProjects: projects.length,
        activeProjects,
        totalWorkers: workers.length,
        totalRevenue,
        totalContractValue,
        totalExpenses,
        pendingInvites: pendingInviteCount,
      });

      // Overdue invoices
      try {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('total, amount_paid')
          .or(`user_id.eq.${user.id},assigned_supervisor_id.eq.${user.id}`)
          .in('status', ['unpaid', 'partial', 'overdue']);
        let overdueAmount = 0;
        (invoices || []).forEach(inv => {
          overdueAmount += (inv.total || 0) - (inv.amount_paid || 0);
        });
        setOverdueInvoices({ count: (invoices || []).length, amount: overdueAmount });
      } catch (e) { setOverdueInvoices({ count: 0, amount: 0 }); }

      // Cash flow — 3 months
      try {
        const projectIds = projects.map(p => p.id);
        const txs = await fetchAllOwnerTransactions(projectIds);
        const cf = calculateCashFlow(txs, 3);
        setCashFlowData(cf);
      } catch (e) { setCashFlowData([]); }

      // Bank reconciliation
      try {
        const reconSummary = await getReconciliationSummary();
        setReconciliation(reconSummary);
      } catch (e) { setReconciliation(null); }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => { fetchDashboardData(); }, []);
  useFocusEffect(useCallback(() => { fetchDashboardData(); }, [fetchDashboardData]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboardData();
  }, [fetchDashboardData]);

  const fmt = (amount) => {
    const abs = Math.abs(amount);
    if (abs >= 1000000) return `${amount < 0 ? '-' : ''}$${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${amount < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
    return `${amount < 0 ? '-' : ''}$${Math.round(abs).toLocaleString()}`;
  };

  // Alerts
  const alerts = useMemo(() => {
    const items = [];
    if (overdueInvoices.count > 0) {
      items.push({
        key: 'overdue',
        icon: 'alert-circle',
        color: ACCENT.error,
        bg: `${ACCENT.error}12`,
        text: t('dashboardScreen.overdueInvoices', { count: overdueInvoices.count, amount: fmt(overdueInvoices.amount) }),
        onPress: () => navigation.navigate('ARAging'),
      });
    }
    const unmatchedCount = (reconciliation?.unmatched || 0) + (reconciliation?.suggested_matches || 0);
    if (unmatchedCount > 0) {
      items.push({
        key: 'unmatched',
        icon: 'card-outline',
        color: ACCENT.warning,
        bg: `${ACCENT.warning}12`,
        text: t('dashboardScreen.unmatchedTransactions', { count: unmatchedCount }),
        onPress: () => navigation.navigate('BankReconciliation', { filter: 'unmatched' }),
      });
    }
    if (stats.pendingInvites > 0) {
      items.push({
        key: 'invites',
        icon: 'mail-unread',
        color: ACCENT.primaryLight,
        bg: `${ACCENT.primaryLight}12`,
        text: t('dashboardScreen.pendingInvites', { count: stats.pendingInvites }),
        onPress: () => navigation.navigate('Workers'),
      });
    }
    return items;
  }, [overdueInvoices, reconciliation, stats.pendingInvites, navigation, t]);

  const maxCashFlowVal = useMemo(() => {
    let max = 1;
    cashFlowData.forEach(b => { max = Math.max(max, b.cashIn, b.cashOut); });
    return max;
  }, [cashFlowData]);

  const totalNet = useMemo(() => cashFlowData.reduce((s, b) => s + b.net, 0), [cashFlowData]);

  const marginHealth = useMemo(() => {
    if (pnl.margin >= 20) return { text: t('financial.healthy'), color: ACCENT.success };
    if (pnl.margin >= 10) return { text: t('financial.moderate'), color: ACCENT.warning };
    return { text: t('financial.atRisk'), color: ACCENT.error };
  }, [pnl.margin, t]);

  const styles = createStyles(Colors);

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.topBar, { backgroundColor: Colors.background, borderBottomColor: Colors.border }]} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={{ padding: 20 }}>
            <SkeletonBox width="50%" height={22} borderRadius={4} />
            <SkeletonBox width="70%" height={14} borderRadius={4} style={{ marginTop: 8 }} />
          </View>
          <View style={{ paddingHorizontal: 16 }}>
            <SkeletonBox width="100%" height={160} borderRadius={12} />
            <SkeletonBox width="100%" height={90} borderRadius={12} style={{ marginTop: 16 }} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <SkeletonBox width="48%" height={80} borderRadius={12} />
              <SkeletonBox width="48%" height={80} borderRadius={12} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={[styles.topBar, { backgroundColor: Colors.background, borderBottomColor: Colors.border }]}>
        <View style={styles.topBarLeft}>
          <Text style={[styles.welcomeText, { color: Colors.primaryText }]}>{t('dashboardScreen.welcome')}</Text>
          <Text style={[styles.dateText, { color: Colors.secondaryText }]}>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>
        <NotificationBell onPress={() => navigation.navigate('Notifications')} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ACCENT.primary} />}
      >

        {/* ── P&L Card ── */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.card, { backgroundColor: Colors.cardBackground }]}
            onPress={() => navigation.navigate('FinancialReport')}
            activeOpacity={0.7}
          >
            <View style={styles.pnlColumns}>
              <View style={styles.pnlCol}>
                <Ionicons name="trending-up" size={14} color={ACCENT.success} />
                <Text style={[styles.pnlValue, { color: ACCENT.success }]}>{fmt(pnl.revenue)}</Text>
                <Text style={[styles.pnlLabel, { color: Colors.secondaryText }]}>{t('dashboardScreen.revenue')}</Text>
              </View>
              <View style={[styles.pnlDivider, { backgroundColor: Colors.border }]} />
              <View style={styles.pnlCol}>
                <Ionicons name="trending-down" size={14} color={ACCENT.error} />
                <Text style={[styles.pnlValue, { color: ACCENT.error }]}>{fmt(pnl.expenses)}</Text>
                <Text style={[styles.pnlLabel, { color: Colors.secondaryText }]}>{t('dashboardScreen.expenses')}</Text>
              </View>
              <View style={[styles.pnlDivider, { backgroundColor: Colors.border }]} />
              <View style={styles.pnlCol}>
                <Ionicons name="wallet" size={14} color={pnl.profit >= 0 ? ACCENT.success : ACCENT.error} />
                <Text style={[styles.pnlValue, { color: pnl.profit >= 0 ? ACCENT.success : ACCENT.error }]}>{fmt(pnl.profit)}</Text>
                <Text style={[styles.pnlLabel, { color: Colors.secondaryText }]}>{t('dashboardScreen.grossProfit')}</Text>
              </View>
            </View>

            <View style={styles.marginRow}>
              <View style={[styles.marginBadge, { backgroundColor: `${marginHealth.color}15` }]}>
                <View style={[styles.marginDot, { backgroundColor: marginHealth.color }]} />
                <Text style={[styles.marginText, { color: marginHealth.color }]}>
                  {Math.round(pnl.margin)}% {t('dashboardScreen.margin')} — {marginHealth.text}
                </Text>
              </View>
            </View>

            <View style={[styles.viewReportRow, { backgroundColor: `${ACCENT.primary}08` }]}>
              <Ionicons name="bar-chart-outline" size={14} color={ACCENT.primary} />
              <Text style={styles.viewReportText}>{t('dashboardScreen.viewPLReport')}</Text>
              <Ionicons name="chevron-forward" size={14} color={ACCENT.primary} />
            </View>
          </TouchableOpacity>
        </View>

        {/* ── Needs Attention ── */}
        {alerts.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('dashboardScreen.needsAttention')}</Text>
            {alerts.map(alert => (
              <TouchableOpacity
                key={alert.key}
                style={[styles.alertCard, { backgroundColor: Colors.cardBackground, borderLeftColor: alert.color }]}
                onPress={alert.onPress}
                activeOpacity={0.7}
              >
                <View style={[styles.alertIcon, { backgroundColor: `${alert.color}15` }]}>
                  <Ionicons name={alert.icon} size={16} color={alert.color} />
                </View>
                <Text style={[styles.alertText, { color: Colors.primaryText }]} numberOfLines={1}>{alert.text}</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.secondaryText} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Quick Access Grid ── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('dashboardScreen.quickAccess')}</Text>
          <View style={styles.grid}>
            <TouchableOpacity
              style={[styles.gridCard, { backgroundColor: Colors.cardBackground, borderLeftColor: ACCENT.primaryLight }]}
              onPress={() => navigation.navigate('Projects')}
              activeOpacity={0.7}
            >
              <View style={[styles.gridIcon, { backgroundColor: `${ACCENT.primaryLight}15` }]}>
                <Ionicons name="construct-outline" size={18} color={ACCENT.primaryLight} />
              </View>
              <Text style={[styles.gridValue, { color: Colors.primaryText }]}>{stats.activeProjects}</Text>
              <Text style={[styles.gridLabel, { color: Colors.secondaryText }]}>
                {t('dashboardScreen.activeProjects')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.gridCard, { backgroundColor: Colors.cardBackground, borderLeftColor: ACCENT.warning }]}
              onPress={() => navigation.navigate('Workers')}
              activeOpacity={0.7}
            >
              <View style={[styles.gridIcon, { backgroundColor: `${ACCENT.warning}15` }]}>
                <Ionicons name="people-outline" size={18} color={ACCENT.warning} />
              </View>
              <Text style={[styles.gridValue, { color: Colors.primaryText }]}>{stats.totalWorkers}</Text>
              <Text style={[styles.gridLabel, { color: Colors.secondaryText }]}>{t('dashboardScreen.totalWorkers')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.gridCard, { backgroundColor: Colors.cardBackground, borderLeftColor: ACCENT.primary }]}
              onPress={() => navigation.navigate('Workers', { initialTab: 'team' })}
              activeOpacity={0.7}
            >
              <View style={[styles.gridIcon, { backgroundColor: `${ACCENT.primary}15` }]}>
                <Ionicons name="shield-outline" size={18} color={ACCENT.primary} />
              </View>
              <Text style={[styles.gridValue, { color: Colors.primaryText }]}>{stats.totalSupervisors}</Text>
              <Text style={[styles.gridLabel, { color: Colors.secondaryText }]}>{t('dashboardScreen.totalSupervisors')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.gridCard, { backgroundColor: Colors.cardBackground, borderLeftColor: ACCENT.success }]}
              onPress={() => reconciliation && !reconciliation.message
                ? navigation.navigate('BankReconciliation')
                : navigation.navigate('BankConnection')}
              activeOpacity={0.7}
            >
              <View style={[styles.gridIcon, { backgroundColor: `${ACCENT.success}15` }]}>
                <Ionicons name="card-outline" size={18} color={ACCENT.success} />
              </View>
              <Text style={[styles.gridValue, { color: Colors.primaryText }]}>
                {reconciliation && !reconciliation.message ? (reconciliation.total || 0) : '—'}
              </Text>
              <Text style={[styles.gridLabel, { color: Colors.secondaryText }]}>{t('dashboardScreen.transactions')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Cash Flow ── */}
        {cashFlowData.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>{t('dashboardScreen.cashFlow')}</Text>
            <TouchableOpacity
              style={[styles.card, { backgroundColor: Colors.cardBackground }]}
              onPress={() => navigation.navigate('FinancialReport')}
              activeOpacity={0.7}
            >
              <View style={styles.cfChart}>
                {cashFlowData.map((month) => {
                  const inH = Math.max(6, (month.cashIn / maxCashFlowVal) * 56);
                  const outH = Math.max(6, (month.cashOut / maxCashFlowVal) * 56);
                  return (
                    <View key={month.key} style={styles.cfMonth}>
                      <View style={styles.cfBars}>
                        <View style={[styles.cfBar, { height: inH, backgroundColor: ACCENT.success }]} />
                        <View style={[styles.cfBar, { height: outH, backgroundColor: `${ACCENT.error}50` }]} />
                      </View>
                      <Text style={[styles.cfLabel, { color: Colors.secondaryText }]}>{month.label}</Text>
                    </View>
                  );
                })}
              </View>

              <View style={[styles.cfFooter, { borderTopColor: Colors.border }]}>
                <View style={styles.cfLegend}>
                  <View style={[styles.legendDot, { backgroundColor: ACCENT.success }]} />
                  <Text style={[styles.cfFooterText, { color: Colors.secondaryText }]}>{t('dashboardScreen.cashIn')}</Text>
                  <View style={[styles.legendDot, { backgroundColor: `${ACCENT.error}50`, marginLeft: 10 }]} />
                  <Text style={[styles.cfFooterText, { color: Colors.secondaryText }]}>{t('dashboardScreen.cashOut')}</Text>
                </View>
                <Text style={[styles.cfNetText, { color: totalNet >= 0 ? ACCENT.success : ACCENT.error }]}>
                  {t('dashboardScreen.net')}: {fmt(totalNet)}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors) => StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  topBarLeft: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 20 },

  welcomeText: {
    fontSize: FontSizes.header,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  dateText: { fontSize: FontSizes.small },

  // Section
  section: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    letterSpacing: 0.2,
  },

  // P&L unified card columns
  pnlColumns: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  pnlCol: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  pnlDivider: {
    width: 1,
    height: 40,
    alignSelf: 'center',
  },
  pnlValue: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  pnlLabel: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
  },

  // Card
  card: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },

  // Margin row
  marginRow: { alignItems: 'flex-start', marginBottom: Spacing.md },
  // View report button
  viewReportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
  },
  viewReportText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E40AF',
  },
  marginBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 6,
  },
  marginDot: { width: 7, height: 7, borderRadius: 4 },
  marginText: { fontSize: 12, fontWeight: '600' },

  // Alerts
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderLeftWidth: 4,
    gap: 10,
    marginBottom: Spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  alertIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertText: { flex: 1, fontSize: 13, fontWeight: '600' },

  // Cash Flow
  cfChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 80,
    marginBottom: Spacing.sm,
  },
  cfMonth: { alignItems: 'center', flex: 1 },
  cfBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 6 },
  cfBar: { width: 20, borderRadius: 4, minHeight: 6 },
  cfLabel: { fontSize: 11, fontWeight: '500' },
  cfFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
  },
  cfLegend: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  cfFooterText: { fontSize: 11 },
  cfNetText: { fontSize: 13, fontWeight: '700' },

  // Quick Access Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  gridCard: {
    width: '47%',
    flexGrow: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  gridIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  gridValue: { fontSize: 20, fontWeight: '700' },
  gridLabel: { fontSize: 11, marginTop: 2 },
});
