import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

function VennDiagram({ unmatched, suggested, size = 50 }) {
  const r = size * 0.35;
  const overlap = size * 0.15;
  const cx1 = size / 2 - overlap;
  const cx2 = size / 2 + overlap;
  const cy = size / 2;
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx1} cy={cy} r={r} fill="rgba(253,186,116,0.35)" />
      <Circle cx={cx2} cy={cy} r={r} fill="rgba(255,255,255,0.2)" />
    </Svg>
  );
}

export default function UnmatchedTxnsWidget({ unmatchedCount, suggestedCount, size, editMode, onPress }) {
  const total = unmatchedCount + suggestedCount;

  if (size === 'medium') {
    return (
      <TouchableOpacity
        style={styles.containerMedium}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <LinearGradient
          colors={['#C2410C', '#EA580C']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientMedium}
        >
          <VennDiagram unmatched={unmatchedCount} suggested={suggestedCount} size={46} />
          <View style={styles.mediumContent}>
            <Text style={styles.valueMedium}>{total}</Text>
            <Text style={styles.labelMedium}>UNMATCHED</Text>
          </View>
          <View style={styles.breakdownCol}>
            <Text style={styles.breakdownItem}>{unmatchedCount} unmatched</Text>
            <Text style={styles.breakdownItem}>{suggestedCount} suggested</Text>
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
        colors={['#C2410C', '#EA580C']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientSmall}
      >
        <View style={styles.vennWrap}>
          <VennDiagram unmatched={unmatchedCount} suggested={suggestedCount} size={40} />
        </View>
        <Text style={styles.valueSmall}>{total}</Text>
        <Text style={styles.label}>UNMATCHED</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientMedium: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  vennWrap: {
    marginBottom: 2,
  },
  valueSmall: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
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
  breakdownCol: {
    alignItems: 'flex-end',
  },
  breakdownItem: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
  },
});
