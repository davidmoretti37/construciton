import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getWorkerTimesheet, getCurrentUserId } from '../../utils/storage';
import { supabase } from '../../lib/supabase';

export default function WorkerTimesheetScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workerId, setWorkerId] = useState(null);
  const [workerRate, setWorkerRate] = useState(0);
  const [timesheet, setTimesheet] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState('week'); // week, month, all
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);

  useEffect(() => {
    loadTimesheet();
  }, [selectedPeriod]);

  const loadTimesheet = async () => {
    try {
      setLoading(true);
      const userId = await getCurrentUserId();

      // Get worker ID and hourly rate
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

      setWorkerId(workerData.id);
      setWorkerRate(workerData.hourly_rate || 0);

      // Calculate date range based on selected period
      const dateRange = getDateRange(selectedPeriod);

      // Load timesheet
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
        // Start from Monday of current week
        const dayOfWeek = today.getDay();
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startDate = new Date(today.setDate(diff));
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'month':
        // Start from first day of current month
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'all':
        return null; // No date range
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

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDayOfWeek = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  // Calculate totals
  const totalHours = timesheet.reduce((sum, entry) => sum + (entry.hours || 0), 0);
  const totalPay = totalHours * workerRate;

  // Group entries by date
  const groupedEntries = timesheet.reduce((groups, entry) => {
    const date = new Date(entry.clock_in).toDateString();
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(entry);
    return groups;
  }, {});

  const periodLabels = {
    week: 'This Week',
    month: 'This Month',
    all: 'All Time',
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.topBar, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
          <Text style={[styles.topBarTitle, { color: Colors.primaryText }]}>Timesheet</Text>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Settings')}
          >
            <Ionicons name="settings-outline" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Top Bar */}
      <View style={[styles.topBar, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <Text style={[styles.topBarTitle, { color: Colors.primaryText }]}>Timesheet</Text>
        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => navigation.navigate('Settings')}
        >
          <Ionicons name="settings-outline" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
      </View>

      {/* Period Selector */}
      <View style={[styles.periodSelector, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={[styles.periodButton, { backgroundColor: Colors.lightGray }]}
          onPress={() => setShowPeriodPicker(true)}
        >
          <Text style={[styles.periodButtonText, { color: Colors.primaryText }]}>
            {periodLabels[selectedPeriod]}
          </Text>
          <Ionicons name="chevron-down" size={20} color={Colors.primaryText} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primaryBlue} />
        }
      >
        {/* Summary Cards */}
        <View style={styles.summaryContainer}>
          <View style={[styles.summaryCard, { backgroundColor: Colors.primaryBlue }]}>
            <Ionicons name="time" size={32} color="#FFFFFF" />
            <Text style={styles.summaryValue}>{totalHours.toFixed(2)}</Text>
            <Text style={styles.summaryLabel}>Total Hours</Text>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: '#10B981' }]}>
            <Ionicons name="cash" size={32} color="#FFFFFF" />
            <Text style={styles.summaryValue}>${totalPay.toFixed(2)}</Text>
            <Text style={styles.summaryLabel}>Total Pay</Text>
          </View>
        </View>

        {/* Hourly Rate Info */}
        {workerRate > 0 && (
          <View style={[styles.rateInfo, { backgroundColor: Colors.white }]}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.secondaryText} />
            <Text style={[styles.rateText, { color: Colors.secondaryText }]}>
              Hourly rate: ${workerRate.toFixed(2)}/hr
            </Text>
          </View>
        )}

        {/* Time Entries */}
        {timesheet.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={80} color={Colors.secondaryText} />
            <Text style={[styles.emptyStateTitle, { color: Colors.primaryText }]}>No Time Entries</Text>
            <Text style={[styles.emptyStateText, { color: Colors.secondaryText }]}>
              You haven't logged any hours for this period yet.
            </Text>
          </View>
        ) : (
          <View style={styles.entriesContainer}>
            {Object.keys(groupedEntries)
              .sort((a, b) => new Date(b) - new Date(a))
              .map((date) => {
                const entries = groupedEntries[date];
                const dayTotal = entries.reduce((sum, e) => sum + (e.hours || 0), 0);

                return (
                  <View key={date} style={styles.dayGroup}>
                    {/* Date Header */}
                    <View style={[styles.dateHeader, { backgroundColor: Colors.lightGray }]}>
                      <View style={styles.dateInfo}>
                        <Text style={[styles.dayOfWeek, { color: Colors.primaryText }]}>
                          {formatDayOfWeek(entries[0].clock_in)}
                        </Text>
                        <Text style={[styles.dateText, { color: Colors.secondaryText }]}>
                          {formatDate(entries[0].clock_in)}
                        </Text>
                      </View>
                      <View style={styles.dayTotalBadge}>
                        <Ionicons name="time-outline" size={14} color={Colors.primaryBlue} />
                        <Text style={[styles.dayTotalText, { color: Colors.primaryBlue }]}>
                          {dayTotal.toFixed(2)}h
                        </Text>
                      </View>
                    </View>

                    {/* Entries for this day */}
                    {entries.map((entry) => (
                      <View key={entry.id} style={[styles.entryCard, { backgroundColor: Colors.white }]}>
                        <View style={styles.entryHeader}>
                          <View style={styles.projectInfo}>
                            <Ionicons name="briefcase" size={18} color={Colors.primaryBlue} />
                            <Text style={[styles.projectName, { color: Colors.primaryText }]} numberOfLines={1}>
                              {entry.projects?.name || 'Unknown Project'}
                            </Text>
                          </View>
                          <View style={[styles.hoursBadge, { backgroundColor: Colors.primaryBlue + '20' }]}>
                            <Text style={[styles.hoursText, { color: Colors.primaryBlue }]}>
                              {entry.hours.toFixed(2)}h
                            </Text>
                          </View>
                        </View>

                        <View style={styles.entryDetails}>
                          <View style={styles.timeRow}>
                            <View style={styles.timeInfo}>
                              <Ionicons name="log-in-outline" size={14} color="#10B981" />
                              <Text style={[styles.timeLabel, { color: Colors.secondaryText }]}>In:</Text>
                              <Text style={[styles.timeValue, { color: Colors.primaryText }]}>
                                {formatTime(entry.clock_in)}
                              </Text>
                            </View>

                            {entry.clock_out && (
                              <View style={styles.timeInfo}>
                                <Ionicons name="log-out-outline" size={14} color="#EF4444" />
                                <Text style={[styles.timeLabel, { color: Colors.secondaryText }]}>Out:</Text>
                                <Text style={[styles.timeValue, { color: Colors.primaryText }]}>
                                  {formatTime(entry.clock_out)}
                                </Text>
                              </View>
                            )}
                          </View>

                          {entry.notes && (
                            <View style={[styles.notesBox, { backgroundColor: Colors.lightGray }]}>
                              <Ionicons name="document-text-outline" size={14} color={Colors.secondaryText} />
                              <Text style={[styles.notesText, { color: Colors.secondaryText }]} numberOfLines={2}>
                                {entry.notes}
                              </Text>
                            </View>
                          )}

                          {(entry.location_lat || entry.location_lng) && (
                            <View style={styles.locationRow}>
                              <Ionicons name="location-outline" size={12} color={Colors.secondaryText} />
                              <Text style={[styles.locationText, { color: Colors.secondaryText }]}>
                                Location tracked
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>
                );
              })}
          </View>
        )}
      </ScrollView>

      {/* Period Picker Modal */}
      <Modal
        visible={showPeriodPicker}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowPeriodPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowPeriodPicker(false)}
        >
          <View style={[styles.pickerModal, { backgroundColor: Colors.white }]}>
            <Text style={[styles.pickerTitle, { color: Colors.primaryText }]}>Select Period</Text>

            {['week', 'month', 'all'].map((period) => (
              <TouchableOpacity
                key={period}
                style={[
                  styles.periodOption,
                  selectedPeriod === period && { backgroundColor: Colors.primaryBlue + '10' },
                ]}
                onPress={() => {
                  setSelectedPeriod(period);
                  setShowPeriodPicker(false);
                }}
              >
                <Text
                  style={[
                    styles.periodOptionText,
                    { color: selectedPeriod === period ? Colors.primaryBlue : Colors.primaryText },
                  ]}
                >
                  {periodLabels[period]}
                </Text>
                {selectedPeriod === period && (
                  <Ionicons name="checkmark" size={20} color={Colors.primaryBlue} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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
  topBar: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.large,
    borderBottomWidth: 1,
  },
  topBarTitle: {
    fontSize: FontSizes.large,
    fontWeight: '700',
  },
  settingsButton: {
    padding: Spacing.small,
  },
  periodSelector: {
    paddingHorizontal: Spacing.large,
    paddingVertical: Spacing.medium,
    borderBottomWidth: 1,
  },
  periodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.medium,
    paddingVertical: Spacing.small,
    borderRadius: BorderRadius.medium,
  },
  periodButtonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.large,
  },
  summaryContainer: {
    flexDirection: 'row',
    gap: Spacing.medium,
    marginBottom: Spacing.large,
  },
  summaryCard: {
    flex: 1,
    borderRadius: BorderRadius.large,
    padding: Spacing.large,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: Spacing.small,
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: FontSizes.small,
    color: 'rgba(255,255,255,0.9)',
  },
  rateInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.medium,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.large,
  },
  rateText: {
    fontSize: FontSizes.small,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xlarge * 3,
  },
  emptyStateTitle: {
    fontSize: FontSizes.xlarge,
    fontWeight: '700',
    marginTop: Spacing.large,
    marginBottom: Spacing.small,
  },
  emptyStateText: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.xlarge,
  },
  entriesContainer: {
    gap: Spacing.large,
  },
  dayGroup: {
    marginBottom: Spacing.medium,
  },
  dateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.medium,
    paddingVertical: Spacing.small,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.small,
  },
  dateInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayOfWeek: {
    fontSize: FontSizes.body,
    fontWeight: '700',
  },
  dateText: {
    fontSize: FontSizes.small,
  },
  dayTotalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dayTotalText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  entryCard: {
    borderRadius: BorderRadius.medium,
    padding: Spacing.medium,
    marginBottom: Spacing.small,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.small,
  },
  projectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  projectName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    flex: 1,
  },
  hoursBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  hoursText: {
    fontSize: FontSizes.small,
    fontWeight: '700',
  },
  entryDetails: {
    gap: Spacing.small,
  },
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.medium,
  },
  timeInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeLabel: {
    fontSize: FontSizes.small,
  },
  timeValue: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  notesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    padding: Spacing.small,
    borderRadius: BorderRadius.small,
  },
  notesText: {
    flex: 1,
    fontSize: FontSizes.small,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerModal: {
    width: '80%',
    borderRadius: BorderRadius.large,
    padding: Spacing.large,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  pickerTitle: {
    fontSize: FontSizes.large,
    fontWeight: '700',
    marginBottom: Spacing.medium,
  },
  periodOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.medium,
    paddingHorizontal: Spacing.medium,
    borderRadius: BorderRadius.medium,
    marginBottom: Spacing.small,
  },
  periodOptionText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
