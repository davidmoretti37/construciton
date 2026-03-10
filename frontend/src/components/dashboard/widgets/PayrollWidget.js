import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

export default function PayrollWidget({ payrollSummary, size, editMode, onPress, fmt }) {
  const { grossPay = 0, workerCount = 0 } = payrollSummary || {};

  const personIcons = Math.min(workerCount, 5);
  const extraCount = workerCount > 5 ? workerCount - 5 : 0;

  if (size === 'small') {
    return (
      <TouchableOpacity
        style={styles.containerSmall}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <LinearGradient
          colors={['#6D28D9', '#7C3AED']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientSmall}
        >
          <Ionicons name="wallet" size={16} color="rgba(255,255,255,0.4)" style={styles.bgIcon} />
          <Text style={styles.valueSmall}>{fmt(grossPay)}</Text>
          <Text style={styles.label}>PAYROLL</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.containerMedium}
      onPress={onPress}
      activeOpacity={editMode ? 1 : 0.85}
      disabled={editMode}
    >
      <LinearGradient
        colors={['#6D28D9', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradientMedium}
      >
        <View style={styles.mediumLeft}>
          <Text style={styles.valueMedium}>{fmt(grossPay)}</Text>
          <View style={styles.peopleRow}>
            {Array.from({ length: personIcons }).map((_, i) => (
              <Ionicons key={i} name="person" size={12} color="rgba(255,255,255,0.5)" style={{ marginLeft: i > 0 ? -2 : 0 }} />
            ))}
            {extraCount > 0 && (
              <Text style={styles.extraText}>+{extraCount}</Text>
            )}
            <Text style={styles.paidText}>
              {workerCount} paid this week
            </Text>
          </View>
        </View>
        <Ionicons name="wallet" size={28} color="rgba(255,255,255,0.12)" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  containerSmall: {
    width: '100%',
    height: 130,
    borderRadius: 16,
    overflow: 'hidden',
  },
  containerMedium: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradientSmall: {
    flex: 1,
    padding: 14,
    justifyContent: 'flex-end',
  },
  gradientMedium: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bgIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  valueSmall: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  valueMedium: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  mediumLeft: {
    flex: 1,
  },
  peopleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  extraText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '600',
  },
  paidText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
});
