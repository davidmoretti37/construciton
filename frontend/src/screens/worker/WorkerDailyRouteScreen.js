/**
 * WorkerDailyRouteScreen — Worker's view of today's route
 * Large cards for each stop with navigation and checklist progress
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchDailyVisits } from '../../utils/storage/serviceVisits';

const STATUS_CONFIG = {
  scheduled: { color: '#9CA3AF', bg: '#F3F4F6', label: 'Scheduled', icon: 'time-outline' },
  in_progress: { color: '#3B82F6', bg: '#EFF6FF', label: 'In Progress', icon: 'play-circle-outline' },
  completed: { color: '#10B981', bg: '#ECFDF5', label: 'Completed', icon: 'checkmark-circle-outline' },
  skipped: { color: '#F59E0B', bg: '#FFFBEB', label: 'Skipped', icon: 'arrow-forward-circle-outline' },
};

export default function WorkerDailyRouteScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();

  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadVisits = useCallback(async () => {
    try {
      const data = await fetchDailyVisits();
      setVisits(data?.visits || []);
    } catch (e) {
      console.error('[WorkerDailyRoute] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadVisits();
    }, [loadVisits])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadVisits();
    setRefreshing(false);
  };

  const openMaps = (address) => {
    if (!address) return;
    const encoded = encodeURIComponent(address);
    const url = Platform.select({
      ios: `maps://app?daddr=${encoded}`,
      android: `google.navigation:q=${encoded}`,
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
    });
  };

  const completedCount = visits.filter(v => v.status === 'completed').length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Today's Route</Text>
          {visits.length > 0 && (
            <Text style={[styles.headerSubtitle, { color: Colors.secondaryText }]}>
              {completedCount}/{visits.length} stops completed
            </Text>
          )}
        </View>
      </View>

      {/* Overall progress */}
      {visits.length > 0 && (
        <View style={styles.progressWrapper}>
          <View style={[styles.progressBar, { backgroundColor: Colors.border }]}>
            <View style={[styles.progressFill, {
              width: `${(completedCount / visits.length) * 100}%`,
            }]} />
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />}
        >
          {visits.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="navigate-outline" size={56} color={Colors.secondaryText} />
              <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>No visits today</Text>
              <Text style={[styles.emptySubtitle, { color: Colors.secondaryText }]}>
                You don't have any service visits scheduled for today.
              </Text>
            </View>
          )}

          {visits.map((visit, index) => {
            const statusConfig = STATUS_CONFIG[visit.status] || STATUS_CONFIG.scheduled;
            const location = visit.location || {};
            const hasChecklist = visit.checklist_total > 0;
            const stopNumber = visit.stop_order != null ? visit.stop_order : index + 1;

            return (
              <TouchableOpacity
                key={visit.id}
                style={[styles.visitCard, { backgroundColor: Colors.cardBackground }]}
                onPress={() => navigation.navigate('VisitDetail', { visit })}
                activeOpacity={0.8}
              >
                {/* Stop number badge */}
                <View style={[styles.stopNumberBadge, { backgroundColor: statusConfig.color }]}>
                  <Text style={styles.stopNumberText}>{stopNumber}</Text>
                </View>

                <View style={styles.visitContent}>
                  {/* Location info */}
                  <Text style={[styles.locationName, { color: Colors.primaryText }]} numberOfLines={1}>
                    {location.name || 'Unknown Location'}
                  </Text>
                  <Text style={[styles.locationAddress, { color: Colors.secondaryText }]} numberOfLines={2}>
                    {location.address || ''}
                  </Text>

                  {/* Access notes */}
                  {location.access_notes && (
                    <View style={styles.accessNotes}>
                      <Ionicons name="key-outline" size={12} color="#F59E0B" />
                      <Text style={styles.accessNotesText} numberOfLines={1}>{location.access_notes}</Text>
                    </View>
                  )}

                  {/* Status + Checklist */}
                  <View style={styles.visitMeta}>
                    <View style={[styles.statusPill, { backgroundColor: statusConfig.bg }]}>
                      <Ionicons name={statusConfig.icon} size={14} color={statusConfig.color} />
                      <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
                    </View>

                    {hasChecklist && (
                      <View style={styles.checklistInfo}>
                        <Ionicons name="checkbox-outline" size={14} color={Colors.secondaryText} />
                        <Text style={[styles.checklistText, { color: Colors.secondaryText }]}>
                          {visit.checklist_completed}/{visit.checklist_total}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Checklist progress bar */}
                  {hasChecklist && (
                    <View style={[styles.checklistBar, { backgroundColor: Colors.border }]}>
                      <View style={[styles.checklistBarFill, {
                        width: `${(visit.checklist_completed / visit.checklist_total) * 100}%`,
                      }]} />
                    </View>
                  )}
                </View>

                {/* Navigate button */}
                <TouchableOpacity
                  style={styles.navButton}
                  onPress={() => openMaps(location.address)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="navigate" size={22} color="#3B82F6" />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}

          <View style={{ height: 120 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: 12,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  progressWrapper: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#059669', borderRadius: 3 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: Spacing.lg },
  emptyState: { alignItems: 'center', paddingTop: 100, gap: 12 },
  emptyTitle: { fontSize: FontSizes.subheader, fontWeight: '700' },
  emptySubtitle: { fontSize: FontSizes.small, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  visitCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  stopNumberBadge: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 2,
  },
  stopNumberText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  visitContent: { flex: 1 },
  locationName: { fontSize: FontSizes.body, fontWeight: '700', marginBottom: 2 },
  locationAddress: { fontSize: 13, lineHeight: 18, marginBottom: 6 },
  accessNotes: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#FFFBEB', paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, alignSelf: 'flex-start', marginBottom: 8,
  },
  accessNotesText: { fontSize: 11, color: '#92400E' },
  visitMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  checklistInfo: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  checklistText: { fontSize: 12 },
  checklistBar: { height: 3, borderRadius: 1.5, overflow: 'hidden' },
  checklistBarFill: { height: '100%', backgroundColor: '#059669', borderRadius: 1.5 },
  navButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center', alignItems: 'center',
    marginTop: 2,
  },
});
