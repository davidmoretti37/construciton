import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function PayrollWidget({ payrollSummary, size, editMode, onPress, fmt }) {
  const { grossPay = 0, workerCount = 0 } = payrollSummary || {};

  if (size === 'small') {
    return (
      <TouchableOpacity
        style={styles.containerSmall}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.7}
        disabled={editMode}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="wallet-outline" size={16} color="#8B5CF6" />
        </View>
        <Text style={styles.valueSmall}>{fmt(grossPay)}</Text>
        <Text style={styles.label}>PAYROLL</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.containerMedium}
      onPress={onPress}
      activeOpacity={editMode ? 1 : 0.7}
      disabled={editMode}
    >
      <View style={styles.iconCircle}>
        <Ionicons name="wallet-outline" size={16} color="#8B5CF6" />
      </View>
      <View style={styles.mediumContent}>
        <Text style={styles.valueMedium}>{fmt(grossPay)}</Text>
        <Text style={styles.label}>
          {workerCount} worker{workerCount !== 1 ? 's' : ''} paid this week
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  containerSmall: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    height: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  containerMedium: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#8B5CF61A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediumContent: {
    marginLeft: 12,
  },
  valueSmall: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
    marginTop: 8,
  },
  valueMedium: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 2,
  },
});
