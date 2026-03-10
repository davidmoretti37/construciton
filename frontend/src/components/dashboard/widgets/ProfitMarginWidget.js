import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import SemiCircleGauge from './svg/SemiCircleGauge';

function fmtK(amount) {
  const abs = Math.abs(amount);
  if (abs >= 100000) return `${amount < 0 ? '-' : ''}$${Math.round(abs / 1000)}K`;
  if (abs >= 1000) return `${amount < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${amount < 0 ? '-' : ''}$${Math.round(abs)}`;
}

function getGaugeColor(margin) {
  if (margin >= 20) return '#6EE7B7';
  if (margin >= 10) return '#FCD34D';
  return '#FCA5A5';
}

export default function ProfitMarginWidget({ margin, healthText, revenue, expenses, size, editMode, onPress }) {
  const gaugeValue = Math.min(margin, 50) / 50; // Normalize to 0-1 (50% = full)
  const gaugeColor = getGaugeColor(margin);

  if (size === 'medium') {
    return (
      <TouchableOpacity
        style={styles.containerMedium}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <LinearGradient
          colors={['#065F46', '#059669']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientMedium}
        >
          <SemiCircleGauge
            value={gaugeValue}
            size={56}
            strokeWidth={6}
            color={gaugeColor}
            trackColor="rgba(255,255,255,0.15)"
          >
            <Text style={styles.gaugePercentMed}>{margin.toFixed(0)}%</Text>
          </SemiCircleGauge>
          <View style={styles.mediumContent}>
            <Text style={styles.labelMedium}>PROFIT MARGIN</Text>
            <View style={styles.pillRow}>
              <View style={styles.tinyPill}>
                <Text style={styles.pillText}>{fmtK(revenue)} rev</Text>
              </View>
              <View style={[styles.tinyPill, { backgroundColor: 'rgba(252,165,165,0.2)' }]}>
                <Text style={[styles.pillText, { color: '#FCA5A5' }]}>{fmtK(expenses)} exp</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={styles.containerSmall}
      onPress={onPress}
      activeOpacity={editMode ? 1 : 0.85}
      disabled={editMode}
    >
      <LinearGradient
        colors={['#065F46', '#059669']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientSmall}
      >
        <SemiCircleGauge
          value={gaugeValue}
          size={70}
          strokeWidth={7}
          color={gaugeColor}
          trackColor="rgba(255,255,255,0.15)"
        >
          <Text style={styles.gaugePercent}>{margin.toFixed(1)}%</Text>
        </SemiCircleGauge>
        <Text style={styles.healthLabel}>{healthText}</Text>
        <Text style={styles.label}>MARGIN</Text>
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
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientMedium: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  gaugePercent: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: -4,
  },
  gaugePercentMed: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: -4,
  },
  healthLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    marginTop: 0,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.5,
    marginTop: 1,
  },
  mediumContent: {
    flex: 1,
  },
  labelMedium: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  pillRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  tinyPill: {
    backgroundColor: 'rgba(110,231,183,0.2)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#6EE7B7',
  },
});
