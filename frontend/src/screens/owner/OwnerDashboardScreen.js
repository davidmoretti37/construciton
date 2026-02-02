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
  SafeAreaView,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import NotificationBell from '../../components/NotificationBell';

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
      // Fetch stats
      const { data: statsData, error: statsError } = await supabase.rpc('get_owner_dashboard_stats', {
        p_owner_id: user.id,
      });

      if (!statsError && statsData) {
        setStats({
          totalSupervisors: statsData.total_supervisors || 0,
          totalProjects: statsData.total_projects || 0,
          activeProjects: statsData.active_projects || 0,
          totalWorkers: statsData.total_workers || 0,
          totalRevenue: statsData.total_revenue || 0,
          totalContractValue: statsData.total_contract_value || 0,
          totalExpenses: statsData.total_expenses || 0,
          pendingInvites: statsData.pending_invites || 0,
        });
      }

      // Fetch supervisors for list
      const { data: supervisorData } = await supabase
        .from('profiles')
        .select('id, business_name, business_phone')
        .eq('owner_id', user.id)
        .eq('role', 'supervisor')
        .limit(5);

      setSupervisors(supervisorData || []);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

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

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={OWNER_COLORS.primary} />
          <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>Loading...</Text>
        </View>
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
          <View
            style={[styles.statCard, { backgroundColor: Colors.cardBackground, borderLeftColor: OWNER_COLORS.primary }]}
          >
            <Text style={[styles.statNumber, { color: Colors.primaryText }]}>{stats.totalSupervisors}</Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Supervisors</Text>
          </View>

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
            onPress={() => navigation.navigate('Workers')}
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
                onPress={() => navigation.navigate('Workers')}
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
