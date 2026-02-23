import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

const OWNER_PRIMARY = '#1E40AF';

const PERIODS = [
  { key: 'month', label: 'This Month' },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All Time' },
];

export default function PeriodFilter({ selected, onSelect }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  return (
    <View style={styles.row}>
      {PERIODS.map((p) => {
        const active = selected === p.key;
        return (
          <TouchableOpacity
            key={p.key}
            style={[
              styles.pill,
              active
                ? { backgroundColor: OWNER_PRIMARY }
                : { backgroundColor: 'transparent', borderColor: Colors.border, borderWidth: 1 },
            ]}
            onPress={() => onSelect(p.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.pillText, { color: active ? '#FFFFFF' : Colors.secondaryText }]}>
              {p.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.pill,
  },
  pillText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
});
