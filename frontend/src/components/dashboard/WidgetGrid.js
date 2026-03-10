import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Spacing } from '../../constants/theme';

const screenWidth = Dimensions.get('window').width;
const GAP = 12;
export const colWidth = (screenWidth - Spacing.lg * 2 - GAP) / 2;

export function getWidgetSize(size) {
  switch (size) {
    case 'small':
      return { width: colWidth, height: 130 };
    case 'medium':
      return { width: screenWidth - Spacing.lg * 2, height: 110 };
    case 'large':
    default:
      return { width: screenWidth - Spacing.lg * 2, height: 200 };
  }
}

export default function WidgetGrid({ widgets, editMode, children }) {
  return (
    <View style={styles.grid}>
      {widgets.map((widget, index) => children(widget, index))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GAP,
  },
});
