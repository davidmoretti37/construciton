import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CustomCalendar from './CustomCalendar';

export default function DateRangePicker({ fromDate, toDate, onRangeChange }) {
  const [showCalendar, setShowCalendar] = useState(false);
  const [tempFromDate, setTempFromDate] = useState(fromDate);
  const [tempToDate, setTempToDate] = useState(toDate);
  // Helper to get date ranges
  const getThisWeek = () => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return {
      from: monday.toISOString().split('T')[0],
      to: sunday.toISOString().split('T')[0]
    };
  };

  const getLastWeek = () => {
    const thisWeek = getThisWeek();
    const lastMonday = new Date(thisWeek.from);
    lastMonday.setDate(lastMonday.getDate() - 7);

    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);

    return {
      from: lastMonday.toISOString().split('T')[0],
      to: lastSunday.toISOString().split('T')[0]
    };
  };

  const getThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    return {
      from: firstDay.toISOString().split('T')[0],
      to: lastDay.toISOString().split('T')[0]
    };
  };

  const getLastMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);

    return {
      from: firstDay.toISOString().split('T')[0],
      to: lastDay.toISOString().split('T')[0]
    };
  };

  const formatDateDisplay = (dateString) => {
    // Parse date string without timezone conversion (YYYY-MM-DD)
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day); // month is 0-indexed
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const presets = [
    { label: 'This Week', getValue: getThisWeek },
    { label: 'Last Week', getValue: getLastWeek },
    { label: 'This Month', getValue: getThisMonth },
    { label: 'Last Month', getValue: getLastMonth },
  ];

  const isPresetActive = (preset) => {
    const range = preset.getValue();
    return range.from === fromDate && range.to === toDate;
  };

  // Check if current range is custom (doesn't match any preset)
  const isCustomRange = () => {
    return !presets.some(preset => isPresetActive(preset));
  };

  const handleDateSelect = (dateString) => {
    console.log('📅 Date selected:', dateString);
    console.log('📅 Current temp state:', { tempFromDate, tempToDate });

    if (!tempFromDate || (tempFromDate && tempToDate)) {
      // Start new selection
      console.log('📅 Starting new selection');
      setTempFromDate(dateString);
      setTempToDate(null);
    } else {
      // Complete selection
      const from = new Date(tempFromDate);
      const to = new Date(dateString);

      if (to < from) {
        // If end date is before start, swap them
        console.log('📅 Swapping dates (end before start)');
        setTempFromDate(dateString);
        setTempToDate(tempFromDate);
      } else {
        console.log('📅 Setting end date');
        setTempToDate(dateString);
      }
    }
  };

  const handleApplyCustomRange = () => {
    console.log('📅 Apply clicked, temp state:', { tempFromDate, tempToDate });
    if (tempFromDate && tempToDate) {
      console.log('📅 Applying custom range:', tempFromDate, 'to', tempToDate);
      onRangeChange(tempFromDate, tempToDate);
      setShowCalendar(false);
    } else {
      console.log('📅 Cannot apply - missing dates');
    }
  };

  const handleCancelCustomRange = () => {
    setTempFromDate(fromDate);
    setTempToDate(toDate);
    setShowCalendar(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="calendar-outline" size={20} color="#6B7280" />
        <Text style={styles.headerText}>Period</Text>
      </View>

      <TouchableOpacity
        style={styles.dateDisplay}
        onPress={() => {
          setTempFromDate(fromDate);
          setTempToDate(toDate);
          setShowCalendar(true);
        }}
        activeOpacity={0.7}
      >
        <Text style={styles.dateText}>
          {formatDateDisplay(fromDate)} - {formatDateDisplay(toDate)}
        </Text>
        {isCustomRange() && (
          <View style={styles.customBadge}>
            <Text style={styles.customBadgeText}>Custom</Text>
          </View>
        )}
        <Ionicons name="calendar" size={20} color="#6B7280" />
      </TouchableOpacity>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.presetsContainer}
      >
        {presets.map((preset, index) => {
          const isActive = isPresetActive(preset);
          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.presetButton,
                isActive && styles.presetButtonActive
              ]}
              onPress={() => {
                const range = preset.getValue();
                onRangeChange(range.from, range.to);
              }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.presetButtonText,
                isActive && styles.presetButtonTextActive
              ]}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Calendar Modal */}
      <Modal
        visible={showCalendar}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCancelCustomRange}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleCancelCustomRange}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select Date Range</Text>
            <TouchableOpacity
              onPress={handleApplyCustomRange}
              disabled={!tempFromDate || !tempToDate}
              style={[
                styles.applyButton,
                (tempFromDate && tempToDate) && styles.applyButtonEnabled
              ]}
            >
              <Text style={[
                styles.modalApplyText,
                (!tempFromDate || !tempToDate) && styles.modalApplyTextDisabled,
                (tempFromDate && tempToDate) && styles.modalApplyTextEnabled
              ]}>Apply</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={styles.selectionInfo}>
              <View style={styles.selectionInfoItem}>
                <Text style={styles.selectionInfoLabel}>From</Text>
                <Text style={styles.selectionInfoValue}>
                  {tempFromDate ? formatDateDisplay(tempFromDate) : 'Tap a date'}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color="#9CA3AF" />
              <View style={styles.selectionInfoItem}>
                <Text style={styles.selectionInfoLabel}>To</Text>
                <Text style={styles.selectionInfoValue}>
                  {tempToDate ? formatDateDisplay(tempToDate) : (tempFromDate ? 'Tap another date' : '-')}
                </Text>
              </View>
            </View>

            {/* Instruction text */}
            <Text style={styles.instructionText}>
              {!tempFromDate
                ? 'Tap a date to start selecting a range'
                : !tempToDate
                  ? 'Tap another date to complete the range'
                  : 'Tap "Apply" to use this date range'}
            </Text>

            <CustomCalendar
              onDateSelect={handleDateSelect}
              selectedStart={tempFromDate}
              selectedEnd={tempToDate}
              theme={{
                primaryBlue: '#1F2937',
                primaryText: '#1F2937',
                secondaryText: '#6B7280',
                white: '#FFFFFF',
                border: '#E5E7EB',
              }}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  headerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  dateDisplay: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
    flex: 1,
  },
  presetsContainer: {
    gap: 8,
  },
  presetButton: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  presetButtonActive: {
    backgroundColor: '#1F2937',
    borderColor: '#1F2937',
  },
  presetButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  presetButtonTextActive: {
    color: '#FFFFFF',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalCancelText: {
    fontSize: 16,
    color: '#6B7280',
  },
  modalApplyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalApplyTextDisabled: {
    opacity: 0.3,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  selectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  selectionInfoItem: {
    flex: 1,
  },
  selectionInfoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  selectionInfoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  customBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 8,
  },
  customBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4F46E5',
  },
  applyButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  applyButtonEnabled: {
    backgroundColor: '#1F2937',
  },
  modalApplyTextEnabled: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  instructionText: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
});
