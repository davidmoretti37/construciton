import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import CustomCalendar from './CustomCalendar';
import { LightColors, getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

export default function DateRangePicker({ fromDate, toDate, onRangeChange }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');
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
    { label: t('calendar.thisWeek'), getValue: getThisWeek },
    { label: t('calendar.lastWeek'), getValue: getLastWeek },
    { label: t('calendar.thisMonth'), getValue: getThisMonth },
    { label: t('calendar.lastMonth'), getValue: getLastMonth },
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
    if (!tempFromDate || (tempFromDate && tempToDate)) {
      // Start new selection
      setTempFromDate(dateString);
      setTempToDate(null);
    } else {
      // Complete selection
      const from = new Date(tempFromDate);
      const to = new Date(dateString);

      if (to < from) {
        // If end date is before start, swap them
        setTempFromDate(dateString);
        setTempToDate(tempFromDate);
      } else {
        setTempToDate(dateString);
      }
    }
  };

  const handleApplyCustomRange = () => {
    if (tempFromDate && tempToDate) {
      onRangeChange(tempFromDate, tempToDate);
      setShowCalendar(false);
    }
  };

  const handleCancelCustomRange = () => {
    setTempFromDate(fromDate);
    setTempToDate(toDate);
    setShowCalendar(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: Colors.cardBackground }]}>
      <View style={styles.header}>
        <Ionicons name="calendar-outline" size={20} color={Colors.secondaryText} />
        <Text style={[styles.headerText, { color: Colors.secondaryText }]}>{t('calendar.period')}</Text>
      </View>

      <TouchableOpacity
        style={[styles.dateDisplay, { backgroundColor: Colors.background }]}
        onPress={() => {
          setTempFromDate(fromDate);
          setTempToDate(toDate);
          setShowCalendar(true);
        }}
        activeOpacity={0.7}
      >
        <Text style={[styles.dateText, { color: Colors.primaryText }]}>
          {formatDateDisplay(fromDate)} - {formatDateDisplay(toDate)}
        </Text>
        {isCustomRange() && (
          <View style={[styles.customBadge, { backgroundColor: Colors.primaryBlue + '20' }]}>
            <Text style={[styles.customBadgeText, { color: Colors.primaryBlue }]}>{t('calendar.custom')}</Text>
          </View>
        )}
        <Ionicons name="calendar" size={20} color={Colors.secondaryText} />
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
                { backgroundColor: Colors.background, borderColor: Colors.border },
                isActive && { backgroundColor: Colors.primaryBlue, borderColor: Colors.primaryBlue }
              ]}
              onPress={() => {
                const range = preset.getValue();
                onRangeChange(range.from, range.to);
              }}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.presetButtonText,
                { color: Colors.primaryText },
                isActive && { color: '#FFFFFF' }
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
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={handleCancelCustomRange}>
              <Text style={[styles.modalCancelText, { color: Colors.secondaryText }]}>{t('buttons.cancel')}</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>{t('calendar.selectDateRange')}</Text>
            <TouchableOpacity
              onPress={handleApplyCustomRange}
              disabled={!tempFromDate || !tempToDate}
              style={[
                styles.applyButton,
                (tempFromDate && tempToDate) && { backgroundColor: Colors.primaryBlue }
              ]}
            >
              <Text style={[
                styles.modalApplyText,
                { color: Colors.primaryText },
                (!tempFromDate || !tempToDate) && styles.modalApplyTextDisabled,
                (tempFromDate && tempToDate) && { color: '#FFFFFF' }
              ]}>{t('buttons.apply')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalContent}>
            <View style={[styles.selectionInfo, { backgroundColor: Colors.cardBackground }]}>
              <View style={styles.selectionInfoItem}>
                <Text style={[styles.selectionInfoLabel, { color: Colors.secondaryText }]}>{t('labels.from')}</Text>
                <Text style={[styles.selectionInfoValue, { color: Colors.primaryText }]}>
                  {tempFromDate ? formatDateDisplay(tempFromDate) : t('calendar.tapDate')}
                </Text>
              </View>
              <Ionicons name="arrow-forward" size={20} color={Colors.placeholderText} />
              <View style={styles.selectionInfoItem}>
                <Text style={[styles.selectionInfoLabel, { color: Colors.secondaryText }]}>{t('labels.end')}</Text>
                <Text style={[styles.selectionInfoValue, { color: Colors.primaryText }]}>
                  {tempToDate ? formatDateDisplay(tempToDate) : (tempFromDate ? t('calendar.tapAnotherDate') : '-')}
                </Text>
              </View>
            </View>

            {/* Instruction text */}
            <Text style={[styles.instructionText, { color: Colors.secondaryText }]}>
              {!tempFromDate
                ? t('calendar.tapStartDate')
                : !tempToDate
                  ? t('calendar.tapEndDate')
                  : t('calendar.tapApply')}
            </Text>

            <CustomCalendar
              onDateSelect={handleDateSelect}
              selectedStart={tempFromDate}
              selectedEnd={tempToDate}
              theme={{
                primaryBlue: Colors.primaryBlue,
                primaryText: Colors.primaryText,
                secondaryText: Colors.secondaryText,
                white: Colors.cardBackground,
                border: Colors.border,
                background: Colors.background,
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
  },
  dateDisplay: {
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
    flex: 1,
  },
  presetsContainer: {
    gap: 8,
  },
  presetButton: {
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
  },
  presetButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  modalCancelText: {
    fontSize: 16,
  },
  modalApplyText: {
    fontSize: 16,
    fontWeight: '600',
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
    marginBottom: 4,
  },
  selectionInfoValue: {
    fontSize: 15,
    fontWeight: '600',
  },
  customBadge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 8,
  },
  customBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  applyButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  instructionText: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    fontStyle: 'italic',
  },
});
