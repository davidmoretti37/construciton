import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MiniSparkline from './svg/MiniSparkline';

function fmtK(amount) {
  const abs = Math.abs(amount);
  if (abs >= 100000) return `${amount < 0 ? '-' : ''}$${Math.round(abs / 1000)}K`;
  if (abs >= 1000) return `${amount < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${amount < 0 ? '-' : ''}$${Math.round(abs)}`;
}

export default function PnLWidget({ pnl, size, editMode, onPress }) {
  // Decorative sparkline data — use revenue/expense/profit to create a simple shape
  const sparkData = [
    pnl.expenses * 0.6,
    pnl.expenses * 0.8,
    pnl.expenses,
    pnl.revenue * 0.7,
    pnl.revenue * 0.85,
    pnl.revenue,
    pnl.profit > 0 ? pnl.revenue * 0.9 : pnl.revenue * 0.6,
  ].map(v => Math.max(0, v));

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={editMode}
    >
      <LinearGradient
        colors={['#0F172A', '#1E3A5F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <Text style={styles.label}>THIS MONTH</Text>
        <Text style={styles.revenue}>{fmtK(pnl.revenue)}</Text>

        <View style={styles.pills}>
          <View style={styles.expensePill}>
            <Ionicons name="arrow-down-outline" size={11} color="#FCA5A5" />
            <Text style={styles.expenseText}>{fmtK(pnl.expenses)} Expenses</Text>
          </View>
          <View style={styles.profitPill}>
            <Ionicons name="arrow-up-outline" size={11} color="#6EE7B7" />
            <Text style={styles.profitText}>{fmtK(pnl.profit)} Profit</Text>
          </View>
        </View>

        {/* Decorative sparkline */}
        <View style={styles.sparklineWrap}>
          <MiniSparkline
            data={sparkData}
            width={320}
            height={45}
            color="rgba(56,189,248,0.4)"
            fillColor="rgba(56,189,248,0.08)"
          />
        </View>

        <View style={styles.footer}>
          <View style={styles.footerBtn}>
            <Text style={styles.footerText}>View Full P&L Report</Text>
            <Ionicons name="chevron-forward" size={13} color="#38BDF8" />
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 200,
    borderRadius: 20,
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    padding: 20,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
  },
  revenue: {
    fontSize: 38,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -1,
    marginTop: 2,
    textShadowColor: 'rgba(56,189,248,0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  pills: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  expensePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(244,63,94,0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  expenseText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FCA5A5',
  },
  profitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  profitText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6EE7B7',
  },
  sparklineWrap: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    opacity: 0.7,
  },
  footer: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    right: 20,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(56,189,248,0.1)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  footerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#38BDF8',
  },
});
