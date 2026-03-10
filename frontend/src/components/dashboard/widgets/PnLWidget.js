import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

function fmtK(amount) {
  const abs = Math.abs(amount);
  if (abs >= 100000) return `${amount < 0 ? '-' : ''}$${Math.round(abs / 1000)}K`;
  if (abs >= 1000) return `${amount < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${amount < 0 ? '-' : ''}$${Math.round(abs)}`;
}

export default function PnLWidget({ pnl, size, editMode, onPress }) {
  return (
    <View style={styles.container} pointerEvents={editMode ? 'none' : 'auto'}>
      <Text style={styles.label}>THIS MONTH</Text>
      <Text style={styles.revenue}>{fmtK(pnl.revenue)}</Text>

      <View style={styles.pills}>
        <View style={styles.expensePill}>
          <Ionicons name="arrow-down-outline" size={11} color="#F43F5E" />
          <Text style={styles.expenseText}>{fmtK(pnl.expenses)} Expenses</Text>
        </View>
        <View style={styles.profitPill}>
          <Ionicons name="arrow-up-outline" size={11} color="#10B981" />
          <Text style={styles.profitText}>{fmtK(pnl.profit)} Profit</Text>
        </View>
      </View>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.footer} onPress={onPress} activeOpacity={0.7}>
        <Text style={styles.footerText}>View Full P&L Report</Text>
        <Ionicons name="chevron-forward" size={14} color="#3B82F6" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    height: 200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  revenue: {
    fontSize: 36,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -1,
    marginTop: 4,
  },
  pills: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  expensePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(244,63,94,0.12)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  expenseText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F43F5E',
  },
  profitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  profitText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginTop: 16,
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
  },
});
