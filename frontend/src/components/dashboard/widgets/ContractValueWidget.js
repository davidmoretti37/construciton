import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import HorizontalGauge from './svg/HorizontalGauge';

function fmtK(amount) {
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  if (abs >= 1000000) return `${n < 0 ? '-' : ''}$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 100000) return `${n < 0 ? '-' : ''}$${Math.round(abs / 1000)}K`;
  if (abs >= 1000) return `${n < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${n < 0 ? '-' : ''}$${Math.round(abs)}`;
}

export default function ContractValueWidget({
  totalContractValue,
  totalRevenue,
  totalProjects,
  size,
  editMode,
  onPress,
  topProjects = [],
  onProjectPress,
}) {
  const remaining = Math.max(0, (totalContractValue || 0) - (totalRevenue || 0));
  const segments = [
    { value: totalRevenue || 1, color: '#A5B4FC' },
    { value: remaining || 1, color: 'rgba(255,255,255,0.15)' },
  ];
  const showRows = (size === 'medium' || size === 'large') && topProjects.length > 0;
  const rowLimit = size === 'large' ? 4 : 3;
  const rows = topProjects.slice(0, rowLimit);

  if (size === 'medium' || size === 'large') {
    return (
      <TouchableOpacity
        style={[styles.containerMedium, size === 'large' && styles.containerLarge]}
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
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.valueMedium}>{fmtK(totalContractValue)}</Text>
              <Text style={styles.labelMedium}>CONTRACTS · {totalProjects} projects</Text>
            </View>
            <View style={styles.headerRight}>
              <Text style={styles.earnedText}>{fmtK(totalRevenue)} earned</Text>
              <View style={{ width: 110, marginTop: 4 }}>
                <HorizontalGauge segments={segments} height={5} borderRadius={3} width={110} />
              </View>
            </View>
          </View>

          {showRows && (
            <View style={styles.rowList}>
              {rows.map((p, idx) => (
                <TouchableOpacity
                  key={p.id || idx}
                  style={[styles.row, idx < rows.length - 1 && styles.rowDivider]}
                  activeOpacity={0.7}
                  disabled={editMode}
                  onPress={() => onProjectPress && onProjectPress(p.id)}
                >
                  <Text style={styles.rowName} numberOfLines={1}>{p.name || 'Untitled'}</Text>
                  <Text style={styles.rowValue}>{fmtK(p.contractAmount || p.contract_amount || 0)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  // small
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
  containerLarge: {
    height: '100%',
  },
  gradientSmall: {
    flex: 1,
    padding: 14,
    justifyContent: 'flex-end',
  },
  gradientMedium: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerRight: {
    alignItems: 'flex-end',
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
  labelMedium: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  earnedText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A5B4FC',
  },
  rowList: {
    flex: 1,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  rowDivider: {
    borderBottomColor: 'rgba(255,255,255,0.08)',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowName: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  rowValue: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    fontVariant: ['tabular-nums'],
  },
});
