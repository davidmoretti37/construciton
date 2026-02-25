/**
 * OwnerDashboardScreen
 * Matches Supervisor HomeScreen layout with owner-specific data
 * No animations - instant load, professional appearance
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import NotificationBell from '../../components/NotificationBell';
import SkeletonBox from '../../components/skeletons/SkeletonBox';
import SkeletonCard from '../../components/skeletons/SkeletonCard';
import { fetchProjectsForOwner } from '../../utils/storage/projects';
import { fetchWorkersForOwner, getSupervisorsForOwner } from '../../utils/storage/workers';
import { getReconciliationSummary } from '../../services/plaidService';

// Color palette for owner theme
const OWNER_COLORS = {
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
  const [supervisors, setSupervisors] = useState([]);
  const [reconciliation, setReconciliation] = useState(null);

  // Calculate monthly stats
  const monthlyStats = useMemo(() => {
    const income = stats.totalRevenue || 0;
    const expenses = stats.totalExpenses || 0;
    const profit = income - expenses;
    const budgeted = stats.totalContractValue || 0;
    const percentage = budgeted > 0 ? Math.round((income / budgeted) * 100) : 0;

    return { profit, budgeted, percentage };
  }, [stats]);

  const fetchDashboardData = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Use the same fetch functions as the Projects and Workers tabs
      // This guarantees consistent counts across all screens
      const [projects, workers, supervisorList] = await Promise.all([
        fetchProjectsForOwner(),
        fetchWorkersForOwner(),
        getSupervisorsForOwner(user.id),
      ]);

      // Fetch pending invites (table may not exist yet)
      let pendingInviteCount = 0;
      try {
        const { data: invitesData } = await supabase
          .from('supervisor_invites')
          .select('id')
          .eq('owner_id', user.id)
          .eq('status', 'pending');
        pendingInviteCount = (invitesData || []).length;
      } catch (e) {
        // supervisor_invites table may not exist
      }

      // Compute stats from the fetched arrays
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

      setSupervisors(supervisorList.slice(0, 5));

      // Fetch bank reconciliation summary (non-blocking)
      try {
        const reconSummary = await getReconciliationSummary();
        setReconciliation(reconSummary);
      } catch (e) {
        // Bank integration may not be set up yet - that's OK
        setReconciliation(null);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  // Load dashboard data immediately on mount (so data is ready during splash)
  useEffect(() => {
    fetchDashboardData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData();
    }, [fetchDashboardData])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Format currency
  const formatCurrency = (amount) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (amount >= 1000) {
      return `$${Math.round(amount / 1000)}K`;
    }
    return `$${amount.toLocaleString()}`;
  };

  const styles = createStyles(Colors);

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.topBar, { backgroundColor: Colors.background, borderBottomColor: Colors.border }]} />
        <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Welcome skeleton */}
          <View style={{ padding: 20 }}>
            <SkeletonBox width="50%" height={22} borderRadius={4} />
            <SkeletonBox width="70%" height={14} borderRadius={4} style={{ marginTop: 8 }} />
          </View>
          {/* Stats row skeleton */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 20 }}>
            <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16 }}>
              <SkeletonBox width={40} height={28} borderRadius={4} />
              <SkeletonBox width="70%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
            </View>
            <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16 }}>
              <SkeletonBox width={40} height={28} borderRadius={4} />
              <SkeletonBox width="70%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
            </View>
            <View style={{ flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16 }}>
              <SkeletonBox width={40} height={28} borderRadius={4} />
              <SkeletonBox width="70%" height={12} borderRadius={4} style={{ marginTop: 8 }} />
            </View>
          </View>
          {/* Section skeleton */}
          <View style={{ paddingHorizontal: 16 }}>
            <SkeletonBox width="40%" height={18} borderRadius={4} style={{ marginBottom: 12 }} />
            <SkeletonCard lines={3} />
            <SkeletonBox width="40%" height={18} borderRadius={4} style={{ marginTop: 8, marginBottom: 12 }} />
            <SkeletonCard lines={4} />
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.background, borderBottomColor: Colors.border }]}>
        <View style={styles.topBarLeft} />
        <NotificationBell onPress={() => navigation.navigate('Notifications')} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={OWNER_COLORS.primary}
          />
        }
      >
        {/* Welcome Section */}
        <View style={[styles.welcomeSection, { backgroundColor: Colors.cardBackground, borderBottomColor: Colors.border }]}>
          <Text style={[styles.welcomeText, { color: Colors.primaryText }]}>Welcome! 👋</Text>
          <Text style={[styles.dateText, { color: Colors.secondaryText }]}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Text>
        </View>

        {/* Quick Stats Cards */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: Colors.cardBackground, borderLeftColor: OWNER_COLORS.primary }]}
            onPress={() => navigation.navigate('Workers', { initialTab: 'team' })}
            activeOpacity={0.7}
          >
            <Text style={[styles.statNumber, { color: Colors.primaryText }]}>{stats.totalSupervisors}</Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Supervisors</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: Colors.cardBackground, borderLeftColor: OWNER_COLORS.success }]}
            onPress={() => navigation.navigate('Projects')}
            activeOpacity={0.7}
          >
            <Text style={[styles.statNumber, { color: Colors.primaryText }]}>{stats.totalProjects}</Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Projects</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: Colors.cardBackground, borderLeftColor: OWNER_COLORS.warning }]}
            onPress={() => navigation.navigate('Workers', { initialTab: 'team' })}
            activeOpacity={0.7}
          >
            <Text style={[styles.statNumber, { color: Colors.primaryText }]}>{stats.totalWorkers}</Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Workers</Text>
          </TouchableOpacity>
        </View>

        {/* This Month Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>💰 This Month</Text>
          <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
            <Text style={[styles.incomeAmount, { color: monthlyStats.profit >= 0 ? OWNER_COLORS.success : OWNER_COLORS.error }]}>
              {formatCurrency(monthlyStats.profit)} profit
            </Text>
            <Text style={[styles.budgetText, { color: Colors.secondaryText }]}>
              {formatCurrency(monthlyStats.budgeted)} budgeted
            </Text>
            <View style={[styles.progressBarContainer, { backgroundColor: Colors.lightGray }]}>
              <View style={[styles.progressBar, { width: `${Math.min(monthlyStats.percentage, 100)}%`, backgroundColor: OWNER_COLORS.primary }]} />
            </View>
            <Text style={[styles.percentageText, { color: Colors.secondaryText }]}>{monthlyStats.percentage}%</Text>
            <TouchableOpacity
              style={styles.reportLink}
              onPress={() => navigation.navigate('FinancialReport')}
              activeOpacity={0.7}
            >
              <Ionicons name="bar-chart-outline" size={16} color={OWNER_COLORS.primary} />
              <Text style={[styles.reportLinkText, { color: OWNER_COLORS.primary }]}>View Full P&L Report</Text>
              <Ionicons name="chevron-forward" size={16} color={OWNER_COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Stats Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>📊 Quick Stats</Text>
          <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
            <View style={styles.statsGrid}>
              <View style={styles.statRow}>
                <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>Total Supervisors</Text>
                <Text style={[styles.statRowValue, { color: Colors.primaryText }]}>{stats.totalSupervisors}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>Total Projects</Text>
                <Text style={[styles.statRowValue, { color: Colors.primaryText }]}>{stats.totalProjects}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>Total Contract Value</Text>
                <Text style={[styles.statRowValue, { color: Colors.primaryText }]}>{formatCurrency(stats.totalContractValue)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>Total Revenue</Text>
                <Text style={[styles.statRowValue, { color: OWNER_COLORS.success }]}>{formatCurrency(stats.totalRevenue)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>Total Expenses</Text>
                <Text style={[styles.statRowValue, { color: OWNER_COLORS.error }]}>{formatCurrency(stats.totalExpenses)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[styles.statRowLabel, { color: Colors.secondaryText }]}>Total Workers</Text>
                <Text style={[styles.statRowValue, { color: Colors.primaryText }]}>{stats.totalWorkers}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Pending Invites Alert */}
        {stats.pendingInvites > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={[styles.alertBanner, { backgroundColor: `${OWNER_COLORS.warning}15` }]}
              onPress={() => navigation.navigate('Workers')}
            >
              <Ionicons name="mail-unread" size={20} color={OWNER_COLORS.warning} />
              <Text style={[styles.alertText, { color: OWNER_COLORS.warning }]}>
                {stats.pendingInvites} pending supervisor invite{stats.pendingInvites > 1 ? 's' : ''}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={OWNER_COLORS.warning} />
            </TouchableOpacity>
          </View>
        )}

        {/* Bank Reconciliation Alert */}
        {reconciliation && !reconciliation.message && reconciliation.total_transactions > 0 && (
          <View style={styles.section}>
            {reconciliation.unmatched > 0 || reconciliation.suggested_matches > 0 ? (
              <TouchableOpacity
                style={[styles.alertBanner, { backgroundColor: `${OWNER_COLORS.error}10` }]}
                onPress={() => navigation.navigate('BankReconciliation', { filter: 'unmatched' })}
              >
                <Ionicons name="card" size={20} color={OWNER_COLORS.error} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.alertText, { color: OWNER_COLORS.error }]}>
                    {reconciliation.unmatched + (reconciliation.suggested_matches || 0)} card transaction{reconciliation.unmatched + (reconciliation.suggested_matches || 0) !== 1 ? 's' : ''} need attention
                  </Text>
                  {reconciliation.unmatched_amount > 0 && (
                    <Text style={[{ fontSize: FontSizes.tiny, color: OWNER_COLORS.error, marginTop: 2 }]}>
                      ${reconciliation.unmatched_amount.toFixed(2)} in unrecorded expenses
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={OWNER_COLORS.error} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.alertBanner, { backgroundColor: `${OWNER_COLORS.success}10` }]}
                onPress={() => navigation.navigate('BankReconciliation')}
              >
                <Ionicons name="checkmark-circle" size={20} color={OWNER_COLORS.success} />
                <Text style={[styles.alertText, { color: OWNER_COLORS.success }]}>
                  All card transactions reconciled
                </Text>
                <Ionicons name="chevron-forward" size={18} color={OWNER_COLORS.success} />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Supervisors Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>👥 Supervisors</Text>
            {supervisors.length > 0 && (
              <TouchableOpacity onPress={() => navigation.navigate('Workers')}>
                <Text style={[styles.seeAllText, { color: OWNER_COLORS.primary }]}>See all</Text>
              </TouchableOpacity>
            )}
          </View>

          {supervisors.length === 0 ? (
            <View style={[styles.card, { backgroundColor: Colors.cardBackground, alignItems: 'center' }]}>
              <View style={[styles.emptyIcon, { backgroundColor: `${OWNER_COLORS.primary}10` }]}>
                <Ionicons name="people-outline" size={32} color={OWNER_COLORS.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>No supervisors yet</Text>
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                Add supervisors to help manage your projects
              </Text>
              <TouchableOpacity
                style={[styles.emptyButton, { backgroundColor: OWNER_COLORS.primary }]}
                onPress={() => navigation.navigate('Workers', { initialTab: 'team', openAddSupervisor: true })}
              >
                <Text style={styles.emptyButtonText}>Add Supervisor</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: Colors.cardBackground, padding: 0, overflow: 'hidden' }]}>
              {supervisors.map((supervisor, index) => (
                <View key={supervisor.id}>
                  <TouchableOpacity
                    style={styles.supervisorRow}
                    onPress={() => navigation.navigate('SupervisorDetail', { supervisor })}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.supervisorAvatar, { backgroundColor: `${OWNER_COLORS.primary}15` }]}>
                      <Text style={[styles.avatarText, { color: OWNER_COLORS.primary }]}>
                        {(supervisor.business_name || 'S').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.supervisorInfo}>
                      <Text style={[styles.supervisorName, { color: Colors.primaryText }]}>
                        {supervisor.business_name || 'Supervisor'}
                      </Text>
                      {supervisor.business_phone && (
                        <Text style={[styles.supervisorPhone, { color: Colors.secondaryText }]}>
                          {supervisor.business_phone}
                        </Text>
                      )}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText} />
                  </TouchableOpacity>
                  {index < supervisors.length - 1 && (
                    <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Bottom padding for tab bar */}
        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (Colors) => StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: FontSizes.body,
    marginTop: Spacing.md,
  },
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    borderBottomWidth: 1,
  },
  topBarLeft: {
    minWidth: 40,
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  welcomeSection: {
    padding: Spacing.xl,
    borderBottomWidth: 1,
  },
  welcomeText: {
    fontSize: FontSizes.header,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  dateText: {
    fontSize: FontSizes.small,
  },
  statsRow: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  statCard: {
    flex: 1,
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
    marginBottom: Spacing.xs,
  },
  statLabel: {
    fontSize: FontSizes.tiny,
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  seeAllText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  card: {
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
    marginBottom: Spacing.xs,
  },
  budgetText: {
    fontSize: FontSizes.body,
    marginBottom: Spacing.md,
  },
  progressBarContainer: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  progressBar: {
    height: '100%',
  },
  percentageText: {
    fontSize: FontSizes.small,
    textAlign: 'right',
  },
  reportLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  reportLinkText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
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
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  alertText: {
    flex: 1,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  supervisorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  supervisorAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  supervisorInfo: {
    flex: 1,
  },
  supervisorName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  supervisorPhone: {
    fontSize: FontSizes.small,
  },
  divider: {
    height: 1,
    marginLeft: 70,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  emptyText: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  emptyButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: 20,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
