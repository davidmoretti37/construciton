import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getTodaysWorkersSchedule } from '../utils/storage';
import WorkerScheduleCard from '../components/WorkerScheduleCard';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

export default function ScheduleScreen({ navigation }) {
  const { t } = useTranslation('schedule');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
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
      if (!hasLoadedOnce) {
        loadSchedule();
      }
    }, [hasLoadedOnce])
  );

  const loadSchedule = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const data = await getTodaysWorkersSchedule();
      setScheduleData(data);
      setHasLoadedOnce(true);
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
            <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('title')}</Text>
            <Text style={[styles.headerDate, { color: Colors.secondaryText }]}>{formatDate()}</Text>
          </View>
          <TouchableOpacity
            style={[styles.refreshButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={() => loadSchedule()}
          >
            <Ionicons name="refresh" size={20} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: Colors.lightGray }]}>
            <Text style={[styles.statValue, { color: Colors.primaryText }]}>{totalWorkers}</Text>
            <Text style={[styles.statLabel, { color: Colors.secondaryText }]}>{t('stats.totalWorkers')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: Colors.successGreen + '15' }]}>
            <Text style={[styles.statValue, { color: Colors.successGreen }]}>{clockedInCount}</Text>
            <Text style={[styles.statLabel, { color: Colors.successGreen }]}>{t('stats.clockedIn')}</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: Colors.warningOrange + '15' }]}>
            <Text style={[styles.statValue, { color: Colors.warningOrange }]}>{unassignedWorkers.length}</Text>
            <Text style={[styles.statLabel, { color: Colors.warningOrange }]}>{t('stats.notClockedIn')}</Text>
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
              {t('emptyStates.noWorkers.title')}
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: Colors.secondaryText }]}>
              {t('emptyStates.noWorkers.subtitle')}
            </Text>
            <TouchableOpacity
              style={[styles.emptyStateButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={() => navigation.navigate('Workers')}
            >
              <Ionicons name="add-circle-outline" size={20} color={Colors.white} />
              <Text style={[styles.emptyStateButtonText, { color: Colors.white }]}>{t('emptyStates.noWorkers.button')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Unassigned Workers Section */}
        {unassignedWorkers.length > 0 && (
          <View style={styles.section}>
            <View style={[styles.sectionHeader, { backgroundColor: Colors.warningOrange + '15' }]}>
              <Ionicons name="alert-circle" size={20} color={Colors.warningOrange} />
              <Text style={[styles.sectionTitle, { color: Colors.warningOrange }]}>
                {t('sections.notClockedInYet', { count: unassignedWorkers.length })}
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
                    <View style={[styles.unassignedAvatar, { backgroundColor: Colors.secondaryText }]}>
                      <Text style={[styles.unassignedAvatarText, { color: Colors.white }]}>
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
              {t('emptyStates.noClockedIn.title')}
            </Text>
            <Text style={[styles.emptyStateSubtext, { color: Colors.secondaryText }]}>
              {t('emptyStates.noClockedIn.subtitle')}
            </Text>
          </View>
        )}

        {projectGroups.map((group) => (
          <View key={group.projectId} style={styles.section}>
            <View style={[styles.sectionHeader, { backgroundColor: Colors.primaryBlue + '15' }]}>
              <Ionicons name="briefcase" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.sectionTitle, { color: Colors.primaryBlue }]}>
                {t('sections.projectWorkers', { projectName: group.projectName, count: group.workers.length })}
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
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
