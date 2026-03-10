import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

function fmtK(amount) {
  const abs = Math.abs(amount);
  if (abs >= 100000) return `${amount < 0 ? '-' : ''}$${Math.round(abs / 1000)}K`;
  if (abs >= 1000) return `${amount < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${amount < 0 ? '-' : ''}$${Math.round(abs)}`;
}

export default function CashFlowWidget({ cashFlowData, maxCashFlowVal, totalNet, size, editMode, onPress }) {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={editMode}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Cash Flow</Text>
        <Text style={[styles.net, { color: totalNet >= 0 ? '#10B981' : '#F43F5E' }]}>
          Net: {fmtK(totalNet)}
        </Text>
      </View>

      <View style={styles.chart}>
        {cashFlowData.map((month) => {
          const inH = Math.max(4, (month.cashIn / maxCashFlowVal) * 80);
          const outH = Math.max(4, (month.cashOut / maxCashFlowVal) * 80);
          return (
            <View key={month.key} style={styles.monthCol}>
              <View style={styles.barContainer}>
                <View style={[styles.barIn, { height: inH }]} />
                <View style={[styles.barOut, { height: outH }]} />
              </View>
              <Text style={styles.monthLabel}>{month.label}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
          <Text style={styles.legendText}>In</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: 'rgba(244,63,94,0.7)' }]} />
          <Text style={styles.legendText}>Out</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    height: 200,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  net: {
    fontSize: 13,
    fontWeight: '700',
  },
  chart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 12,
    gap: 8,
  },
  monthCol: {
    flex: 1,
    alignItems: 'center',
  },
  barContainer: {
    width: 40,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  barIn: {
    width: 17,
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  barOut: {
    width: 17,
    backgroundColor: 'rgba(244,63,94,0.6)',
    borderRadius: 4,
  },
  monthLabel: {
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#94A3B8',
  },
});
