import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

export default function VerticalBarGroup({
  data = [], // [{label, values: [{value, color}]}]
  maxValue = 1,
  barWidth = 14,
  barGap = 3,
  chartHeight = 80,
  labelColor = 'rgba(255,255,255,0.6)',
}) {
  return (
    <View style={styles.container}>
      {data.map((group, gi) => {
        const groupWidth = group.values.length * barWidth + (group.values.length - 1) * barGap;
        return (
          <View key={gi} style={styles.group}>
            <View style={[styles.barArea, { height: chartHeight }]}>
              <Svg width={groupWidth} height={chartHeight}>
                {group.values.map((bar, bi) => {
                  const h = Math.max(4, (bar.value / maxValue) * chartHeight);
                  const x = bi * (barWidth + barGap);
                  const y = chartHeight - h;
                  return (
                    <Rect
                      key={bi}
                      x={x}
                      y={y}
                      width={barWidth}
                      height={h}
                      rx={barWidth / 3}
                      ry={barWidth / 3}
                      fill={bar.color}
                      opacity={bar.opacity || 1}
                    />
                  );
                })}
              </Svg>
            </View>
            <Text style={[styles.label, { color: labelColor }]}>{group.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    flex: 1,
  },
  group: {
    alignItems: 'center',
  },
  barArea: {
    justifyContent: 'flex-end',
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 4,
  },
});
