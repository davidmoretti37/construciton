/**
 * OwnerDashboardScreen
 * Widget-based customizable dashboard with drag-to-reorder editing
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import NotificationBell from '../../components/NotificationBell';
import SkeletonBox from '../../components/skeletons/SkeletonBox';
import { fetchProjectsForOwner } from '../../utils/storage/projects';
import { fetchWorkersForOwner, getSupervisorsForOwner } from '../../utils/storage/workers';
import { getReconciliationSummary } from '../../services/bankService';
import { fetchAllOwnerTransactions, calculateCashFlow } from '../../utils/financialReportUtils';
import { checkForgottenClockOuts, sendForgottenClockOutNotifications } from '../../utils/storage/timeTracking';

import { WIDGET_DEFINITIONS, DEFAULT_LAYOUT, loadLayout, saveLayout, resetLayout } from '../../utils/dashboardLayout';
import { colWidth, getWidgetSize } from '../../components/dashboard/WidgetGrid';
import PnLWidget from '../../components/dashboard/widgets/PnLWidget';
import CashFlowWidget from '../../components/dashboard/widgets/CashFlowWidget';
import AlertsWidget from '../../components/dashboard/widgets/AlertsWidget';
import AgingWidget from '../../components/dashboard/widgets/AgingWidget';
import PayrollWidget from '../../components/dashboard/widgets/PayrollWidget';
import RecentReportsWidget from '../../components/dashboard/widgets/RecentReportsWidget';
import PipelineWidget from '../../components/dashboard/widgets/PipelineWidget';
import ActiveProjectsWidget from '../../components/dashboard/widgets/ActiveProjectsWidget';
import WorkersWidget from '../../components/dashboard/widgets/WorkersWidget';
import SupervisorsWidget from '../../components/dashboard/widgets/SupervisorsWidget';
import TransactionsWidget from '../../components/dashboard/widgets/TransactionsWidget';
import OverdueInvoicesWidget from '../../components/dashboard/widgets/OverdueInvoicesWidget';
import ProfitMarginWidget from '../../components/dashboard/widgets/ProfitMarginWidget';
import ContractValueWidget from '../../components/dashboard/widgets/ContractValueWidget';
import PendingInvitesWidget from '../../components/dashboard/widgets/PendingInvitesWidget';
import ForgottenClockoutsWidget from '../../components/dashboard/widgets/ForgottenClockoutsWidget';
import UnmatchedTxnsWidget from '../../components/dashboard/widgets/UnmatchedTxnsWidget';
import AddWidgetSheet from '../../components/dashboard/AddWidgetSheet';
import WidgetSizeSheet from '../../components/dashboard/WidgetSizeSheet';
import { fetchAgingReport, fetchInvoicesForOwner } from '../../utils/storage/invoices';
import { fetchEstimatesForOwner } from '../../utils/storage/estimates';
import { fetchDailyReportsWithFilters } from '../../utils/storage/dailyReports';

const { width: screenWidth } = Dimensions.get('window');
const FULL_WIDTH = screenWidth - Spacing.lg * 2;

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
  const [forgottenClockOuts, setForgottenClockOuts] = useState({ workers: [], supervisors: [] });

  // Heavy widget data
  const [agingData, setAgingData] = useState({ totals: { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 } });
  const [payrollSummary, setPayrollSummary] = useState({ grossPay: 0, workerCount: 0 });
  const [recentReports, setRecentReports] = useState([]);
  const [pipeline, setPipeline] = useState({ estimates: { draft: 0, sent: 0, accepted: 0 }, invoices: { unpaid: 0, partial: 0, paid: 0 } });

  // Widget layout state
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [editMode, setEditMode] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [resizingWidget, setResizingWidget] = useState(null);
  const [pendingLayout, setPendingLayout] = useState(null);

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

      // Check forgotten clock-outs (>10 hours)
      try {
        const forgotten = await checkForgottenClockOuts(10);
        setForgottenClockOuts(forgotten);
        // Send push notifications for forgotten clock-outs (fire and forget)
        if (forgotten.workers.length > 0 || forgotten.supervisors.length > 0) {
          sendForgottenClockOutNotifications(10);
        }
      } catch (e) { setForgottenClockOuts({ workers: [], supervisors: [] }); }

      // AR Aging report
      try {
        const aging = await fetchAgingReport();
        setAgingData(aging);
      } catch (e) { setAgingData({ totals: { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 } }); }

      // Payroll summary (this week's labor from already-fetched transactions)
      try {
        const projectIds = projects.map(p => p.id);
        const txs = await fetchAllOwnerTransactions(projectIds);
        const now = new Date();
        const dayOfWeek = now.getDay();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - dayOfWeek);
        const weekStartStr = weekStart.toISOString().split('T')[0];
        const laborTxs = txs.filter(tx => tx.type === 'expense' && tx.category === 'labor' && tx.date >= weekStartStr);
        const payrollGross = laborTxs.reduce((s, tx) => s + parseFloat(tx.amount || 0), 0);
        const payrollWorkers = new Set(laborTxs.filter(tx => tx.worker_id).map(tx => tx.worker_id)).size;
        setPayrollSummary({ grossPay: payrollGross, workerCount: payrollWorkers });
      } catch (e) { setPayrollSummary({ grossPay: 0, workerCount: 0 }); }

      // Recent daily reports
      try {
        const reports = await fetchDailyReportsWithFilters({ limit: 5 });
        setRecentReports(reports || []);
      } catch (e) { setRecentReports([]); }

      // Invoice/Estimate pipeline
      try {
        const [allEstimates, allInvoices] = await Promise.all([
          fetchEstimatesForOwner(),
          fetchInvoicesForOwner(),
        ]);
        const estCounts = { draft: 0, sent: 0, accepted: 0 };
        (allEstimates || []).forEach(e => { if (estCounts[e.status] !== undefined) estCounts[e.status]++; });
        const invCounts = { unpaid: 0, partial: 0, paid: 0 };
        (allInvoices || []).forEach(i => { if (invCounts[i.status] !== undefined) invCounts[i.status]++; });
        setPipeline({ estimates: estCounts, invoices: invCounts });
      } catch (e) { setPipeline({ estimates: { draft: 0, sent: 0, accepted: 0 }, invoices: { unpaid: 0, partial: 0, paid: 0 } }); }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { fetchDashboardData(); }, []));

  // Load persisted layout on mount
  useEffect(() => {
    loadLayout().then(setLayout);
  }, []);

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
        onPress: () => navigation.navigate('Workers', { initialTab: 'team' }),
      });
    }
    const forgottenCount = forgottenClockOuts.workers.length + forgottenClockOuts.supervisors.length;
    if (forgottenCount > 0) {
      const names = [
        ...forgottenClockOuts.workers.map(w => w.worker_name),
        ...forgottenClockOuts.supervisors.map(s => s.supervisor_name),
      ].slice(0, 3).join(', ');
      items.push({
        key: 'forgotten-clockout',
        icon: 'time',
        color: ACCENT.warning,
        bg: `${ACCENT.warning}12`,
        text: `${forgottenCount} team member${forgottenCount > 1 ? 's' : ''} may have forgotten to clock out (${names}${forgottenCount > 3 ? '...' : ''})`,
        onPress: () => navigation.navigate('Workers', { initialTab: 'team' }),
      });
    }
    return items;
  }, [overdueInvoices, reconciliation, stats.pendingInvites, forgottenClockOuts, navigation, t]);

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

  const transactionCount = reconciliation && !reconciliation.message ? (reconciliation.total || 0) : '\u2014';

  // ── Edit mode handlers ──

  const enterEditMode = useCallback(() => {
    setEditMode(true);
    setPendingLayout([...layout]);
  }, [layout]);

  const exitEditMode = useCallback(async () => {
    if (pendingLayout) {
      await saveLayout(pendingLayout);
      setLayout(pendingLayout);
    }
    setEditMode(false);
    setPendingLayout(null);
  }, [pendingLayout]);

  const handleReset = useCallback(async () => {
    const fresh = await resetLayout();
    setPendingLayout([...fresh]);
  }, []);

  const handleRemoveWidget = useCallback((widgetId) => {
    setPendingLayout((prev) => prev.filter((w) => w.id !== widgetId));
  }, []);

  const handleAddWidget = useCallback((widgetId, size) => {
    setPendingLayout((prev) => {
      const maxPos = prev.reduce((max, w) => Math.max(max, w.position), -1);
      return [...prev, { id: widgetId, size, position: maxPos + 1 }];
    });
    setShowAddSheet(false);
  }, []);

  const handleResize = useCallback((newSize) => {
    if (!resizingWidget) return;
    setPendingLayout((prev) =>
      prev.map((w) => (w.id === resizingWidget.id ? { ...w, size: newSize } : w))
    );
    setResizingWidget(null);
  }, [resizingWidget]);

  const availableWidgets = useMemo(() => {
    const activeLayout = editMode ? pendingLayout : layout;
    const placedIds = new Set((activeLayout || []).map((w) => w.id));
    return WIDGET_DEFINITIONS.filter((w) => !placedIds.has(w.id));
  }, [editMode, pendingLayout, layout]);

  const resizingWidgetDef = useMemo(() => {
    if (!resizingWidget) return null;
    return WIDGET_DEFINITIONS.find((w) => w.id === resizingWidget.id) || null;
  }, [resizingWidget]);

  // ── Widget render function ──

  const renderWidget = useCallback((item) => {
    switch (item.id) {
      case 'pnl':
        return (
          <PnLWidget
            pnl={pnl}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('FinancialReport')}
          />
        );
      case 'cashflow':
        return (
          <CashFlowWidget
            cashFlowData={cashFlowData}
            maxCashFlowVal={maxCashFlowVal}
            totalNet={totalNet}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('FinancialReport')}
          />
        );
      case 'alerts':
        return (
          <AlertsWidget
            alerts={alerts}
            size={item.size}
            editMode={editMode}
            onNavigate={(target) => target && navigation.navigate(target)}
          />
        );
      case 'active_projects':
        return (
          <ActiveProjectsWidget
            activeProjects={stats.activeProjects}
            totalProjects={stats.totalProjects}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('Projects')}
          />
        );
      case 'workers':
        return (
          <WorkersWidget
            totalWorkers={stats.totalWorkers}
            totalSupervisors={stats.totalSupervisors}
            totalProjects={stats.totalProjects}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('Workers', { initialTab: 'team' })}
          />
        );
      case 'supervisors':
        return (
          <SupervisorsWidget
            totalSupervisors={stats.totalSupervisors}
            totalWorkers={stats.totalWorkers}
            totalProjects={stats.totalProjects}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('Workers', { initialTab: 'team' })}
          />
        );
      case 'transactions': {
        const txMatched = reconciliation?.matched || 0;
        const txUnmatched = reconciliation?.unmatched || 0;
        const txSuggested = reconciliation?.suggested_matches || 0;
        return (
          <TransactionsWidget
            transactionCount={transactionCount}
            matched={txMatched}
            unmatched={txUnmatched + txSuggested}
            size={item.size}
            editMode={editMode}
            onPress={() =>
              reconciliation && !reconciliation.message
                ? navigation.navigate('BankReconciliation')
                : navigation.navigate('BankConnection')
            }
          />
        );
      }
      case 'overdue_invoices':
        return (
          <OverdueInvoicesWidget
            count={overdueInvoices.count}
            amount={overdueInvoices.amount}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('ARAging')}
          />
        );
      case 'profit_margin':
        return (
          <ProfitMarginWidget
            margin={pnl.margin}
            healthText={marginHealth.text}
            revenue={pnl.revenue}
            expenses={pnl.expenses}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('FinancialReport')}
          />
        );
      case 'contract_value':
        return (
          <ContractValueWidget
            totalContractValue={stats.totalContractValue}
            totalRevenue={stats.totalRevenue}
            totalProjects={stats.totalProjects}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('Projects')}
          />
        );
      case 'pending_invites':
        return (
          <PendingInvitesWidget
            pendingInvites={stats.pendingInvites}
            totalSupervisors={stats.totalSupervisors}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('Workers', { initialTab: 'team' })}
          />
        );
      case 'forgotten_clockouts': {
        const forgottenNames = [
          ...forgottenClockOuts.workers.map(w => w.worker_name),
          ...forgottenClockOuts.supervisors.map(s => s.supervisor_name),
        ].filter(Boolean).slice(0, 3);
        const forgottenTotal = forgottenClockOuts.workers.length + forgottenClockOuts.supervisors.length;
        return (
          <ForgottenClockoutsWidget
            count={forgottenTotal}
            names={forgottenNames}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('ClockOuts')}
          />
        );
      }
      case 'unmatched_txns': {
        const unmatchedOnly = reconciliation?.unmatched || 0;
        const suggestedOnly = reconciliation?.suggested_matches || 0;
        return (
          <UnmatchedTxnsWidget
            unmatchedCount={unmatchedOnly}
            suggestedCount={suggestedOnly}
            size={item.size}
            editMode={editMode}
            onPress={() =>
              reconciliation && !reconciliation.message
                ? navigation.navigate('BankReconciliation', { filter: 'unmatched' })
                : navigation.navigate('BankConnection')
            }
          />
        );
      }
      case 'ar_aging':
        return (
          <AgingWidget
            agingTotals={agingData?.totals}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('ARAging')}
            fmt={fmt}
          />
        );
      case 'payroll':
        return (
          <PayrollWidget
            payrollSummary={payrollSummary}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('PayrollSummary')}
            fmt={fmt}
          />
        );
      case 'recent_reports':
        return (
          <RecentReportsWidget
            reports={recentReports}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('OwnerDailyReports')}
          />
        );
      case 'pipeline':
        return (
          <PipelineWidget
            pipeline={pipeline}
            size={item.size}
            editMode={editMode}
            onEstimatesPress={() => navigation.navigate('EstimatesDetail')}
            onInvoicesPress={() => navigation.navigate('InvoicesDetail')}
          />
        );
      default:
        return null;
    }
  }, [pnl, cashFlowData, maxCashFlowVal, totalNet, alerts, stats, transactionCount, reconciliation, editMode, navigation, overdueInvoices, marginHealth, forgottenClockOuts, agingData, payrollSummary, recentReports, pipeline]);

  // ── Sized widget wrapper (view mode) ──

  const renderSizedWidget = useCallback((item, index) => {
    const { width, height } = getWidgetSize(item.size);
    return (
      <TouchableOpacity
        key={item.id}
        style={{ width, height }}
        onLongPress={enterEditMode}
        activeOpacity={0.9}
        delayLongPress={500}
      >
        {renderWidget(item)}
      </TouchableOpacity>
    );
  }, [renderWidget, enterEditMode]);

  // ── Draggable item (edit mode) ──

  const renderDraggableItem = useCallback(({ item, drag, isActive }) => {
    const { width, height } = getWidgetSize(item.size);
    return (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={drag}
          onPress={() => {
            const def = WIDGET_DEFINITIONS.find((w) => w.id === item.id);
            if (def && def.availableSizes.length > 1) {
              setResizingWidget({ ...item, ...def });
            }
          }}
          delayLongPress={200}
          activeOpacity={0.8}
          style={[
            styles.editWidgetWrap,
            { width, height, marginBottom: 12 },
            isActive && { opacity: 0.85 },
          ]}
        >
          <View
            style={[
              { width: '100%', height: '100%' },
              styles.editWidgetHighlight,
            ]}
          >
            {renderWidget(item)}
          </View>
          {/* Remove badge — outside overflow container */}
          <TouchableOpacity
            style={styles.removeBadge}
            onPress={() => handleRemoveWidget(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="remove-circle" size={22} color="#EF4444" />
          </TouchableOpacity>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  }, [renderWidget, handleRemoveWidget]);

  // ── Loading skeleton ──

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header} />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: Spacing.lg }}>
            <SkeletonBox width="50%" height={26} borderRadius={4} />
            <SkeletonBox width="60%" height={14} borderRadius={4} style={{ marginTop: 6 }} />
            <SkeletonBox width="100%" height={190} borderRadius={20} style={{ marginTop: Spacing.md }} />
            <SkeletonBox width="100%" height={50} borderRadius={BorderRadius.md} style={{ marginTop: Spacing.lg }} />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: Spacing.lg }}>
              <SkeletonBox width={86} height={110} borderRadius={16} />
              <SkeletonBox width={86} height={110} borderRadius={16} />
              <SkeletonBox width={86} height={110} borderRadius={16} />
              <SkeletonBox width={86} height={110} borderRadius={16} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Main render ──

  const activeLayout = editMode ? (pendingLayout || layout) : layout;

  return (
    <SafeAreaView style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>{t('dashboardScreen.welcome')}</Text>
          <Text style={styles.dateText}>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={enterEditMode} style={styles.customizeIconBtn}>
            <Ionicons name="grid-outline" size={22} color="#64748B" />
          </TouchableOpacity>
          <NotificationBell onPress={() => navigation.navigate('Notifications')} />
        </View>
      </View>

      {/* ── Edit mode header overlay ── */}
      {editMode && (
        <View style={styles.editHeader}>
          <TouchableOpacity onPress={handleReset}>
            <Text style={styles.editHeaderReset}>Reset</Text>
          </TouchableOpacity>
          <Text style={styles.editHeaderTitle}>Editing Dashboard</Text>
          <TouchableOpacity onPress={exitEditMode}>
            <Text style={styles.editHeaderDone}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Content ── */}
      {editMode ? (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <DraggableFlatList
            data={activeLayout}
            extraData={pendingLayout}
            keyExtractor={(item) => item.id}
            renderItem={renderDraggableItem}
            onDragEnd={({ data }) => {
              setPendingLayout(data.map((item, i) => ({ ...item, position: i })));
            }}
            contentContainerStyle={styles.editListContent}
            ListFooterComponent={
              <View>
                {/* Add widget slot */}
                <TouchableOpacity style={styles.addSlot} onPress={() => setShowAddSheet(true)}>
                  <Ionicons name="add-circle-outline" size={20} color="#94A3B8" />
                  <Text style={styles.addSlotText}>Add Widget</Text>
                </TouchableOpacity>
                <View style={{ height: 100 }} />
              </View>
            }
          />
        </GestureHandlerRootView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
        >
          {/* Widget grid */}
          <View style={styles.widgetGrid}>
            {activeLayout.map((item, index) => renderSizedWidget(item, index))}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      )}

      {/* ── Bottom sheets ── */}
      <AddWidgetSheet
        visible={showAddSheet}
        onClose={() => setShowAddSheet(false)}
        availableWidgets={availableWidgets}
        onAdd={handleAddWidget}
      />
      <WidgetSizeSheet
        visible={!!resizingWidget}
        onClose={() => setResizingWidget(null)}
        widget={resizingWidgetDef}
        currentSize={resizingWidget?.size}
        onResize={handleResize}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Root
  container: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  welcomeText: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  dateText: {
    fontSize: FontSizes.small,
    color: '#94A3B8',
    marginTop: 2,
  },

  // Scroll
  scroll: {
    flex: 1,
    backgroundColor: '#F1F5F9',
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 20,
    paddingTop: Spacing.md,
  },

  // Widget grid (view mode)
  widgetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  // Edit mode header
  editHeader: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editHeaderReset: {
    fontSize: 13,
    color: '#94A3B8',
  },
  editHeaderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  editHeaderDone: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3B82F6',
  },

  // Edit mode list
  editListContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 20,
  },
  editWidgetWrap: {
    // width set dynamically per widget size
  },
  editWidgetHighlight: {
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 0.35)',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
    backgroundColor: 'rgba(59, 130, 246, 0.03)',
  },

  // Remove badge
  removeBadge: {
    position: 'absolute',
    top: -6,
    left: -6,
    zIndex: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 11,
  },

  // Add widget slot (edit mode)
  addSlot: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#E5E7EB',
    borderRadius: 16,
    height: 80,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginTop: 4,
  },
  addSlotText: {
    fontSize: 13,
    color: '#94A3B8',
    marginLeft: 6,
  },

  // Header right (customize + notification bell)
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  customizeIconBtn: {
    padding: 8,
  },
});
