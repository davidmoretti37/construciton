import React from 'react';
import { View } from 'react-native';
import SkeletonCard from './SkeletonCard';

const SkeletonList = ({ count = 3, lines = 3, showAvatar = false, style, cardStyle }) => {
  return (
    <View style={style}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} showAvatar={showAvatar} style={cardStyle} />
      ))}
    </View>
  );
};

export default SkeletonList;
