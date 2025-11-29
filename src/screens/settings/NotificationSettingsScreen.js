import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  getNotificationPreferences,
  saveNotificationPreferences,
} from '../../utils/notificationStorage';

export default function NotificationSettingsScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        setPreferences(prev => ({ ...prev, ...prefs }));
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      Alert.alert('Error', 'Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = useCallback((key) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSliderChange = useCallback((value) => {
    setPreferences(prev => ({ ...prev, appointment_reminder_minutes: Math.round(value) }));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveNotificationPreferences(preferences);
      Alert.alert('Success', 'Notification preferences saved', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error('Error saving preferences:', error);
      Alert.alert('Error', 'Failed to save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const formatReminderTime = (minutes) => {
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.white, borderBottomColor: Colors.border }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Notifications</Text>
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveButtonText}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
        {/* Push Notifications Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
            PUSH NOTIFICATIONS
          </Text>
          <Text style={[styles.sectionDescription, { color: Colors.secondaryText }]}>
            Notifications that appear on your lock screen
          </Text>

          <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SettingRow
              icon="notifications"
              iconColor="#3B82F6"
              title="Push Notifications"
              subtitle="Enable all push notifications"
              value={preferences.push_enabled}
              onToggle={() => handleToggle('push_enabled')}
              Colors={Colors}
            />

            {preferences.push_enabled && (
              <>
                <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                <SettingRow
                  icon="calendar"
                  iconColor="#3B82F6"
                  title="Appointment Reminders"
                  subtitle="Get reminded before appointments"
                  value={preferences.push_appointment_reminders}
                  onToggle={() => handleToggle('push_appointment_reminders')}
                  Colors={Colors}
                  indent
                />

                <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                <SettingRow
                  icon="document-text"
                  iconColor="#10B981"
                  title="Daily Reports"
                  subtitle="When workers submit reports"
                  value={preferences.push_daily_reports}
                  onToggle={() => handleToggle('push_daily_reports')}
                  Colors={Colors}
                  indent
                />

                <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                <SettingRow
                  icon="warning"
                  iconColor="#F59E0B"
                  title="Project Warnings"
                  subtitle="Behind schedule, over budget alerts"
                  value={preferences.push_project_warnings}
                  onToggle={() => handleToggle('push_project_warnings')}
                  Colors={Colors}
                  indent
                />

                <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                <SettingRow
                  icon="cash"
                  iconColor="#8B5CF6"
                  title="Financial Updates"
                  subtitle="Payments and expense alerts"
                  value={preferences.push_financial_updates}
                  onToggle={() => handleToggle('push_financial_updates')}
                  Colors={Colors}
                  indent
                />

                <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                <SettingRow
                  icon="person"
                  iconColor="#6366F1"
                  title="Worker Updates"
                  subtitle="Invitations, clock-ins, etc."
                  value={preferences.push_worker_updates}
                  onToggle={() => handleToggle('push_worker_updates')}
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
            APPOINTMENT REMINDERS
          </Text>

          <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <View style={styles.sliderContainer}>
              <Text style={[styles.sliderLabel, { color: Colors.primaryText }]}>
                Remind me before
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
              <Text style={[styles.sliderLabelText, { color: Colors.secondaryText }]}>15 min</Text>
              <Text style={[styles.sliderLabelText, { color: Colors.secondaryText }]}>2 hours</Text>
            </View>

            <View style={[styles.divider, { backgroundColor: Colors.border, marginTop: 16 }]} />

            <SettingRow
              icon="car"
              iconColor="#10B981"
              title="Include Travel Time"
              subtitle="Add estimated travel time to reminder"
              value={preferences.appointment_reminder_with_travel}
              onToggle={() => handleToggle('appointment_reminder_with_travel')}
              Colors={Colors}
            />
          </View>
        </View>

        {/* Quiet Hours */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
            QUIET HOURS
          </Text>
          <Text style={[styles.sectionDescription, { color: Colors.secondaryText }]}>
            Silence notifications during certain hours
          </Text>

          <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SettingRow
              icon="moon"
              iconColor="#6366F1"
              title="Do Not Disturb"
              subtitle={preferences.quiet_hours_enabled
                ? `${preferences.quiet_hours_start} - ${preferences.quiet_hours_end}`
                : 'Notifications always on'}
              value={preferences.quiet_hours_enabled}
              onToggle={() => handleToggle('quiet_hours_enabled')}
              Colors={Colors}
            />

            {preferences.quiet_hours_enabled && (
              <>
                <View style={[styles.divider, { backgroundColor: Colors.border }]} />
                <View style={styles.timeRow}>
                  <View style={styles.timeItem}>
                    <Text style={[styles.timeLabel, { color: Colors.secondaryText }]}>From</Text>
                    <Text style={[styles.timeValue, { color: Colors.primaryText }]}>
                      {preferences.quiet_hours_start}
                    </Text>
                  </View>
                  <View style={styles.timeItem}>
                    <Text style={[styles.timeLabel, { color: Colors.secondaryText }]}>Until</Text>
                    <Text style={[styles.timeValue, { color: Colors.primaryText }]}>
                      {preferences.quiet_hours_end}
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        </View>

        {/* In-App Notifications Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>
            IN-APP NOTIFICATIONS
          </Text>
          <Text style={[styles.sectionDescription, { color: Colors.secondaryText }]}>
            Notifications shown in the notification center
          </Text>

          <View style={[styles.card, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <SettingRow
              icon="apps"
              iconColor="#3B82F6"
              title="In-App Notifications"
              subtitle="Show in notification center"
              value={preferences.inapp_enabled}
              onToggle={() => handleToggle('inapp_enabled')}
              Colors={Colors}
            />
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
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
        thumbColor={value ? Colors.primaryBlue : '#f4f3f4'}
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
    color: '#FFFFFF',
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
    fontSize: 18,
    fontWeight: '600',
  },
});
