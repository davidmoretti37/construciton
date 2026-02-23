import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

const OWNER_COLORS = {
  primary: '#1E40AF',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
};

export default function MetricCard({ label, value, icon, color, subtitle }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  return (
    <View style={[styles.card, { backgroundColor: Colors.cardBackground, borderLeftColor: color || OWNER_COLORS.primary }]}>
      <View style={styles.iconRow}>
        <Ionicons name={icon || 'stats-chart'} size={16} color={color || OWNER_COLORS.primary} />
      </View>
      <Text style={[styles.value, { color: color || Colors.primaryText }]}>{value}</Text>
      <Text style={[styles.label, { color: Colors.secondaryText }]}>{label}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  iconRow: {
    marginBottom: Spacing.xs,
  },
  value: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  label: {
    fontSize: FontSizes.tiny,
    fontWeight: '500',
    marginTop: 2,
  },
  subtitle: {
    fontSize: FontSizes.tiny,
    marginTop: 2,
  },
});
