import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function WorkerScheduleCard({ worker, onPress }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [elapsedTime, setElapsedTime] = useState('');

  // Update elapsed time every minute for active workers
  useEffect(() => {
    if (!worker.isActive || !worker.clockInTime) return;

    const updateTime = () => {
      const clockIn = new Date(worker.clockInTime);
      const now = new Date();
      const diff = now - clockIn;

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      setElapsedTime(`${hours}h ${minutes}m`);
    };

    updateTime();
    const interval = setInterval(updateTime, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [worker.isActive, worker.clockInTime]);

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return '#10B981';
      case 'inactive':
        return '#6B7280';
      case 'pending':
        return '#F59E0B';
      default:
        return Colors.primaryBlue;
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const statusColor = getStatusColor(worker.status);
  const hasNotes = worker.latestClockIn?.notes;

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Status Bar */}
      <View style={[styles.statusBar, { backgroundColor: statusColor }]} />

      <View style={styles.content}>
        {/* Header Row */}
        <View style={styles.header}>
          {/* Avatar */}
          <View style={[styles.avatar, { backgroundColor: statusColor }]}>
            <Text style={styles.avatarText}>{getInitials(worker.full_name)}</Text>
            {worker.isActive && (
              <View style={styles.activePulse}>
                <View style={[styles.pulseDot, { backgroundColor: '#10B981' }]} />
              </View>
            )}
          </View>

          {/* Worker Info */}
          <View style={styles.workerInfo}>
            <Text style={[styles.workerName, { color: Colors.primaryText }]} numberOfLines={1}>
              {worker.full_name}
            </Text>
            {worker.trade && (
              <View style={styles.tradeRow}>
                <Ionicons name="hammer" size={12} color={Colors.secondaryText} />
                <Text style={[styles.tradeText, { color: Colors.secondaryText }]} numberOfLines={1}>
                  {worker.trade}
                </Text>
              </View>
            )}
          </View>

          {/* Clock-in Time */}
          {worker.clockInTime && (
            <View style={styles.timeColumn}>
              <Text style={[styles.timeLabel, { color: Colors.secondaryText }]}>Clocked In</Text>
              <Text style={[styles.timeValue, { color: Colors.primaryText }]}>
                {formatTime(worker.clockInTime)}
              </Text>
            </View>
          )}
        </View>

        {/* Hours and Status Row */}
        <View style={styles.statsRow}>
          {/* Hours Worked */}
          <View style={[styles.statBadge, { backgroundColor: Colors.primaryBlue + '15' }]}>
            <Ionicons name="time" size={14} color={Colors.primaryBlue} />
            <Text style={[styles.statText, { color: Colors.primaryBlue }]}>
              {worker.isActive ? elapsedTime : `${Math.round(worker.hoursWorked * 10) / 10}h`}
            </Text>
          </View>

          {/* Status Badge */}
          {worker.isActive && (
            <View style={[styles.statBadge, { backgroundColor: '#10B981' + '15' }]}>
              <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
              <Text style={[styles.statText, { color: '#10B981' }]}>Active</Text>
            </View>
          )}
        </View>

        {/* Notes Preview */}
        {hasNotes && (
          <View style={[styles.notesPreview, { backgroundColor: Colors.lightGray }]}>
            <Text style={[styles.notesText, { color: Colors.secondaryText }]} numberOfLines={2}>
              {worker.latestClockIn.notes}
            </Text>
          </View>
        )}
      </View>

      {/* Chevron */}
      <View style={styles.chevron}>
        <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusBar: {
    width: 4,
  },
  content: {
    flex: 1,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    position: 'relative',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activePulse: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 2,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  workerInfo: {
    flex: 1,
  },
  workerName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  tradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tradeText: {
    fontSize: 13,
  },
  timeColumn: {
    alignItems: 'flex-end',
  },
  timeLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  notesPreview: {
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
  },
  notesText: {
    fontSize: 13,
    lineHeight: 18,
  },
  chevron: {
    justifyContent: 'center',
    paddingRight: 12,
  },
});
