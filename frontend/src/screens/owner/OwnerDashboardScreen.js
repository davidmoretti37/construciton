/**
 * OwnerDashboardScreen
 * Widget-based customizable dashboard with drag-to-reorder editing
 */

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import DraggableWidgetGrid from '../../components/dashboard/DraggableWidgetGrid';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import NotificationBell from '../../components/NotificationBell';
import InboxBell from '../../components/InboxBell';
import MorningBriefCard from '../../components/MorningBriefCard';
import SkeletonBox from '../../components/skeletons/SkeletonBox';
import { fetchProjectsForOwner } from '../../utils/storage/projects';
import { fetchWorkersForOwner, getSupervisorsForOwner, getClockedInWorkersTodayForOwner } from '../../utils/storage/workers';
import { getReconciliationSummary } from '../../services/bankService';
import { fetchAllOwnerTransactions, calculateCashFlow } from '../../utils/financialReportUtils';
import { fetchRecurringExpenses } from '../../utils/storage/recurringExpenses';
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
import { useWalkthrough } from '../../navigation/OwnerBottomTabNavigator';

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
  const styles = useMemo(() => createStyles(Colors, isDark), [Colors, isDark]);
  const { user } = useAuth();
  const navigation = useNavigation();
  const { t } = useTranslation('owner');
  const walkthrough = useWalkthrough();

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
  const notifSentRef = useRef(false);

  // Heavy widget data
  const [agingData, setAgingData] = useState({ totals: { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 } });
  const [payrollSummary, setPayrollSummary] = useState({ grossPay: 0, workerCount: 0 });
  const [recentReports, setRecentReports] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [activeClockIns, setActiveClockIns] = useState([]);
  const [pipeline, setPipeline] = useState({ estimates: { draft: 0, sent: 0, accepted: 0 }, invoices: { unpaid: 0, partial: 0, paid: 0 } });
  const [monthlyOverhead, setMonthlyOverhead] = useState(0);
  const [businessName, setBusinessName] = useState('');

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

  // Top-N project lists for the inline widget rows. Show every non-archived
  // and non-completed project sorted by recency so drafts and just-created
  // projects don't disappear from the widget — the count in the header
  // still reflects strict "active" status.
  const topActiveProjectsForWidget = useMemo(
    () => [...allProjects]
      .filter((p) => p.status !== 'archived' && p.status !== 'completed')
      .sort((a, b) => new Date(b.updatedAt || b.updated_at || 0) - new Date(a.updatedAt || a.updated_at || 0))
      .slice(0, 4)
      .map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        percent_complete: p.percentComplete ?? p.percent_complete ?? 0,
      })),
    [allProjects]
  );
  const topProjectsByContract = useMemo(
    () => [...allProjects]
      .sort((a, b) => (b.contractAmount || 0) - (a.contractAmount || 0))
      .slice(0, 4)
      .map((p) => ({
        id: p.id,
        name: p.name,
        contractAmount: p.contractAmount || 0,
      })),
    [allProjects]
  );

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
      setAllProjects(projects);

      // Currently clocked-in workers (cross-team list for the owner)
      try {
        const clocked = await getClockedInWorkersTodayForOwner();
        setActiveClockIns(
          (clocked || [])
            .filter(t => !!t.workers)
            .map(t => ({
              id: t.workers?.id || t.worker_id,
              name: t.workers?.full_name || t.worker_name || 'Worker',
              projectName: t.projects?.name || t.service_plans?.name || '',
            }))
        );
      } catch (e) { setActiveClockIns([]); }

      // Load business name
      try {
        const { data: profile } = await supabase.from('profiles').select('business_name').eq('id', user.id).single();
        if (profile?.business_name) setBusinessName(profile.business_name);
      } catch (e) { /* not critical */ }

      // Load overhead expenses
      try {
        const overheadItems = await fetchRecurringExpenses();
        const overhead = (overheadItems || [])
          .filter(i => i.is_active)
          .reduce((sum, i) => {
            const amt = parseFloat(i.amount || 0);
            if (i.frequency === 'weekly') return sum + amt * 4.33;
            if (i.frequency === 'biweekly') return sum + amt * 2.17;
            if (i.frequency === 'quarterly') return sum + amt / 3;
            if (i.frequency === 'annually') return sum + amt / 12;
            return sum + amt;
          }, 0);
        setMonthlyOverhead(overhead);
      } catch (e) { /* overhead not critical */ }

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
        // Send push notifications ONCE per session (dedup also checks 24h in the function)
        if (!notifSentRef.current && (forgotten.workers.length > 0 || forgotten.supervisors.length > 0)) {
          notifSentRef.current = true;
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

  // Load on mount (so data is ready before tab is focused — needed for walkthrough)
  useEffect(() => { fetchDashboardData(); }, []);
  // Also refresh when tab gains focus
  useFocusEffect(useCallback(() => { fetchDashboardData(); }, []));

  // Auto-refresh when any data changes from chat or other screens
  useEffect(() => {
    const { onProjectUpdated, onEstimateChanged, onInvoiceChanged, onWorkerChanged } = require('../../services/eventEmitter');
    const unsubs = [
      onProjectUpdated(() => fetchDashboardData()),
      onEstimateChanged(() => fetchDashboardData()),
      onInvoiceChanged(() => fetchDashboardData()),
      onWorkerChanged(() => fetchDashboardData()),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [fetchDashboardData]);

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
        onPress: () => navigation.navigate('ClockOuts'),
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
    navigation.setOptions({ swipeEnabled: false });
  }, [layout, navigation]);

  const exitEditMode = useCallback(async () => {
    if (pendingLayout) {
      await saveLayout(pendingLayout);
      setLayout(pendingLayout);
    }
    setEditMode(false);
    setPendingLayout(null);
    navigation.setOptions({ swipeEnabled: true });
  }, [pendingLayout, navigation]);

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
            topProjects={topActiveProjectsForWidget}
            onProjectPress={(projectId) =>
              navigation.navigate('Projects', { screen: 'ProjectDetail', params: { projectId } })
            }
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
            onsiteWorkers={activeClockIns}
            onsiteCount={activeClockIns.length}
            onWorkerPress={(workerId) => {
              const w = activeClockIns.find((x) => x.id === workerId);
              if (w) {
                navigation.navigate('WorkerDetailHistory', { worker: { id: w.id, full_name: w.name } });
              }
            }}
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
            topProjects={topProjectsByContract}
            onProjectPress={(projectId) =>
              navigation.navigate('Projects', { screen: 'ProjectDetail', params: { projectId } })
            }
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
            onReportPress={(reportId) => navigation.navigate('DailyReportDetail', { reportId })}
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
  }, [pnl, cashFlowData, maxCashFlowVal, totalNet, alerts, stats, transactionCount, reconciliation, editMode, navigation, overdueInvoices, marginHealth, forgottenClockOuts, agingData, payrollSummary, recentReports, pipeline, topActiveProjectsForWidget, topProjectsByContract, activeClockIns]);

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

  // Edit mode widget rendering is handled by DraggableWidgetGrid

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
            <Ionicons name="grid-outline" size={22} color={Colors.secondaryText} />
          </TouchableOpacity>
          {/* <InboxBell onPress={() => navigation.navigate('Inbox')} /> */}
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
        <DraggableWidgetGrid
          items={activeLayout}
          onReorder={(data) => {
            setPendingLayout(data.map((item, i) => ({ ...item, position: i })));
          }}
          onRemove={handleRemoveWidget}
          onResize={(item) => {
            const def = WIDGET_DEFINITIONS.find((w) => w.id === item.id);
            if (def && def.availableSizes.length > 1) {
              setResizingWidget({ ...item, ...def });
            }
          }}
          renderWidget={renderWidget}
          footer={
            <View>
              <TouchableOpacity
                style={styles.addSlot}
                onPress={() => setShowAddSheet(true)}
                activeOpacity={0.85}
              >
                <View style={styles.addSlotIconCircle}>
                  <Ionicons name="add" size={20} color="#FFFFFF" />
                </View>
                <Text style={styles.addSlotText}>Add a widget</Text>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.85)" />
              </TouchableOpacity>
              <View style={{ height: 100 }} />
            </View>
          }
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryBlue} />}
        >
          {/* Phase-3 Morning Brief — surfaces the nightly anomaly snapshot */}
          <MorningBriefCard />

          {/* Company Info Card */}
          <TouchableOpacity
            ref={walkthrough?.overheadRef}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('CompanyOverhead')}
            style={styles.companyCard}
          >
            <View style={styles.companyHeader}>
              <Text style={styles.companyName}>{businessName || 'My Company'}</Text>
            </View>

            <View style={styles.companyStats}>
              <View style={styles.companyStat}>
                <Text style={styles.companyStatLabel}>Overhead</Text>
                <Text style={[styles.companyStatValue, { color: '#FCA5A5' }]}>
                  ${Math.round(monthlyOverhead).toLocaleString()}
                </Text>
                <Text style={styles.companyStatSuffix}>/month</Text>
              </View>
              <View style={styles.companyStatDivider} />
              <View style={styles.companyStat}>
                <Text style={styles.companyStatLabel}>Revenue</Text>
                <Text style={[styles.companyStatValue, { color: '#6EE7B7' }]}>
                  ${Math.round(pnl.revenue).toLocaleString()}
                </Text>
              </View>
              <View style={styles.companyStatDivider} />
              <View style={styles.companyStat}>
                <Text style={styles.companyStatLabel}>Net Profit</Text>
                <Text style={[styles.companyStatValue, { color: (pnl.profit - monthlyOverhead) >= 0 ? '#6EE7B7' : '#FCA5A5' }]}>
                  ${Math.round(pnl.profit - monthlyOverhead).toLocaleString()}
                </Text>
              </View>
            </View>

            {pnl.revenue > 0 && (
              <View style={styles.companyRatio}>
                {(() => {
                  const ratio = Math.round((monthlyOverhead / pnl.revenue) * 100);
                  const isHealthy = ratio < 20;
                  const isModerate = ratio >= 20 && ratio < 35;
                  const color = isHealthy ? '#6EE7B7' : isModerate ? '#FBBF24' : '#FCA5A5';
                  const bgColor = isHealthy ? 'rgba(16,185,129,0.15)' : isModerate ? 'rgba(251,191,36,0.15)' : 'rgba(244,63,94,0.15)';
                  const label = isHealthy ? 'Healthy' : isModerate ? 'Moderate' : 'High';
                  return (
                    <View style={[styles.companyRatioPill, { backgroundColor: bgColor }]}>
                      <View style={[styles.companyRatioDot, { backgroundColor: color }]} />
                      <Text style={[styles.companyRatioText, { color }]}>
                        Overhead {ratio}% — {label}
                      </Text>
                    </View>
                  );
                })()}
              </View>
            )}

            <View style={styles.companyBadge}>
              <Text style={styles.companyBadgeText}>Manage Overhead</Text>
              <Ionicons name="chevron-forward" size={13} color="#38BDF8" />
            </View>
          </TouchableOpacity>

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

const createStyles = (Colors, isDark) => StyleSheet.create({
  // Root
  container: {
    flex: 1,
    backgroundColor: Colors.background,
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
    color: Colors.primaryText,
    letterSpacing: -0.5,
  },
  dateText: {
    fontSize: FontSizes.small,
    color: Colors.placeholderText,
    marginTop: 2,
  },

  // Scroll
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingTop: Spacing.md,
    paddingBottom: 20,
  },

  // Widget grid (view mode)
  widgetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },

  // Edit mode header
  editHeader: {
    backgroundColor: Colors.cardBackground,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  editHeaderReset: {
    fontSize: 13,
    color: Colors.placeholderText,
  },
  editHeaderTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primaryText,
  },
  editHeaderDone: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.primaryBlue,
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
    shadowColor: Colors.primaryBlue,
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
    backgroundColor: Colors.cardBackground,
    borderRadius: 11,
  },

  // Add widget slot (edit mode) — solid filled CTA so it stands out as the
  // primary action while the rest of the grid is in editable disarray.
  addSlot: {
    backgroundColor: ACCENT.primary,
    borderRadius: 16,
    height: 60,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    marginHorizontal: Spacing.lg,
    shadowColor: ACCENT.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  addSlotIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSlotText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
    color: '#FFFFFF',
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

  // Company card — same dark style as PnL widget
  companyCard: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: 20,
    backgroundColor: '#0F172A',
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  companyHeader: {
    alignItems: 'center',
  },
  companyName: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  companyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 4,
    backgroundColor: 'rgba(56,189,248,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
  },
  companyBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#38BDF8',
  },
  companyStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  companyStat: {
    alignItems: 'center',
    flex: 1,
  },
  companyStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  companyStatLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  companyStatValue: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 3,
    letterSpacing: -0.5,
  },
  companyStatSuffix: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '500',
  },
  companyRatio: {
    alignItems: 'center',
  },
  companyRatioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 5,
  },
  companyRatioDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  companyRatioText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
