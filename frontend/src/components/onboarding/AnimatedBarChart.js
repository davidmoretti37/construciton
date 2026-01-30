/**
 * AnimatedBarChart
 * Financial bar chart with dramatic bounce animation
 * Bars overshoot, undershoot, then settle at final value
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSequence,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';

const BAR_MAX_HEIGHT = 120;

const AnimatedBar = ({ value, maxValue, label, color, index, isActive, dramatic = false }) => {
  const targetHeight = (value / maxValue) * BAR_MAX_HEIGHT;
  const animatedHeight = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      if (dramatic) {
        // Dramatic bounce: overshoot → undershoot → overshoot → settle
        animatedHeight.value = withDelay(
          index * 120,
          withSequence(
            // Shoot up past target (130%)
            withTiming(targetHeight * 1.35, { duration: 300, easing: Easing.out(Easing.cubic) }),
            // Drop below target (60%)
            withTiming(targetHeight * 0.5, { duration: 200, easing: Easing.inOut(Easing.ease) }),
            // Bounce back up (115%)
            withTiming(targetHeight * 1.15, { duration: 180, easing: Easing.out(Easing.ease) }),
            // Settle to final with spring
            withSpring(targetHeight, { damping: 10, stiffness: 120 })
          )
        );
      } else {
        // Simple spring animation
        animatedHeight.value = withDelay(
          index * 100,
          withSpring(targetHeight, { damping: 12, stiffness: 100 })
        );
      }
    } else {
      animatedHeight.value = 0;
    }
  }, [isActive, targetHeight, dramatic]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: Math.max(4, animatedHeight.value),
  }));

  return (
    <View style={styles.barContainer}>
      <View style={styles.barWrapper}>
        <Animated.View
          style={[
            styles.bar,
            { backgroundColor: color },
            animatedStyle,
          ]}
        />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};

export default function AnimatedBarChart({ data, isActive = true, dramatic = false }) {
  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <View style={styles.container}>
      <View style={styles.chartArea}>
        {data.map((item, index) => (
          <AnimatedBar
            key={item.label}
            value={item.value}
            maxValue={maxValue}
            label={item.label}
            color={item.color || '#3B82F6'}
            index={index}
            isActive={isActive}
            dramatic={dramatic}
          />
        ))}
      </View>
      {/* Y-axis labels */}
      <View style={styles.yAxis}>
        <Text style={styles.yLabel}>${Math.round(maxValue / 1000)}K</Text>
        <Text style={styles.yLabel}>${Math.round(maxValue / 2000)}K</Text>
        <Text style={styles.yLabel}>$0</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 16,
  },
  yAxis: {
    height: BAR_MAX_HEIGHT,
    justifyContent: 'space-between',
    paddingRight: 8,
    marginRight: 8,
  },
  yLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  chartArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: BAR_MAX_HEIGHT,
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingLeft: 8,
  },
  barContainer: {
    alignItems: 'center',
  },
  barWrapper: {
    height: BAR_MAX_HEIGHT,
    justifyContent: 'flex-end',
  },
  bar: {
    width: 32,
    borderRadius: 4,
    minHeight: 4,
  },
  label: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 6,
  },
});
