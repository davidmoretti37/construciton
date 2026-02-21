import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getWorkerTimesheet, getCurrentUserId } from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import WorkerInviteHandler from '../../components/WorkerInviteHandler';
import { formatHoursMinutes } from '../../utils/calculations';

export default function WorkerTimesheetScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timesheet, setTimesheet] = useState([]);
  const [workerRate, setWorkerRate] = useState(0);
  const [selectedPeriod, setSelectedPeriod] = useState('week'); // week, month, all

  useEffect(() => {
    loadTimesheet();
  }, [selectedPeriod]);

  const loadTimesheet = async () => {
    try {
      setLoading(true);
      const userId = await getCurrentUserId();

      const { data: workerData, error: workerError } = await supabase
        .from('workers')
        .select('id, hourly_rate')
        .eq('user_id', userId)
        .single();

      if (workerError || !workerData) {
        console.error('Error fetching worker:', workerError);
        setLoading(false);
        return;
      }

      setWorkerRate(workerData.hourly_rate || 0);

      const dateRange = getDateRange(selectedPeriod);
      const entries = await getWorkerTimesheet(workerData.id, dateRange);
      setTimesheet(entries);
    } catch (error) {
      console.error('Error loading timesheet:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDateRange = (period) => {
    const today = new Date();
    let startDate;

    switch (period) {
      case 'week':
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startDate = new Date(today.setDate(diff));
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'all':
        return null;
      default:
        return null;
    }

    return {
      startDate: startDate?.toISOString(),
      endDate: new Date().toISOString(),
    };
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTimesheet();
    setRefreshing(false);
  };

  const totalHours = timesheet.reduce((sum, entry) => sum + (entry.hours || 0), 0);
  const totalPay = totalHours * workerRate;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (dateString) => {
    if (!dateString) return '--';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Hours</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={22} color="#1F2937" />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1F2937" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Minimalist Top Bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Hours</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
          <Ionicons name="settings-outline" size={22} color="#1F2937" />
        </TouchableOpacity>
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {['week', 'month', 'all'].map((period) => (
          <TouchableOpacity
            key={period}
            style={[
              styles.periodButton,
              selectedPeriod === period && styles.periodButtonActive
            ]}
            onPress={() => setSelectedPeriod(period)}
          >
            <Text style={[
              styles.periodButtonText,
              selectedPeriod === period && styles.periodButtonTextActive
            ]}>
              {period === 'week' ? 'Week' : period === 'month' ? 'Month' : 'All'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1F2937" />
        }
      >
        {/* Summary */}
        <View style={styles.summaryContainer}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Hours</Text>
            <Text style={styles.summaryValue}>{formatHoursMinutes(totalHours)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Total Pay</Text>
            <Text style={styles.summaryValue}>${totalPay.toFixed(0)}</Text>
          </View>
        </View>

        {/* Entries */}
        {timesheet.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyStateText}>No hours logged yet</Text>
          </View>
        ) : (
          timesheet.map((entry) => (
            <View key={entry.id} style={styles.entryCard}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryDate}>{formatDate(entry.clock_in)}</Text>
                <Text style={styles.entryHours}>{formatHoursMinutes(entry.hours)}</Text>
              </View>
              <Text style={styles.entryProject}>{entry.projects?.name || 'Unknown Project'}</Text>
              <View style={styles.entryTimeRow}>
                <Text style={styles.entryTime}>
                  {formatTime(entry.clock_in)} - {formatTime(entry.clock_out)}
                </Text>
                {entry.clock_out && (
                  <Text style={styles.entryPay}>${(entry.hours * workerRate).toFixed(0)}</Text>
                )}
              </View>
              {entry.notes && (
                <Text style={styles.entryNotes}>{entry.notes}</Text>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <WorkerInviteHandler onInvitesHandled={loadTimesheet} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: 'transparent',
  },
  topBarTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    letterSpacing: -0.5,
  },
  periodSelector: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'transparent',
  },
  periodButtonActive: {
    backgroundColor: '#1F2937',
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  periodButtonTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
    paddingTop: 0,
  },
  summaryContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
    marginBottom: 8,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: '300',
    color: '#1F2937',
    letterSpacing: -1,
  },
  summaryDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E5E7EB',
  },
  entryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 8,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryDate: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  entryHours: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  entryProject: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  entryTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  entryTime: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  entryPay: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  entryNotes: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 15,
    color: '#9CA3AF',
    fontWeight: '500',
  },
});
