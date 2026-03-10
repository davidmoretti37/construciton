import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import VerticalBarGroup from './svg/VerticalBarGroup';

function fmtK(amount) {
  const abs = Math.abs(amount);
  if (abs >= 100000) return `${amount < 0 ? '-' : ''}$${Math.round(abs / 1000)}K`;
  if (abs >= 1000) return `${amount < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${amount < 0 ? '-' : ''}$${Math.round(abs)}`;
}

export default function CashFlowWidget({ cashFlowData, maxCashFlowVal, totalNet, size, editMode, onPress }) {
  const barData = cashFlowData.map((month) => ({
    label: month.label,
    values: [
      { value: month.cashIn, color: '#34D399', opacity: 1 },
      { value: month.cashOut, color: 'rgba(251,113,133,0.8)', opacity: 0.9 },
    ],
  }));

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.85}
      disabled={editMode}
    >
      <LinearGradient
        colors={['#064E3B', '#065F46']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Cash Flow</Text>
          <View style={styles.netPill}>
            <Text style={[styles.netText, { color: totalNet >= 0 ? '#34D399' : '#FB7185' }]}>
              Net: {fmtK(totalNet)}
            </Text>
          </View>
        </View>

        <View style={styles.chart}>
          <VerticalBarGroup
            data={barData}
            maxValue={maxCashFlowVal}
            barWidth={16}
            barGap={4}
            chartHeight={90}
            labelColor="rgba(255,255,255,0.6)"
          />
        </View>

        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendBar, { backgroundColor: '#34D399' }]} />
            <Text style={styles.legendText}>In</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendBar, { backgroundColor: 'rgba(251,113,133,0.8)' }]} />
            <Text style={styles.legendText}>Out</Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  netPill: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  netText: {
    fontSize: 13,
    fontWeight: '700',
  },
  chart: {
    flex: 1,
    marginTop: 8,
  },
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendBar: {
    width: 12,
    height: 3,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
});
