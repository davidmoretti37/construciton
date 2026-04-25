import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Slider from '@react-native-community/slider';
import DateTimePicker from '@react-native-community/datetimepicker';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from '../../utils/notificationStorage';

export default function NotificationSettingsScreen({ navigation }) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(null); // 'start' or 'end'
  const [preferences, setPreferences] = useState({
    push_enabled: true,
    push_appointment_reminders: true,
    push_daily_reports: true,
    push_project_warnings: true,
    push_financial_updates: true,
    push_worker_updates: true,
    inapp_enabled: true,
    inapp_appointment_reminders: true,
    inapp_daily_reports: true,
    inapp_project_warnings: true,
    inapp_financial_updates: true,
    inapp_worker_updates: true,
    appointment_reminder_minutes: 30,
    appointment_reminder_with_travel: true,
    quiet_hours_enabled: false,
    quiet_hours_start: '22:00',
    quiet_hours_end: '07:00',
  });

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = async () => {
    try {
      const prefs = await getNotificationPreferences();
      if (prefs) {
        // Strip null values so they don't clobber sensible defaults
        // (`appointment_reminder_minutes: null` was rendering as "null minutes"
        // in the slider value label).
        const cleaned = Object.fromEntries(
          Object.entries(prefs).filter(([, v]) => v !== null && v !== undefined)
        );
        setPreferences(prev => ({ ...prev, ...cleaned }));
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToLoad', { item: 'notification preferences' }));
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = useCallback((key) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Consolidated category toggle: sets BOTH push_<x> and inapp_<x> to the
  // same value so the UI shows one row per category instead of duplicate
  // push + in-app toggles for the same thing. The DB keeps both fields,
  // so power users can still split channels via API if they ever want to.
  const handleCategoryToggle = useCallback((suffix) => {
    setPreferences(prev => {
      const pushKey = `push_${suffix}`;
      const inappKey = `inapp_${suffix}`;
      // Use whichever is currently true to determine "is the category on?";
      // toggle BOTH to the inverse so they always stay in sync from the UI.
      const isOn = prev[pushKey] || prev[inappKey];
      return { ...prev, [pushKey]: !isOn, [inappKey]: !isOn };
    });
  }, []);

  // Master "Allow notifications" toggle: flips both delivery channels at
  // once so users have a single all-off switch.
  const handleMasterToggle = useCallback(() => {
    setPreferences(prev => {
      const isOn = prev.push_enabled || prev.inapp_enabled;
      return { ...prev, push_enabled: !isOn, inapp_enabled: !isOn };
    });
  }, []);

  const handleSliderChange = useCallback((value) => {
    setPreferences(prev => ({ ...prev, appointment_reminder_minutes: Math.round(value) }));
  }, []);

  // Convert time string (HH:mm) to Date object
  const timeStringToDate = (timeString) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
  };

  // Convert Date object to time string (HH:mm)
  const dateToTimeString = (date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Format time for display (e.g., "10:00 PM")
  const formatTimeForDisplay = (timeString) => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const handleTimeChange = (event, selectedDate) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(null);
    }
    if (selectedDate && event.type !== 'dismissed') {
      const timeString = dateToTimeString(selectedDate);
      if (showTimePicker === 'start') {
        setPreferences(prev => ({ ...prev, quiet_hours_start: timeString }));
      } else if (showTimePicker === 'end') {
        setPreferences(prev => ({ ...prev, quiet_hours_end: timeString }));
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveNotificationPreferences(preferences);
      Alert.alert(tCommon('alerts.success'), tCommon('messages.savedSuccessfully', { item: 'Notification preferences' }), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Error saving preferences:', error);
      Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToSave', { item: 'preferences' }));
    } finally {
      setSaving(false);
    }
  };

  const formatReminderTime = (minutes) => {
    if (minutes < 60) return `${minutes} ${t('notificationsSettings.minutes')}`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours} ${hours > 1 ? t('notificationsSettings.hours') : t('notificationsSettings.hour')}`;
    return t('notificationsSettings.hoursMinutes', { hours, minutes: mins });
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.cardBackground, borderBottomColor: Colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('notifications.title')}</Text>
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={[styles.saveButtonText, { color: Colors.white }]}>{tCommon('buttons.save')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Single consolidated NOTIFICATIONS section. Each per-category toggle
            controls BOTH push and in-app delivery in lockstep — users
            don't conceptually distinguish between "push reminder for X"
            and "in-app reminder for X", so showing two rows per category
            (the previous behavior) was just confusing duplication. */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
            {t('notifications.title', 'NOTIFICATIONS').toUpperCase()}
          </Text>
          <Text style={[styles.sectionDescription, { color: Colors.secondaryText }]}>
            {t('notificationsSettings.allDescription', 'Choose what you want to be notified about')}
          </Text>

          <View style={[styles.card, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
            <SettingRow
              icon="notifications"
              iconColor={Colors.primaryBlue}
              title={t('notificationsSettings.allowAll', 'Allow notifications')}
              subtitle={t('notificationsSettings.enableAll')}
              value={preferences.push_enabled || preferences.inapp_enabled}
              onToggle={handleMasterToggle}
              Colors={Colors}
            />

            {(preferences.push_enabled || preferences.inapp_enabled) && (
              <>
                <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                <SettingRow
                  icon="calendar"
                  iconColor={Colors.primaryBlue}
                  title={t('notifications.appointments')}
                  subtitle={t('notificationsSettings.getReminded')}
                  value={preferences.push_appointment_reminders || preferences.inapp_appointment_reminders}
                  onToggle={() => handleCategoryToggle('appointment_reminders')}
                  Colors={Colors}
                  indent
                />

                <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                <SettingRow
                  icon="document-text"
                  iconColor={Colors.success}
                  title={t('notifications.workerReports')}
                  subtitle={t('notificationsSettings.whenWorkersSubmit')}
                  value={preferences.push_daily_reports || preferences.inapp_daily_reports}
                  onToggle={() => handleCategoryToggle('daily_reports')}
                  Colors={Colors}
                  indent
                />

                <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                <SettingRow
                  icon="warning"
                  iconColor={Colors.warning}
                  title={t('notifications.projectUpdates')}
                  subtitle={t('notificationsSettings.behindSchedule')}
                  value={preferences.push_project_warnings || preferences.inapp_project_warnings}
                  onToggle={() => handleCategoryToggle('project_warnings')}
                  Colors={Colors}
                  indent
                />

                <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                <SettingRow
                  icon="cash"
                  iconColor={Colors.accent}
                  title={t('notifications.payments')}
                  subtitle={t('notificationsSettings.paymentsExpense')}
                  value={preferences.push_financial_updates || preferences.inapp_financial_updates}
                  onToggle={() => handleCategoryToggle('financial_updates')}
                  Colors={Colors}
                  indent
                />

                <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                <SettingRow
                  icon="person"
                  iconColor={Colors.primaryBlue}
                  title={t('notificationsSettings.workerUpdates')}
                  subtitle={t('notificationsSettings.invitationsClockIns')}
                  value={preferences.push_worker_updates || preferences.inapp_worker_updates}
                  onToggle={() => handleCategoryToggle('worker_updates')}
                  Colors={Colors}
                  indent
                />
              </>
            )}
          </View>
        </View>

        {/* Appointment Reminder Timing */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
            {t('notifications.appointments').toUpperCase()}
          </Text>

          <View style={[styles.card, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
            <View style={styles.sliderContainer}>
              <Text style={[styles.sliderLabel, { color: Colors.primaryText }]}>
                {t('notificationsSettings.remindMeBefore')}
              </Text>
              <Text style={[styles.sliderValue, { color: Colors.primaryBlue }]}>
                {formatReminderTime(preferences.appointment_reminder_minutes)}
              </Text>
            </View>

            <Slider
              style={styles.slider}
              minimumValue={15}
              maximumValue={120}
              step={15}
              value={preferences.appointment_reminder_minutes}
              onValueChange={handleSliderChange}
              minimumTrackTintColor={Colors.primaryBlue}
              maximumTrackTintColor={Colors.border}
              thumbTintColor={Colors.primaryBlue}
            />

            <View style={styles.sliderLabels}>
              <Text style={[styles.sliderLabelText, { color: Colors.secondaryText }]}>15 {t('notificationsSettings.min')}</Text>
              <Text style={[styles.sliderLabelText, { color: Colors.secondaryText }]}>2 {t('notificationsSettings.hours')}</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: Colors.border, marginTop: 16 }]} />

            <SettingRow
              icon="car"
              iconColor={Colors.success}
              title={t('notificationsSettings.includeTravelTime')}
              subtitle={t('notificationsSettings.addEstimatedTravel')}
              value={preferences.appointment_reminder_with_travel}
              onToggle={() => handleToggle('appointment_reminder_with_travel')}
              Colors={Colors}
            />
          </View>
        </View>

        {/* Quiet Hours */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
            {t('notificationsSettings.quietHours')}
          </Text>
          <Text style={[styles.sectionDescription, { color: Colors.secondaryText }]}>
            {t('notificationsSettings.silenceNotifications')}
          </Text>

          <View style={[styles.card, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}>
            <SettingRow
              icon="moon"
              iconColor={Colors.primaryBlue}
              title={t('notificationsSettings.doNotDisturb')}
              subtitle={preferences.quiet_hours_enabled
                ? `${preferences.quiet_hours_start} - ${preferences.quiet_hours_end}`
                : t('notificationsSettings.notificationsAlwaysOn')}
              value={preferences.quiet_hours_enabled}
              onToggle={() => handleToggle('quiet_hours_enabled')}
              Colors={Colors}
            />

            {preferences.quiet_hours_enabled && (
              <>
                <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                <View style={styles.timeRow}>
                  <TouchableOpacity
                    style={styles.timeItem}
                    onPress={() => setShowTimePicker('start')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.timeLabel, { color: Colors.secondaryText }]}>{tCommon('labels.from')}</Text>
                    <View style={[styles.timeButton, { backgroundColor: Colors.lightGray }]}>
                      <Text style={[styles.timeValue, { color: Colors.primaryText }]}>
                        {formatTimeForDisplay(preferences.quiet_hours_start)}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={Colors.secondaryText} />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.timeItem}
                    onPress={() => setShowTimePicker('end')}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.timeLabel, { color: Colors.secondaryText }]}>{t('notificationsSettings.until')}</Text>
                    <View style={[styles.timeButton, { backgroundColor: Colors.lightGray }]}>
                      <Text style={[styles.timeValue, { color: Colors.primaryText }]}>
                        {formatTimeForDisplay(preferences.quiet_hours_end)}
                      </Text>
                      <Ionicons name="chevron-down" size={16} color={Colors.secondaryText} />
                    </View>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>

        {/* In-App Notifications section removed — categories above now
            control both push and in-app delivery in one toggle. */}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Time Picker Modal */}
      {Platform.OS === 'ios' ? (
        <Modal
          visible={showTimePicker !== null}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setShowTimePicker(null)}
        >
          <View style={styles.timePickerModalOverlay}>
            <TouchableOpacity
              style={styles.timePickerBackdrop}
              activeOpacity={1}
              onPress={() => setShowTimePicker(null)}
            />
            <View style={[styles.timePickerModalContent, { backgroundColor: Colors.cardBackground }]}>
              <View style={[styles.timePickerHeader, { borderBottomColor: Colors.border }]}>
                <TouchableOpacity onPress={() => setShowTimePicker(null)}>
                  <Text style={[styles.timePickerCancelText, { color: Colors.secondaryText }]}>{tCommon('buttons.cancel')}</Text>
                </TouchableOpacity>
                <Text style={[styles.timePickerTitle, { color: Colors.primaryText }]}>
                  {showTimePicker === 'start' ? t('notificationsSettings.startTime') : t('notificationsSettings.endTime')}
                </Text>
                <TouchableOpacity onPress={() => setShowTimePicker(null)}>
                  <Text style={[styles.timePickerDoneText, { color: Colors.primaryBlue }]}>{tCommon('buttons.done')}</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={timeStringToDate(
                  showTimePicker === 'start'
                    ? preferences.quiet_hours_start
                    : preferences.quiet_hours_end
                )}
                mode="time"
                display="spinner"
                onChange={handleTimeChange}
                style={styles.timePicker}
                textColor={Colors.primaryText}
              />
            </View>
          </View>
        </Modal>
      ) : (
        showTimePicker !== null && (
          <DateTimePicker
            value={timeStringToDate(
              showTimePicker === 'start'
                ? preferences.quiet_hours_start
                : preferences.quiet_hours_end
            )}
            mode="time"
            display="default"
            onChange={handleTimeChange}
          />
        )
      )}
    </SafeAreaView>
  );
}

// Helper component for setting rows
function SettingRow({ icon, iconColor, title, subtitle, value, onToggle, Colors, indent = false }) {
  return (
    <View style={[styles.settingRow, indent && styles.settingRowIndent]}>
      <View style={[styles.settingIcon, { backgroundColor: iconColor + '20' }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>{title}</Text>
        <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.border, true: Colors.primaryBlue + '50' }}
        thumbColor={value ? Colors.primaryBlue : Colors.lightGray}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 70,
    alignItems: 'center',
  },
  saveButtonText: {
    fontWeight: '600',
    fontSize: 14,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
    marginLeft: 4,
  },
  sectionDescription: {
    fontSize: 13,
    marginBottom: 12,
    marginLeft: 4,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  settingRowIndent: {
    paddingLeft: 24,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 13,
  },
  divider: {
    height: 1,
    marginLeft: 64,
  },
  sliderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sliderLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  sliderValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  slider: {
    marginHorizontal: 16,
    marginTop: 8,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 4,
  },
  sliderLabelText: {
    fontSize: 12,
  },
  timeRow: {
    flexDirection: 'row',
    padding: 16,
    paddingTop: 12,
  },
  timeItem: {
    flex: 1,
    alignItems: 'center',
  },
  timeLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  timeValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  timePickerModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  timePickerBackdrop: {
    flex: 1,
  },
  timePickerModalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 40,
  },
  timePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  timePickerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  timePickerCancelText: {
    fontSize: 16,
    fontWeight: '500',
  },
  timePickerDoneText: {
    fontSize: 16,
    fontWeight: '600',
  },
  timePicker: {
    height: 200,
  },
});
