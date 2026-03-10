import React from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

export default function HorizontalGauge({
  segments = [], // [{value, color}]
  height = 6,
  borderRadius = 3,
  width = 200,
}) {
  const total = segments.reduce((sum, s) => sum + (s.value || 0), 0);
  if (total === 0) return null;

  let x = 0;
  const gap = 2;
  const bars = [];

  segments.forEach((seg, i) => {
    const pct = seg.value / total;
    const barWidth = Math.max(2, pct * (width - gap * (segments.length - 1)));
    bars.push(
      <Rect
        key={i}
        x={x}
        y={0}
        width={barWidth}
        height={height}
        rx={borderRadius}
        ry={borderRadius}
        fill={seg.color}
      />
    );
    x += barWidth + gap;
  });

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {bars}
      </Svg>
    </View>
  );
}
