import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import HorizontalGauge from './svg/HorizontalGauge';

const BUCKETS = [
  { key: 'current', label: 'Current', color: '#6EE7B7' },
  { key: 'days30',  label: '1-30d',   color: '#FCD34D' },
  { key: 'days60',  label: '31-60d',  color: '#FB923C' },
  { key: 'days90',  label: '61-90d',  color: '#F87171' },
  { key: 'over90',  label: '90+',     color: '#FCA5A5' },
];

export default function AgingWidget({ agingTotals, size, editMode, onPress, fmt }) {
  const total = agingTotals?.total || 0;

  const segments = BUCKETS
    .map((b) => ({ value: agingTotals?.[b.key] || 0, color: b.color }))
    .filter((s) => s.value > 0);

  const activeBuckets = BUCKETS.filter((b) => (agingTotals?.[b.key] || 0) > 0 || b.key === 'current');

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={editMode ? 1 : 0.85}
      disabled={editMode}
    >
      <LinearGradient
        colors={['#3730A3', '#4F46E5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.topRow}>
          <Text style={styles.totalAmount}>{fmt(total)}</Text>
          <Text style={styles.label}>AGING</Text>
        </View>

        <View style={styles.bucketRow}>
          {activeBuckets.map((bucket) => (
            <View key={bucket.key} style={styles.chip}>
              <View style={[styles.chipDot, { backgroundColor: bucket.color }]} />
              <Text style={styles.chipLabel}>{bucket.label}</Text>
            </View>
          ))}
        </View>

        {total > 0 && (
          <View style={styles.gaugeWrap}>
            <HorizontalGauge
              segments={segments}
              height={6}
              borderRadius={3}
              width={size === 'large' ? 320 : 300}
            />
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
  },
  bucketRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chipLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
  },
  gaugeWrap: {
    marginTop: 4,
  },
});
