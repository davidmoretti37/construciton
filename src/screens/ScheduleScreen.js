import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getTodaysWorkersSchedule } from '../utils/storage';
import WorkerScheduleCard from '../components/WorkerScheduleCard';
import { useFocusEffect } from '@react-navigation/native';

export default function ScheduleScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [scheduleData, setScheduleData] = useState({
    unassignedWorkers: [],
    projectGroups: [],
    totalWorkers: 0,
    clockedInCount: 0
  });

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadSchedule(false);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Load when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadSchedule();
    }, [])
  );

  const loadSchedule = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const data = await getTodaysWorkersSchedule();
      setScheduleData(data);
    } catch (error) {
      console.error('Error loading schedule:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSchedule(false);
  };

  const handleWorkerPress = (worker) => {
    navigation.navigate('WorkerDetailHistory', { worker });
  };

  const formatDate = () => {
    const today = new Date();
    return today.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  const { unassignedWorkers, projectGroups, totalWorkers, clockedInCount } = scheduleData;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.settingsButton} onPress={() => navigation.navigate('Settings')}>
            <Ionicons name="settings-outline" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Today's Schedule</Text>
            <Text style={[styles.headerDate, { color: Colors.secondaryText }]}>{formatDate()}</Text>
          </View>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={() => loadSchedule()}
          >
            <Ionicons name="refresh" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: Colors.lightGray }]}>
            <Text style={[styles.statValue, { color: Colors.primaryText }]}>{totalWorkers}</Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>Total Workers</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#10B981' + '15' }]}>
            <Text style={[styles.statValue, { color: '#10B981' }]}>{clockedInCount}</Text>
            <Text style={[styles.statLabel, { color: '#10B981' }]}>Clocked In</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#F59E0B' + '15' }]}>
            <Text style={[styles.statValue, { color: '#F59E0B' }]}>{unassignedWorkers.length}</Text>
            <Text style={[styles.statLabel, { color: '#F59E0B' }]}>Not Clocked In</Text>
          </View>
        </View>
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
        {/* No Workers State */}
        {totalWorkers === 0 && (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconCircle, { backgroundColor: Colors.lightGray }]}>
              <Ionicons name="people-outline" size={64} color={Colors.secondaryText} />
            </View>
            <Text style={[styles.emptyStateTitle, { color: Colors.primaryText }]}>
              No Workers Yet
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: Colors.secondaryText }]}>
              Add workers to see their daily schedule here
            </Text>
            <TouchableOpacity
              style={[styles.emptyStateButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={() => navigation.navigate('Workers')}
            >
              <Ionicons name="add-circle-outline" size={20} color="#FFFFFF" />
              <Text style={styles.emptyStateButtonText}>Go to Workers</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Unassigned Workers Section */}
        {unassignedWorkers.length > 0 && (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { backgroundColor: '#F59E0B' + '15' }]}>
              <Ionicons name="alert-circle" size={20} color="#F59E0B" />
              <Text style={[styles.sectionTitle, { color: '#F59E0B' }]}>
                Not Clocked In Yet ({unassignedWorkers.length})
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScroll}
            >
              {unassignedWorkers.map((worker) => (
                <View key={worker.id} style={styles.unassignedCard}>
                  <TouchableOpacity
                    style={[styles.unassignedWorkerCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                    onPress={() => handleWorkerPress(worker)}
                  >
                    <View style={[styles.unassignedAvatar, { backgroundColor: '#6B7280' }]}>
                      <Text style={styles.unassignedAvatarText}>
                        {worker.full_name?.split(' ').map(n => n[0]).join('').toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.unassignedName, { color: Colors.primaryText }]} numberOfLines={1}>
                      {worker.full_name}
                    </Text>
                    {worker.trade && (
                      <Text style={[styles.unassignedTrade, { color: Colors.secondaryText }]} numberOfLines={1}>
                        {worker.trade}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Project Groups */}
        {projectGroups.length === 0 && clockedInCount === 0 && totalWorkers > 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="time-outline" size={64} color={Colors.secondaryText} />
            <Text style={[styles.emptyStateTitle, { color: Colors.primaryText }]}>
              No Workers Clocked In
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: Colors.secondaryText }]}>
              Workers will appear here when they clock in to projects
            </Text>
          </View>
        )}

        {projectGroups.map((group) => (
          <View key={group.projectId} style={styles.section}>
            <View style={[styles.sectionHeader, { backgroundColor: Colors.primaryBlue + '15' }]}>
              <Ionicons name="briefcase" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryBlue }]}>
                {group.projectName} ({group.workers.length})
              </Text>
            </View>
            <View style={styles.workersList}>
              {group.workers.map((worker) => (
                <WorkerScheduleCard
                  key={worker.id}
                  worker={worker}
                  onPress={() => handleWorkerPress(worker)}
                />
              ))}
            </View>
          </View>
        ))}
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
    paddingHorizontal: 20,
    paddingTop: Spacing.small,
    paddingBottom: Spacing.medium,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.medium,
  },
  settingsButton: {
    padding: 4,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerDate: {
    fontSize: 13,
    marginTop: 2,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  horizontalScroll: {
    paddingBottom: 4,
  },
  unassignedCard: {
    marginRight: 12,
  },
  unassignedWorkerCard: {
    width: 100,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  unassignedAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  unassignedAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  unassignedName: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  unassignedTrade: {
    fontSize: 11,
    textAlign: 'center',
  },
  workersList: {
    gap: 0,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  emptyStateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
