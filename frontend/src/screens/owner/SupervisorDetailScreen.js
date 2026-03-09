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
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useNavigation, useRoute } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getSupervisorTimesheet, calculateSupervisorPaymentForPeriod, getActiveSupervisorClockIn, remoteClockOutSupervisor } from '../../utils/storage/timeTracking';
import DateRangePicker from '../../components/DateRangePicker';
import TimeEditModal from '../../components/TimeEditModal';
import { formatHoursMinutes } from '../../utils/calculations';

// Helper function to format pay rate (takes t function for i18n)
const formatPayRate = (sup, t) => {
  if (!sup) return t('supervisorDetailScreen.notSet');
  switch (sup.payment_type) {
    case 'hourly': return `$${sup.hourly_rate || 0}${t('supervisorDetailScreen.perHour')}`;
    case 'daily': return `$${sup.daily_rate || 0}${t('supervisorDetailScreen.perDay')}`;
    case 'weekly': return `$${sup.weekly_salary || 0}${t('supervisorDetailScreen.perWeek')}`;
    case 'project_based': return `$${sup.project_rate || 0}${t('supervisorDetailScreen.perProject')}`;
    default: return t('supervisorDetailScreen.notSet');
  }
};

// Helper function to get payment type label (takes t function for i18n)
const getPaymentTypeLabel = (type, t) => {
  switch (type) {
    case 'hourly': return t('supervisorDetailScreen.hourly');
    case 'daily': return t('supervisorDetailScreen.daily');
    case 'weekly': return t('supervisorDetailScreen.weekly');
    case 'project_based': return t('supervisorDetailScreen.projectBased');
    default: return t('supervisorDetailScreen.notSet');
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
const JobCard = ({ job, Colors, t }) => {
  const progressPercent = job.progress || 0;
  const statusColor = job.status === 'active' ? '#059669' : job.status === 'completed' ? '#2563EB' : '#F59E0B';

  return (
    <View style={[styles.jobCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      <View style={styles.jobHeader}>
        <View style={styles.jobTitleRow}>
          <Text style={[styles.jobName, { color: Colors.primaryText }]} numberOfLines={1}>
            {job.name || t('supervisorDetailScreen.unnamedProject')}
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
          <Text style={[styles.progressLabel, { color: Colors.secondaryText }]}>{t('supervisorDetailScreen.progress')}</Text>
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
            {t('supervisorDetailScreen.workersCount', { count: job.worker_count || 0 })}
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
  const [activeSession, setActiveSession] = useState(null);
  const [elapsedTime, setElapsedTime] = useState('');

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
  const [clockOutLoading, setClockOutLoading] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  const handleClockOutSupervisor = () => {
    const name = supervisor?.business_name || supervisor?.email?.split('@')[0] || 'Supervisor';
    Alert.alert(
      'Clock Out Supervisor',
      `Are you sure you want to clock out ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clock Out',
          style: 'destructive',
          onPress: async () => {
            setClockOutLoading(true);
            try {
              const result = await remoteClockOutSupervisor(supervisor.id);
              if (result.success) {
                Alert.alert('Success', `${name} has been clocked out. (${formatHoursMinutes(result.hours || 0)})`);
                setActiveSession(null);
                fetchSupervisorData();
              } else {
                Alert.alert('Error', result.error || 'Failed to clock out supervisor.');
              }
            } catch (e) {
              Alert.alert('Error', 'Something went wrong.');
            } finally {
              setClockOutLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleEditTimeRecord = (record) => {
    setEditingRecord(record);
    setEditModalVisible(true);
  };

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
        // Fetch active clock-in session
        try {
          const activeData = await getActiveSupervisorClockIn(supervisor.id);
          setActiveSession(activeData);
        } catch (activeError) {
          console.error('Error fetching active session:', activeError);
        }
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

  const formatTimeLocal = (timestamp) => {
    if (!timestamp) return '--';
    return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDateLocal = (timestamp) => {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return t('common:time.today');
    if (date.toDateString() === yesterday.toDateString()) return t('common:time.yesterday');
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

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
        <TouchableOpacity
          style={{ padding: 4 }}
          onPress={() => navigation.navigate('EditSupervisor', { supervisor })}
        >
          <Ionicons name="settings-outline" size={22} color={Colors.primaryText} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1E40AF" />
        }
      >
        {/* ─── 1. Profile Card ─── */}
        <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#1E40AF20', justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ fontSize: 22, fontWeight: '600', color: '#1E40AF' }}>
                {supervisorName.substring(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: Colors.primaryText, marginBottom: 2 }}>
                {supervisorName}
              </Text>
              <Text style={{ fontSize: 14, color: Colors.secondaryText, marginBottom: 4 }}>
                {t('supervisorDetailScreen.supervisor', { defaultValue: 'Supervisor' })}
              </Text>
              <View style={{ alignSelf: 'flex-start', backgroundColor: '#10B98115', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#10B981', textTransform: 'capitalize' }}>
                  {supervisor?.status || 'active'}
                </Text>
              </View>
            </View>
          </View>

          {/* Contact Info */}
          {(supervisor?.email || supervisor?.business_phone) ? (
            <View style={{ marginBottom: 16 }}>
              {supervisor?.email ? (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}
                  onPress={() => Linking.openURL(`mailto:${supervisor.email}`)}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#1E40AF10', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="mail-outline" size={16} color="#1E40AF" />
                  </View>
                  <Text style={{ fontSize: 14, color: '#1E40AF', marginLeft: 10 }}>{supervisor.email}</Text>
                </TouchableOpacity>
              ) : null}
              {supervisor?.business_phone ? (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}
                  onPress={() => Linking.openURL(`tel:${supervisor.business_phone}`)}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#10B98110', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="call-outline" size={16} color="#10B981" />
                  </View>
                  <Text style={{ fontSize: 14, color: '#10B981', marginLeft: 10 }}>{supervisor.business_phone}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {/* Payment Info */}
          <View style={{ backgroundColor: Colors.lightGray || '#F3F4F6', borderRadius: 12, padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Ionicons name="wallet-outline" size={18} color="#1E40AF" />
              <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.primaryText, marginLeft: 6 }}>
                {t('supervisorDetailScreen.paymentInfo', { defaultValue: 'Payment Info' })}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <View style={{ backgroundColor: Colors.white, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: '45%' }}>
                <Text style={{ fontSize: 11, color: Colors.secondaryText, marginBottom: 2 }}>
                  {t('supervisorDetailScreen.type', { defaultValue: 'Type' })}
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: Colors.primaryText }}>
                  {supervisor?.payment_type ? getPaymentTypeLabel(supervisor.payment_type, t) : t('supervisorDetailScreen.notSet')}
                </Text>
              </View>
              <View style={{ backgroundColor: Colors.white, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: '45%' }}>
                <Text style={{ fontSize: 11, color: Colors.secondaryText, marginBottom: 2 }}>
                  {t('supervisorDetailScreen.rate')}
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#1E40AF' }}>
                  {formatPayRate(supervisor, t)}
                </Text>
              </View>
              <View style={{ backgroundColor: Colors.white, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: '45%' }}>
                <Text style={{ fontSize: 11, color: Colors.secondaryText, marginBottom: 2 }}>
                  {t('supervisorDetailScreen.thisWeek')}
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: Colors.primaryText }}>
                  {formatHoursMinutes(timeStats.weekHours)}
                </Text>
              </View>
              <View style={{ backgroundColor: Colors.white, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: '45%' }}>
                <Text style={{ fontSize: 11, color: Colors.secondaryText, marginBottom: 2 }}>
                  {t('supervisorDetailScreen.thisMonth')}
                </Text>
                <Text style={{ fontSize: 15, fontWeight: '600', color: Colors.primaryText }}>
                  {formatHoursMinutes(timeStats.monthHours)}
                </Text>
              </View>
            </View>
          </View>

          {/* Member Since */}
          {supervisor?.created_at && (
            <Text style={{ fontSize: 12, color: Colors.secondaryText, marginTop: 10, textAlign: 'center' }}>
              {t('supervisorDetailScreen.memberSince', { defaultValue: 'Member since {{date}}', date: new Date(supervisor.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })}
            </Text>
          )}

          {/* Edit Supervisor Button */}
          <TouchableOpacity
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#1E40AF',
              borderRadius: 10,
              paddingVertical: 12,
              marginTop: 14,
              gap: 8,
            }}
            onPress={() => navigation.navigate('EditSupervisor', { supervisor })}
          >
            <Ionicons name="create-outline" size={18} color="#FFF" />
            <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '600' }}>Edit Supervisor</Text>
          </TouchableOpacity>
        </View>

        {/* ─── 2. Currently Clocked In ─── */}
        {activeSession && (
          <View style={[styles.card, { backgroundColor: '#10B98110', borderColor: '#10B98140' }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="time" size={20} color="#10B981" />
              <Text style={[styles.cardTitle, { color: '#10B981' }]}>
                {t('supervisorDetailScreen.currentlyClockedIn', { defaultValue: 'Currently Clocked In' })}
              </Text>
            </View>
            <View style={[styles.sessionContent, { backgroundColor: Colors.white }]}>
              <View style={styles.sessionRow}>
                <Text style={[styles.sessionLabel, { color: Colors.secondaryText }]}>
                  {t('supervisorDetailScreen.project', { defaultValue: 'Project' })}
                </Text>
                <Text style={[styles.sessionValue, { color: Colors.primaryText }]}>
                  {activeSession.projects?.name || t('supervisorDetailScreen.unknownProject')}
                </Text>
              </View>
              <View style={styles.sessionRow}>
                <Text style={[styles.sessionLabel, { color: Colors.secondaryText }]}>
                  {t('supervisorDetailScreen.clockedIn', { defaultValue: 'Clocked In' })}
                </Text>
                <Text style={[styles.sessionValue, { color: Colors.primaryText }]}>
                  {formatTimeLocal(activeSession.clock_in)}
                </Text>
              </View>
              <View style={styles.sessionRow}>
                <Text style={[styles.sessionLabel, { color: Colors.secondaryText }]}>
                  {t('supervisorDetailScreen.elapsedTime', { defaultValue: 'Elapsed Time' })}
                </Text>
                <Text style={[styles.sessionValue, { color: '#10B981', fontWeight: '700' }]}>
                  {elapsedTime}
                </Text>
              </View>
              {activeSession.location_lat && activeSession.location_lng ? (
                <TouchableOpacity
                  style={styles.locationButton}
                  onPress={() => {
                    const url = Platform.select({
                      ios: `maps://maps.apple.com/?ll=${activeSession.location_lat},${activeSession.location_lng}&q=Clock-in Location`,
                      android: `geo:${activeSession.location_lat},${activeSession.location_lng}?q=${activeSession.location_lat},${activeSession.location_lng}(Clock-in Location)`,
                    });
                    Linking.openURL(url);
                  }}
                >
                  <Ionicons name="location" size={18} color="#8B5CF6" />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#8B5CF6' }}>
                    {t('supervisorDetailScreen.viewClockInLocation', { defaultValue: 'View Clock-in Location' })}
                  </Text>
                  <Ionicons name="open-outline" size={14} color="#8B5CF6" />
                </TouchableOpacity>
              ) : (
                <View style={[styles.sessionRow, { opacity: 0.5 }]}>
                  <Text style={[styles.sessionLabel, { color: Colors.secondaryText }]}>
                    {t('supervisorDetailScreen.location', { defaultValue: 'Location' })}
                  </Text>
                  <Text style={[styles.sessionValue, { color: Colors.secondaryText }]}>
                    {t('supervisorDetailScreen.notAvailable', { defaultValue: 'Not available' })}
                  </Text>
                </View>
              )}
              {/* Clock Out Button */}
              <TouchableOpacity
                style={styles.clockOutButton}
                onPress={handleClockOutSupervisor}
                disabled={clockOutLoading}
              >
                {clockOutLoading ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="log-out-outline" size={18} color="#FFF" />
                    <Text style={styles.clockOutButtonText}>Clock Out</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ─── 3. Period + Payment Summary ─── */}
        <DateRangePicker
          fromDate={dateRange.from}
          toDate={dateRange.to}
          onRangeChange={handleRangeChange}
        />

        {loadingPayment ? (
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <ActivityIndicator size="small" color="#1E40AF" />
          </View>
        ) : paymentData && (
          <View style={[styles.card, { backgroundColor: Colors.white }]}>
            <View style={styles.cardHeader}>
              <Ionicons name="cash-outline" size={20} color="#1E40AF" />
              <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>
                {t('supervisorDetailScreen.paymentSummary')}
              </Text>
            </View>

            <View style={[styles.totalAmountContainer, { backgroundColor: Colors.lightGray || '#F3F4F6' }]}>
              <Text style={[styles.totalAmountLabel, { color: Colors.secondaryText }]}>
                {t('supervisorDetailScreen.totalAmountOwed')}
              </Text>
              <Text style={[styles.totalAmountValue, { color: '#1E40AF' }]}>
                ${paymentData.totalAmount?.toFixed(2) || '0.00'}
              </Text>
              <Text style={{ fontSize: 13, color: Colors.secondaryText }}>
                {formatHoursMinutes(paymentData.totalHours || 0)} {t('supervisorDetailScreen.total')}
              </Text>
            </View>

            {paymentData.byProject && paymentData.byProject.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.primaryText, marginBottom: 8 }}>
                  {t('supervisorDetailScreen.breakdownByProject')}
                </Text>
                {paymentData.byProject.map((project, index) => (
                  <View key={index} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.primaryText }}>{project.projectName}</Text>
                      <Text style={{ fontSize: 12, color: Colors.secondaryText }}>{formatHoursMinutes(project.hours)}</Text>
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E40AF' }}>${project.amount?.toFixed(2) || '0.00'}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* ─── 4. Managed Projects ─── */}
        <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="briefcase-outline" size={20} color="#1E40AF" />
            <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>
              {t('supervisorDetailScreen.jobsCount', { count: jobs.length })}
            </Text>
          </View>

          {jobs.length === 0 ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <Ionicons name="briefcase-outline" size={36} color={Colors.secondaryText + '60'} />
              <Text style={{ fontSize: 14, color: Colors.secondaryText, marginTop: 8 }}>
                {t('supervisorDetailScreen.noJobsYet')}
              </Text>
            </View>
          ) : (
            jobs.map((job) => (
              <JobCard key={job.id} job={job} Colors={Colors} t={t} />
            ))
          )}
        </View>

        {/* ─── 5. Work History ─── */}
        <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar-outline" size={20} color="#1E40AF" />
            <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>
              {t('supervisorDetailScreen.timeTracking')}
            </Text>
          </View>

          {timeRecords.length === 0 ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <Ionicons name="time-outline" size={36} color={Colors.secondaryText + '60'} />
              <Text style={{ fontSize: 14, color: Colors.secondaryText, marginTop: 8 }}>
                {t('supervisorDetailScreen.noTimeRecords')}
              </Text>
            </View>
          ) : (
            timeRecords.slice(0, 10).map((record) => {
              const clockIn = new Date(record.clock_in);
              const clockOut = record.clock_out ? new Date(record.clock_out) : null;
              const isActive = !record.clock_out;

              return (
                <View key={record.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="calendar-outline" size={14} color={Colors.secondaryText} />
                      <Text style={{ fontSize: 13, fontWeight: '600', color: Colors.primaryText }}>
                        {formatDateLocal(record.clock_in)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {isActive ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#05966920', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, gap: 4 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#059669' }} />
                          <Text style={{ fontSize: 12, fontWeight: '500', color: '#059669' }}>{t('supervisorDetailScreen.activeStatus')}</Text>
                        </View>
                      ) : (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#059669' }}>{formatHoursMinutes(record.hours)}</Text>
                          {supervisor?.payment_type && (
                            <Text style={{ fontSize: 11, fontWeight: '500', color: '#F59E0B' }}>
                              ${calculateLaborCost(record.hours || 0, supervisor).toFixed(2)}
                            </Text>
                          )}
                        </View>
                      )}
                      {/* Edit button - only for completed entries */}
                      {!isActive && (
                        <TouchableOpacity
                          style={{ padding: 4 }}
                          onPress={() => handleEditTimeRecord(record)}
                        >
                          <Ionicons name="create-outline" size={18} color={Colors.secondaryText} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: Colors.primaryText }} numberOfLines={1}>
                    {record.projects?.name || t('supervisorDetailScreen.unknownProject')}
                  </Text>
                  <Text style={{ fontSize: 12, color: Colors.secondaryText }}>
                    {formatTimeLocal(record.clock_in)} {clockOut ? `- ${formatTimeLocal(record.clock_out)}` : `- ${t('supervisorDetailScreen.inProgress')}`}
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Time Edit Modal */}
      <TimeEditModal
        visible={editModalVisible}
        onClose={() => {
          setEditModalVisible(false);
          setEditingRecord(null);
        }}
        onSaved={() => {
          fetchSupervisorData();
          loadPaymentData();
        }}
        record={editingRecord}
        isSupervisor={true}
      />
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
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  // Shared card style — same as worker detail
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  // Session (clock-in) styles
  sessionContent: {
    borderRadius: 12,
    padding: 12,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  sessionLabel: {
    fontSize: 13,
  },
  sessionValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 8,
    gap: 6,
    backgroundColor: '#8B5CF615',
  },
  clockOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 12,
    gap: 8,
    backgroundColor: '#EF4444',
  },
  clockOutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  // Payment summary
  totalAmountContainer: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  totalAmountLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  totalAmountValue: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 4,
  },
  // JobCard styles
  jobCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  jobHeader: {
    marginBottom: 10,
  },
  jobTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  jobName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  jobLocation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  jobAddress: {
    fontSize: 12,
    flex: 1,
  },
  progressContainer: {
    marginBottom: 10,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  progressLabel: {
    fontSize: 12,
  },
  progressPercent: {
    fontSize: 12,
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
    gap: 16,
    marginBottom: 10,
  },
  jobStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  jobStatText: {
    fontSize: 12,
  },
});
