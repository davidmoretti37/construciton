import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

const ThemeSwitch = () => {
  const { isDark = false, toggleTheme = () => {} } = useTheme() || {};

  const iconStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { rotate: withTiming(isDark ? '0deg' : '360deg', { duration: 300 }) },
        { scale: withTiming(1, { duration: 200 }) },
      ],
    };
  });

  return (
    <TouchableOpacity onPress={toggleTheme} activeOpacity={0.7} style={styles.touchable}>
      <Animated.View style={[styles.iconContainer, iconStyle]}>
        <Ionicons
          name={isDark ? 'sunny' : 'moon'}
          size={24}
          color={isDark ? '#F59E0B' : '#3B82F6'}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    padding: 8,
  },
  iconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default ThemeSwitch;
