/**
 * DailyRouteScreen — Owner view of all daily routes and unrouted visits
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchDailyVisits } from '../../utils/storage/serviceVisits';

const STATUS_COLORS = {
  scheduled: '#9CA3AF',
  in_progress: '#3B82F6',
  completed: '#10B981',
  skipped: '#F59E0B',
  cancelled: '#EF4444',
};

export default function DailyRouteScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedRoutes, setExpandedRoutes] = useState({});

  const loadData = useCallback(async () => {
    try {
      const result = await fetchDailyVisits(date);
      setData(result);
    } catch (e) {
      console.error('[DailyRoute] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const changeDate = (offset) => {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + offset);
    setDate(d.toISOString().split('T')[0]);
  };

  const toggleRoute = (index) => {
    setExpandedRoutes(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date().toISOString().split('T')[0];
    if (dateStr === today) return 'Today';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const routes = data?.routes || [];
  const unrouted = data?.unrouted || [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Daily Routes</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={() => navigation.navigate('MapRoute')}
            style={styles.buildBtn}
          >
            <Ionicons name="map" size={24} color="#1E40AF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('RouteBuilder', { route_date: date })}
            style={styles.buildBtn}
          >
            <Ionicons name="add-circle" size={28} color="#1E40AF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Date Picker */}
      <View style={styles.datePicker}>
        <TouchableOpacity onPress={() => changeDate(-1)} style={styles.dateArrow}>
          <Ionicons name="chevron-back" size={20} color="#3B82F6" />
        </TouchableOpacity>
        <Text style={[styles.dateText, { color: Colors.primaryText }]}>{formatDate(date)}</Text>
        <TouchableOpacity onPress={() => changeDate(1)} style={styles.dateArrow}>
          <Ionicons name="chevron-forward" size={20} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1E40AF" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />}
        >
          {/* Routes */}
          {routes.length === 0 && unrouted.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="navigate-outline" size={48} color={Colors.secondaryText} />
              <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>No routes for this day</Text>
              <Text style={[styles.emptySubtitle, { color: Colors.secondaryText }]}>
                Generate visits from your service plans to see routes here.
              </Text>
            </View>
          )}

          {routes.map((routeData, index) => {
            const { route, stops } = routeData;
            const completedCount = stops.filter(s => s.visit?.status === 'completed').length;
            const isExpanded = expandedRoutes[index];

            return (
              <View key={route.id || index} style={[styles.routeCard, { backgroundColor: Colors.cardBackground }]}>
                <TouchableOpacity
                  style={styles.routeHeader}
                  onPress={() => toggleRoute(index)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.routeName, { color: Colors.primaryText }]}>{route.name}</Text>
                    <View style={styles.routeMeta}>
                      <Ionicons name="person-outline" size={13} color={Colors.secondaryText} />
                      <Text style={[styles.routeMetaText, { color: Colors.secondaryText }]}>
                        {route.worker_name || 'Unassigned'}
                      </Text>
                      <Text style={[styles.routeMetaText, { color: Colors.secondaryText }]}>
                        • {stops.length} stop{stops.length !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    {/* Progress bar */}
                    <View style={[styles.progressBar, { backgroundColor: Colors.border }]}>
                      <View style={[styles.progressFill, {
                        width: stops.length > 0 ? `${(completedCount / stops.length) * 100}%` : '0%',
                      }]} />
                    </View>
                    <Text style={[styles.progressText, { color: Colors.secondaryText }]}>
                      {completedCount}/{stops.length} completed
                    </Text>
                  </View>
                  <Ionicons
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={Colors.secondaryText}
                  />
                </TouchableOpacity>

                {isExpanded && stops.map((stop, si) => (
                  <View key={si} style={[styles.stopItem, { borderTopColor: Colors.border }]}>
                    <View style={[styles.stopBadge, { backgroundColor: STATUS_COLORS[stop.visit?.status] || '#9CA3AF' }]}>
                      <Text style={styles.stopBadgeText}>{stop.stop_order}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.stopName, { color: Colors.primaryText }]}>
                        {stop.visit?.location?.name || 'Unknown'}
                      </Text>
                      <Text style={[styles.stopAddress, { color: Colors.secondaryText }]} numberOfLines={1}>
                        {stop.visit?.location?.address || ''}
                      </Text>
                      {stop.visit?.checklist_total > 0 && (
                        <Text style={[styles.stopChecklist, { color: Colors.secondaryText }]}>
                          {stop.visit.checklist_completed}/{stop.visit.checklist_total} items
                        </Text>
                      )}
                    </View>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[stop.visit?.status] || '#9CA3AF' }]} />
                  </View>
                ))}
              </View>
            );
          })}

          {/* Unrouted visits */}
          {unrouted.length > 0 && (
            <View style={styles.unroutedSection}>
              <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
                Unrouted Visits ({unrouted.length})
              </Text>
              {unrouted.map(visit => (
                <View key={visit.id} style={[styles.unroutedItem, { backgroundColor: Colors.cardBackground }]}>
                  <Ionicons name="location-outline" size={18} color="#F59E0B" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stopName, { color: Colors.primaryText }]}>
                      {visit.location_name || 'Unknown'}
                    </Text>
                    <Text style={[styles.stopAddress, { color: Colors.secondaryText }]} numberOfLines={1}>
                      {visit.location_address || ''}
                    </Text>
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[visit.status] || '#9CA3AF' }]} />
                </View>
              ))}
            </View>
          )}

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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  buildBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSizes.header - 4, fontWeight: '700' },
  datePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    gap: 16,
  },
  dateArrow: { padding: 8 },
  dateText: { fontSize: FontSizes.body, fontWeight: '600', minWidth: 100, textAlign: 'center' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingHorizontal: Spacing.lg },
  emptyState: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: FontSizes.subheader, fontWeight: '700' },
  emptySubtitle: { fontSize: FontSizes.small, textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
  routeCard: {
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: 12,
  },
  routeName: { fontSize: FontSizes.body, fontWeight: '700' },
  routeMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  routeMetaText: { fontSize: 12 },
  progressBar: { height: 4, borderRadius: 2, marginTop: 8, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#10B981', borderRadius: 2 },
  progressText: { fontSize: 11, marginTop: 4 },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    gap: 12,
  },
  stopBadge: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  stopBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  stopName: { fontSize: FontSizes.small, fontWeight: '600' },
  stopAddress: { fontSize: 12, marginTop: 2 },
  stopChecklist: { fontSize: 11, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  unroutedSection: { marginTop: Spacing.lg },
  sectionTitle: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  unroutedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    gap: 10,
  },
});
