import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { getColors, LightColors, Spacing, FontSizes } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const WEEKDAYS = [
  { id: 1, short: 'M', name: 'Monday' },
  { id: 2, short: 'T', name: 'Tuesday' },
  { id: 3, short: 'W', name: 'Wednesday' },
  { id: 4, short: 'T', name: 'Thursday' },
  { id: 5, short: 'F', name: 'Friday' },
  { id: 6, short: 'S', name: 'Saturday' },
  { id: 7, short: 'S', name: 'Sunday' },
];

export default function WorkingDaysSelector({
  selectedDays = [1, 2, 3, 4, 5],
  onDaysChange,
  label = 'Working Days',
  disabled = false,
}) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const toggleDay = (dayId) => {
    if (disabled) return;

    if (selectedDays.includes(dayId)) {
      // Don't allow removing all days - must have at least one working day
      if (selectedDays.length > 1) {
        onDaysChange(selectedDays.filter((d) => d !== dayId));
      } else {
        Alert.alert(
          'At Least One Day Required',
          'You must have at least one working day selected for the project schedule.',
          [{ text: 'OK' }]
        );
      }
    } else {
      onDaysChange([...selectedDays, dayId].sort((a, b) => a - b));
    }
  };

  return (
    <View style={styles.container}>
      {label && (
        <Text style={[styles.label, { color: Colors.secondaryText }]}>{label}</Text>
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
