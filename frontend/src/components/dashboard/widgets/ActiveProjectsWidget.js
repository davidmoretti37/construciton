import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import CircularProgress from './svg/CircularProgress';

// Map raw project.status → status dot color so the project rows show health
// at a glance instead of just being plain text.
function statusDotColor(status) {
  switch (status) {
    case 'active':
    case 'on-track':
      return '#34D399';
    case 'behind':
      return '#FBBF24';
    case 'over-budget':
      return '#F87171';
    case 'completed':
      return '#93C5FD';
    case 'archived':
      return '#9CA3AF';
    default:
      return '#A5B4FC';
  }
}

export default function ActiveProjectsWidget({
  activeProjects,
  totalProjects,
  size,
  editMode,
  onPress,
  topProjects = [],
  onProjectPress,
}) {
  const progress = totalProjects > 0 ? activeProjects / totalProjects : 0;
  const showRows = (size === 'medium' || size === 'large') && topProjects.length > 0;
  const rowLimit = size === 'large' ? 4 : 2;
  const rows = topProjects.slice(0, rowLimit);

  if (size === 'medium' || size === 'large') {
    return (
      <TouchableOpacity
        style={[styles.containerMedium, size === 'large' && styles.containerLarge]}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <LinearGradient
          colors={['#1E40AF', '#3B82F6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientMedium}
        >
          <View style={styles.headerRow}>
            <CircularProgress
              progress={progress}
              size={36}
              strokeWidth={4}
              color="#93C5FD"
              trackColor="rgba(255,255,255,0.15)"
            >
              <Text style={styles.ringValueSm}>{activeProjects}</Text>
            </CircularProgress>
            <View style={{ flex: 1 }}>
              <Text style={styles.labelMedium}>ACTIVE PROJECTS</Text>
              <Text style={styles.breakdown}>{activeProjects} active · {totalProjects} total</Text>
            </View>
          </View>

          {showRows && (
            <View style={styles.rowList}>
              {rows.map((p, idx) => {
                const pct = Math.max(0, Math.min(100, Number(p.percent_complete) || 0));
                return (
                  <TouchableOpacity
                    key={p.id || idx}
                    style={[styles.row, idx < rows.length - 1 && styles.rowDivider]}
                    activeOpacity={0.7}
                    disabled={editMode}
                    onPress={() => onProjectPress && onProjectPress(p.id)}
                  >
                    <View style={[styles.dot, { backgroundColor: statusDotColor(p.status) }]} />
                    <Text style={styles.rowName} numberOfLines={1}>{p.name || 'Untitled'}</Text>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={styles.rowPct} numberOfLines={1}>{pct}%</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  // small (legacy single-stat tile)
  return (
    <TouchableOpacity
      style={styles.containerSmall}
      onPress={onPress}
      activeOpacity={editMode ? 1 : 0.85}
      disabled={editMode}
    >
      <LinearGradient
        colors={['#1E40AF', '#3B82F6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientSmall}
      >
        <CircularProgress
          progress={progress}
          size={56}
          strokeWidth={5}
          color="#93C5FD"
          trackColor="rgba(255,255,255,0.15)"
        >
          <Text style={styles.ringValueSmall}>{activeProjects}</Text>
        </CircularProgress>
        <Text style={styles.subtext}>{activeProjects} of {totalProjects}</Text>
        <Text style={styles.label}>PROJECTS</Text>
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
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
  ringValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ringValueSm: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ringValueSmall: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtext: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    marginTop: 4,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  labelMedium: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  breakdown: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  rowList: {
    flex: 1,
    gap: 6,
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
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  rowName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  progressTrack: {
    width: 56,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#A5F3FC',
  },
  rowPct: {
    width: 42,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    fontVariant: ['tabular-nums'],
  },
});
