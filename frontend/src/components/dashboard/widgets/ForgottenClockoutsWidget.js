import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Line } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  cancelAnimation,
  Easing,
} from 'react-native-reanimated';

const AnimatedLine = Animated.createAnimatedComponent(Line);

function AnimatedClock({ size = 32, editMode }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (!editMode) {
      rotation.value = withRepeat(
        withTiming(360, { duration: 4000, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(rotation);
      rotation.value = 0;
    }
  }, [editMode]);

  const handProps = useAnimatedProps(() => {
    const rad = (rotation.value * Math.PI) / 180;
    const cx = size / 2;
    const cy = size / 2;
    const len = size * 0.3;
    return {
      x2: cx + Math.sin(rad) * len,
      y2: cy - Math.cos(rad) * len,
    };
  });

  const cx = size / 2;
  const cy = size / 2;

  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cy} r={size / 2 - 2} stroke="rgba(255,255,255,0.25)" strokeWidth={1.5} fill="none" />
      <Circle cx={cx} cy={cy} r={1.5} fill="rgba(255,255,255,0.6)" />
      {/* Static hour hand */}
      <Line x1={cx} y1={cy} x2={cx} y2={cy - size * 0.2} stroke="rgba(255,255,255,0.5)" strokeWidth={2} strokeLinecap="round" />
      {/* Animated second hand */}
      <AnimatedLine x1={cx} y1={cy} animatedProps={handProps} stroke="#FDE68A" strokeWidth={1} strokeLinecap="round" />
    </Svg>
  );
}

export default function ForgottenClockoutsWidget({ count, names = [], size, editMode, onPress }) {
  if (size === 'medium') {
    return (
      <TouchableOpacity
        style={styles.containerMedium}
        onPress={onPress}
        activeOpacity={editMode ? 1 : 0.85}
        disabled={editMode}
      >
        <LinearGradient
          colors={['#B45309', '#D97706']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientMedium}
        >
          <AnimatedClock size={36} editMode={editMode} />
          <View style={styles.mediumContent}>
            <View style={styles.countRow}>
              <Text style={styles.valueMedium}>{count}</Text>
              <View style={styles.hrsBadge}>
                <Text style={styles.hrsText}>10+ hrs</Text>
              </View>
            </View>
            {names.length > 0 && (
              <Text style={styles.namesText} numberOfLines={1}>
                {names.join(', ')}
              </Text>
            )}
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
        colors={['#B45309', '#D97706']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientSmall}
      >
        <AnimatedClock size={32} editMode={editMode} />
        <Text style={styles.valueSmall}>{count}</Text>
        <View style={styles.hrsBadgeSmall}>
          <Ionicons name="time-outline" size={9} color="#FDE68A" />
          <Text style={styles.hrsTextSmall}>10+ hrs</Text>
        </View>
        <Text style={styles.label}>CLOCK-OUTS</Text>
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
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradientMedium: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  valueSmall: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 2,
  },
  valueMedium: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 8,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  hrsBadge: {
    backgroundColor: 'rgba(253,230,138,0.2)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 6,
  },
  hrsText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FDE68A',
  },
  hrsBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(253,230,138,0.15)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
  },
  hrsTextSmall: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FDE68A',
  },
  mediumContent: {
    flex: 1,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  namesText: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '500',
    marginTop: 2,
  },
});
