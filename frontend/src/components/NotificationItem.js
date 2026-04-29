import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { LightColors, getColors } from '../constants/theme';

// Notification type configurations
const NOTIFICATION_CONFIG = {
  appointment_reminder: {
    icon: 'calendar',
    color: '#3B82F6', // blue
    label: 'Appointment',
  },
  daily_report_submitted: {
    icon: 'document-text',
    color: '#10B981', // green
    label: 'Daily Report',
  },
  project_warning: {
    icon: 'warning',
    color: '#F59E0B', // orange
    label: 'Warning',
  },
  financial_update: {
    icon: 'cash',
    color: '#8B5CF6', // purple
    label: 'Financial',
  },
  worker_update: {
    icon: 'person',
    color: '#6366F1', // indigo
    label: 'Worker',
  },
  system: {
    icon: 'information-circle',
    color: '#6B7280', // gray
    label: 'System',
  },
  // ─── Billing types ───
  draw_ready: {
    icon: 'cash-outline',
    color: '#10B981', // green
    label: 'Draw ready',
  },
  draw_stale: {
    icon: 'time-outline',
    color: '#F59E0B', // amber
    label: 'Draw waiting',
  },
  invoice_overdue: {
    icon: 'alert-circle-outline',
    color: '#EF4444', // red
    label: 'Overdue',
  },
  co_response_received: {
    icon: 'checkmark-circle-outline',
    color: '#10B981', // green
    label: 'Change order',
  },
  co_pending_response: {
    icon: 'mail-unread-outline',
    color: '#F59E0B', // amber
    label: 'Awaiting client',
  },
  bank_reconciliation: {
    icon: 'wallet-outline',
    color: '#8B5CF6',
    label: 'Reconciliation',
  },
  task_update: {
    icon: 'list-outline',
    color: '#6366F1',
    label: 'Task',
  },
};

// Map action_type → CTA label + visual style. Drives the inline one-tap button.
const CTA_CONFIG = {
  send_draw:     { label: 'Send invoice', bg: '#1E40AF' },
  nudge_invoice: { label: 'Nudge client', bg: '#D97706' },
  resend_co:     { label: 'Resend',       bg: '#F59E0B' },
  bill_co_now:   { label: 'Bill now',     bg: '#1E40AF' },
};

export default function NotificationItem({
  notification,
  onPress,
  onDelete,
  onAction,
  showSwipeHint = false,
}) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const config = NOTIFICATION_CONFIG[notification.type] || NOTIFICATION_CONFIG.system;
  const ctaCfg = !notification.read && CTA_CONFIG[notification.action_type];
  const [busy, setBusy] = React.useState(false);

  const handleCta = async (e) => {
    e.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    try { await onAction?.(notification); }
    finally { setBusy(false); }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: notification.read ? Colors.background : Colors.white,
          borderLeftColor: config.color,
        },
      ]}
      onPress={() => onPress?.(notification)}
      activeOpacity={0.7}
    >
      {/* Icon */}
      <View style={[styles.iconContainer, { backgroundColor: config.color + '20' }]}>
        <Ionicons name={config.icon} size={22} color={config.color} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.header}>
          <Text
            style={[
              styles.title,
              {
                color: Colors.primaryText,
                fontWeight: notification.read ? '500' : '700',
              },
            ]}
            numberOfLines={1}
          >
            {notification.title}
          </Text>
          <Text style={[styles.time, { color: Colors.secondaryText }]}>
            {formatTime(notification.created_at)}
          </Text>
        </View>

        <Text
          style={[
            styles.body,
            {
              color: Colors.secondaryText,
              fontWeight: notification.read ? '400' : '500',
            },
          ]}
          numberOfLines={2}
        >
          {notification.body}
        </Text>

        {/* Type label + inline CTA for actionable billing notifications */}
        <View style={styles.footer}>
          <View style={[styles.typeLabel, { backgroundColor: config.color + '15' }]}>
            <Text style={[styles.typeLabelText, { color: config.color }]}>
              {config.label}
            </Text>
          </View>

          {!notification.read && <View style={styles.unreadDot} />}

          {ctaCfg && onAction && (
            <TouchableOpacity
              style={[styles.cta, { backgroundColor: busy ? '#94A3B8' : ctaCfg.bg }]}
              onPress={handleCta}
              disabled={busy}
              activeOpacity={0.8}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={styles.ctaText}>{busy ? '…' : ctaCfg.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Delete button */}
      {onDelete && (
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => onDelete(notification.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={18} color={Colors.secondaryText} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: 16,
    borderLeftWidth: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeLabel: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  typeLabelText: {
    fontSize: 11,
    fontWeight: '600',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#3B82F6',
  },
  cta: {
    marginLeft: 'auto',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  ctaText: {
    color: '#fff', fontSize: 12, fontWeight: '700',
  },
  deleteButton: {
    padding: 4,
    marginLeft: 8,
  },
});
