import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function WorkerCard({ worker, onPress, isClocked = false, hidePayment = false }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = createStyles(Colors);

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
      style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {/* Content */}
      <View style={styles.content}>
        {/* Avatar */}
        <View style={styles.header}>
          <View style={styles.avatarWrapper}>
            <View style={[styles.avatar, { backgroundColor: statusColor }]}>
              <Text style={styles.avatarText}>{getInitials(worker.full_name)}</Text>
            </View>
            {isClocked && (
              <View style={[styles.clockedBadge, { borderColor: Colors.white }]} />
            )}
          </View>
        </View>

        {/* Worker Name */}
        <Text style={[styles.workerName, { color: Colors.primaryText }]} numberOfLines={1}>
          {worker.full_name}
        </Text>

        {/* Trade */}
        {worker.trade && (
          <View style={styles.tradeRow}>
            <Ionicons name="hammer-outline" size={11} color={Colors.secondaryText} />
            <Text style={[styles.tradeText, { color: Colors.secondaryText }]} numberOfLines={1}>
              {worker.trade}
            </Text>
          </View>
        )}

        {/* Spacer */}
        <View style={styles.spacer} />

        {/* Footer - Status and Rate pills */}
        <View style={styles.footer}>
          <View style={[styles.statusPill, { backgroundColor: `${statusColor}15` }]}>
            <Ionicons name={statusIcon} size={11} color={statusColor} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {worker.status}
            </Text>
          </View>
          {!hidePayment && paymentDisplay && (
            <View style={[styles.ratePill, { backgroundColor: `${Colors.primaryBlue}12` }]}>
              <Text style={[styles.rateText, { color: Colors.primaryBlue }]}>
                {paymentDisplay}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const createStyles = (Colors) => StyleSheet.create({
  card: {
    width: '48%',
    minHeight: 164,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    elevation: 1,
    shadowColor: Colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
  },
  content: {
    flex: 1,
    padding: 14,
    paddingTop: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  clockedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#10B981',
    borderWidth: 2.5,
  },
  workerName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
    letterSpacing: 0.1,
  },
  tradeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  tradeText: {
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.7,
  },
  spacer: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  ratePill: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  rateText: {
    fontSize: 10,
    fontWeight: '700',
  },
});
