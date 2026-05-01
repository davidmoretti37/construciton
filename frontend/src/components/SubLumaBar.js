/**
 * SubLumaBar — floating pill navigation for the sub portal.
 *
 * Visual parity with WorkerLumaBar / OwnerLumaBar: rounded card, animated
 * icon scale on active. Sub portal brand color is violet (#8B5CF6).
 *
 * Props:
 *   active: 'home' | 'documents' | 'work' | 'settings'
 *   onChange: (key) => void
 */

import React, { useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const SUB_VIOLET = '#8B5CF6';

const ITEMS = [
  { key: 'home',      icon: 'home' },
  { key: 'work',      icon: 'briefcase' },
  { key: 'documents', icon: 'folder' },
  { key: 'settings',  icon: 'settings' },
];

export default function SubLumaBar({ active, onChange }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = createStyles(Colors);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.navBar}>
        {ITEMS.map((item) => (
          <NavItem
            key={item.key}
            item={item}
            isActive={active === item.key}
            onPress={() => onChange(item.key)}
            Colors={Colors}
          />
        ))}
      </View>
    </View>
  );
}

function NavItem({ item, isActive, onPress, Colors }) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    scale.value = withSpring(isActive ? 1.25 : 1, {
      damping: 15,
      stiffness: 300,
    });
  }, [isActive]);

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={navItemStyles.navItem}>
      <Animated.View style={[navItemStyles.iconContainer, animatedStyle]}>
        <Ionicons
          name={item.icon}
          size={22}
          color={isActive ? SUB_VIOLET : Colors.secondaryText}
        />
      </Animated.View>
    </TouchableOpacity>
  );
}

const navItemStyles = StyleSheet.create({
  navItem: {
    width: 56,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  iconContainer: { alignItems: 'center', justifyContent: 'center' },
});

const createStyles = (Colors) => StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.navBarBackground,
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingVertical: 8,
    shadowColor: Colors.shadow || '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
