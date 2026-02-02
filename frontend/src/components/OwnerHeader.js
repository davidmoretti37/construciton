/**
 * OwnerHeader - Consistent header for all Boss Portal screens
 *
 * Layout: Title                    [rightComponent]
 *
 * Features:
 * - Title (inline)
 * - Optional right component (e.g., NotificationBell)
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getColors, LightColors, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

/**
 * OwnerHeader Component
 *
 * @param {Object} props
 * @param {string} props.title - Screen title
 * @param {React.ReactNode} props.rightComponent - Component on right side (e.g., NotificationBell)
 */
const OwnerHeader = ({
  title,
  rightComponent,
}) => {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {/* Left spacer for centering */}
        <View style={styles.leftSpacer} />

        {/* Title - centered */}
        {title ? (
          <Text style={[styles.centeredTitle, { color: Colors.primaryText }]} numberOfLines={1}>
            {title}
          </Text>
        ) : (
          <View style={styles.spacer} />
        )}

        {/* Right side: optional component */}
        <View style={styles.rightContainer}>
          {rightComponent}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftSpacer: {
    width: 40, // Match right container width for true centering
  },
  centeredTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
    flex: 1,
    marginHorizontal: 8,
  },
  spacer: {
    flex: 1,
  },
  rightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 40,
    justifyContent: 'flex-end',
  },
});

export default OwnerHeader;
