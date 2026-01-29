import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { getColors, LightColors, Spacing, FontSizes } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';

export default function WorkingDaysSelector({
  selectedDays = [1, 2, 3, 4, 5],
  onDaysChange,
  label,
  disabled = false,
}) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const WEEKDAYS = [
    { id: 1, short: t('calendar.daysMin.mo'), name: t('calendar.days.monday') },
    { id: 2, short: t('calendar.daysMin.tu'), name: t('calendar.days.tuesday') },
    { id: 3, short: t('calendar.daysMin.we'), name: t('calendar.days.wednesday') },
    { id: 4, short: t('calendar.daysMin.th'), name: t('calendar.days.thursday') },
    { id: 5, short: t('calendar.daysMin.fr'), name: t('calendar.days.friday') },
    { id: 6, short: t('calendar.daysMin.sa'), name: t('calendar.days.saturday') },
    { id: 7, short: t('calendar.daysMin.su'), name: t('calendar.days.sunday') },
  ];

  const toggleDay = (dayId) => {
    if (disabled) return;

    if (selectedDays.includes(dayId)) {
      // Don't allow removing all days - must have at least one working day
      if (selectedDays.length > 1) {
        onDaysChange(selectedDays.filter((d) => d !== dayId));
      } else {
        Alert.alert(
          t('alerts.atLeastOneDayRequired', 'At Least One Day Required'),
          t('alerts.atLeastOneDayMessage', 'You must have at least one working day selected for the project schedule.'),
          [{ text: t('buttons.ok') }]
        );
      }
    } else {
      onDaysChange([...selectedDays, dayId].sort((a, b) => a - b));
    }
  };

  const displayLabel = label !== undefined ? label : t('labels.workingDays', 'Working Days');

  return (
    <View style={styles.container}>
      {displayLabel && (
        <Text style={[styles.label, { color: Colors.secondaryText }]}>{displayLabel}</Text>
      )}
      <View style={styles.daysRow}>
        {WEEKDAYS.map((day) => {
          const isSelected = selectedDays.includes(day.id);
          return (
            <TouchableOpacity
              key={day.id}
              style={[
                styles.dayButton,
                {
                  backgroundColor: isSelected ? Colors.primaryBlue : Colors.white,
                  borderColor: isSelected ? Colors.primaryBlue : Colors.border,
                },
              ]}
              onPress={() => toggleDay(day.id)}
              disabled={disabled}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.dayText,
                  { color: isSelected ? '#fff' : Colors.primaryText },
                ]}
              >
                {day.short}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  daysRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
