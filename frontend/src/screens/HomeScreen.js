import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { ProjectCard } from '../components/ChatVisuals';
import ProjectDetailView from '../components/ProjectDetailView';
import { useProjects } from '../hooks/useProjects';
import NotificationBell from '../components/NotificationBell';
import TrialBanner from '../components/TrialBanner';
import { fetchDailyReportsWithFilters, getProject } from '../utils/storage';
import logger from '../utils/logger';

export default function HomeScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = createStyles(Colors);
  const { t } = useTranslation('home');

  // Use custom hook for projects data
  const { projects, loading, hasLoadedOnce, loadProjects } = useProjects();

  const [refreshing, setRefreshing] = useState(false);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [modalProjects, setModalProjects] = useState([]);
  const [modalTitle, setModalTitle] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [showProjectDetail, setShowProjectDetail] = useState(false);
  const [todaysDailyReports, setTodaysDailyReports] = useState([]);

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
    }, [hasLoadedOnce, loadProjects, loadTodaysDailyReports])
  );

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
                  <View style={styles.statRow}>
                    <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>{t('financial.totalContractValue')}</Text>
                    <Text style={[styles.statRowValue, { color: Colors.primaryText }]}>
                      ${projects.reduce((sum, p) => sum + (p.contractAmount || 0), 0).toLocaleString()}
                    </Text>
                  </View>
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
    width: 40,
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
    padding: Spacing.xl,
    backgroundColor: Colors.cardBackground,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
});
