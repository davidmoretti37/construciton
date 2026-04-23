import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

function fmtK(amount) {
  const abs = Math.abs(amount);
  if (abs >= 100000) return `${amount < 0 ? '-' : ''}$${Math.round(abs / 1000)}K`;
  if (abs >= 1000) return `${amount < 0 ? '-' : ''}$${(abs / 1000).toFixed(1)}K`;
  return `${amount < 0 ? '-' : ''}$${Math.round(abs)}`;
}

export default function OverdueInvoicesWidget({ count, amount, size, editMode, onPress }) {
  const pulse = useSharedValue(0.3);

  useEffect(() => {
    if (count > 0 && !editMode) {
      pulse.value = withRepeat(
        withTiming(0.7, { duration: 1200 }),
        -1,
        true
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = 0;
    }
  }, [count, editMode]);

  const glowStyle = useAnimatedStyle(() => ({
    borderWidth: count > 0 ? 2 : 0,
    borderColor: `rgba(252,165,165,${pulse.value})`,
  }));

  const gradientColors = count > 0 ? ['#DC2626', '#EF4444'] : ['#059669', '#10B981'];

  if (size === 'medium') {
    return (
      <TouchableOpacity
        style={styles.containerMedium}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <Animated.View style={[styles.animWrap, glowStyle]}>
          <LinearGradient
            colors={gradientColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradientMedium}
          >
            <Text style={styles.valueMedium}>{count}</Text>
            <View style={styles.mediumContent}>
              <Text style={styles.titleMedium}>Invoices</Text>
              <Text style={styles.labelMedium}>{count > 0 ? 'OVERDUE' : 'ALL CURRENT'}</Text>
              <Text style={styles.amountText}>{fmtK(amount)} outstanding</Text>
            </View>
            <Ionicons name="alert-circle" size={20} color="rgba(255,255,255,0.3)" />
          </LinearGradient>
        </Animated.View>
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
      <Animated.View style={[styles.animWrap, glowStyle]}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientSmall}
        >
          <Text style={styles.titleSmall}>Invoices</Text>
          <Ionicons name="alert-circle" size={16} color="rgba(255,255,255,0.3)" style={styles.bgIcon} />
          <Text style={styles.valueSmall}>{count}</Text>
          {amount > 0 && (
            <View style={styles.amountPill}>
              <Text style={styles.amountPillText}>{fmtK(amount)}</Text>
            </View>
          )}
          <Text style={styles.label}>{count > 0 ? 'OVERDUE' : 'ALL CURRENT'}</Text>
        </LinearGradient>
      </Animated.View>
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
  animWrap: {
    flex: 1,
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
  titleMedium: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.2,
    marginBottom: 1,
  },
  gradientMedium: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bgIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
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
  amountPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  amountPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
    marginTop: 4,
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
  amountText: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
});
