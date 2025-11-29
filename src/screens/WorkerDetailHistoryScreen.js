import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getWorkerClockInHistory, getWorkerStats, getActiveClockIn, calculateWorkerPaymentForPeriod } from '../utils/storage';
import DateRangePicker from '../components/DateRangePicker';

export default function WorkerDetailHistoryScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { worker } = route.params;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({
    weekHours: 0,
    monthHours: 0,
    mostWorkedProjectId: null,
    mostWorkedProjectHours: 0
  });
  const [activeSession, setActiveSession] = useState(null);
  const [elapsedTime, setElapsedTime] = useState('');

  // Date range and payment state
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

  useEffect(() => {
    loadData();
  }, [worker.id]);

  // Load payment data when date range changes
  useEffect(() => {
    loadPaymentData();
  }, [dateRange, worker.id]);

  // Update elapsed time every second for active session
  useEffect(() => {
    if (!activeSession) return;

    const updateTime = () => {
      const clockIn = new Date(activeSession.clock_in);
      const now = new Date();
      const diff = now - clockIn;

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setElapsedTime(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [activeSession]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [historyData, statsData, activeData] = await Promise.all([
        getWorkerClockInHistory(worker.id, 30),
        getWorkerStats(worker.id),
        getActiveClockIn(worker.id)
      ]);

      setHistory(historyData);
      setStats(statsData);
      setActiveSession(activeData);
    } catch (error) {
      console.error('Error loading worker data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadPaymentData = async () => {
    try {
      setLoadingPayment(true);
      const data = await calculateWorkerPaymentForPeriod(
        worker.id,
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

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadData(), loadPaymentData()]);
  };

  const handleRangeChange = (from, to) => {
    setDateRange({ from, to });
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return '#10B981';
      case 'inactive':
        return '#6B7280';
      case 'pending':
        return '#F59E0B';
      default:
        return Colors.primaryBlue;
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
      });
    }
  };

  const groupHistoryByDate = (historyData) => {
    const grouped = {};
    historyData.forEach(entry => {
      const date = new Date(entry.clock_in).toDateString();
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(entry);
    });
    return grouped;
  };

  const calculateEntryAmount = (entry) => {
    if (!paymentData || !worker.payment_type) return null;

    const hours = entry.hoursWorked || 0;

    switch (worker.payment_type) {
      case 'hourly':
        return hours * (worker.hourly_rate || 0);

      case 'daily':
        // Find this entry in the payment breakdown by date
        if (paymentData.byDate) {
          const entryDate = new Date(entry.clock_in).toISOString().split('T')[0];
          const dateData = paymentData.byDate.find(d => d.date === entryDate);
          if (dateData) {
            // Find this specific entry's proportion
            const dayEntries = dateData.entries || [];
            const thisEntry = dayEntries.find(e =>
              e.projectId === entry.project_id &&
              Math.abs(e.hours - hours) < 0.01
            );
            return thisEntry ? thisEntry.amount : 0;
          }
        }
        return 0;

      case 'weekly':
        // For weekly, we can't show per-entry amounts
        return null;

      case 'project_based':
        // For project-based, payment is milestone-based, not per session
        return null;

      default:
        return null;
    }
  };

  const statusColor = getStatusColor(worker.status);
  const groupedHistory = groupHistoryByDate(history);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Worker Details</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primaryBlue}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Worker Header */}
        <View style={[styles.workerHeader, { backgroundColor: Colors.white }]}>
          <View style={[styles.workerAvatar, { backgroundColor: statusColor }]}>
            <Text style={styles.workerAvatarText}>{getInitials(worker.full_name)}</Text>
            {activeSession && (
              <View style={styles.activePulse}>
                <View style={[styles.pulseDot, { backgroundColor: '#10B981' }]} />
              </View>
            )}
          </View>
          <Text style={[styles.workerName, { color: Colors.primaryText }]}>{worker.full_name}</Text>
          {worker.trade && (
            <View style={styles.tradeRow}>
              <Ionicons name="hammer" size={16} color={Colors.secondaryText} />
              <Text style={[styles.tradeText, { color: Colors.secondaryText }]}>{worker.trade}</Text>
            </View>
          )}
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {worker.status || 'pending'}
            </Text>
          </View>

          {/* Contact Info */}
          {(worker.phone || worker.email) && (
            <View style={styles.contactRow}>
              {worker.phone && (
                <View style={styles.contactItem}>
                  <Ionicons name="call" size={14} color={Colors.secondaryText} />
                  <Text style={[styles.contactText, { color: Colors.secondaryText }]}>{worker.phone}</Text>
                </View>
              )}
              {worker.email && (
                <View style={styles.contactItem}>
                  <Ionicons name="mail" size={14} color={Colors.secondaryText} />
                  <Text style={[styles.contactText, { color: Colors.secondaryText }]}>{worker.email}</Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Active Session */}
        {activeSession && (
          <View style={[styles.card, { backgroundColor: '#10B981' + '10', borderColor: '#10B981' + '40' }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="time" size={20} color="#10B981" />
              <Text style={[styles.cardTitle, { color: '#10B981' }]}>Currently Clocked In</Text>
            </View>
            <View style={[styles.sessionContent, { backgroundColor: Colors.white }]}>
              <View style={styles.sessionRow}>
                <Text style={[styles.sessionLabel, { color: Colors.secondaryText }]}>Project</Text>
                <Text style={[styles.sessionValue, { color: Colors.primaryText }]}>
                  {activeSession.projects?.name || 'Unknown'}
                </Text>
              </View>
              <View style={styles.sessionRow}>
                <Text style={[styles.sessionLabel, { color: Colors.secondaryText }]}>Clocked In</Text>
                <Text style={[styles.sessionValue, { color: Colors.primaryText }]}>
                  {formatTime(activeSession.clock_in)}
                </Text>
              </View>
              <View style={styles.sessionRow}>
                <Text style={[styles.sessionLabel, { color: Colors.secondaryText }]}>Elapsed Time</Text>
                <Text style={[styles.sessionValue, { color: '#10B981', fontWeight: '700' }]}>
                  {elapsedTime}
                </Text>
              </View>
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
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <ActivityIndicator size="small" color={Colors.primaryBlue} />
          </View>
        ) : paymentData && (
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="cash-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Payment Summary</Text>
            </View>

            {/* Total Amount */}
            <View style={[styles.totalAmountContainer, { backgroundColor: Colors.lightGray }]}>
              <Text style={[styles.totalAmountLabel, { color: Colors.secondaryText }]}>
                Total Amount Owed
              </Text>
              <Text style={[styles.totalAmountValue, { color: Colors.primaryBlue }]}>
                ${paymentData.totalAmount.toFixed(2)}
              </Text>
              <Text style={[styles.totalHoursText, { color: Colors.secondaryText }]}>
                {paymentData.totalHours.toFixed(1)} hours total
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
                        {project.hours.toFixed(1)} hours
                      </Text>
                    </View>
                    <Text style={[styles.breakdownAmount, { color: Colors.primaryBlue }]}>
                      ${project.amount.toFixed(2)}
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
                          {day.hours.toFixed(1)} hours
                        </Text>
                      </View>
                      <Text style={[styles.dayBreakdownAmount, { color: Colors.primaryBlue }]}>
                        ${day.amount.toFixed(2)}
                      </Text>
                    </View>
                    {/* Show projects worked on this day */}
                    {day.projects && day.projects.length > 0 && (
                      <View style={styles.dayProjectsList}>
                        {day.projects.map((project, projectIndex) => (
                          <View key={projectIndex} style={styles.dayProjectItem}>
                            <View style={styles.dayProjectDot} />
                            <Text style={[styles.dayProjectText, { color: Colors.secondaryText }]}>
                              {project.projectName}: {project.hours.toFixed(1)}h
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
            {worker.payment_type && (
              <View style={styles.paymentTypeInfo}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.secondaryText} />
                <Text style={[styles.paymentTypeText, { color: Colors.secondaryText }]}>
                  Payment Type: {worker.payment_type === 'hourly' ? 'Hourly' :
                    worker.payment_type === 'daily' ? 'Daily' :
                    worker.payment_type === 'weekly' ? 'Weekly' : 'Project-Based'}
                  {worker.payment_type === 'hourly' && worker.hourly_rate && ` - $${Number(worker.hourly_rate).toFixed(2)}/hr`}
                  {worker.payment_type === 'daily' && worker.daily_rate && ` - $${Number(worker.daily_rate).toFixed(2)}/day`}
                  {worker.payment_type === 'weekly' && worker.weekly_salary && ` - $${Number(worker.weekly_salary).toFixed(2)}/wk`}
                  {worker.payment_type === 'project_based' && worker.project_rate && ` - $${Number(worker.project_rate).toFixed(2)}/project`}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Stats Summary */}
        <View style={[styles.card, { backgroundColor: Colors.white }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="stats-chart" size={20} color={Colors.primaryBlue} />
            <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Summary</Text>
          </View>
          <View style={styles.statsGrid}>
            <View style={[styles.statItem, { backgroundColor: Colors.lightGray }]}>
              <Text style={[styles.statValue, { color: Colors.primaryText }]}>{stats.weekHours}h</Text>
              <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>This Week</Text>
            </View>
            <View style={[styles.statItem, { backgroundColor: Colors.lightGray }]}>
              <Text style={[styles.statValue, { color: Colors.primaryText }]}>{stats.monthHours}h</Text>
              <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>This Month</Text>
            </View>
          </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  workerHeader: {
    alignItems: 'center',
    padding: 24,
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  workerAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  workerAvatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activePulse: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 3,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  workerName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  tradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  tradeText: {
    fontSize: 15,
  },
  statusBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 12,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  contactText: {
    fontSize: 13,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sessionContent: {
    borderRadius: 12,
    padding: 12,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  sessionLabel: {
    fontSize: 14,
  },
  sessionValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  dateGroup: {
    marginBottom: 16,
  },
  dateHeader: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  historyEntry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  historyLeft: {
    flex: 1,
    marginRight: 12,
  },
  historyProject: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  historyTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyTime: {
    fontSize: 13,
  },
  historyNotes: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  historyRight: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  historyHours: {
    fontSize: 16,
    fontWeight: '700',
  },
  historyAmount: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  emptyHistory: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyHistoryText: {
    fontSize: 14,
    marginTop: 12,
  },
  totalAmountContainer: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  totalAmountLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  totalAmountValue: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  totalHoursText: {
    fontSize: 13,
  },
  breakdownSection: {
    marginTop: 8,
  },
  breakdownTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  breakdownLeft: {
    flex: 1,
  },
  breakdownProjectName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  breakdownHours: {
    fontSize: 13,
  },
  breakdownAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  paymentTypeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  paymentTypeText: {
    fontSize: 12,
    flex: 1,
  },
  dayBreakdownItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  dayBreakdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  dayBreakdownLeft: {
    flex: 1,
  },
  dayBreakdownDate: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  dayBreakdownHours: {
    fontSize: 13,
  },
  dayBreakdownAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  dayProjectsList: {
    marginTop: 4,
    paddingLeft: 12,
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
    marginRight: 8,
  },
  dayProjectText: {
    fontSize: 13,
  },
});
