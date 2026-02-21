import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import DateTimePicker from '@react-native-community/datetimepicker';

export default function AddPersonalEventModal({ visible, onClose, onSave, initialDate }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [eventType, setEventType] = useState('meeting');
  const [allDay, setAllDay] = useState(false);
  const [selectedDate, setSelectedDate] = useState(initialDate || new Date());
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(() => {
    const end = new Date();
    end.setHours(end.getHours() + 1);
    return end;
  });
  const [selectedColor, setSelectedColor] = useState('#10B981');

  // Date/Time picker visibility
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);

  const eventTypes = [
    { value: 'meeting', label: 'Meeting', icon: 'people' },
    { value: 'appointment', label: 'Appointment', icon: 'calendar' },
    { value: 'site_visit', label: 'Site Visit', icon: 'location' },
    { value: 'phone_call', label: 'Phone Call', icon: 'call' },
    { value: 'other', label: 'Other', icon: 'ellipsis-horizontal' },
  ];

  const colors = [
    { value: '#10B981', label: 'Green' },
    { value: '#3B82F6', label: 'Blue' },
    { value: '#F59E0B', label: 'Orange' },
    { value: '#EF4444', label: 'Red' },
    { value: '#8B5CF6', label: 'Purple' },
    { value: '#EC4899', label: 'Pink' },
  ];

  const handleSave = () => {
    // Validation
    if (!title.trim()) {
      Alert.alert(t('alerts.requiredField', 'Required Field'), t('messages.pleaseEnter', { item: t('schedule:eventTitle', 'event title') }));
      return;
    }

    // Combine date and time
    const startDatetime = new Date(selectedDate);
    if (!allDay) {
      startDatetime.setHours(startTime.getHours());
      startDatetime.setMinutes(startTime.getMinutes());
    } else {
      startDatetime.setHours(0, 0, 0, 0);
    }

    let endDatetime = null;
    if (!allDay) {
      endDatetime = new Date(selectedDate);
      endDatetime.setHours(endTime.getHours());
      endDatetime.setMinutes(endTime.getMinutes());
    }

    const eventData = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      eventType,
      startDatetime: startDatetime.toISOString(),
      endDatetime: endDatetime ? endDatetime.toISOString() : null,
      allDay,
      color: selectedColor,
    };

    onSave(eventData);
    handleClose();
  };

  const handleClose = () => {
    // Reset form
    setTitle('');
    setDescription('');
    setLocation('');
    setEventType('meeting');
    setAllDay(false);
    setSelectedDate(initialDate || new Date());
    setStartTime(new Date());
    const end = new Date();
    end.setHours(end.getHours() + 1);
    setEndTime(end);
    setSelectedColor('#10B981');
    onClose();
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          {/* Header */}
          <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
              <Text style={[styles.headerButtonText, { color: Colors.secondaryText }]}>{t('buttons.cancel', 'Cancel')}</Text>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('schedule:addPersonalEvent', 'Add Personal Event')}</Text>
            <TouchableOpacity onPress={handleSave} style={styles.headerButton}>
              <Text style={[styles.headerButtonText, styles.saveButton, { color: Colors.primaryBlue }]}>{t('buttons.save', 'Save')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Title */}
            <View style={styles.section}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('schedule:title', 'Title')} *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                value={title}
                onChangeText={setTitle}
                placeholder={t('schedule:titlePlaceholder', 'e.g., Client meeting, Site visit')}
                placeholderTextColor={Colors.secondaryText}
              />
            </View>

            {/* Event Type */}
            <View style={styles.section}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('schedule:eventType', 'Event Type')}</Text>
              <View style={styles.eventTypeGrid}>
                {eventTypes.map((type) => (
                  <TouchableOpacity
                    key={type.value}
                    style={[
                      styles.eventTypeButton,
                      { backgroundColor: Colors.white, borderColor: Colors.border },
                      eventType === type.value && { borderColor: Colors.primaryBlue, backgroundColor: Colors.primaryBlue + '10' }
                    ]}
                    onPress={() => setEventType(type.value)}
                  >
                    <Ionicons
                      name={type.icon}
                      size={20}
                      color={eventType === type.value ? Colors.primaryBlue : Colors.secondaryText}
                    />
                    <Text style={[
                      styles.eventTypeText,
                      { color: Colors.secondaryText },
                      eventType === type.value && { color: Colors.primaryBlue, fontWeight: '600' }
                    ]}>
                      {t(`schedule:eventTypes.${type.value}`, type.label)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Date */}
            <View style={styles.section}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('labels.date', 'Date')}</Text>
              <TouchableOpacity
                style={[styles.dateTimeButton, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                onPress={() => setShowDatePicker(true)}
              >
                <Ionicons name="calendar-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.dateTimeText, { color: Colors.primaryText }]}>
                  {formatDate(selectedDate)}
                </Text>
              </TouchableOpacity>
            </View>

            {/* All Day Toggle */}
            <View style={styles.section}>
              <View style={styles.switchRow}>
                <View>
                  <Text style={[styles.label, { color: Colors.primaryText }]}>{t('schedule:allDayEvent', 'All Day Event')}</Text>
                  <Text style={[styles.hint, { color: Colors.secondaryText }]}>
                    {t('schedule:allDayHint', 'Event runs from 12:00 AM to 11:59 PM')}
                  </Text>
                </View>
                <Switch
                  value={allDay}
                  onValueChange={setAllDay}
                  trackColor={{ false: Colors.border, true: Colors.primaryBlue + '60' }}
                  thumbColor={allDay ? Colors.primaryBlue : Colors.lightGray}
                />
              </View>
            </View>

            {/* Time (if not all day) */}
            {!allDay && (
              <View style={styles.section}>
                <Text style={[styles.label, { color: Colors.primaryText }]}>{t('labels.time', 'Time')}</Text>
                <View style={styles.timeRow}>
                  <TouchableOpacity
                    style={[styles.timeButton, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                    onPress={() => setShowStartTimePicker(true)}
                  >
                    <Ionicons name="time-outline" size={20} color={Colors.primaryBlue} />
                    <View style={styles.timeTextContainer}>
                      <Text style={[styles.timeLabel, { color: Colors.secondaryText }]}>{t('schedule:start', 'Start')}</Text>
                      <Text style={[styles.timeText, { color: Colors.primaryText }]}>
                        {formatTime(startTime)}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <Ionicons name="arrow-forward" size={20} color={Colors.secondaryText} />

                  <TouchableOpacity
                    style={[styles.timeButton, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                    onPress={() => setShowEndTimePicker(true)}
                  >
                    <Ionicons name="time-outline" size={20} color={Colors.primaryBlue} />
                    <View style={styles.timeTextContainer}>
                      <Text style={[styles.timeLabel, { color: Colors.secondaryText }]}>{t('schedule:end', 'End')}</Text>
                      <Text style={[styles.timeText, { color: Colors.primaryText }]}>
                        {formatTime(endTime)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* Location */}
            <View style={styles.section}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('schedule:location', 'Location')}</Text>
              <TextInput
                style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                value={location}
                onChangeText={setLocation}
                placeholder={t('schedule:locationPlaceholder', 'e.g., Office, Client site')}
                placeholderTextColor={Colors.secondaryText}
              />
            </View>

            {/* Description */}
            <View style={styles.section}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('labels.description', 'Description')}</Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                value={description}
                onChangeText={setDescription}
                placeholder={t('schedule:descriptionPlaceholder', 'Add notes or details about this event')}
                placeholderTextColor={Colors.secondaryText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>

            {/* Color */}
            <View style={styles.section}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('schedule:color', 'Color')}</Text>
              <View style={styles.colorGrid}>
                {colors.map((color) => (
                  <TouchableOpacity
                    key={color.value}
                    style={[
                      styles.colorButton,
                      { backgroundColor: color.value },
                      selectedColor === color.value && styles.colorButtonSelected
                    ]}
                    onPress={() => setSelectedColor(color.value)}
                  >
                    {selectedColor === color.value && (
                      <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Overlay for pickers */}
          {(showDatePicker || showStartTimePicker || showEndTimePicker) && (
            <TouchableOpacity
              style={styles.pickerOverlay}
              activeOpacity={1}
              onPress={() => {
                setShowDatePicker(false);
                setShowStartTimePicker(false);
                setShowEndTimePicker(false);
              }}
            />
          )}

          {/* Date Picker */}
          {showDatePicker && Platform.OS === 'ios' && (
            <View style={[styles.pickerContainer, { backgroundColor: Colors.white }]}>
              <View style={[styles.pickerHeader, { borderBottomColor: Colors.border }]}>
                <Text style={[styles.pickerTitle, { color: Colors.primaryText }]}>{t('schedule:selectDate', 'Select Date')}</Text>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(false)}
                  style={[styles.pickerDoneButton, { backgroundColor: Colors.primaryBlue }]}
                >
                  <Text style={styles.pickerDoneButtonText}>{t('buttons.done', 'Done')}</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.pickerWrapper, { backgroundColor: Colors.inputBackground }]}>
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
            </View>
          )}

          {/* Start Time Picker */}
          {showStartTimePicker && Platform.OS === 'ios' && (
            <View style={[styles.pickerContainer, { backgroundColor: Colors.white }]}>
              <View style={[styles.pickerHeader, { borderBottomColor: Colors.border }]}>
                <Text style={[styles.pickerTitle, { color: Colors.primaryText }]}>{t('schedule:selectStartTime', 'Select Start Time')}</Text>
                <TouchableOpacity
                  onPress={() => setShowStartTimePicker(false)}
                  style={[styles.pickerDoneButton, { backgroundColor: Colors.primaryBlue }]}
                >
                  <Text style={styles.pickerDoneButtonText}>{t('buttons.done', 'Done')}</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.pickerWrapper, { backgroundColor: Colors.inputBackground }]}>
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
            </View>
          )}

          {/* End Time Picker */}
          {showEndTimePicker && Platform.OS === 'ios' && (
            <View style={[styles.pickerContainer, { backgroundColor: Colors.white }]}>
              <View style={[styles.pickerHeader, { borderBottomColor: Colors.border }]}>
                <Text style={[styles.pickerTitle, { color: Colors.primaryText }]}>{t('schedule:selectEndTime', 'Select End Time')}</Text>
                <TouchableOpacity
                  onPress={() => setShowEndTimePicker(false)}
                  style={[styles.pickerDoneButton, { backgroundColor: Colors.primaryBlue }]}
                >
                  <Text style={styles.pickerDoneButtonText}>{t('buttons.done', 'Done')}</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.pickerWrapper, { backgroundColor: Colors.inputBackground }]}>
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
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  headerButton: {
    minWidth: 60,
  },
  headerButtonText: {
    fontSize: FontSizes.md,
  },
  saveButton: {
    fontWeight: '600',
    textAlign: 'right',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  section: {
    marginTop: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  hint: {
    fontSize: FontSizes.sm,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.md,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.md,
    minHeight: 100,
  },
  eventTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  eventTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
  },
  eventTypeText: {
    fontSize: FontSizes.sm,
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  colorGrid: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  colorButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorButtonSelected: {
    borderWidth: 3,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  pickerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pickerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 34,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  pickerWrapper: {
    height: 216,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  pickerTitle: {
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
