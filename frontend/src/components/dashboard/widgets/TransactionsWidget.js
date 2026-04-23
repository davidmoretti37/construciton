import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import CircularProgress from './svg/CircularProgress';

export default function TransactionsWidget({
  transactionCount,
  matched = 0,
  unmatched = 0,
  size,
  editMode,
  onPress,
}) {
  const total = matched + unmatched;
  const progress = total > 0 ? matched / total : 0;

  if (size === 'medium') {
    return (
      <TouchableOpacity
        style={styles.containerMedium}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <LinearGradient
          colors={['#047857', '#10B981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientMedium}
        >
          <Text style={styles.valueMedium}>{transactionCount}</Text>
          <View style={styles.mediumContent}>
            <Text style={styles.labelMedium}>TRANSACTIONS</Text>
            <Text style={styles.breakdown}>{matched} matched · {unmatched} unmatched</Text>
          </View>
          <CircularProgress
            progress={progress}
            size={36}
            strokeWidth={4}
            color="#A7F3D0"
            trackColor="rgba(255,255,255,0.15)"
          />
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
        colors={['#047857', '#10B981']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientSmall}
      >
        <Text style={styles.titleSmall}>Transactions</Text>
        <Text style={styles.valueSmall}>{transactionCount}</Text>
        <Text style={styles.label}>{matched} matched · {unmatched} unmatched</Text>
        <View style={styles.miniDonut}>
          <CircularProgress
            progress={progress}
            size={28}
            strokeWidth={3}
            color="#A7F3D0"
            trackColor="rgba(255,255,255,0.15)"
          />
        </View>
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
  titleSmall: {
    position: 'absolute',
    top: 12,
    left: 14,
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  gradientMedium: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  valueSmall: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  valueMedium: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  miniDonut: {
    position: 'absolute',
    top: 12,
    right: 12,
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
  breakdown: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
});
