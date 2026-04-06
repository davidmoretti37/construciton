/**
 * TimeEditModal
 * Reusable modal for editing clock in/out times
 * Used by owners and supervisors to edit time entries
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { formatHoursMinutes } from '../utils/calculations';
import { supabase } from '../lib/supabase';
import { editTimeEntry, editSupervisorTimeEntry } from '../utils/storage/timeTracking';
import { API_URL as BACKEND_URL } from '../config/api';

export default function TimeEditModal({
  visible,
  onClose,
  onSaved,
  record,
  isSupervisor = false,
}) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [clockIn, setClockIn] = useState(new Date());
  const [clockOut, setClockOut] = useState(new Date());
  const [saving, setSaving] = useState(false);

  // Picker visibility for Android
  const [showClockInPicker, setShowClockInPicker] = useState(Platform.OS === 'ios');
  const [showClockOutPicker, setShowClockOutPicker] = useState(Platform.OS === 'ios');

  useEffect(() => {
    if (record) {
      setClockIn(new Date(record.clock_in));
      setClockOut(record.clock_out ? new Date(record.clock_out) : new Date());
    }
  }, [record]);

  const hoursWorked = (clockOut - clockIn) / (1000 * 60 * 60);
  const isValid = clockOut > clockIn;

  const handleSave = async () => {
    if (!isValid) {
      Alert.alert('Invalid Time', 'Clock out must be after clock in.');
      return;
    }

    setSaving(true);
    try {
      // Try backend API first (bypasses RLS for cross-user edits)
      let backendSuccess = false;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const response = await fetch(`${BACKEND_URL}/api/time-entries/${record.id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              clock_in: clockIn.toISOString(),
              clock_out: clockOut.toISOString(),
              table: isSupervisor ? 'supervisor' : 'worker',
            }),
          });

          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const result = await response.json();
            if (response.ok && result.success) {
              backendSuccess = true;
            }
          }
          // Non-JSON response (HTML 404) = endpoint not deployed yet, fall through
        }
      } catch (e) {
        console.log('Backend API unavailable, using direct update:', e.message);
      }

      // Fallback: try Supabase RPC (bypasses RLS with server-side auth)
      if (!backendSuccess) {
        let rpcSuccess = false;
        try {
          const { data: rpcResult, error: rpcError } = await supabase.rpc('edit_time_entry', {
            p_entry_id: record.id,
            p_clock_in: clockIn.toISOString(),
            p_clock_out: clockOut.toISOString(),
            p_table: isSupervisor ? 'supervisor' : 'worker',
          });
          if (!rpcError && rpcResult?.success) {
            rpcSuccess = true;
          }
        } catch (e) {
          console.log('RPC not available, using direct update:', e.message);
        }

        // Last resort: direct Supabase update (only works when user owns the row)
        if (!rpcSuccess) {
          const updates = {
            clock_in: clockIn.toISOString(),
            clock_out: clockOut.toISOString(),
          };
          const success = isSupervisor
            ? await editSupervisorTimeEntry(record.id, updates)
            : await editTimeEntry(record.id, updates);

          if (!success) {
            Alert.alert('Error', 'Unable to update time entry. You may not have permission to edit this record.');
            return;
          }
        }
      }

      await onSaved?.();
      onClose();
    } catch (error) {
      console.error('Error saving time edit:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const formatTimeDisplay = (date) => {
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDateDisplay = (date) => {
    return date.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: Colors.white }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={Colors.secondaryText} />
            </TouchableOpacity>
            <Text style={[styles.title, { color: Colors.primaryText }]}>
              Edit Time Entry
            </Text>
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving || !isValid}
              style={[
                styles.saveButton,
                { backgroundColor: isValid ? '#1E40AF' : '#9CA3AF' },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Project Name */}
          {record && (
            <View style={[styles.projectRow, { backgroundColor: Colors.lightGray || '#F3F4F6' }]}>
              <Ionicons name="briefcase-outline" size={16} color="#1E40AF" />
              <Text style={[styles.projectName, { color: Colors.primaryText }]}>
                {record.projects?.name || record.service_plans?.name || record.project_name || 'Unknown Project'}
              </Text>
            </View>
          )}

          {/* Clock In */}
          <View style={styles.timeSection}>
            <View style={styles.timeLabelRow}>
              <View style={[styles.timeIcon, { backgroundColor: '#10B98120' }]}>
                <Ionicons name="log-in-outline" size={18} color="#10B981" />
              </View>
              <Text style={[styles.timeLabel, { color: Colors.primaryText }]}>
                Clock In
              </Text>
              {Platform.OS === 'android' && (
                <TouchableOpacity
                  style={[styles.timeButton, { backgroundColor: Colors.lightGray || '#F3F4F6' }]}
                  onPress={() => setShowClockInPicker(true)}
                >
                  <Text style={[styles.timeButtonText, { color: Colors.primaryText }]}>
                    {formatDateDisplay(clockIn)}  {formatTimeDisplay(clockIn)}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.secondaryText} />
                </TouchableOpacity>
              )}
            </View>
            {showClockInPicker && (
              <DateTimePicker
                value={clockIn}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'compact' : 'default'}
                onChange={(event, date) => {
                  if (Platform.OS === 'android') setShowClockInPicker(false);
                  if (date) setClockIn(date);
                }}
                style={styles.picker}
              />
            )}
          </View>

          {/* Clock Out */}
          <View style={styles.timeSection}>
            <View style={styles.timeLabelRow}>
              <View style={[styles.timeIcon, { backgroundColor: '#EF444420' }]}>
                <Ionicons name="log-out-outline" size={18} color="#EF4444" />
              </View>
              <Text style={[styles.timeLabel, { color: Colors.primaryText }]}>
                Clock Out
              </Text>
              {Platform.OS === 'android' && (
                <TouchableOpacity
                  style={[styles.timeButton, { backgroundColor: Colors.lightGray || '#F3F4F6' }]}
                  onPress={() => setShowClockOutPicker(true)}
                >
                  <Text style={[styles.timeButtonText, { color: Colors.primaryText }]}>
                    {formatDateDisplay(clockOut)}  {formatTimeDisplay(clockOut)}
                  </Text>
                  <Ionicons name="chevron-down" size={16} color={Colors.secondaryText} />
                </TouchableOpacity>
              )}
            </View>
            {showClockOutPicker && (
              <DateTimePicker
                value={clockOut}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'compact' : 'default'}
                onChange={(event, date) => {
                  if (Platform.OS === 'android') setShowClockOutPicker(false);
                  if (date) setClockOut(date);
                }}
                style={styles.picker}
              />
            )}
          </View>

          {/* Summary */}
          <View style={[styles.summary, { backgroundColor: isValid ? '#1E40AF10' : '#EF444410' }]}>
            <Ionicons
              name={isValid ? 'timer-outline' : 'alert-circle-outline'}
              size={20}
              color={isValid ? '#1E40AF' : '#EF4444'}
            />
            <Text style={[styles.summaryText, { color: isValid ? '#1E40AF' : '#EF4444' }]}>
              {isValid
                ? `Total: ${formatHoursMinutes(hoursWorked)}`
                : 'Clock out must be after clock in'}
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 60,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  projectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  projectName: {
    fontSize: 14,
    fontWeight: '600',
  },
  timeSection: {
    marginHorizontal: 16,
    marginTop: 16,
  },
  timeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  timeIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeLabel: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  timeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  timeButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  picker: {
    marginLeft: -8,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 20,
    padding: 14,
    borderRadius: 12,
  },
  summaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
