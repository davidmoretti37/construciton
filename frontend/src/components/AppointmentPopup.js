import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const AppointmentPopup = ({
  visible,
  appointment,
  onClose,
  onReschedule,
  onCancel,
  loading = false
}) => {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  // Reschedule mode state
  const [isRescheduleMode, setIsRescheduleMode] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date());
  const [saving, setSaving] = useState(false);

  // Picker visibility
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  // Initialize dates when appointment changes
  useEffect(() => {
    if (appointment) {
      const start = new Date(appointment.start_datetime);
      const end = appointment.end_datetime ? new Date(appointment.end_datetime) : new Date(start.getTime() + 60 * 60 * 1000);
      setSelectedDate(start);
      setStartTime(start);
      setEndTime(end);
    }
  }, [appointment]);

  // Reset state when modal closes
  useEffect(() => {
    if (!visible) {
      setIsRescheduleMode(false);
      setShowDatePicker(false);
      setShowStartTimePicker(false);
      setShowEndTimePicker(false);
    }
  }, [visible]);

  if (!appointment) return null;

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
  } = appointment;

  // Format date/time helpers
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

  const formatDateShort = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTimeShort = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
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
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`);
    });
  };

  const displayAddress = formatted_address || address || location;
  const dateStr = formatDateTime(start_datetime);
  const startTimeStr = formatTime(start_datetime);
  const endTimeStr = formatTime(end_datetime);

  // Handle save reschedule
  const handleSaveReschedule = async () => {
    setSaving(true);

    // Build updated datetime
    const newStartDatetime = new Date(selectedDate);
    if (!all_day) {
      newStartDatetime.setHours(startTime.getHours());
      newStartDatetime.setMinutes(startTime.getMinutes());
      newStartDatetime.setSeconds(0);
    } else {
      newStartDatetime.setHours(0, 0, 0, 0);
    }

    let newEndDatetime = null;
    if (!all_day) {
      newEndDatetime = new Date(selectedDate);
      newEndDatetime.setHours(endTime.getHours());
      newEndDatetime.setMinutes(endTime.getMinutes());
      newEndDatetime.setSeconds(0);
    }

    const updates = {
      start_datetime: newStartDatetime.toISOString(),
      end_datetime: newEndDatetime ? newEndDatetime.toISOString() : null,
    };

    await onReschedule(id, updates);
    setSaving(false);
  };

  // Render view mode content
  const renderViewMode = () => (
    <>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: color }]}>
          <Ionicons name={getEventIcon()} size={28} color="#fff" />
        </View>
        <View style={styles.headerContent}>
          <Text style={[styles.eventType, { color: color }]}>
            {(event_type || 'appointment').replace('_', ' ').toUpperCase()}
          </Text>
          <Text style={[styles.title, { color: Colors.primaryText }]} numberOfLines={2}>
            {title}
          </Text>
        </View>
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Ionicons name="close" size={24} color={Colors.secondaryText} />
        </TouchableOpacity>
      </View>

      {/* Date & Time */}
      <View style={[styles.section, { borderTopColor: Colors.border }]}>
        <View style={styles.row}>
          <Ionicons name="calendar-outline" size={22} color={color} />
          <View style={styles.rowContent}>
            <Text style={[styles.label, { color: Colors.secondaryText }]}>Date</Text>
            <Text style={[styles.value, { color: Colors.primaryText }]}>{dateStr}</Text>
          </View>
        </View>
        {!all_day && (
          <View style={[styles.row, { marginTop: Spacing.md }]}>
            <Ionicons name="time-outline" size={22} color={color} />
            <View style={styles.rowContent}>
              <Text style={[styles.label, { color: Colors.secondaryText }]}>Time</Text>
              <Text style={[styles.value, { color: Colors.primaryText }]}>
                {startTimeStr}{endTimeStr ? ` - ${endTimeStr}` : ''}
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

      {/* Location */}
      {displayAddress && (
        <TouchableOpacity
          style={[styles.section, styles.locationSection, { borderTopColor: Colors.border, backgroundColor: Colors.lightGray }]}
          onPress={openInMaps}
          activeOpacity={0.7}
        >
          <View style={styles.row}>
            <Ionicons name="location" size={22} color={color} />
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
            <Ionicons name="document-text-outline" size={22} color={Colors.secondaryText} />
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
          onPress={() => setIsRescheduleMode(true)}
          disabled={loading}
        >
          <Ionicons name="calendar" size={18} color="#fff" />
          <Text style={styles.actionText}>Reschedule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#EF4444' }]}
          onPress={() => onCancel(id)}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="close-circle" size={18} color="#fff" />
              <Text style={styles.actionText}>Cancel</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  // Render reschedule mode content
  const renderRescheduleMode = () => (
    <>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setIsRescheduleMode(false)}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.rescheduleTitle, { color: Colors.primaryText }]}>
          Reschedule
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.rescheduleContent}>
        {/* Current title */}
        <Text style={[styles.currentEventTitle, { color: Colors.secondaryText }]}>
          {title}
        </Text>

        {/* Date Picker */}
        <View style={styles.pickerSection}>
          <Text style={[styles.pickerLabel, { color: Colors.primaryText }]}>Date</Text>
          <TouchableOpacity
            style={[styles.dateTimeButton, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={() => setShowDatePicker(true)}
          >
            <Ionicons name="calendar-outline" size={20} color={color} />
            <Text style={[styles.dateTimeText, { color: Colors.primaryText }]}>
              {formatDateShort(selectedDate)}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Time Pickers (if not all day) */}
        {!all_day && (
          <View style={styles.pickerSection}>
            <Text style={[styles.pickerLabel, { color: Colors.primaryText }]}>Time</Text>
            <View style={styles.timeRow}>
              <TouchableOpacity
                style={[styles.timeButton, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                onPress={() => setShowStartTimePicker(true)}
              >
                <Ionicons name="time-outline" size={20} color={color} />
                <View style={styles.timeTextContainer}>
                  <Text style={[styles.timeLabel, { color: Colors.secondaryText }]}>Start</Text>
                  <Text style={[styles.timeText, { color: Colors.primaryText }]}>
                    {formatTimeShort(startTime)}
                  </Text>
                </View>
              </TouchableOpacity>

              <Ionicons name="arrow-forward" size={20} color={Colors.secondaryText} />

              <TouchableOpacity
                style={[styles.timeButton, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                onPress={() => setShowEndTimePicker(true)}
              >
                <Ionicons name="time-outline" size={20} color={color} />
                <View style={styles.timeTextContainer}>
                  <Text style={[styles.timeLabel, { color: Colors.secondaryText }]}>End</Text>
                  <Text style={[styles.timeText, { color: Colors.primaryText }]}>
                    {formatTimeShort(endTime)}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Save Button */}
      <View style={styles.rescheduleActions}>
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: color }]}
          onPress={handleSaveReschedule}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* iOS Date/Time Pickers */}
      {showDatePicker && Platform.OS === 'ios' && (
        <View style={[styles.pickerContainer, { backgroundColor: Colors.white }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: Colors.border }]}>
            <Text style={[styles.pickerHeaderTitle, { color: Colors.primaryText }]}>Select Date</Text>
            <TouchableOpacity
              onPress={() => setShowDatePicker(false)}
              style={[styles.pickerDoneButton, { backgroundColor: color }]}
            >
              <Text style={styles.pickerDoneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="spinner"
            themeVariant={isDark ? 'dark' : 'light'}
            onChange={(event, date) => {
              if (date) setSelectedDate(date);
            }}
          />
        </View>
      )}

      {showStartTimePicker && Platform.OS === 'ios' && (
        <View style={[styles.pickerContainer, { backgroundColor: Colors.white }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: Colors.border }]}>
            <Text style={[styles.pickerHeaderTitle, { color: Colors.primaryText }]}>Select Start Time</Text>
            <TouchableOpacity
              onPress={() => setShowStartTimePicker(false)}
              style={[styles.pickerDoneButton, { backgroundColor: color }]}
            >
              <Text style={styles.pickerDoneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={startTime}
            mode="time"
            display="spinner"
            themeVariant={isDark ? 'dark' : 'light'}
            onChange={(event, time) => {
              if (time) setStartTime(time);
            }}
          />
        </View>
      )}

      {showEndTimePicker && Platform.OS === 'ios' && (
        <View style={[styles.pickerContainer, { backgroundColor: Colors.white }]}>
          <View style={[styles.pickerHeader, { borderBottomColor: Colors.border }]}>
            <Text style={[styles.pickerHeaderTitle, { color: Colors.primaryText }]}>Select End Time</Text>
            <TouchableOpacity
              onPress={() => setShowEndTimePicker(false)}
              style={[styles.pickerDoneButton, { backgroundColor: color }]}
            >
              <Text style={styles.pickerDoneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={endTime}
            mode="time"
            display="spinner"
            themeVariant={isDark ? 'dark' : 'light'}
            onChange={(event, time) => {
              if (time) setEndTime(time);
            }}
          />
        </View>
      )}

      {/* Android Date/Time Pickers */}
      {showDatePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={(event, date) => {
            setShowDatePicker(false);
            if (date) setSelectedDate(date);
          }}
        />
      )}

      {showStartTimePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={startTime}
          mode="time"
          display="default"
          onChange={(event, time) => {
            setShowStartTimePicker(false);
            if (time) setStartTime(time);
          }}
        />
      )}

      {showEndTimePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={endTime}
          mode="time"
          display="default"
          onChange={(event, time) => {
            setShowEndTimePicker(false);
            if (time) setEndTime(time);
          }}
        />
      )}
    </>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.popup, { backgroundColor: Colors.white }]}>
          {isRescheduleMode ? renderRescheduleMode() : renderViewMode()}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  popup: {
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
    marginBottom: 4,
  },
  title: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  closeButton: {
    padding: 4,
  },
  backButton: {
    padding: 4,
  },
  rescheduleTitle: {
    flex: 1,
    fontSize: FontSizes.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  section: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  locationSection: {
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
    marginBottom: 4,
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
    marginLeft: 34,
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
    marginLeft: 34,
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
  // Reschedule mode styles
  rescheduleContent: {
    paddingHorizontal: Spacing.lg,
    maxHeight: 300,
  },
  currentEventTitle: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  pickerSection: {
    marginBottom: Spacing.lg,
  },
  pickerLabel: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  dateTimeText: {
    fontSize: FontSizes.md,
    fontWeight: '500',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  timeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  timeTextContainer: {
    flex: 1,
  },
  timeLabel: {
    fontSize: FontSizes.xs,
    marginBottom: 2,
  },
  timeText: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  rescheduleActions: {
    padding: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  // Picker styles (iOS)
  pickerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  pickerHeaderTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
  },
  pickerDoneButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
  },
  pickerDoneButtonText: {
    color: '#FFFFFF',
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});

export default AppointmentPopup;
