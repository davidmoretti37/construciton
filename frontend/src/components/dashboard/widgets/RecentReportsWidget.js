import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function RecentReportsWidget({ reports, size, editMode, onPress }) {
  const reportCount = (reports || []).length;
  const totalPhotos = (reports || []).reduce((sum, r) => sum + (r.photoCount || 0), 0);
  const lastReport = reports?.[0];

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={editMode ? 1 : 0.7}
      disabled={editMode}
    >
      <View style={styles.topRow}>
        <View style={styles.iconCircle}>
          <Ionicons name="clipboard-outline" size={16} color="#0EA5E9" />
        </View>
        <View style={styles.statsRow}>
          <Text style={styles.statValue}>{reportCount}</Text>
          <Text style={styles.statLabel}> reports</Text>
          <Text style={styles.statDot}> · </Text>
          <Text style={styles.statValue}>{totalPhotos}</Text>
          <Text style={styles.statLabel}> photos</Text>
        </View>
      </View>

      {lastReport ? (
        <Text style={styles.lastReport} numberOfLines={1}>
          Last: {lastReport.workerName} — {lastReport.phaseName || lastReport.projectName}
        </Text>
      ) : (
        <Text style={styles.lastReport}>No recent reports</Text>
      )}

      <Text style={styles.label}>DAILY REPORTS</Text>
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
    backgroundColor: '#0EA5E91A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  statDot: {
    fontSize: 12,
    color: '#94A3B8',
  },
  lastReport: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 6,
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
