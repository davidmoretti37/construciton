/**
 * ServicePlansScreen — List of service plans with filter tabs
 * Rendered inside WorkScreen's "Services" segment
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { fetchServicePlans } from '../../utils/storage/servicePlans';
import ServicePlanCard from '../../components/ServicePlanCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'paused', label: 'Paused' },
];

export default function ServicePlansScreen({ showFilter = false }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  const loadPlans = useCallback(async () => {
    try {
      const data = await fetchServicePlans();
      setPlans(data || []);
    } catch (e) {
      console.error('[ServicePlans] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPlans();
    }, [loadPlans])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPlans();
    setRefreshing(false);
  };

  const filteredPlans = activeFilter === 'all'
    ? plans.filter(p => p.status !== 'cancelled')
    : plans.filter(p => p.status === activeFilter);

  // Chunk into rows of 2
  const rows = [];
  for (let i = 0; i < filteredPlans.length; i += 2) {
    rows.push(filteredPlans.slice(i, i + 2));
  }

  const handlePlanPress = (plan) => {
    navigation.navigate('ServicePlanDetail', { plan });
  };

  const renderRow = ({ item: row }) => (
    <View style={styles.row}>
      {row.map(plan => (
        <ServicePlanCard key={plan.id} plan={plan} onPress={handlePlanPress} />
      ))}
      {row.length === 1 && <View style={styles.emptyCard} />}
    </View>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyState}>
        <Ionicons name="clipboard-outline" size={48} color={Colors.secondaryText} />
        <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>
          No Service Plans Yet
        </Text>
        <Text style={[styles.emptySubtitle, { color: Colors.secondaryText }]}>
          Create a service plan to manage recurring visits for your clients.
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter pills — shown when filter button is active */}
      {showFilter && <View style={styles.filterRow}>
        {FILTERS.map(f => {
          const isActive = activeFilter === f.key;
          const count = f.key === 'all'
            ? plans.filter(p => p.status !== 'cancelled').length
            : plans.filter(p => p.status === f.key).length;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterPill, isActive && { backgroundColor: '#1E40AF' }]}
              onPress={() => setActiveFilter(f.key)}
            >
              <Text style={[styles.filterText, isActive && { color: '#fff' }]}>
                {f.label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>}

      <FlatList
        data={rows}
        renderItem={renderRow}
        keyExtractor={(_, i) => `row-${i}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3B82F6" />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: 8,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: 120,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  emptyCard: {
    width: (SCREEN_WIDTH - 32 - 12) / 2,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: FontSizes.small,
    textAlign: 'center',
    lineHeight: 20,
  },
});
