/**
 * AnimatedBarChart
 * Financial bar chart with bars growing from bottom
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
} from 'react-native-reanimated';

const BAR_MAX_HEIGHT = 120;

const AnimatedBar = ({ value, maxValue, label, color, delay, isActive }) => {
  const height = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      const targetHeight = (value / maxValue) * BAR_MAX_HEIGHT;
      height.value = withDelay(
        delay,
        withSpring(targetHeight, { damping: 12, stiffness: 100 })
      );
    }
  }, [isActive, value, maxValue, delay]);

  const barStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return (
    <View style={styles.barContainer}>
      <View style={styles.barWrapper}>
        <Animated.View
          style={[
            styles.bar,
            barStyle,
            { backgroundColor: color },
          ]}
        />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
};

export default function AnimatedBarChart({
  data,
  delay = 0,
  isActive = true,
}) {
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
            delay={delay + index * 150}
            isActive={isActive}
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
