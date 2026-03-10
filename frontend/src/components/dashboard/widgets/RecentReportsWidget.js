import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export default function RecentReportsWidget({ reports, size, editMode, onPress }) {
  const reportCount = (reports || []).length;
  const totalPhotos = (reports || []).reduce((sum, r) => sum + (r.photoCount || 0), 0);
  const lastReport = reports?.[0];

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={editMode ? 1 : 0.85}
      disabled={editMode}
    >
      <LinearGradient
        colors={['#0E7490', '#06B6D4']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.topRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{reportCount}</Text>
            <Text style={styles.statLabel}>reports</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statBlock}>
            <Text style={styles.statValue}>{totalPhotos}</Text>
            <Text style={styles.statLabel}>photos</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={styles.iconCircle}>
            <Ionicons name="clipboard-outline" size={16} color="#A5F3FC" />
          </View>
        </View>

        {lastReport ? (
          <View style={styles.lastPill}>
            <Text style={styles.lastText} numberOfLines={1}>
              {lastReport.workerName} — {lastReport.phaseName || lastReport.projectName}
            </Text>
          </View>
        ) : (
          <Text style={styles.noReports}>No recent reports</Text>
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
    padding: 14,
    justifyContent: 'space-between',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statBlock: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastPill: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lastText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  noReports: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
});
