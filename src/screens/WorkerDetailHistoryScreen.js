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
import { getWorkerClockInHistory, getWorkerStats, getActiveClockIn } from '../utils/storage';

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

  useEffect(() => {
    loadData();
  }, [worker.id]);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
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

        {/* History */}
        <View style={[styles.card, { backgroundColor: Colors.white }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="calendar" size={20} color={Colors.primaryBlue} />
            <Text style={[styles.cardTitle, { color: Colors.primaryText }]}>Recent History</Text>
          </View>

          {history.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Ionicons name="time-outline" size={48} color={Colors.secondaryText} />
              <Text style={[styles.emptyHistoryText, { color: Colors.secondaryText }]}>
                No clock-in history yet
              </Text>
            </View>
          ) : (
            Object.entries(groupedHistory).map(([date, entries]) => (
              <View key={date} style={styles.dateGroup}>
                <Text style={[styles.dateHeader, { color: Colors.primaryText }]}>
                  {formatDate(entries[0].clock_in)}
                </Text>
                {entries.map((entry) => (
                  <View key={entry.id} style={[styles.historyEntry, { borderBottomColor: Colors.border }]}>
                    <View style={styles.historyLeft}>
                      <Text style={[styles.historyProject, { color: Colors.primaryText }]}>
                        {entry.projects?.name || 'Unknown Project'}
                      </Text>
                      <View style={styles.historyTimeRow}>
                        <Text style={[styles.historyTime, { color: Colors.secondaryText }]}>
                          {formatTime(entry.clock_in)} → {formatTime(entry.clock_out)}
                        </Text>
                      </View>
                      {entry.notes && (
                        <Text style={[styles.historyNotes, { color: Colors.secondaryText }]} numberOfLines={2}>
                          {entry.notes}
                        </Text>
                      )}
                    </View>
                    <View style={styles.historyRight}>
                      <Text style={[styles.historyHours, { color: Colors.primaryBlue }]}>
                        {entry.hoursWorked ? `${Math.round(entry.hoursWorked * 10) / 10}h` : '--'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))
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
  },
  historyHours: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyHistory: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyHistoryText: {
    fontSize: 14,
    marginTop: 12,
  },
});
