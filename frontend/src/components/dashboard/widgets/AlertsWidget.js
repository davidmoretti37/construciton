import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  cancelAnimation,
} from 'react-native-reanimated';

export default function AlertsWidget({ alerts, size, editMode, onNavigate }) {
  const iconScale = useSharedValue(1);

  useEffect(() => {
    if (alerts.length > 0 && !editMode) {
      iconScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 800 }),
          withTiming(1, { duration: 800 })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(iconScale);
      iconScale.value = 1;
    }
  }, [alerts.length, editMode]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  if (alerts.length === 0) {
    return (
      <View style={styles.container}>
        <LinearGradient
          colors={['#D1FAE5', '#A7F3D0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <Ionicons name="checkmark-circle" size={20} color="#059669" />
          <Text style={styles.allClear}>All clear</Text>
        </LinearGradient>
      </View>
    );
  }

  const first = alerts[0];
  const moreCount = alerts.length - 1;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => !editMode && first.onPress && first.onPress()}
      activeOpacity={editMode ? 1 : 0.85}
    >
      <LinearGradient
        colors={['#FEF3C7', '#FDE68A']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.gradient}
      >
        <Animated.View style={iconAnimStyle}>
          <Ionicons name="warning" size={20} color="#D97706" />
        </Animated.View>
        <Text style={styles.text} numberOfLines={1}>{first.text}</Text>
        {moreCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>+{moreCount}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color="#B45309" />
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  gradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  allClear: {
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
    marginLeft: 6,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    flex: 1,
  },
  badge: {
    backgroundColor: '#D97706',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
