import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ProjectCard } from '../components/ChatVisuals';
import ProjectDetailView from '../components/ProjectDetailView';
import { useCachedFetch } from '../hooks/useCachedFetch';
import NotificationBell from '../components/NotificationBell';
import TrialBanner from '../components/TrialBanner';
import { fetchProjects as fetchProjectsFromStorage, fetchDailyReportsWithFilters, getProject, fetchWorkers } from '../utils/storage';
import { supabase } from '../lib/supabase';
import { supervisorClockIn, supervisorClockOut, getActiveSupervisorClockIn, getSupervisorTimesheet, checkForgottenClockOuts, remoteClockOutWorker, getClockedInWorkersToday } from '../utils/storage/timeTracking';
import TimeEditModal from '../components/TimeEditModal';
import logger from '../utils/logger';
import { formatHoursMinutes } from '../utils/calculations';
import SkeletonBox from '../components/skeletons/SkeletonBox';
import SkeletonCard from '../components/skeletons/SkeletonCard';
import { Alert } from 'react-native';
import { useSupervisorPermissions } from '../hooks/useSupervisorPermissions';
import {
  SUPERVISOR_WIDGET_DEFINITIONS,
  SUPERVISOR_DEFAULT_LAYOUT,
  loadSupervisorLayout,
  saveSupervisorLayout,
  resetSupervisorLayout,
  getAvailableSupervisorWidgets,
} from '../utils/supervisorDashboardLayout';
import { getWidgetSize } from '../components/dashboard/WidgetGrid';
import DraggableWidgetGrid from '../components/dashboard/DraggableWidgetGrid';
import AddWidgetSheet from '../components/dashboard/AddWidgetSheet';
import WidgetSizeSheet from '../components/dashboard/WidgetSizeSheet';
import ActiveProjectsWidget from '../components/dashboard/widgets/ActiveProjectsWidget';
import WorkersWidget from '../components/dashboard/widgets/WorkersWidget';
import RecentReportsWidget from '../components/dashboard/widgets/RecentReportsWidget';
import ContractValueWidget from '../components/dashboard/widgets/ContractValueWidget';
import PnLWidget from '../components/dashboard/widgets/PnLWidget';
import ProfitMarginWidget from '../components/dashboard/widgets/ProfitMarginWidget';
import ClockInOutWidget from '../components/dashboard/widgets/ClockInOutWidget';
import TimeHistoryWidget from '../components/dashboard/widgets/TimeHistoryWidget';
import MorningBriefCard from '../components/MorningBriefCard';

export default function HomeScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = createStyles(Colors);
  const { t } = useTranslation('home');
  const { user, profile, ownerHidesContract, refreshProfile } = useAuth();

  // Cache-first loading for projects
  const fetchProjectsFn = useCallback(() => fetchProjectsFromStorage(), []);
  const {
    data: rawProjects,
    loading,
    refreshing: projectsRefreshing,
    refresh: refreshProjects,
    reload: reloadProjects,
  } = useCachedFetch('home:projects', fetchProjectsFn);
  const projects = rawProjects || [];

  // Cache-first loading for today's daily reports
  const fetchTodayReportsFn = useCallback(async () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const reports = await fetchDailyReportsWithFilters({
      startDate: todayStr,
      endDate: todayStr,
      limit: 10
    });
    return reports || [];
  }, []);
  const {
    data: rawDailyReports,
    reload: reloadDailyReports,
    refresh: refreshDailyReports,
  } = useCachedFetch('home:dailyReports', fetchTodayReportsFn, { staleTTL: 15000, maxAge: 3 * 60 * 1000 });
  const todaysDailyReports = rawDailyReports || [];

  const [servicePlans, setServicePlans] = useState([]);

  const [refreshing, setRefreshing] = useState(false);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [modalProjects, setModalProjects] = useState([]);
  const [modalTitle, setModalTitle] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectDetail, setShowProjectDetail] = useState(false);

  // Supervisor clock-in state
  const [activeSession, setActiveSession] = useState(null);
  const [clockLoading, setClockLoading] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [supervisorTodayHours, setSupervisorTodayHours] = useState(0);
  const [supervisorTimeHistory, setSupervisorTimeHistory] = useState([]);
  const [showTimeHistory, setShowTimeHistory] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [forgottenClockOuts, setForgottenClockOuts] = useState({ workers: [], supervisors: [] });
  const [loadError, setLoadError] = useState(false);

  // ── Widget dashboard state ──
  const supervisorPerms = useSupervisorPermissions();
  const [widgetLayout, setWidgetLayout] = useState(SUPERVISOR_DEFAULT_LAYOUT);
  const [editMode, setEditMode] = useState(false);
  const [pendingLayout, setPendingLayout] = useState(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [resizingWidget, setResizingWidget] = useState(null);
  const [workerCount, setWorkerCount] = useState(0);
  const [recentReportsForWidget, setRecentReportsForWidget] = useState([]);
  const [activeClockIns, setActiveClockIns] = useState([]);

  // Load saved layout on mount
  useEffect(() => {
    let cancelled = false;
    loadSupervisorLayout().then((saved) => {
      if (cancelled) return;
      setWidgetLayout(saved || SUPERVISOR_DEFAULT_LAYOUT);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load projects and service plans immediately on mount
  const loadServicePlans = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('service_plans')
        .select('id, name, address, status')
        .eq('status', 'active')
        .order('name', { ascending: true });
      setServicePlans((data || []).map(p => ({ ...p, isServicePlan: true, location: p.address })));
    } catch (e) { /* non-critical */ }
  }, []);

  useEffect(() => {
    loadServicePlans();
  }, []);

  // On focus: show cached data instantly, refresh stale data in background
  useFocusEffect(
    useCallback(() => {
      const loads = [reloadProjects(), reloadDailyReports(), loadSupervisorTimeData(), loadWidgetData()];
      Promise.all(loads).then(() => setLoadError(false)).catch(() => setLoadError(true));
    }, [reloadProjects, reloadDailyReports, loadSupervisorTimeData, loadWidgetData])
  );

  // Check for active supervisor clock-in session
  useEffect(() => {
    const checkActiveSession = async () => {
      if (user?.id) {
        const session = await getActiveSupervisorClockIn(user.id);
        setActiveSession(session);
      }
    };
    checkActiveSession();
  }, [user?.id]);

  // Elapsed time timer for active clock-in
  useEffect(() => {
    if (!activeSession?.clock_in) return;

    const updateElapsed = () => {
      const start = new Date(activeSession.clock_in);
      const now = new Date();
      const diff = now - start;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      setElapsedTime(
        `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      );
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [activeSession?.clock_in]);

  // Supervisor clock-in handler
  const handleClockIn = async (project) => {
    const projectId = project.isServicePlan ? null : project.id;
    const servicePlanId = project.isServicePlan ? project.id : null;
    setClockLoading(true);
    try {
      const result = await supervisorClockIn(user.id, projectId, null, servicePlanId);
      if (result) {
        setActiveSession(result);
        setShowProjectPicker(false);
        Alert.alert('Success', 'You have clocked in successfully!');
      } else {
        Alert.alert('Error', 'Failed to clock in. Please check if the supervisor_time_tracking table exists in your database.');
      }
    } catch (error) {
      console.error('🕐 Clock-in error:', error);
      Alert.alert('Error', `Failed to clock in: ${error.message || 'Unknown error'}`);
    } finally {
      setClockLoading(false);
    }
  };

  // Supervisor clock-out handler
  const handleClockOut = async () => {
    if (!activeSession) return;

    setClockLoading(true);
    try {
      const result = await supervisorClockOut(activeSession.id);
      if (result.success) {
        Alert.alert('Clocked Out', `You worked ${formatHoursMinutes(result.hours)}`);
        setActiveSession(null);
        setElapsedTime('00:00:00');
        loadSupervisorTimeData(); // Refresh today's hours and history
      } else {
        Alert.alert('Error', result.error || 'Failed to clock out');
      }
    } catch (error) {
      console.error('🕐 Clock-out error:', error);
      Alert.alert('Error', `Failed to clock out: ${error.message || 'Unknown error'}`);
    } finally {
      setClockLoading(false);
    }
  };

  // Load supervisor's hours worked today and recent history
  const loadSupervisorTimeData = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Fetch timesheet and forgotten clock-outs in parallel (independent queries)
      const [timesheet, forgotten] = await Promise.all([
        getSupervisorTimesheet(user.id),
        checkForgottenClockOuts(10).catch(() => ({ workers: [], supervisors: [] })),
      ]);

      // Calculate today's hours
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEntries = timesheet.filter(entry => {
        const entryDate = new Date(entry.clock_in);
        return entryDate >= today;
      });
      const totalHours = todayEntries.reduce((sum, entry) => sum + (entry.hours || 0), 0);
      setSupervisorTodayHours(totalHours);

      // Store recent history (last 10 completed entries)
      const completedEntries = timesheet.filter(e => e.clock_out).slice(0, 10);
      setSupervisorTimeHistory(completedEntries);

      setForgottenClockOuts(forgotten);
    } catch (error) {
      console.error('Error loading supervisor time data:', error);
    }
  }, [user?.id]);

  // ── Widget data fetches ──
  const loadWidgetData = useCallback(async () => {
    try {
      const [workers, reports, clocked] = await Promise.all([
        fetchWorkers().catch(() => []),
        fetchDailyReportsWithFilters({ limit: 5 }).catch(() => []),
        getClockedInWorkersToday().catch(() => []),
      ]);
      setWorkerCount((workers || []).length);
      setRecentReportsForWidget(reports || []);
      // Normalize the time_tracking rows to the shape WorkersWidget expects
      setActiveClockIns(
        (clocked || [])
          .filter(t => !!t.workers)
          .map(t => ({
            id: t.workers?.id || t.worker_id,
            name: t.workers?.full_name || 'Worker',
            projectName: t.projects?.name || t.service_plans?.name || '',
          }))
      );
    } catch (e) {
      // non-fatal — widgets render with stale/empty data
    }
  }, []);

  // ── Edit-mode handlers ──
  const enterEditMode = useCallback(() => {
    setPendingLayout([...widgetLayout]);
    setEditMode(true);
  }, [widgetLayout]);

  const exitEditMode = useCallback(async () => {
    if (pendingLayout) {
      await saveSupervisorLayout(pendingLayout);
      setWidgetLayout(pendingLayout);
    }
    setEditMode(false);
    setPendingLayout(null);
  }, [pendingLayout]);

  const handleResetLayout = useCallback(async () => {
    const fresh = await resetSupervisorLayout();
    setPendingLayout([...fresh]);
  }, []);

  const handleRemoveWidget = useCallback((widgetId) => {
    setPendingLayout((prev) => (prev || []).filter((w) => w.id !== widgetId));
  }, []);

  const handleAddWidget = useCallback((widgetId, size) => {
    setPendingLayout((prev) => {
      const arr = prev || [];
      const maxPos = arr.reduce((m, w) => Math.max(m, w.position), -1);
      return [...arr, { id: widgetId, size, position: maxPos + 1 }];
    });
    setShowAddSheet(false);
  }, []);

  const handleResizeWidget = useCallback((newSize) => {
    if (!resizingWidget) return;
    setPendingLayout((prev) =>
      (prev || []).map((w) => (w.id === resizingWidget.id ? { ...w, size: newSize } : w))
    );
    setResizingWidget(null);
  }, [resizingWidget]);

  // Format date for history display
  const formatHistoryDate = (dateString) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Manual recovery path for stale supervisor permissions: pull-to-refresh
    // also reloads the profile so newly-flipped capability toggles propagate.
    await Promise.all([
      refreshProjects(),
      refreshDailyReports(),
      refreshProfile ? refreshProfile() : Promise.resolve(),
    ]);
    setRefreshing(false);
  }, [refreshProjects, refreshDailyReports, refreshProfile]);

  // Refresh project data when modal opens to get latest progress
  useEffect(() => {
    const refreshSelectedProject = async () => {
      if (showProjectDetail && selectedProject?.id) {
        try {
          const freshProject = await getProject(selectedProject.id);
          if (freshProject && freshProject.percentComplete !== selectedProject.percentComplete) {
            setSelectedProject(freshProject);
          }
        } catch (error) {
          logger.error('Error refreshing selected project:', error);
        }
      }
    };
    refreshSelectedProject();
    // Only run when modal visibility changes, not when selectedProject changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProjectDetail]);

  // Memoized: Active projects calculation
  const activeProjects = useMemo(() =>
    projects.filter(p => ['active', 'on-track', 'behind', 'over-budget'].includes(p.status)),
    [projects]
  );

  // Memoized: On-site projects calculation
  const onSiteProjects = useMemo(() =>
    projects.filter(p => p.workers && p.workers.length > 0),
    [projects]
  );

  // Memoized: Projects needing attention
  const needAttentionProjects = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return projects.map(p => {
      const isBehindSchedule = p.status === 'behind' || (p.daysRemaining !== null && p.daysRemaining < 7);
      const isOverBudget = (p.expenses || 0) > (p.contractAmount || 0);
      const hasLowCashFlow = (p.expenses || 0) > (p.incomeCollected || 0);

      let isOverdue = false;
      if (p.endDate) {
        const endDate = new Date(p.endDate);
        endDate.setHours(0, 0, 0, 0);
        isOverdue = endDate < today && (p.percentComplete || 0) < 100;
      }

      const needsAttention = isBehindSchedule || isOverBudget || hasLowCashFlow || isOverdue;

      if (!needsAttention) return null;

      // Build attention reasons without mutating the original project object
      const reasons = [];
      if (isBehindSchedule) {
        if (p.status === 'behind') {
          reasons.push(t('attention.behindSchedule'));
        } else if (p.daysRemaining !== null && p.daysRemaining < 7) {
          reasons.push(t('attention.daysRemaining', { count: p.daysRemaining }));
        }
      }
      if (isOverBudget) {
        const over = (p.expenses || 0) - (p.contractAmount || 0);
        reasons.push(t('attention.overBudget', { amount: over.toLocaleString() }));
      }
      if (hasLowCashFlow) {
        const unpaid = (p.expenses || 0) - (p.incomeCollected || 0);
        reasons.push(t('attention.unpaidExpenses', { amount: unpaid.toLocaleString() }));
      }
      if (isOverdue) {
        reasons.push(t('attention.projectOverdue'));
      }

      return { ...p, attentionReasons: reasons };
    }).filter(Boolean);
  }, [projects, t]);

  // Memoized: Monthly stats
  const monthlyStats = useMemo(() => {
    const thisMonth = new Date().getMonth();
    const thisYear = new Date().getFullYear();

    const thisMonthProjects = projects.filter(p => {
      const createdDate = new Date(p.createdAt);
      const updatedDate = new Date(p.updatedAt);

      const createdThisMonth = createdDate.getMonth() === thisMonth && createdDate.getFullYear() === thisYear;
      const updatedThisMonth = updatedDate.getMonth() === thisMonth && updatedDate.getFullYear() === thisYear;

      return createdThisMonth || updatedThisMonth;
    });

    const income = thisMonthProjects.reduce((sum, p) => sum + (p.incomeCollected || 0), 0);
    const expenses = thisMonthProjects.reduce((sum, p) => sum + (p.expenses || p.spent || 0), 0);
    const profit = income - expenses;
    const budgeted = thisMonthProjects.reduce((sum, p) => sum + (p.contractAmount || 0), 0);
    const percentage = budgeted > 0 ? Math.round((income / budgeted) * 100) : 0;

    return { profit, budgeted, percentage };
  }, [projects]);

  // Memoized: Today's activity
  const todaysActivity = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return projects.filter(p => {
      if (!p.updatedAt) return false;
      const updatedDate = new Date(p.updatedAt);
      updatedDate.setHours(0, 0, 0, 0);
      return updatedDate.getTime() === today.getTime();
    }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [projects]);

  // ── Widget-derived stats ──
  const totalContractValue = useMemo(
    () => projects.reduce((s, p) => s + (p.contractAmount || 0), 0),
    [projects]
  );
  // Top-N project lists for inline widget rows. Show ALL non-archived
  // projects (including drafts) sorted by recency so a brand-new draft
  // doesn't leave the widget mysteriously empty when it's the user's only
  // project. The "active" count in the header still uses the strict status
  // list — that's correct semantically.
  const topActiveProjectsForWidget = useMemo(
    () => [...projects]
      .filter(p => p.status !== 'archived' && p.status !== 'completed')
      .sort((a, b) => new Date(b.updatedAt || b.updated_at || 0) - new Date(a.updatedAt || a.updated_at || 0))
      .slice(0, 4)
      .map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        percent_complete: p.percentComplete ?? p.percent_complete ?? 0,
      })),
    [projects]
  );
  const topProjectsByContract = useMemo(
    () => [...projects]
      .sort((a, b) => (b.contractAmount || 0) - (a.contractAmount || 0))
      .slice(0, 4)
      .map(p => ({
        id: p.id,
        name: p.name,
        contractAmount: p.contractAmount || 0,
      })),
    [projects]
  );
  const totalIncomeCollected = useMemo(
    () => projects.reduce((s, p) => s + (p.incomeCollected || 0), 0),
    [projects]
  );
  const totalExpenses = useMemo(
    () => projects.reduce((s, p) => s + (p.expenses || p.spent || 0), 0),
    [projects]
  );
  const pnl = useMemo(() => {
    const revenue = totalIncomeCollected;
    const expenses = totalExpenses;
    const profit = revenue - expenses;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return { revenue, expenses, profit, margin };
  }, [totalIncomeCollected, totalExpenses]);
  const marginHealthText = pnl.margin >= 20 ? 'Healthy' : pnl.margin >= 10 ? 'Moderate' : 'At risk';

  // Filter the layout: drop any widget the supervisor no longer has
  // permission for (so a granted-then-revoked toggle silently hides the
  // widget instead of crashing on missing data).
  const activeLayout = useMemo(() => {
    const base = (editMode ? pendingLayout : widgetLayout) || [];
    return base.filter((w) => {
      const def = SUPERVISOR_WIDGET_DEFINITIONS.find((d) => d.id === w.id);
      if (!def) return false;
      if (!def.requires) return true;
      return !!supervisorPerms?.[def.requires];
    });
  }, [editMode, pendingLayout, widgetLayout, supervisorPerms]);

  // Catalog of widgets the supervisor can ADD — gated by permissions, and
  // exclude any already placed in the layout.
  const availableWidgets = useMemo(() => {
    const allowed = getAvailableSupervisorWidgets(supervisorPerms);
    const placed = new Set(activeLayout.map((w) => w.id));
    return allowed.filter((w) => !placed.has(w.id));
  }, [supervisorPerms, activeLayout]);

  const resizingWidgetDef = useMemo(() => {
    if (!resizingWidget) return null;
    return SUPERVISOR_WIDGET_DEFINITIONS.find((w) => w.id === resizingWidget.id) || null;
  }, [resizingWidget]);

  // Per-widget render — mirrors OwnerDashboardScreen's switch but scoped to
  // the supervisor's own data set.
  const handleClockInPress = useCallback(() => {
    if (projects.length === 0) {
      Alert.alert('No Projects', 'You need to have at least one project to clock in.');
      return;
    }
    setShowProjectPicker(true);
  }, [projects.length]);

  const renderWidget = useCallback((item) => {
    switch (item.id) {
      case 'clock_in_out':
        return (
          <ClockInOutWidget
            activeSession={activeSession}
            elapsedTime={elapsedTime}
            clockLoading={clockLoading}
            supervisorTodayHours={supervisorTodayHours}
            onClockInPress={handleClockInPress}
            onClockOutPress={handleClockOut}
            editMode={editMode}
            Colors={Colors}
            formatHoursMinutes={formatHoursMinutes}
          />
        );
      case 'time_history':
        return (
          <TimeHistoryWidget
            entries={supervisorTimeHistory}
            size={item.size}
            editMode={editMode}
            onEntryPress={(entry) => {
              setEditingRecord(entry);
              setEditModalVisible(true);
            }}
            Colors={Colors}
            formatHistoryDate={formatHistoryDate}
            formatHoursMinutes={formatHoursMinutes}
          />
        );
      case 'active_projects':
        return (
          <ActiveProjectsWidget
            activeProjects={activeProjects.length}
            totalProjects={projects.length}
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
            totalWorkers={workerCount}
            totalSupervisors={0}
            totalProjects={projects.length}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Workers' })}
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
      case 'recent_reports':
        return (
          <RecentReportsWidget
            reports={recentReportsForWidget}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('OwnerDailyReports')}
            onReportPress={(reportId) => navigation.navigate('DailyReportDetail', { reportId })}
          />
        );
      case 'contract_value':
        return (
          <ContractValueWidget
            totalContractValue={totalContractValue}
            totalRevenue={pnl.revenue}
            totalProjects={projects.length}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('Projects')}
            topProjects={topProjectsByContract}
            onProjectPress={(projectId) =>
              navigation.navigate('Projects', { screen: 'ProjectDetail', params: { projectId } })
            }
          />
        );
      case 'pnl':
        return (
          <PnLWidget
            pnl={pnl}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('Projects')}
          />
        );
      case 'profit_margin':
        return (
          <ProfitMarginWidget
            margin={pnl.margin}
            healthText={marginHealthText}
            revenue={pnl.revenue}
            expenses={pnl.expenses}
            size={item.size}
            editMode={editMode}
            onPress={() => navigation.navigate('Projects')}
          />
        );
      default:
        return null;
    }
  }, [activeProjects.length, projects.length, workerCount, recentReportsForWidget, totalContractValue, pnl, marginHealthText, editMode, navigation, activeSession, elapsedTime, clockLoading, supervisorTodayHours, handleClockInPress, Colors, supervisorTimeHistory, topActiveProjectsForWidget, topProjectsByContract, activeClockIns]);

  const renderSizedWidget = useCallback((item) => {
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

  const handleStatCardPress = useCallback((type) => {
    let filteredProjects = [];
    let title = '';

    switch (type) {
      case 'active':
        filteredProjects = activeProjects;
        title = t('modal.activeProjects');
        break;
      case 'onsite':
        filteredProjects = onSiteProjects;
        title = t('modal.onSiteProjects');
        break;
      case 'attention':
        filteredProjects = needAttentionProjects;
        title = t('modal.projectsNeedingAttention');
        break;
    }

    setModalProjects(filteredProjects);
    setModalTitle(title);
    setShowProjectsModal(true);
  }, [activeProjects, onSiteProjects, needAttentionProjects, t]);

  const formatTimeAgo = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return t('timeAgo.justNow');
    if (diffMins < 60) return diffMins === 1 ? t('timeAgo.minuteAgo') : t('timeAgo.minutesAgo', { count: diffMins });
    if (diffHours < 24) return diffHours === 1 ? t('timeAgo.hourAgo') : t('timeAgo.hoursAgo', { count: diffHours });
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  // Handle project card actions
  const handleProjectAction = (action) => {
    if (action && action.type === 'view-project' && action.data?.projectId) {
      const project = projects.find(p => p.id === action.data.projectId);
      if (project) {
        setSelectedProject(project);
        setShowProjectDetail(true);
      }
    }
  };

  const handleProjectEdit = () => {
    // Close detail view and navigate to Projects screen for editing
    setShowProjectDetail(false);
    navigation.navigate('Projects');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.background, borderBottomColor: Colors.border }]}>
        <View style={styles.topBarLeft} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <TouchableOpacity onPress={enterEditMode} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="grid-outline" size={22} color={Colors.secondaryText} />
          </TouchableOpacity>
          <NotificationBell onPress={() => navigation.navigate('Notifications')} />
        </View>
      </View>

      {/* Trial Banner - shows when user is on trial */}
      <TrialBanner onPress={() => navigation.navigate('Settings', { screen: 'SubscriptionSettings' })} />

      {loadError && !loading && (
        <TouchableOpacity
          style={{ backgroundColor: '#FF3B30', paddingVertical: 8, paddingHorizontal: 16, alignItems: 'center' }}
          onPress={() => { setLoadError(false); refreshProjects(); refreshDailyReports(); }}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Failed to load data. Tap to retry.</Text>
        </TouchableOpacity>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Welcome Header */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>{t('welcome')} 👋</Text>
          <Text style={styles.dateText}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
        </View>

        {/* Phase-3 Morning Brief — surfaces the nightly anomaly snapshot */}
        <MorningBriefCard />

        {/* Clock-in lives in the widget grid below — see ClockInOutWidget. */}

        {/* Time history is now a widget (TimeHistoryWidget) — see grid below. */}

        {/* Forgotten Clock-Out Alert */}
        {forgottenClockOuts.workers.length > 0 && (
          <View style={[styles.forgottenAlert, { backgroundColor: '#FEF3C7' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ionicons name="warning" size={20} color="#D97706" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E' }}>
                Forgotten Clock-Outs
              </Text>
            </View>
            {forgottenClockOuts.workers.map((w) => (
              <View key={w.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#92400E' }}>{w.worker_name}</Text>
                  <Text style={{ fontSize: 12, color: '#B45309' }}>{w.project_name} - {w.hoursElapsed}h</Text>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: '#EF4444', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                  onPress={() => {
                    Alert.alert(
                      'Clock Out Worker',
                      `Clock out ${w.worker_name}?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Clock Out',
                          style: 'destructive',
                          onPress: async () => {
                            const result = await remoteClockOutWorker(w.worker_id);
                            if (result.success) {
                              Alert.alert('Success', `${w.worker_name} clocked out.`);
                              loadSupervisorTimeData();
                            }
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#FFF' }}>Clock Out</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ─── Widget Dashboard ─── */}
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              {[1,2,3,4].map(i => (
                <SkeletonBox key={i} width={86} height={110} borderRadius={16} />
              ))}
            </View>
            <SkeletonBox width="100%" height={140} borderRadius={16} style={{ marginTop: 16 }} />
          </View>
        ) : editMode ? (
          <>
            <View style={styles.editBar}>
              <TouchableOpacity onPress={handleResetLayout}>
                <Text style={styles.editBarReset}>Reset</Text>
              </TouchableOpacity>
              <Text style={styles.editBarTitle}>Editing Dashboard</Text>
              <TouchableOpacity onPress={exitEditMode}>
                <Text style={styles.editBarDone}>Done</Text>
              </TouchableOpacity>
            </View>
            <DraggableWidgetGrid
              items={activeLayout}
              onReorder={(data) =>
                setPendingLayout(data.map((item, i) => ({ ...item, position: i })))
              }
              onRemove={handleRemoveWidget}
              onResize={(item) => {
                const def = SUPERVISOR_WIDGET_DEFINITIONS.find((w) => w.id === item.id);
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
                  <View style={{ height: 60 }} />
                </View>
              }
            />
          </>
        ) : (
          <View style={styles.widgetGrid}>
            {activeLayout.length === 0 ? (
              <TouchableOpacity style={styles.emptyDash} onPress={enterEditMode}>
                <Ionicons name="grid-outline" size={28} color={Colors.placeholderText} />
                <Text style={[styles.emptyDashText, { color: Colors.placeholderText }]}>
                  Tap to add widgets to your dashboard
                </Text>
              </TouchableOpacity>
            ) : (
              activeLayout.map((item) => renderSizedWidget(item))
            )}
          </View>
        )}
      </ScrollView>

      {/* Widget management sheets */}
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
        onResize={handleResizeWidget}
      />

      {/* Projects Modal */}
      <Modal
        visible={showProjectsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProjectsModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          {/* Modal Header */}
          <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity
              onPress={() => setShowProjectsModal(false)}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={28} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>{modalTitle}</Text>
            <View style={{ width: 28 }} />
          </View>

          {/* Modal Content */}
          <ScrollView
            style={styles.modalContent}
            showsVerticalScrollIndicator={false}
          >
            {modalProjects.length === 0 ? (
              <View style={styles.emptyModalState}>
                <Ionicons name="folder-open-outline" size={64} color={Colors.secondaryText} />
                <Text style={[styles.emptyModalText, { color: Colors.secondaryText }]}>
                  {t('modal.noProjectsFound')}
                </Text>
              </View>
            ) : (
              modalProjects.map((project) => (
                <View key={project.id}>
                  <ProjectCard
                    data={project}
                    onAction={(action) => {
                      setShowProjectsModal(false);
                      handleProjectAction(action);
                    }}
                  />
                  {project.attentionReasons && project.attentionReasons.length > 0 && (
                    <View style={[styles.attentionReasonsCard, { backgroundColor: Colors.warningOrange + '20', borderColor: Colors.warningOrange }]}>
                      <View style={styles.attentionHeader}>
                        <Ionicons name="warning" size={16} color={Colors.warningOrange} />
                        <Text style={[styles.attentionTitle, { color: Colors.warningOrange }]}>{t('attention.required')}</Text>
                      </View>
                      {project.attentionReasons.map((reason, idx) => (
                        <View key={idx} style={styles.attentionReasonRow}>
                          <Text style={styles.attentionBullet}>•</Text>
                          <Text style={[styles.attentionReasonText, { color: Colors.primaryText }]}>{reason}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ))
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Project Picker Modal for Clock-in */}
      <Modal
        visible={showProjectPicker}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProjectPicker(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => setShowProjectPicker(false)} style={styles.modalCloseButton}>
              <Ionicons name="close" size={28} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Select Project</Text>
            <View style={{ width: 28 }} />
          </View>
          <ScrollView style={{ flex: 1, padding: Spacing.lg }}>
            {[...projects, ...servicePlans].length === 0 ? (
              <View style={styles.emptyModalState}>
                <Ionicons name="folder-open-outline" size={64} color={Colors.secondaryText} />
                <Text style={[styles.emptyModalText, { color: Colors.secondaryText }]}>
                  No projects available
                </Text>
              </View>
            ) : (
              [...projects, ...servicePlans].map((project) => (
                <TouchableOpacity
                  key={project.id}
                  style={[styles.projectPickerItem, { backgroundColor: Colors.cardBackground }]}
                  onPress={() => handleClockIn(project)}
                >
                  <Ionicons name={project.isServicePlan ? "leaf" : "briefcase"} size={24} color={project.isServicePlan ? "#059669" : Colors.primaryBlue} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={[styles.projectPickerName, { color: Colors.primaryText }]}>{project.name}</Text>
                    {(project.address || project.location) && (
                      <Text style={[styles.projectPickerAddress, { color: Colors.secondaryText }]}>{project.address || project.location}</Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                </TouchableOpacity>
              ))
            )}
            <View style={{ height: 40 }} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Project Detail View */}
      <ProjectDetailView
        visible={showProjectDetail}
        project={selectedProject}
        onClose={() => setShowProjectDetail(false)}
        onEdit={handleProjectEdit}
        onAction={handleProjectAction}
        navigation={navigation}
        onRefreshNeeded={refreshProjects}
      />

      {/* Time Edit Modal (for supervisor self-edit) */}
      <TimeEditModal
        visible={editModalVisible}
        onClose={() => {
          setEditModalVisible(false);
          setEditingRecord(null);
        }}
        onSaved={() => loadSupervisorTimeData()}
        record={editingRecord}
        isSupervisor={true}
      />
    </SafeAreaView>
  );
}

const createStyles = (Colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  topBarLeft: {
    minWidth: 40,
    justifyContent: 'center',
  },
  exitFieldModeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  exitFieldModeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptySpace: {
    flex: 1,
  },
  settingsButton: {
    padding: Spacing.sm,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  welcomeSection: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  welcomeText: {
    fontSize: FontSizes.header,
    fontWeight: '600',
    color: Colors.primaryText,
    marginBottom: Spacing.xs,
  },
  dateText: {
    fontSize: FontSizes.small,
    color: Colors.secondaryText,
  },
  statsRow: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    borderLeftWidth: 4,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    color: Colors.primaryText,
    marginBottom: Spacing.xs,
  },
  statLabel: {
    fontSize: FontSizes.tiny,
    color: Colors.secondaryText,
    textAlign: 'center',
  },
  section: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    color: Colors.primaryText,
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  incomeAmount: {
    fontSize: FontSizes.header,
    fontWeight: 'bold',
    color: Colors.primaryText,
    marginBottom: Spacing.xs,
  },
  budgetText: {
    fontSize: FontSizes.body,
    color: Colors.secondaryText,
    marginBottom: Spacing.md,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: Colors.lightGray,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.primaryBlue,
  },
  percentageText: {
    fontSize: FontSizes.small,
    color: Colors.secondaryText,
    textAlign: 'right',
  },
  statItem: {
    fontSize: FontSizes.body,
    color: Colors.primaryText,
    marginBottom: Spacing.sm,
  },
  activityItem: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.lightGray,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    color: Colors.primaryText,
    marginBottom: 2,
  },
  activityProject: {
    fontSize: FontSizes.small,
    color: Colors.secondaryText,
    marginBottom: 2,
  },
  activityTime: {
    fontSize: FontSizes.tiny,
    color: Colors.placeholderText,
  },
  viewAllButton: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  viewAllText: {
    fontSize: FontSizes.small,
    color: Colors.primaryBlue,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  emptyModalState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyModalText: {
    fontSize: 16,
    marginTop: 16,
  },
  attentionReasonsCard: {
    marginHorizontal: 16,
    marginTop: -12,
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  attentionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  attentionTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  attentionReasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    paddingLeft: 4,
  },
  attentionBullet: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.warningOrange,
    marginRight: 6,
    marginTop: 1,
  },
  attentionReasonText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  projectCard: {
    backgroundColor: Colors.cardBackground,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  projectName: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    color: Colors.primaryText,
    marginBottom: Spacing.xs,
  },
  projectBudget: {
    fontSize: FontSizes.body,
    color: Colors.secondaryText,
    marginBottom: Spacing.md,
  },
  projectFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.sm,
  },
  projectWorkers: {
    fontSize: FontSizes.small,
    color: Colors.secondaryText,
  },
  projectStatus: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: FontSizes.body,
    color: Colors.secondaryText,
    textAlign: 'center',
    paddingVertical: Spacing.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    fontSize: FontSizes.body,
    color: Colors.secondaryText,
    marginTop: Spacing.md,
  },
  statsGrid: {
    gap: Spacing.md,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  statRowLabel: {
    fontSize: FontSizes.small,
    flex: 1,
  },
  statRowValue: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  // Clock Section - Worker Style
  clockCard: {
    borderRadius: 12,
    padding: 24,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  clockStatusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 40,
  },
  clockStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  clockStatusLabel: {
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  clockTimerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  clockTimerText: {
    fontSize: 72,
    fontWeight: '300',
    letterSpacing: -3,
    fontVariant: ['tabular-nums'],
  },
  clockProjectText: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 12,
    letterSpacing: -0.3,
  },
  clockActionButton: {
    width: '100%',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clockActionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  clockDivider: {
    width: '100%',
    height: 1,
    marginVertical: 24,
  },
  clockTodayHoursSection: {
    alignItems: 'center',
  },
  clockTodayHoursLabel: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  clockTodayHoursValue: {
    fontSize: 32,
    fontWeight: '300',
    letterSpacing: -1,
  },
  projectPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  projectPickerName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  projectPickerAddress: {
    fontSize: FontSizes.small,
    marginTop: 2,
  },
  // Time History Styles
  timeHistoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  timeHistoryTitle: {
    fontSize: FontSizes.md || 16,
    fontWeight: '600',
  },
  timeHistoryContent: {
    marginHorizontal: Spacing.lg,
    marginTop: 2,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  timeHistoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  timeHistoryLeft: {
    flex: 1,
  },
  timeHistoryDate: {
    fontSize: FontSizes.small || 14,
    fontWeight: '500',
  },
  timeHistoryProject: {
    fontSize: FontSizes.tiny || 12,
    marginTop: 2,
  },
  timeHistoryHours: {
    fontSize: FontSizes.md || 16,
    fontWeight: '600',
  },
  noHistoryText: {
    textAlign: 'center',
    paddingVertical: 20,
  },
  forgottenAlert: {
    marginHorizontal: Spacing.lg,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  // ── Widget dashboard ──
  // gap MUST equal the GAP constant in WidgetGrid.js (12) so two `small`
  // widgets pack two-per-row without overflow / awkward wrapping.
  widgetGrid: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  emptyDash: {
    width: '100%',
    paddingVertical: 32,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
  },
  emptyDashText: {
    marginTop: 8,
    fontSize: 13,
  },
  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    backgroundColor: Colors.cardBackground,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  editBarTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primaryText,
  },
  editBarReset: {
    fontSize: 14,
    color: '#EF4444',
  },
  editBarDone: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E40AF',
  },
  addSlot: {
    backgroundColor: '#1E40AF',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    height: 60,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    shadowColor: '#1E40AF',
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
});
