import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withSequence,
} from 'react-native-reanimated';
import { useNotifications } from '../contexts/NotificationContext';
import { useTheme } from '../contexts/ThemeContext';
import { getColors, LightColors } from '../constants/theme';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function NotificationBell({ onPress, size = 24, color }) {
  const { unreadCount } = useNotifications();
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const scale = useSharedValue(1);

  const iconColor = color || Colors.primaryText || '#1F2937';

  const handlePress = () => {
    // Animate bell on press
    scale.value = withSequence(
      withSpring(0.85, { damping: 10 }),
      withSpring(1, { damping: 10 })
    );
    onPress?.();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const formatBadgeCount = (count) => {
    if (count > 99) return '99+';
    return count.toString();
  };

  return (
    <AnimatedTouchable
      onPress={handlePress}
      style={[styles.container, animatedStyle]}
      activeOpacity={0.7}
    >
      <Ionicons name="notifications-outline" size={size} color={iconColor} />
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{formatBadgeCount(unreadCount)}</Text>
        </View>
      )}
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 8,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
});
