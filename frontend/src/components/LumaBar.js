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
  { id: 0, icon: 'home', label: 'Home', routeIndex: 0 },
  { id: 1, icon: 'file-tray-full', label: 'Projects', routeIndex: 1 },
  { id: 2, icon: 'chatbubbles', label: 'Chat', routeIndex: 2 },
  { id: 3, icon: 'people', label: 'Workers', routeIndex: 3 },
  { id: 4, icon: 'settings', label: 'Settings', routeIndex: 4 },
];

const LumaBar = ({ state, navigation }) => {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = createStyles(Colors);

  // Shimmer animation
  const shimmerRotation = useSharedValue(0);

  useEffect(() => {
    shimmerRotation.value = withRepeat(
      withTiming(360, {
        duration: 3000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, []);

  // Animated shimmer style
  const animatedShimmerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${shimmerRotation.value}deg` }],
    };
  });

  // Dynamic shimmer colors for dark/light mode
  const shimmerColors = isDark
    ? [Colors.border, Colors.secondaryText, Colors.border, Colors.secondaryText, Colors.border]
    : ['#9CA3AF', '#E5E5E5', '#6B7280', '#E5E5E5', '#9CA3AF'];

  // Map navigation state index to visual item index
  const getVisualIndex = (routeIndex) => {
    const item = items.find(item => item.routeIndex === routeIndex);
    return item ? item.id : 0;
  };

  const [active, setActive] = useState(getVisualIndex(state.index));

  useEffect(() => {
    setActive(getVisualIndex(state.index));
  }, [state.index]);

  const handlePress = (index) => {
    const route = items[index];
    navigation.navigate(route.label);
  };

  return (
    <View style={styles.container}>
      {/* Shimmer Border Container */}
      <View style={styles.shimmerContainer}>
        {/* Rotating Shimmer Gradient */}
        <Animated.View style={[styles.shimmerBorder, animatedShimmerStyle]}>
          <LinearGradient
            colors={shimmerColors}
            locations={[0, 0.25, 0.5, 0.75, 1]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.shimmerGradient}
          />
        </Animated.View>

        {/* Main Nav Bar */}
        <View style={[styles.navBar, { backgroundColor: Colors.navBarBackground }]}>
          {/* Navigation Items */}
          {items.map((item, index) => {
            const isActive = index === active;
            return (
              <NavItem
                key={item.id}
                item={item}
                isActive={isActive}
                onPress={() => handlePress(index)}
                Colors={Colors}
              />
            );
          })}
        </View>
      </View>
    </View>
  );
};

const NavItem = ({ item, isActive, onPress, Colors }) => {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
    };
  });

  useEffect(() => {
    scale.value = withSpring(isActive ? 1.25 : 1, {
      damping: 15,
      stiffness: 300,
    });
  }, [isActive]);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={navItemStyles.navItem}
    >
      <Animated.View style={[navItemStyles.iconContainer, animatedStyle]}>
        <Ionicons
          name={item.icon}
          size={22}
          color={isActive ? Colors.primaryBlue : Colors.secondaryText}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

// Static styles for NavItem (doesn't need dynamic colors)
const navItemStyles = StyleSheet.create({
  navItem: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const createStyles = (Colors) => StyleSheet.create({
  container: {
    // Positioning handled by parent SupervisorNavContainer
    alignItems: 'center',
    justifyContent: 'center',
  },
  shimmerContainer: {
    borderRadius: 27,
    padding: 2,
    overflow: 'hidden',
  },
  shimmerBorder: {
    position: 'absolute',
    top: -50,
    left: -50,
    right: -50,
    bottom: -50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shimmerGradient: {
    width: 400,
    height: 400,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 6,
    shadowColor: Colors.shadow,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
});

export default LumaBar;
