import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LightColors, getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const items = [
  { id: 0, icon: 'home', label: 'Home', routeName: 'Home', routeIndex: 0 },
  { id: 1, icon: 'calendar', label: 'Timeline', routeName: 'Timeline', routeIndex: 1 },
  { id: 2, icon: 'folder-open', label: 'Documents', routeName: 'Documents', routeIndex: 2 },
  { id: 3, icon: 'card', label: 'Money', routeName: 'Money', routeIndex: 3 },
  { id: 4, icon: 'grid', label: 'More', routeName: 'More', routeIndex: 4 },
];

const ClientLumaBar = ({ state, navigation }) => {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = createStyles(Colors);

  const shimmerRotation = useSharedValue(0);

  useEffect(() => {
    shimmerRotation.value = withRepeat(
      withTiming(360, { duration: 3000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const animatedShimmerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${shimmerRotation.value}deg` }],
  }));

  const shimmerColors = isDark
    ? [Colors.border, '#D97706', Colors.border, '#D97706', Colors.border]
    : ['#9CA3AF', '#FBBF24', '#F59E0B', '#FBBF24', '#9CA3AF'];

  const getVisualIndex = (routeIndex) => {
    const item = items.find(i => i.routeIndex === routeIndex);
    return item ? item.id : 0;
  };

  const [active, setActive] = useState(getVisualIndex(state.index));

  useEffect(() => {
    setActive(getVisualIndex(state.index));
  }, [state.index]);

  const handlePress = (index) => {
    navigation.navigate(items[index].routeName);
  };

  return (
    <View style={styles.container}>
      <View style={styles.shimmerContainer}>
        <Animated.View style={[styles.shimmerBorder, animatedShimmerStyle]}>
          <LinearGradient
            colors={shimmerColors}
            locations={[0, 0.25, 0.5, 0.75, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.shimmerGradient}
          />
        </Animated.View>
        <View style={[styles.navBar, { backgroundColor: Colors.navBarBackground }]}>
          {items.map((item, index) => (
            <NavItem
              key={item.id}
              item={item}
              isActive={index === active}
              onPress={() => handlePress(index)}
              Colors={Colors}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

const NavItem = ({ item, isActive, onPress, Colors }) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  useEffect(() => {
    scale.value = withSpring(isActive ? 1.25 : 1, { damping: 15, stiffness: 300 });
  }, [isActive]);

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={navItemStyles.navItem}>
      <Animated.View style={[navItemStyles.iconContainer, animatedStyle]}>
        <Ionicons
          name={item.icon}
          size={22}
          color={isActive ? '#F59E0B' : Colors.secondaryText}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

const navItemStyles = StyleSheet.create({
  navItem: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
  iconContainer: { alignItems: 'center', justifyContent: 'center' },
});

const createStyles = (Colors) => StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  shimmerContainer: { borderRadius: 27, padding: 2, overflow: 'hidden' },
  shimmerBorder: { position: 'absolute', top: -50, left: -50, right: -50, bottom: -50, alignItems: 'center', justifyContent: 'center' },
  shimmerGradient: { width: 400, height: 400 },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 25, paddingHorizontal: 16, paddingVertical: 6,
    shadowColor: Colors.shadow, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 8,
  },
});

export default ClientLumaBar;
