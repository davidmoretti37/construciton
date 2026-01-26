import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function AppointmentCard({ data, onAction }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const {
    id,
    title,
    description,
    event_type,
    location,
    address,
    formatted_address,
    start_datetime,
    end_datetime,
    all_day,
    color = '#3B82F6',
  } = data || {};

  // Format date/time
  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  // Get event type icon
  const getEventIcon = () => {
    switch (event_type) {
      case 'appointment':
        return 'calendar';
      case 'meeting':
        return 'people';
      case 'site_visit':
        return 'location';
      case 'inspection':
        return 'clipboard';
      case 'delivery':
        return 'cube';
      default:
        return 'calendar-outline';
    }
  };

  // Open address in maps
  const openInMaps = () => {
    const mapAddress = formatted_address || address || location;
    if (!mapAddress) return;

    const encodedAddress = encodeURIComponent(mapAddress);
    const url = Platform.select({
      ios: `maps:0,0?q=${encodedAddress}`,
      android: `geo:0,0?q=${encodedAddress}`,
    });

    Linking.openURL(url).catch(() => {
      // Fallback to Google Maps web
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`);
    });
  };

  const displayAddress = formatted_address || address || location;
  const dateStr = formatDateTime(start_datetime);
  const startTime = formatTime(start_datetime);
  const endTime = formatTime(end_datetime);

  return (
    <View style={[styles.container, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
      {/* Header with color accent */}
      <View style={[styles.header, { backgroundColor: color + '15', borderLeftColor: color }]}>
        <View style={[styles.iconContainer, { backgroundColor: color }]}>
          <Ionicons name={getEventIcon()} size={24} color="#fff" />
        </View>
        <View style={styles.headerContent}>
          <Text style={[styles.eventType, { color: color }]}>
            {(event_type || 'appointment').replace('_', ' ').toUpperCase()}
          </Text>
          <Text style={[styles.title, { color: Colors.primaryText }]}>{title}</Text>
        </View>
      </View>

      {/* Date & Time */}
      <View style={[styles.section, { borderTopColor: Colors.border }]}>
        <View style={styles.row}>
          <Ionicons name="calendar-outline" size={20} color={Colors.secondaryText} />
          <View style={styles.rowContent}>
            <Text style={[styles.label, { color: Colors.secondaryText }]}>Date</Text>
            <Text style={[styles.value, { color: Colors.primaryText }]}>{dateStr}</Text>
          </View>
        </View>
        {!all_day && (
          <View style={styles.row}>
            <Ionicons name="time-outline" size={20} color={Colors.secondaryText} />
            <View style={styles.rowContent}>
              <Text style={[styles.label, { color: Colors.secondaryText }]}>Time</Text>
              <Text style={[styles.value, { color: Colors.primaryText }]}>
                {startTime}{endTime ? ` - ${endTime}` : ''}
              </Text>
            </View>
          </View>
        )}
        {all_day && (
          <View style={[styles.allDayBadge, { backgroundColor: color + '20' }]}>
            <Text style={[styles.allDayText, { color: color }]}>All Day</Text>
          </View>
        )}
      </View>

      {/* Location/Address */}
      {displayAddress && (
        <TouchableOpacity
          style={[styles.section, styles.addressSection, { borderTopColor: Colors.border, backgroundColor: Colors.lightGray }]}
          onPress={openInMaps}
          activeOpacity={0.7}
        >
          <View style={styles.row}>
            <Ionicons name="location" size={20} color={color} />
            <View style={styles.rowContent}>
              <Text style={[styles.label, { color: Colors.secondaryText }]}>Location</Text>
              <Text style={[styles.addressText, { color: Colors.primaryText }]}>{displayAddress}</Text>
            </View>
            <Ionicons name="navigate" size={20} color={color} />
          </View>
          <Text style={[styles.tapHint, { color: color }]}>Tap to open in Maps</Text>
        </TouchableOpacity>
      )}

      {/* Description */}
      {description && (
        <View style={[styles.section, { borderTopColor: Colors.border }]}>
          <View style={styles.row}>
            <Ionicons name="document-text-outline" size={20} color={Colors.secondaryText} />
            <View style={styles.rowContent}>
              <Text style={[styles.label, { color: Colors.secondaryText }]}>Notes</Text>
              <Text style={[styles.description, { color: Colors.primaryText }]}>{description}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={() => onAction && onAction({ type: 'reschedule-appointment', data })}
        >
          <Ionicons name="calendar" size={18} color="#fff" />
          <Text style={styles.actionText}>Reschedule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#EF4444' }]}
          onPress={() => onAction && onAction({ type: 'cancel-appointment', data })}
        >
          <Ionicons name="close-circle" size={18} color="#fff" />
          <Text style={styles.actionText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginVertical: Spacing.sm,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderLeftWidth: 4,
    gap: Spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerContent: {
    flex: 1,
  },
  eventType: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
  },
  title: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  section: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  addressSection: {
    paddingBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  rowContent: {
    flex: 1,
  },
  label: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  value: {
    fontSize: FontSizes.body,
    fontWeight: '500',
  },
  addressText: {
    fontSize: FontSizes.body,
    fontWeight: '500',
    lineHeight: 22,
  },
  tapHint: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
    marginTop: Spacing.xs,
    marginLeft: 32,
  },
  description: {
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  allDayBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
    marginLeft: 32,
  },
  allDayText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  actionText: {
    color: '#fff',
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
});
