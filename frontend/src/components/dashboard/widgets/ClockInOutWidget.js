import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Supervisor clock-in/out widget. Renders at `large` size only — designed to
 * fit the widget grid's 200px slot without scrolling. Owns no state: all
 * clock data flows in as props from HomeScreen which keeps the elapsedTime
 * ticker, project picker, and clock-out flow.
 */
export default function ClockInOutWidget({
  activeSession,
  elapsedTime,
  clockLoading,
  supervisorTodayHours,
  onClockInPress,
  onClockOutPress,
  editMode,
  Colors,
  formatHoursMinutes,
}) {
  const isActive = !!activeSession;
  const statusColor = isActive ? (Colors?.successGreen || '#10B981') : (Colors?.secondaryText || '#9CA3AF');
  const projectName = activeSession?.projects?.name || activeSession?.service_plans?.name || '';

  const cardBg = Colors?.white || Colors?.cardBackground || '#FFFFFF';
  const textPrimary = Colors?.primaryText || '#111827';
  const textSecondary = Colors?.secondaryText || '#6B7280';
  const borderColor = Colors?.border || '#E5E7EB';
  const buttonBg = Colors?.primaryBlue || '#1E40AF';

  return (
    <View style={[styles.card, { backgroundColor: cardBg }]} pointerEvents={editMode ? 'none' : 'auto'}>
      <View style={styles.topRow}>
        <View style={styles.statusGroup}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusLabel, { color: textSecondary }]}>
            {isActive ? 'Active' : 'Offline'}
          </Text>
        </View>
        <View style={styles.todayHoursGroup}>
          <Text style={[styles.todayLabel, { color: textSecondary }]}>Today</Text>
          <Text style={[styles.todayValue, { color: textPrimary }]}>
            {formatHoursMinutes ? formatHoursMinutes(supervisorTodayHours || 0) : `${(supervisorTodayHours || 0).toFixed(1)}h`}
          </Text>
        </View>
      </View>

      <View style={styles.timerBlock}>
        <Text style={[styles.timerText, { color: textPrimary }]}>
          {isActive ? elapsedTime : '--:--:--'}
        </Text>
        {projectName ? (
          <Text style={[styles.projectText, { color: textSecondary }]} numberOfLines={1}>
            <Ionicons name="briefcase-outline" size={12} color={textSecondary} /> {projectName}
          </Text>
        ) : null}
      </View>

      <TouchableOpacity
        style={[styles.actionButton, { backgroundColor: isActive ? '#EF4444' : buttonBg }]}
        onPress={isActive ? onClockOutPress : onClockInPress}
        disabled={editMode || clockLoading}
        activeOpacity={0.85}
      >
        {clockLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons
              name={isActive ? 'stop-circle-outline' : 'play-circle-outline'}
              size={18}
              color="#fff"
            />
            <Text style={styles.actionButtonText}>
              {isActive ? 'Clock Out' : 'Clock In'}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 16,
    padding: 16,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  todayHoursGroup: {
    alignItems: 'flex-end',
  },
  todayLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  todayValue: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  timerBlock: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  timerText: {
    fontSize: 44,
    fontWeight: '300',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
  },
  projectText: {
    fontSize: 12,
    marginTop: 4,
    maxWidth: '80%',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
});
