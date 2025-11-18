import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function WorkerCard({ worker, onPress, isClocked = false }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  // Status color mapping
  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return '#10B981'; // Green
      case 'inactive':
        return '#6B7280'; // Gray
      case 'pending':
        return '#F59E0B'; // Orange
      case 'rejected':
        return '#EF4444'; // Red
      default:
        return Colors.primaryBlue;
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active':
        return 'checkmark-circle';
      case 'inactive':
        return 'pause-circle';
      case 'pending':
        return 'time';
      case 'rejected':
        return 'close-circle';
      default:
        return 'person';
    }
  };

  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getPaymentDisplay = () => {
    const paymentType = worker.payment_type || 'hourly';

    switch (paymentType) {
      case 'hourly':
        return worker.hourly_rate > 0 ? `$${worker.hourly_rate}/hr` : null;
      case 'daily':
        return worker.daily_rate > 0 ? `$${worker.daily_rate}/day` : null;
      case 'weekly':
        return worker.weekly_salary > 0 ? `$${worker.weekly_salary}/wk` : null;
      case 'project_based':
        return worker.project_rate > 0 ? `$${worker.project_rate}/proj` : null;
      default:
        return worker.hourly_rate > 0 ? `$${worker.hourly_rate}/hr` : null;
    }
  };

  const statusColor = getStatusColor(worker.status);
  const statusIcon = getStatusIcon(worker.status);
  const paymentDisplay = getPaymentDisplay();

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: Colors.white }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Status Bar */}
      <View style={[styles.statusBar, { backgroundColor: statusColor }]} />

      {/* Content */}
      <View style={styles.content}>
        {/* Avatar and Header */}
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: statusColor }]}>
            <Text style={styles.avatarText}>{getInitials(worker.full_name)}</Text>
          </View>
          {isClocked && (
            <View style={[styles.clockedBadge, { backgroundColor: '#10B981' }]}>
              <View style={styles.pulseDot} />
            </View>
          )}
        </View>

        {/* Worker Name */}
        <Text style={[styles.workerName, { color: Colors.primaryText }]} numberOfLines={1}>
          {worker.full_name}
        </Text>

        {/* Trade */}
        {worker.trade && (
          <View style={styles.tradeRow}>
            <Ionicons name="hammer-outline" size={12} color={Colors.secondaryText} />
            <Text style={[styles.tradeText, { color: Colors.secondaryText }]} numberOfLines={1}>
              {worker.trade}
            </Text>
          </View>
        )}

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Footer - Status and Rate */}
        <View style={styles.footer}>
          <View style={styles.statusRow}>
            <Ionicons name={statusIcon} size={12} color={statusColor} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {worker.status}
            </Text>
          </View>
          {paymentDisplay && (
            <Text style={[styles.rateText, { color: Colors.primaryBlue }]}>
              {paymentDisplay}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    minHeight: 160,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.12)',
  },
  statusBar: {
    height: 4,
    width: '100%',
  },
  content: {
    flex: 1,
    padding: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  clockedBadge: {
    width: 10,
    height: 10,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
  },
  workerName: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  tradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  tradeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  spacer: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  rateText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
