import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { fetchProjects } from '../utils/storage';
import { ProjectCard } from '../components/ChatVisuals';

export default function HomeScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load projects when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadProjects();
    }, [])
  );

  const loadProjects = async () => {
    try {
      setLoading(true);
      const fetchedProjects = await fetchProjects();
      setProjects(fetchedProjects);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProjects();
    setRefreshing(false);
  }, []);

  // Calculate Quick Stats
  const activeProjects = projects.filter(p =>
    ['active', 'on-track', 'behind', 'over-budget'].includes(p.status)
  );

  const onSiteCount = projects.filter(p =>
    p.workers && p.workers.length > 0
  ).length;

  const needAttentionCount = projects.filter(p => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isBehindSchedule = p.status === 'behind' || (p.daysRemaining !== null && p.daysRemaining < 7);
    const isOverBudget = (p.expenses || 0) > (p.contractAmount || 0);
    const hasLowCashFlow = (p.expenses || 0) > (p.incomeCollected || 0);

    let isOverdue = false;
    if (p.endDate) {
      const endDate = new Date(p.endDate);
      endDate.setHours(0, 0, 0, 0);
      isOverdue = endDate < today && (p.percentComplete || 0) < 100;
    }

    return isBehindSchedule || isOverBudget || hasLowCashFlow || isOverdue;
  }).length;

  // Calculate This Month income (projects created/updated this month)
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();

  const thisMonthProjects = projects.filter(p => {
    const createdDate = new Date(p.createdAt);
    const updatedDate = new Date(p.updatedAt);

    const createdThisMonth = createdDate.getMonth() === thisMonth && createdDate.getFullYear() === thisYear;
    const updatedThisMonth = updatedDate.getMonth() === thisMonth && updatedDate.getFullYear() === thisYear;

    return createdThisMonth || updatedThisMonth;
  });

  const monthlyEarned = thisMonthProjects.reduce((sum, p) => sum + (p.incomeCollected || 0), 0);
  const monthlyBudgeted = thisMonthProjects.reduce((sum, p) => sum + (p.contractAmount || 0), 0);
  const monthlyPercentage = monthlyBudgeted > 0 ? Math.round((monthlyEarned / monthlyBudgeted) * 100) : 0;

  // Get today's activity (projects updated today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todaysActivity = projects.filter(p => {
    if (!p.updatedAt) return false;
    const updatedDate = new Date(p.updatedAt);
    updatedDate.setHours(0, 0, 0, 0);
    return updatedDate.getTime() === today.getTime();
  }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)); // Most recent first

  const formatTimeAgo = (dateString) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  // Handle project card actions
  const handleProjectAction = (action) => {
    if (action && action.type === 'view-project' && action.data?.projectId) {
      // Navigate to project details or Projects screen
      navigation.navigate('Projects');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Welcome Header */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Welcome! 👋</Text>
          <Text style={styles.dateText}>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
            <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>Loading your dashboard...</Text>
          </View>
        ) : (
          <>
            {/* Quick Stats Cards */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { borderLeftColor: Colors.primaryBlue }]}>
                <Text style={styles.statNumber}>{activeProjects.length}</Text>
                <Text style={styles.statLabel}>Active Projects</Text>
              </View>

              <View style={[styles.statCard, { borderLeftColor: Colors.successGreen }]}>
                <Text style={styles.statNumber}>{onSiteCount}</Text>
                <Text style={styles.statLabel}>On-Site</Text>
              </View>

              <View style={[styles.statCard, { borderLeftColor: Colors.warningOrange }]}>
                <Text style={styles.statNumber}>{needAttentionCount}</Text>
                <Text style={styles.statLabel}>Need Attention</Text>
              </View>
            </View>
          </>
        )}

        {!loading && (
          <>
            {/* Income This Month */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💰 This Month</Text>
              <View style={styles.card}>
                <Text style={styles.incomeAmount}>${monthlyEarned.toLocaleString()} earned</Text>
                <Text style={styles.budgetText}>${monthlyBudgeted.toLocaleString()} budgeted</Text>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: `${Math.min(monthlyPercentage, 100)}%` }]} />
                </View>
                <Text style={styles.percentageText}>{monthlyPercentage}%</Text>
              </View>
            </View>

            {/* Quick Stats List */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📊 Quick Stats</Text>
              <View style={styles.card}>
                <View style={styles.statsGrid}>
                  <View style={styles.statRow}>
                    <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>Total Projects</Text>
                    <Text style={[styles.statRowValue, { color: Colors.primaryText }]}>{projects.length}</Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>Total Contract Value</Text>
                    <Text style={[styles.statRowValue, { color: Colors.primaryText }]}>
                      ${projects.reduce((sum, p) => sum + (p.contractAmount || 0), 0).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>Total Income Collected</Text>
                    <Text style={[styles.statRowValue, { color: '#22C55E' }]}>
                      ${projects.reduce((sum, p) => sum + (p.incomeCollected || 0), 0).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>Total Expenses</Text>
                    <Text style={[styles.statRowValue, { color: '#EF4444' }]}>
                      ${projects.reduce((sum, p) => sum + (p.expenses || 0), 0).toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.statRow}>
                    <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>Total Profit</Text>
                    <Text style={[styles.statRowValue, { color: Colors.primaryText, fontWeight: '700' }]}>
                      ${projects.reduce((sum, p) => sum + ((p.incomeCollected || 0) - (p.expenses || 0)), 0).toLocaleString()}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Today's Activity */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🔔 Today's Activity</Text>
              {todaysActivity.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.emptyText}>No activity today</Text>
                </View>
              ) : (
                <View style={styles.card}>
                  {todaysActivity.map((project, index) => (
                    <TouchableOpacity
                      key={project.id}
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
                          Updated {formatTimeAgo(project.updatedAt)}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Active Projects */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>🏗️ Active Projects</Text>
                {activeProjects.length > 0 && (
                  <TouchableOpacity onPress={() => navigation.navigate('Projects')}>
                    <Text style={[styles.viewAllText, { color: Colors.primaryBlue }]}>View All</Text>
                  </TouchableOpacity>
                )}
              </View>
              {activeProjects.length === 0 ? (
                <View style={styles.card}>
                  <Text style={styles.emptyText}>No active projects</Text>
                </View>
              ) : (
                <>
                  {activeProjects.slice(0, 3).map((project) => (
                    <ProjectCard key={project.id} data={project} onAction={handleProjectAction} />
                  ))}
                  {activeProjects.length > 3 && (
                    <TouchableOpacity
                      style={styles.viewAllButton}
                      onPress={() => navigation.navigate('Projects')}
                    >
                      <Text style={[styles.viewAllText, { color: Colors.primaryBlue }]}>
                        View {activeProjects.length - 3} more project{activeProjects.length - 3 === 1 ? '' : 's'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LightColors.background,
  },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    backgroundColor: LightColors.white,
    borderBottomWidth: 1,
    borderBottomColor: LightColors.border,
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
    backgroundColor: LightColors.white,
    borderBottomWidth: 1,
    borderBottomColor: LightColors.border,
  },
  welcomeText: {
    fontSize: FontSizes.header,
    fontWeight: '600',
    color: LightColors.primaryText,
    marginBottom: Spacing.xs,
  },
  dateText: {
    fontSize: FontSizes.small,
    color: LightColors.secondaryText,
  },
  statsRow: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: LightColors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: FontSizes.large,
    fontWeight: 'bold',
    color: LightColors.primaryText,
    marginBottom: Spacing.xs,
  },
  statLabel: {
    fontSize: FontSizes.tiny,
    color: LightColors.secondaryText,
    textAlign: 'center',
  },
  section: {
    padding: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    color: LightColors.primaryText,
    marginBottom: Spacing.md,
  },
  card: {
    backgroundColor: LightColors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  incomeAmount: {
    fontSize: FontSizes.header,
    fontWeight: 'bold',
    color: LightColors.primaryText,
    marginBottom: Spacing.xs,
  },
  budgetText: {
    fontSize: FontSizes.body,
    color: LightColors.secondaryText,
    marginBottom: Spacing.md,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: LightColors.lightGray,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  progressBar: {
    height: '100%',
    backgroundColor: LightColors.primaryBlue,
  },
  percentageText: {
    fontSize: FontSizes.small,
    color: LightColors.secondaryText,
    textAlign: 'right',
  },
  statItem: {
    fontSize: FontSizes.body,
    color: LightColors.primaryText,
    marginBottom: Spacing.sm,
  },
  activityItem: {
    flexDirection: 'row',
    backgroundColor: LightColors.white,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  activityIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: LightColors.lightGray,
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
    color: LightColors.primaryText,
    marginBottom: 2,
  },
  activityProject: {
    fontSize: FontSizes.small,
    color: LightColors.secondaryText,
    marginBottom: 2,
  },
  activityTime: {
    fontSize: FontSizes.tiny,
    color: LightColors.placeholderText,
  },
  viewAllButton: {
    marginTop: Spacing.md,
  },
  viewAllText: {
    fontSize: FontSizes.small,
    color: LightColors.primaryBlue,
    fontWeight: '500',
  },
  projectCard: {
    backgroundColor: LightColors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  projectName: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    color: LightColors.primaryText,
    marginBottom: Spacing.xs,
  },
  projectBudget: {
    fontSize: FontSizes.body,
    color: LightColors.secondaryText,
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
    color: LightColors.secondaryText,
  },
  projectStatus: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: FontSizes.body,
    color: LightColors.secondaryText,
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
    color: LightColors.secondaryText,
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
