import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LightColors, getColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import NotificationBell from './NotificationBell';

const items = [
  { id: 0, icon: 'time', label: 'TimeClock', routeIndex: 0 },
  { id: 1, icon: 'briefcase', label: 'WorkerProjects', routeIndex: 1 },
  { id: 2, icon: 'clipboard', label: 'TodaysWork', routeIndex: 2 },
];

const WorkerLumaBar = ({ state, navigation }) => {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const styles = createStyles(Colors);

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
      <View style={styles.navBar}>
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

  // Worker nav uses teal (#059669) as brand color
  const activeColor = '#059669';

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
          color={isActive ? activeColor : Colors.secondaryText}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

// Static styles for NavItem
const navItemStyles = StyleSheet.create({
  navItem: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(128,128,128,0.2)',
    marginHorizontal: 4,
  },
});

const createStyles = (Colors) => StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 20,
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
    borderWidth: 1,
    borderColor: Colors.border,
  },
});

export default WorkerLumaBar;
