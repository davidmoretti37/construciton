/**
 * SupervisorDetailScreen
 * Shows supervisor info and their jobs
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getSupervisorTimesheet, calculateSupervisorPaymentForPeriod } from '../../utils/storage/timeTracking';
import DateRangePicker from '../../components/DateRangePicker';
import { formatHoursMinutes } from '../../utils/calculations';

// Helper function to format pay rate
const formatPayRate = (sup) => {
  if (!sup) return 'Not set';
  switch (sup.payment_type) {
    case 'hourly': return `$${sup.hourly_rate || 0}/hr`;
    case 'daily': return `$${sup.daily_rate || 0}/day`;
    case 'weekly': return `$${sup.weekly_salary || 0}/week`;
    case 'project_based': return `$${sup.project_rate || 0}/project`;
    default: return 'Not set';
  }
};

// Helper function to get payment type label
const getPaymentTypeLabel = (type) => {
  switch (type) {
    case 'hourly': return 'Hourly';
    case 'daily': return 'Daily';
    case 'weekly': return 'Weekly';
    case 'project_based': return 'Project Based';
    default: return 'Not set';
  }
};

// Helper function to calculate labor cost for given hours
const calculateLaborCost = (hours, sup) => {
  if (!sup || !hours) return 0;
  switch (sup.payment_type) {
    case 'hourly':
      return hours * (sup.hourly_rate || 0);
    case 'daily':
      // Rough approximation: 8 hours = 1 day
      const days = hours / 8;
      return days * (sup.daily_rate || 0);
    case 'weekly':
      // Rough approximation: 40 hours = 1 week
      const weeks = hours / 40;
      return weeks * (sup.weekly_salary || 0);
    case 'project_based':
      return 0; // Can't calculate without project completion
    default:
      return 0;
  }
};

// Job Card Component
const JobCard = ({ job, Colors }) => {
  const progressPercent = job.progress || 0;
  const statusColor = job.status === 'active' ? '#059669' : job.status === 'completed' ? '#2563EB' : '#F59E0B';

  return (
    <View style={[styles.jobCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      <View style={styles.jobHeader}>
        <View style={styles.jobTitleRow}>
          <Text style={[styles.jobName, { color: Colors.primaryText }]} numberOfLines={1}>
            {job.name || 'Unnamed Project'}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {job.status || 'active'}
            </Text>
          </View>
        </View>
        {job.address && (
          <View style={styles.jobLocation}>
            <Ionicons name="location-outline" size={14} color={Colors.secondaryText} />
            <Text style={[styles.jobAddress, { color: Colors.secondaryText }]} numberOfLines={1}>
              {job.address}
            </Text>
          </View>
        )}
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressHeader}>
          <Text style={[styles.progressLabel, { color: Colors.secondaryText }]}>Progress</Text>
          <Text style={[styles.progressPercent, { color: Colors.primaryText }]}>{progressPercent}%</Text>
        </View>
        <View style={[styles.progressBar, { backgroundColor: Colors.border }]}>
          <View
            style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: '#1E40AF' }]}
          />
        </View>
      </View>

      {/* Job Stats */}
      <View style={styles.jobStats}>
        <View style={styles.jobStat}>
          <Ionicons name="cash-outline" size={16} color="#059669" />
          <Text style={[styles.jobStatText, { color: Colors.secondaryText }]}>
            ${job.contract_amount?.toLocaleString() || '0'}
          </Text>
        </View>
        <View style={styles.jobStat}>
          <Ionicons name="people-outline" size={16} color="#2563EB" />
          <Text style={[styles.jobStatText, { color: Colors.secondaryText }]}>
            {job.worker_count || 0} workers
          </Text>
        </View>
      </View>

    </View>
  );
};

export default function SupervisorDetailScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('owner');
  const navigation = useNavigation();
  const route = useRoute();

  const supervisor = route.params?.supervisor;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState({
    totalJobs: 0,
    activeJobs: 0,
    totalWorkers: 0,
    totalRevenue: 0,
  });
  const [timeRecords, setTimeRecords] = useState([]);
  const [timeStats, setTimeStats] = useState({ weekHours: 0, monthHours: 0, weekEarnings: 0, monthEarnings: 0 });

  // Payment calculation state
  const getDefaultDateRange = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return {
      from: monday.toISOString().split('T')[0],
      to: sunday.toISOString().split('T')[0]
    };
  };

  const [dateRange, setDateRange] = useState(getDefaultDateRange());
  const [paymentData, setPaymentData] = useState(null);
  const [loadingPayment, setLoadingPayment] = useState(true);

  const fetchSupervisorData = useCallback(async () => {
    if (!supervisor?.id) return;

    try {
      // Fetch supervisor's projects (both created by AND assigned to)
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .or(`user_id.eq.${supervisor.id},assigned_supervisor_id.eq.${supervisor.id}`)
        .order('created_at', { ascending: false });

      if (projectError) throw projectError;

      // Get worker counts for each project
      const projectsWithWorkers = await Promise.all(
        (projectData || []).map(async (project) => {
          const { count } = await supabase
            .from('project_assignments')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', project.id);

          return {
            ...project,
            worker_count: count || 0,
          };
        })
      );

      setJobs(projectsWithWorkers);

      // Calculate stats
      const activeJobs = projectsWithWorkers.filter(j => j.status === 'active' || j.status === 'in_progress').length;
      const totalRevenue = projectsWithWorkers.reduce((sum, j) => sum + (j.contract_amount || 0), 0);
      const totalWorkers = projectsWithWorkers.reduce((sum, j) => sum + (j.worker_count || 0), 0);

      setStats({
        totalJobs: projectsWithWorkers.length,
        activeJobs,
        totalWorkers,
        totalRevenue,
      });

      // Fetch time tracking records (last 30 days)
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const today = new Date();

        const timesheet = await getSupervisorTimesheet(supervisor.id, {
          startDate: thirtyDaysAgo.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        });

        setTimeRecords(timesheet || []);

        // Calculate week and month hours
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        let weekHours = 0;
        let monthHours = 0;

        (timesheet || []).forEach(record => {
          const clockIn = new Date(record.clock_in);
          const hours = record.hours || 0;

          if (clockIn >= startOfWeek) {
            weekHours += hours;
          }
          if (clockIn >= startOfMonth) {
            monthHours += hours;
          }
        });

        setTimeStats({
          weekHours: Math.round(weekHours * 100) / 100,
          monthHours: Math.round(monthHours * 100) / 100,
          weekEarnings: Math.round(calculateLaborCost(weekHours, supervisor) * 100) / 100,
          monthEarnings: Math.round(calculateLaborCost(monthHours, supervisor) * 100) / 100,
        });
      } catch (timeError) {
        console.error('Error fetching supervisor time tracking:', timeError);
      }

    } catch (error) {
      console.error('Error fetching supervisor data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [supervisor?.id]);

  useEffect(() => {
    fetchSupervisorData();
  }, [fetchSupervisorData]);

  // Load payment data when date range changes
  useEffect(() => {
    loadPaymentData();
  }, [dateRange, supervisor?.id]);

  const loadPaymentData = async () => {
    if (!supervisor?.id) return;
    try {
      setLoadingPayment(true);
      const data = await calculateSupervisorPaymentForPeriod(
        supervisor.id,
        supervisor,
        dateRange.from,
        dateRange.to
      );
      setPaymentData(data);
    } catch (error) {
      console.error('Error loading payment data:', error);
      setPaymentData(null);
    } finally {
      setLoadingPayment(false);
    }
  };

  const handleRangeChange = (from, to) => {
    setDateRange({ from, to });
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchSupervisorData();
  }, [fetchSupervisorData]);

  const handleBack = () => {
    navigation.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      </SafeAreaView>
    );
  }

  const supervisorName = supervisor?.business_name || supervisor?.email?.split('@')[0] || 'Supervisor';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]} numberOfLines={1}>
          {supervisorName}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1E40AF" />
        }
      >
        {/* Supervisor Info Card */}
        <View style={[styles.infoCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
          <View style={[styles.avatarLarge, { backgroundColor: '#1E40AF20' }]}>
            <Text style={styles.avatarTextLarge}>
              {supervisorName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={[styles.supervisorName, { color: Colors.primaryText }]}>
            {supervisorName}
          </Text>
          {supervisor?.email && (
            <Text style={[styles.supervisorEmail, { color: Colors.secondaryText }]}>
              {supervisor.email}
            </Text>
          )}
          {supervisor?.business_phone && (
            <View style={styles.phoneRow}>
              <Ionicons name="call-outline" size={16} color={Colors.secondaryText} />
              <Text style={[styles.phoneText, { color: Colors.secondaryText }]}>
                {supervisor.business_phone}
              </Text>
            </View>
          )}
        </View>

        {/* Pay Rate Card */}
        {supervisor?.payment_type && (
          <View style={[styles.payRateCard, { backgroundColor: '#F59E0B' + '15', borderColor: '#F59E0B' + '30' }]}>
            <Ionicons name="cash" size={24} color="#F59E0B" />
            <View style={styles.payRateInfo}>
              <Text style={[styles.payRateLabel, { color: Colors.secondaryText }]}>
                {getPaymentTypeLabel(supervisor.payment_type)} Rate
              </Text>
              <Text style={[styles.payRateValue, { color: Colors.primaryText }]}>
                {formatPayRate(supervisor)}
              </Text>
            </View>
          </View>
        )}

        {/* Date Range Picker */}
        <DateRangePicker
          fromDate={dateRange.from}
          toDate={dateRange.to}
          onRangeChange={handleRangeChange}
        />

        {/* Payment Summary */}
        {loadingPayment ? (
          <View style={[styles.paymentCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <ActivityIndicator size="small" color="#1E40AF" />
          </View>
        ) : paymentData && (
          <View style={[styles.paymentCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <View style={styles.paymentCardHeader}>
              <Ionicons name="cash-outline" size={20} color="#1E40AF" />
              <Text style={[styles.paymentCardTitle, { color: Colors.primaryText }]}>Payment Summary</Text>
            </View>

            {/* Total Amount */}
            <View style={[styles.totalAmountContainer, { backgroundColor: Colors.lightGray || '#F3F4F6' }]}>
              <Text style={[styles.totalAmountLabel, { color: Colors.secondaryText }]}>
                Total Amount Owed
              </Text>
              <Text style={[styles.totalAmountValue, { color: '#1E40AF' }]}>
                ${paymentData.totalAmount?.toFixed(2) || '0.00'}
              </Text>
              <Text style={[styles.totalHoursText, { color: Colors.secondaryText }]}>
                {formatHoursMinutes(paymentData.totalHours || 0)} total
              </Text>
            </View>

            {/* Breakdown by Project */}
            {paymentData.byProject && paymentData.byProject.length > 0 && (
              <View style={styles.breakdownSection}>
                <Text style={[styles.breakdownTitle, { color: Colors.primaryText }]}>
                  Breakdown by Project
                </Text>
                {paymentData.byProject.map((project, index) => (
                  <View
                    key={index}
                    style={[styles.breakdownItem, { borderBottomColor: Colors.border }]}
                  >
                    <View style={styles.breakdownLeft}>
                      <Text style={[styles.breakdownProjectName, { color: Colors.primaryText }]}>
                        {project.projectName}
                      </Text>
                      <Text style={[styles.breakdownHours, { color: Colors.secondaryText }]}>
                        {formatHoursMinutes(project.hours)}
                      </Text>
                    </View>
                    <Text style={[styles.breakdownAmount, { color: '#1E40AF' }]}>
                      ${project.amount?.toFixed(2) || '0.00'}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Breakdown by Date */}
            {paymentData.byDate && paymentData.byDate.length > 0 && (
              <View style={styles.breakdownSection}>
                <Text style={[styles.breakdownTitle, { color: Colors.primaryText }]}>
                  Daily Breakdown
                </Text>
                {paymentData.byDate
                  .sort((a, b) => new Date(b.date) - new Date(a.date))
                  .map((day, index) => (
                  <View
                    key={index}
                    style={[styles.dayBreakdownItem, { borderBottomColor: Colors.border }]}
                  >
                    <View style={styles.dayBreakdownHeader}>
                      <View style={styles.dayBreakdownLeft}>
                        <Text style={[styles.dayBreakdownDate, { color: Colors.primaryText }]}>
                          {new Date(day.date).toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </Text>
                        <Text style={[styles.dayBreakdownHours, { color: Colors.secondaryText }]}>
                          {formatHoursMinutes(day.hours)}
                        </Text>
                      </View>
                      <Text style={[styles.dayBreakdownAmount, { color: '#1E40AF' }]}>
                        ${day.amount?.toFixed(2) || '0.00'}
                      </Text>
                    </View>
                    {/* Show projects worked on this day */}
                    {day.projects && day.projects.length > 0 && (
                      <View style={styles.dayProjectsList}>
                        {day.projects.map((project, projectIndex) => (
                          <View key={projectIndex} style={styles.dayProjectItem}>
                            <View style={styles.dayProjectDot} />
                            <Text style={[styles.dayProjectText, { color: Colors.secondaryText }]}>
                              {project.projectName}: {formatHoursMinutes(project.hours)}
                              {project.amount && ` ($${project.amount.toFixed(2)})`}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Payment type info */}
            {supervisor?.payment_type && (
              <View style={styles.paymentTypeInfo}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.secondaryText} />
                <Text style={[styles.paymentTypeText, { color: Colors.secondaryText }]}>
                  Payment Type: {getPaymentTypeLabel(supervisor.payment_type)}
                  {supervisor.payment_type === 'hourly' && supervisor.hourly_rate && ` - $${Number(supervisor.hourly_rate).toFixed(2)}/hr`}
                  {supervisor.payment_type === 'daily' && supervisor.daily_rate && ` - $${Number(supervisor.daily_rate).toFixed(2)}/day`}
                  {supervisor.payment_type === 'weekly' && supervisor.weekly_salary && ` - $${Number(supervisor.weekly_salary).toFixed(2)}/wk`}
                  {supervisor.payment_type === 'project_based' && supervisor.project_rate && ` - $${Number(supervisor.project_rate).toFixed(2)}/project`}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statBox, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <Text style={[styles.statValue, { color: '#1E40AF' }]}>{stats.totalJobs}</Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Jobs</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <Text style={[styles.statValue, { color: '#059669' }]}>{stats.activeJobs}</Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Active</Text>
          </View>
          <View style={[styles.statBox, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <Text style={[styles.statValue, { color: '#2563EB' }]}>{stats.totalWorkers}</Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Workers</Text>
          </View>
        </View>

        {/* Revenue Card */}
        <View style={[styles.revenueCard, { backgroundColor: '#1E40AF10', borderColor: '#1E40AF30' }]}>
          <Ionicons name="wallet" size={24} color="#1E40AF" />
          <View style={styles.revenueInfo}>
            <Text style={[styles.revenueLabel, { color: Colors.secondaryText }]}>Total Contract Value</Text>
            <Text style={[styles.revenueValue, { color: Colors.primaryText }]}>
              ${stats.totalRevenue.toLocaleString()}
            </Text>
          </View>
        </View>

        {/* Jobs Section */}
        <View style={styles.jobsSection}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
            JOBS ({jobs.length})
          </Text>

          {jobs.length === 0 ? (
            <View style={[styles.emptyJobs, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="briefcase-outline" size={32} color={Colors.secondaryText} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                No jobs yet
              </Text>
            </View>
          ) : (
            jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                Colors={Colors}
              />
            ))
          )}
        </View>

        {/* Time Tracking Section */}
        <View style={styles.timeTrackingSection}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
            TIME TRACKING
          </Text>

          {/* Hours & Earnings Summary Card */}
          <View style={[styles.hoursSummaryCard, { backgroundColor: '#059669' + '15', borderColor: '#059669' + '30' }]}>
            <Ionicons name="time" size={24} color="#059669" />
            <View style={styles.hoursSummaryInfo}>
              <View style={styles.hoursSummaryRow}>
                <Text style={[styles.hoursSummaryLabel, { color: Colors.secondaryText }]}>This Week</Text>
                <View style={styles.hoursSummaryValues}>
                  <Text style={[styles.hoursSummaryValue, { color: Colors.primaryText }]}>
                    {formatHoursMinutes(timeStats.weekHours)}
                  </Text>
                  {timeStats.weekEarnings > 0 && (
                    <Text style={[styles.earningsValue, { color: '#059669' }]}>
                      ${timeStats.weekEarnings.toLocaleString()}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.hoursSummaryRow}>
                <Text style={[styles.hoursSummaryLabel, { color: Colors.secondaryText }]}>This Month</Text>
                <View style={styles.hoursSummaryValues}>
                  <Text style={[styles.hoursSummaryValue, { color: Colors.primaryText }]}>
                    {formatHoursMinutes(timeStats.monthHours)}
                  </Text>
                  {timeStats.monthEarnings > 0 && (
                    <Text style={[styles.earningsValue, { color: '#059669' }]}>
                      ${timeStats.monthEarnings.toLocaleString()}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </View>

          {/* Recent Time Records */}
          {timeRecords.length === 0 ? (
            <View style={[styles.emptyJobs, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="time-outline" size={32} color={Colors.secondaryText} />
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                No time records yet
              </Text>
            </View>
          ) : (
            timeRecords.slice(0, 10).map((record) => {
              const clockIn = new Date(record.clock_in);
              const clockOut = record.clock_out ? new Date(record.clock_out) : null;
              const isActive = !record.clock_out;

              const formatTime = (date) => {
                return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
              };

              const formatDate = (date) => {
                const today = new Date();
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);

                if (date.toDateString() === today.toDateString()) {
                  return 'Today';
                } else if (date.toDateString() === yesterday.toDateString()) {
                  return 'Yesterday';
                } else {
                  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }
              };

              return (
                <View
                  key={record.id}
                  style={[styles.timeRecordCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                >
                  <View style={styles.timeRecordHeader}>
                    <View style={styles.timeRecordDate}>
                      <Ionicons name="calendar-outline" size={14} color={Colors.secondaryText} />
                      <Text style={[styles.timeRecordDateText, { color: Colors.primaryText }]}>
                        {formatDate(clockIn)}
                      </Text>
                    </View>
                    {isActive ? (
                      <View style={[styles.activeIndicator, { backgroundColor: '#059669' + '20' }]}>
                        <View style={[styles.activeDot, { backgroundColor: '#059669' }]} />
                        <Text style={[styles.activeText, { color: '#059669' }]}>Active</Text>
                      </View>
                    ) : (
                      <View style={styles.hoursAndCost}>
                        <Text style={[styles.hoursWorked, { color: '#059669' }]}>
                          {formatHoursMinutes(record.hours)}
                        </Text>
                        {supervisor?.payment_type && (
                          <Text style={[styles.laborCost, { color: '#F59E0B' }]}>
                            ${calculateLaborCost(record.hours || 0, supervisor).toFixed(2)}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                  <Text style={[styles.timeRecordProject, { color: Colors.primaryText }]} numberOfLines={1}>
                    {record.projects?.name || 'Unknown Project'}
                  </Text>
                  <Text style={[styles.timeRecordTimes, { color: Colors.secondaryText }]}>
                    {formatTime(clockIn)} {clockOut ? `- ${formatTime(clockOut)}` : '- In Progress'}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
  },
  backButton: {
    marginRight: Spacing.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: FontSizes.large,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 24,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: 100,
  },
  infoCard: {
    alignItems: 'center',
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  avatarTextLarge: {
    fontSize: 32,
    fontWeight: '600',
    color: '#1E40AF',
  },
  supervisorName: {
    fontSize: FontSizes.large,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  supervisorEmail: {
    fontSize: FontSizes.body,
    marginBottom: Spacing.sm,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  phoneText: {
    fontSize: FontSizes.body,
  },
  // Pay Rate Card
  payRateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  payRateInfo: {
    flex: 1,
  },
  payRateLabel: {
    fontSize: FontSizes.small,
  },
  payRateValue: {
    fontSize: FontSizes.xlarge,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  statValue: {
    fontSize: FontSizes.xlarge,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: FontSizes.small,
    marginTop: 2,
  },
  revenueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  revenueInfo: {
    flex: 1,
  },
  revenueLabel: {
    fontSize: FontSizes.small,
  },
  revenueValue: {
    fontSize: FontSizes.xlarge,
    fontWeight: '700',
  },
  jobsSection: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
  },
  jobCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  jobHeader: {
    marginBottom: Spacing.md,
  },
  jobTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  jobName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    flex: 1,
    marginRight: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  statusText: {
    fontSize: FontSizes.small,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  jobLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  jobAddress: {
    fontSize: FontSizes.small,
    flex: 1,
  },
  progressContainer: {
    marginBottom: Spacing.md,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  progressLabel: {
    fontSize: FontSizes.small,
  },
  progressPercent: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  jobStats: {
    flexDirection: 'row',
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  jobStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  jobStatText: {
    fontSize: FontSizes.small,
  },
  emptyJobs: {
    alignItems: 'center',
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: FontSizes.body,
    marginTop: Spacing.sm,
  },
  // Time Tracking Styles
  timeTrackingSection: {
    marginBottom: Spacing.lg,
  },
  hoursSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  hoursSummaryInfo: {
    flex: 1,
    gap: Spacing.xs,
  },
  hoursSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  hoursSummaryLabel: {
    fontSize: FontSizes.small,
  },
  hoursSummaryValue: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  hoursSummaryValues: {
    alignItems: 'flex-end',
  },
  earningsValue: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  hoursAndCost: {
    alignItems: 'flex-end',
  },
  laborCost: {
    fontSize: FontSizes.tiny || 11,
    fontWeight: '500',
  },
  timeRecordCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  timeRecordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  timeRecordDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeRecordDateText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  activeIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  activeText: {
    fontSize: FontSizes.small,
    fontWeight: '500',
  },
  hoursWorked: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  timeRecordProject: {
    fontSize: FontSizes.body,
    fontWeight: '500',
    marginBottom: 2,
  },
  timeRecordTimes: {
    fontSize: FontSizes.small,
  },
  // Payment Summary Styles
  paymentCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    borderWidth: 1,
  },
  paymentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  paymentCardTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  totalAmountContainer: {
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  totalAmountLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  totalAmountValue: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  totalHoursText: {
    fontSize: FontSizes.small,
  },
  breakdownSection: {
    marginTop: Spacing.sm,
  },
  breakdownTitle: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  breakdownLeft: {
    flex: 1,
  },
  breakdownProjectName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 4,
  },
  breakdownHours: {
    fontSize: FontSizes.small,
  },
  breakdownAmount: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  dayBreakdownItem: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  dayBreakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  dayBreakdownLeft: {
    flex: 1,
  },
  dayBreakdownDate: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 4,
  },
  dayBreakdownHours: {
    fontSize: FontSizes.small,
  },
  dayBreakdownAmount: {
    fontSize: FontSizes.large,
    fontWeight: '700',
  },
  dayProjectsList: {
    marginTop: 4,
    paddingLeft: Spacing.sm,
  },
  dayProjectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  dayProjectDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#9CA3AF',
    marginRight: Spacing.sm,
  },
  dayProjectText: {
    fontSize: FontSizes.small,
  },
  paymentTypeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  paymentTypeText: {
    fontSize: FontSizes.small,
    flex: 1,
  },
});
