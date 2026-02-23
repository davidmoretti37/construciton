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
import { useProjects } from '../hooks/useProjects';
import NotificationBell from '../components/NotificationBell';
import TrialBanner from '../components/TrialBanner';
import { fetchDailyReportsWithFilters, getProject } from '../utils/storage';
import { supervisorClockIn, supervisorClockOut, getActiveSupervisorClockIn, getSupervisorTimesheet } from '../utils/storage/timeTracking';
import logger from '../utils/logger';
import { Alert } from 'react-native';

export default function HomeScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = createStyles(Colors);
  const { t } = useTranslation('home');
  const { user, profile, ownerHidesContract } = useAuth();

  // Use custom hook for projects data
  const { projects, loading, hasLoadedOnce, loadProjects } = useProjects();

  const [refreshing, setRefreshing] = useState(false);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [modalProjects, setModalProjects] = useState([]);
  const [modalTitle, setModalTitle] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectDetail, setShowProjectDetail] = useState(false);
  const [todaysDailyReports, setTodaysDailyReports] = useState([]);

  // Supervisor clock-in state
  const [activeSession, setActiveSession] = useState(null);
  const [clockLoading, setClockLoading] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00:00');
  const [supervisorTodayHours, setSupervisorTodayHours] = useState(0);
  const [supervisorTimeHistory, setSupervisorTimeHistory] = useState([]);
  const [showTimeHistory, setShowTimeHistory] = useState(false);

  // Load today's daily reports
  const loadTodaysDailyReports = useCallback(async () => {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const reports = await fetchDailyReportsWithFilters({
        startDate: todayStr,
        endDate: todayStr,
        limit: 10
      });
      setTodaysDailyReports(reports || []);
    } catch (error) {
      logger.error('Error loading daily reports:', error);
    }
  }, []);

  // Load projects and daily reports when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnce) {
        loadProjects();
      }
      loadTodaysDailyReports();
      loadSupervisorTimeData();
    }, [hasLoadedOnce, loadProjects, loadTodaysDailyReports, loadSupervisorTimeData])
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
  const handleClockIn = async (projectId) => {
    console.log('🕐 Supervisor clock-in attempt:', { userId: user?.id, projectId });
    setClockLoading(true);
    try {
      const result = await supervisorClockIn(user.id, projectId);
      console.log('🕐 Clock-in result:', result);
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

    console.log('🕐 Supervisor clock-out attempt:', { sessionId: activeSession.id });
    setClockLoading(true);
    try {
      const result = await supervisorClockOut(activeSession.id);
      console.log('🕐 Clock-out result:', result);
      if (result.success) {
        Alert.alert('Clocked Out', `You worked ${result.hours?.toFixed(2)} hours`);
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
      const timesheet = await getSupervisorTimesheet(user.id);

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
    } catch (error) {
      console.error('Error loading supervisor time data:', error);
    }
  }, [user?.id]);

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
    await Promise.all([loadProjects(), loadTodaysDailyReports()]);
    setRefreshing(false);
  }, [loadProjects, loadTodaysDailyReports]);

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

    return projects.filter(p => {
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

      // Store attention reasons on the project object for display
      if (needsAttention) {
        p.attentionReasons = [];
        if (isBehindSchedule) {
          if (p.status === 'behind') {
            p.attentionReasons.push(t('attention.behindSchedule'));
          } else if (p.daysRemaining !== null && p.daysRemaining < 7) {
            p.attentionReasons.push(t('attention.daysRemaining', { count: p.daysRemaining }));
          }
        }
        if (isOverBudget) {
          const over = (p.expenses || 0) - (p.contractAmount || 0);
          p.attentionReasons.push(t('attention.overBudget', { amount: over.toLocaleString() }));
        }
        if (hasLowCashFlow) {
          const unpaid = (p.expenses || 0) - (p.incomeCollected || 0);
          p.attentionReasons.push(t('attention.unpaidExpenses', { amount: unpaid.toLocaleString() }));
        }
        if (isOverdue) {
          p.attentionReasons.push(t('attention.projectOverdue'));
        }
      }

      return needsAttention;
    });
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
        <NotificationBell onPress={() => navigation.navigate('Notifications')} />
      </View>

      {/* Trial Banner - shows when user is on trial */}
      <TrialBanner onPress={() => navigation.navigate('Settings', { screen: 'SubscriptionSettings' })} />

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

        {/* Supervisor Clock Section - Worker Style */}
        <View style={[styles.clockCard, { backgroundColor: Colors.white || Colors.cardBackground }]}>
          {/* Status Display */}
          <View style={styles.clockStatusSection}>
            <View style={[styles.clockStatusDot, { backgroundColor: activeSession ? (Colors.successGreen || '#10B981') : Colors.secondaryText }]} />
            <Text style={[styles.clockStatusLabel, { color: Colors.secondaryText }]}>
              {activeSession ? 'Active' : 'Offline'}
            </Text>
          </View>

          {/* Large Timer Display */}
          <View style={styles.clockTimerContainer}>
            <Text style={[styles.clockTimerText, { color: Colors.primaryText }]}>
              {activeSession ? elapsedTime : '--:--:--'}
            </Text>
            {activeSession?.projects?.name && (
              <Text style={[styles.clockProjectText, { color: Colors.secondaryText }]}>
                {activeSession.projects.name}
              </Text>
            )}
          </View>

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.clockActionButton, { backgroundColor: Colors.primaryText }]}
            onPress={() => {
              if (activeSession) {
                handleClockOut();
              } else if (projects.length === 0) {
                Alert.alert('No Projects', 'You need to have at least one project to clock in.');
              } else {
                setShowProjectPicker(true);
              }
            }}
            disabled={clockLoading}
            activeOpacity={0.7}
          >
            {clockLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.clockActionButtonText}>
                {activeSession ? 'Clock Out' : 'Clock In'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={[styles.clockDivider, { backgroundColor: Colors.border }]} />

          {/* Today's Hours */}
          <View style={styles.clockTodayHoursSection}>
            <Text style={[styles.clockTodayHoursLabel, { color: Colors.secondaryText }]}>Today's Hours</Text>
            <Text style={[styles.clockTodayHoursValue, { color: Colors.primaryText }]}>{supervisorTodayHours.toFixed(1)}</Text>
          </View>
        </View>

        {/* Collapsible Time History */}
        <TouchableOpacity
          style={[styles.timeHistoryHeader, { backgroundColor: Colors.white || Colors.cardBackground }]}
          onPress={() => setShowTimeHistory(!showTimeHistory)}
        >
          <Text style={[styles.timeHistoryTitle, { color: Colors.primaryText }]}>
            Recent Time History
          </Text>
          <Ionicons
            name={showTimeHistory ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={Colors.secondaryText}
          />
        </TouchableOpacity>

        {showTimeHistory && (
          <View style={[styles.timeHistoryContent, { backgroundColor: Colors.white || Colors.cardBackground }]}>
            {supervisorTimeHistory.length === 0 ? (
              <Text style={[styles.noHistoryText, { color: Colors.secondaryText }]}>
                No time records yet
              </Text>
            ) : (
              supervisorTimeHistory.map((entry) => (
                <View key={entry.id} style={styles.timeHistoryItem}>
                  <View style={styles.timeHistoryLeft}>
                    <Text style={[styles.timeHistoryDate, { color: Colors.primaryText }]}>
                      {formatHistoryDate(entry.clock_in)}
                    </Text>
                    <Text style={[styles.timeHistoryProject, { color: Colors.secondaryText }]}>
                      {entry.projects?.name || 'Unknown Project'}
                    </Text>
                  </View>
                  <Text style={[styles.timeHistoryHours, { color: Colors.primaryBlue }]}>
                    {entry.hours?.toFixed(1) || '0.0'}h
                  </Text>
                </View>
              ))
            )}
          </View>
        )}

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
            <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>{t('loading')}</Text>
          </View>
        ) : (
          <>
            {/* Quick Stats Cards */}
            <View style={styles.statsRow}>
              <TouchableOpacity
                style={[styles.statCard, { borderLeftColor: Colors.primaryBlue }]}
                onPress={() => handleStatCardPress('active')}
                activeOpacity={0.7}
              >
                <Text style={styles.statNumber}>{activeProjects.length}</Text>
                <Text style={styles.statLabel}>{t('stats.activeProjects')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCard, { borderLeftColor: Colors.successGreen }]}
                onPress={() => handleStatCardPress('onsite')}
                activeOpacity={0.7}
              >
                <Text style={styles.statNumber}>{onSiteProjects.length}</Text>
                <Text style={styles.statLabel}>{t('stats.onSite')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.statCard, { borderLeftColor: Colors.warningOrange }]}
                onPress={() => handleStatCardPress('attention')}
                activeOpacity={0.7}
              >
                <Text style={styles.statNumber}>{needAttentionProjects.length}</Text>
                <Text style={styles.statLabel}>{t('stats.needAttention')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {!loading && (
          <>
            {/* Income This Month */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💰 {t('sections.thisMonth')}</Text>
              <View style={styles.card}>
                <Text style={[styles.incomeAmount, { color: monthlyStats.profit >= 0 ? Colors.successGreen : Colors.errorRed }]}>${monthlyStats.profit.toLocaleString()} {t('financial.profit')}</Text>
                <Text style={styles.budgetText}>${monthlyStats.budgeted.toLocaleString()} {t('financial.budgeted')}</Text>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${Math.min(monthlyStats.percentage, 100)}%` }]} />
                </View>
                <Text style={styles.percentageText}>{monthlyStats.percentage}%</Text>
              </View>
            </View>

            {/* Quick Stats List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📊 {t('sections.quickStats')}</Text>
              <View style={styles.card}>
                <View style={styles.statsGrid}>
                  <View style={styles.statRow}>
                    <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>{t('financial.totalProjects')}</Text>
                    <Text style={[styles.statRowValue, { color: Colors.primaryText }]}>{projects.length}</Text>
                  </View>
                  {!(profile?.role === 'supervisor' && ownerHidesContract) && (
                    <View style={styles.statRow}>
                      <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>{t('financial.totalContractValue')}</Text>
                      <Text style={[styles.statRowValue, { color: Colors.primaryText }]}>
                        ${projects.reduce((sum, p) => sum + (p.contractAmount || 0), 0).toLocaleString()}
                      </Text>
                    </View>
                  )}
                  <View style={styles.statRow}>
                    <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>{t('financial.totalIncomeCollected')}</Text>
                    <Text style={[styles.statRowValue, { color: Colors.successGreen }]}>
                      ${projects.reduce((sum, p) => sum + (p.incomeCollected || 0), 0).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>{t('financial.totalExpenses')}</Text>
                    <Text style={[styles.statRowValue, { color: Colors.errorRed }]}>
                      ${projects.reduce((sum, p) => sum + (p.expenses || 0), 0).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>{t('financial.totalProfit')}</Text>
                    <Text style={[styles.statRowValue, { color: Colors.primaryText, fontWeight: '700' }]}>
                      ${projects.reduce((sum, p) => sum + ((p.incomeCollected || 0) - (p.expenses || 0)), 0).toLocaleString()}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Today's Activity */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🔔 {t('sections.todaysActivity')}</Text>
              {todaysDailyReports.length === 0 && todaysActivity.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.emptyText}>{t('activity.noActivity')}</Text>
                </View>
              ) : (
                <View style={styles.card}>
                  {/* Daily Reports */}
                  {todaysDailyReports.map((report, index) => (
                    <TouchableOpacity
                      key={`report-${report.id}`}
                      style={[
                        styles.activityItem,
                        { backgroundColor: Colors.lightGray },
                        (index < todaysDailyReports.length - 1 || todaysActivity.length > 0) && { marginBottom: Spacing.md }
                      ]}
                      onPress={() => navigation.navigate('DailyReportDetail', { reportId: report.id })}
                    >
                      <View style={[styles.activityIcon, { backgroundColor: Colors.successGreen + '20' }]}>
                        <Ionicons name="document-text" size={20} color={Colors.successGreen} />
                      </View>
                      <View style={styles.activityContent}>
                        <Text style={[styles.activityTitle, { color: Colors.primaryText }]}>
                          {t('activity.dailyReport')}
                        </Text>
                        <Text style={[styles.activityProject, { color: Colors.secondaryText }]} numberOfLines={1}>
                          {report.workers?.full_name || t('fallbacks.worker')} • {report.projects?.name || t('fallbacks.project')}
                        </Text>
                        <Text style={[styles.activityTime, { color: Colors.placeholderText }]} numberOfLines={1}>
                          {report.work_performed ? report.work_performed.substring(0, 50) + (report.work_performed.length > 50 ? '...' : '') : t('fallbacks.noDescription')}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                    </TouchableOpacity>
                  ))}

                  {/* Project Updates */}
                  {todaysActivity.map((project, index) => (
                    <TouchableOpacity
                      key={`project-${project.id}`}
                      style={[
                        styles.activityItem,
                        { backgroundColor: Colors.lightGray },
                        index < todaysActivity.length - 1 && { marginBottom: Spacing.md }
                      ]}
                      onPress={() => navigation.navigate('Projects')}
                    >
                      <View style={[styles.activityIcon, { backgroundColor: Colors.primaryBlue + '20' }]}>
                        <Ionicons name="construct" size={20} color={Colors.primaryBlue} />
                      </View>
                      <View style={styles.activityContent}>
                        <Text style={[styles.activityTitle, { color: Colors.primaryText }]}>
                          {project.name}
                        </Text>
                        <Text style={[styles.activityProject, { color: Colors.secondaryText }]}>
                          {project.client}
                        </Text>
                        <Text style={[styles.activityTime, { color: Colors.placeholderText }]}>
                          {t('fallbacks.updated')} {formatTimeAgo(project.updatedAt)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

          </>
        )}
      </ScrollView>

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
            {projects.length === 0 ? (
              <View style={styles.emptyModalState}>
                <Ionicons name="folder-open-outline" size={64} color={Colors.secondaryText} />
                <Text style={[styles.emptyModalText, { color: Colors.secondaryText }]}>
                  No projects available
                </Text>
              </View>
            ) : (
              projects.map((project) => (
                <TouchableOpacity
                  key={project.id}
                  style={[styles.projectPickerItem, { backgroundColor: Colors.cardBackground }]}
                  onPress={() => handleClockIn(project.id)}
                >
                  <Ionicons name="briefcase" size={24} color={Colors.primaryBlue} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={[styles.projectPickerName, { color: Colors.primaryText }]}>{project.name}</Text>
                    {project.address && (
                      <Text style={[styles.projectPickerAddress, { color: Colors.secondaryText }]}>{project.address}</Text>
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
        onRefreshNeeded={loadProjects}
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
});
