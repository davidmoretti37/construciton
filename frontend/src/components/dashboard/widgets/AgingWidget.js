import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const BUCKETS = [
  { key: 'current', label: 'Current', color: '#10B981' },
  { key: 'days30',  label: '1-30d',   color: '#F59E0B' },
  { key: 'days60',  label: '31-60d',  color: '#F97316' },
  { key: 'days90',  label: '61-90d',  color: '#EF4444' },
  { key: 'over90',  label: '90+',     color: '#991B1B' },
];

export default function AgingWidget({ agingTotals, size, editMode, onPress, fmt }) {
  const total = agingTotals?.total || 0;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={editMode ? 1 : 0.7}
      disabled={editMode}
    >
      <View style={styles.topRow}>
        <View style={styles.iconCircle}>
          <Ionicons name="receipt-outline" size={16} color="#6366F1" />
        </View>
        <Text style={styles.totalAmount}>{fmt(total)}</Text>
      </View>

      <View style={styles.bucketRow}>
        {BUCKETS.map((bucket) => {
          const val = agingTotals?.[bucket.key] || 0;
          const pct = total > 0 ? (val / total) * 100 : 0;
          if (pct === 0 && bucket.key !== 'current') return null;
          return (
            <View key={bucket.key} style={styles.bucketItem}>
              <View style={[styles.bucketDot, { backgroundColor: bucket.color }]} />
              <Text style={styles.bucketLabel}>{bucket.label}</Text>
            </View>
          );
        })}
      </View>

      {total > 0 && (
        <View style={styles.barContainer}>
          {BUCKETS.map((bucket) => {
            const val = agingTotals?.[bucket.key] || 0;
            const pct = total > 0 ? (val / total) * 100 : 0;
            if (pct === 0) return null;
            return (
              <View
                key={bucket.key}
                style={[styles.barSegment, { backgroundColor: bucket.color, flex: pct }]}
              />
            );
          })}
        </View>
      )}

      <Text style={styles.label}>RECEIVABLES AGING</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    width: '100%',
    height: '100%',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#6366F11A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  bucketRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  bucketItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  bucketDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  bucketLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '500',
  },
  barContainer: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 4,
    gap: 1,
  },
  barSegment: {
    height: 4,
    borderRadius: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 4,
  },
});
