import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

export default function MiniSparkline({
  data = [],
  width = 200,
  height = 40,
  color = 'rgba(255,255,255,0.6)',
  fillColor = 'rgba(255,255,255,0.1)',
}) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const padding = 2;

  const points = data.map((val, i) => ({
    x: padding + (i / (data.length - 1)) * (width - padding * 2),
    y: padding + (1 - (val - min) / range) * (height - padding * 2),
  }));

  // Smooth curve using cubic bezier
  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    linePath += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  // Area path (close to bottom)
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={fillColor} stopOpacity="1" />
          <Stop offset="1" stopColor={fillColor} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={areaPath} fill="url(#sparkFill)" />
      <Path d={linePath} stroke={color} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}
