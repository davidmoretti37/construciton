import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import HorizontalGauge from './svg/HorizontalGauge';

function fmtK(amount) {
  const abs = Math.abs(amount);
  if (abs >= 1000000) return `${amount < 0 ? '-' : ''}$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 100000) return `${amount < 0 ? '-' : ''}$${Math.round(abs / 1000)}K`;
  if (abs >= 1000) return `${amount < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${amount < 0 ? '-' : ''}$${Math.round(abs)}`;
}

export default function ContractValueWidget({ totalContractValue, totalRevenue, totalProjects, size, editMode, onPress }) {
  const remaining = Math.max(0, totalContractValue - totalRevenue);
  const segments = [
    { value: totalRevenue || 1, color: '#A5B4FC' },
    { value: remaining || 1, color: 'rgba(255,255,255,0.15)' },
  ];

  if (size === 'medium') {
    return (
      <TouchableOpacity
        style={styles.containerMedium}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <LinearGradient
          colors={['#4338CA', '#6366F1']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientMedium}
        >
          <View style={styles.mediumLeft}>
            <Text style={styles.valueMedium}>{fmtK(totalContractValue)}</Text>
            <Text style={styles.labelMedium}>CONTRACTS</Text>
          </View>
          <View style={styles.mediumRight}>
            <Text style={styles.earnedText}>{fmtK(totalRevenue)} earned</Text>
            <View style={{ width: 120, marginTop: 4 }}>
              <HorizontalGauge segments={segments} height={5} borderRadius={3} width={120} />
            </View>
            <Text style={styles.projText}>{totalProjects} projects</Text>
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
        colors={['#4338CA', '#6366F1']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientSmall}
      >
        <Text style={styles.valueSmall} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {fmtK(totalContractValue)}
        </Text>
        <View style={{ width: '100%', marginTop: 6 }}>
          <HorizontalGauge segments={segments} height={4} borderRadius={2} width={120} />
        </View>
        <Text style={styles.label}>CONTRACTS</Text>
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
  valueSmall: {
    fontSize: 24,
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
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  mediumLeft: {},
  mediumRight: {
    alignItems: 'flex-end',
  },
  labelMedium: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  earnedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A5B4FC',
  },
  projText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
    marginTop: 2,
  },
});
