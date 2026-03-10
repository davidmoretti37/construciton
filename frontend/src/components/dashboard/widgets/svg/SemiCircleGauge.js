import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx, cy, radius, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

export default function SemiCircleGauge({
  value = 0, // 0-1
  size = 80,
  strokeWidth = 8,
  color = '#6EE7B7',
  trackColor = 'rgba(255,255,255,0.15)',
  children,
}) {
  const cx = size / 2;
  const cy = size / 2 + 4;
  const radius = (size - strokeWidth) / 2 - 2;
  const clampedVal = Math.min(1, Math.max(0, value));

  const trackPath = describeArc(cx, cy, radius, 180, 360);
  const valuePath = describeArc(cx, cy, radius, 180, 180 + clampedVal * 180);

  return (
    <View style={{ width: size, height: size / 2 + 8, alignItems: 'center', justifyContent: 'flex-end' }}>
      <Svg width={size} height={size / 2 + 8} style={{ position: 'absolute', top: 0 }}>
        <Path
          d={trackPath}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
        {clampedVal > 0 && (
          <Path
            d={valuePath}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
          />
        )}
      </Svg>
      {children}
    </View>
  );
}
