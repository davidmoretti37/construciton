import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

/**
 * WorkersWidget
 *
 * Medium / large variant: shows "X / Y on-site" header and 2–3 currently
 * clocked-in worker rows with their project name. Tap a row → drill into
 * that worker's detail. Falls back to the count-only display at small size.
 */
export default function WorkersWidget({
  totalWorkers,
  totalSupervisors,
  totalProjects,
  size,
  editMode,
  onPress,
  onsiteWorkers = [],
  onsiteCount,
  onWorkerPress,
}) {
  const onsite = typeof onsiteCount === 'number' ? onsiteCount : (onsiteWorkers?.length || 0);
  const showRows = (size === 'medium' || size === 'large') && onsiteWorkers.length > 0;
  const rowLimit = size === 'large' ? 5 : 2;
  const rows = onsiteWorkers.slice(0, rowLimit);

  if (size === 'medium' || size === 'large') {
    return (
      <TouchableOpacity
        style={[styles.containerMedium, size === 'large' && styles.containerLarge]}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <LinearGradient
          colors={['#EA580C', '#F97316']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientMedium}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerCount}>{onsite}</Text>
            <View style={styles.headerText}>
              <Text style={styles.labelMedium}>ON-SITE NOW</Text>
              <Text style={styles.headerSub}>{onsite} of {totalWorkers} workers</Text>
            </View>
            <Ionicons name="people" size={20} color="rgba(255,255,255,0.18)" />
          </View>

          {showRows ? (
            <View style={styles.rowList}>
              {rows.map((w, idx) => (
                <TouchableOpacity
                  key={w.id || idx}
                  style={[styles.row, idx < rows.length - 1 && styles.rowDivider]}
                  activeOpacity={0.7}
                  disabled={editMode}
                  onPress={() => onWorkerPress && onWorkerPress(w.id)}
                >
                  <View style={styles.activeDot} />
                  <Text style={styles.rowName} numberOfLines={1}>{w.name || 'Worker'}</Text>
                  {!!w.projectName && (
                    <Text style={styles.rowProject} numberOfLines={1}>{w.projectName}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyRow}>
              {onsite === 0 ? 'No workers clocked in' : 'Tap to see the team'}
            </Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  // small (legacy)
  return (
    <TouchableOpacity
      style={styles.containerSmall}
      onPress={onPress}
      activeOpacity={editMode ? 1 : 0.85}
      disabled={editMode}
    >
      <LinearGradient
        colors={['#EA580C', '#F97316']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientSmall}
      >
        <Text style={styles.titleSmall}>Workers</Text>
        <Ionicons name="people" size={16} color="rgba(255,255,255,0.35)" style={styles.bgIcon} />
        <Text style={styles.valueSmall}>{totalWorkers}</Text>
        <Text style={styles.label}>{onsite} on-site</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  containerSmall: {
    width: '100%',
    height: 130,
    borderRadius: 16,
    overflow: 'hidden',
  },
  containerMedium: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  containerLarge: {
    height: '100%',
  },
  gradientSmall: {
    flex: 1,
    padding: 14,
    justifyContent: 'flex-end',
  },
  titleSmall: {
    position: 'absolute',
    top: 12,
    left: 14,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  gradientMedium: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCount: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  headerText: {
    flex: 1,
  },
  bgIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  valueSmall: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.4,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  labelMedium: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 0.5,
  },
  headerSub: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  rowList: {
    flex: 1,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  rowDivider: {
    borderBottomColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  activeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  rowName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  rowProject: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    maxWidth: '50%',
  },
  emptyRow: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
  },
});
