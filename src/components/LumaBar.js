import React, { useState, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

const items = [
  { id: 0, icon: 'home', label: 'Home', routeIndex: 0 },
  { id: 1, icon: 'file-tray-full', label: 'Projects', routeIndex: 1 },
  { id: 2, icon: 'chatbubbles', label: 'Chat', routeIndex: 3 },
  { id: 3, icon: 'people', label: 'Workers', routeIndex: 2 },
  { id: 4, icon: 'stats-chart', label: 'Stats', routeIndex: 4 },
];

const LumaBar = ({ state, navigation }) => {
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
            />
          );
        })}
      </View>
    </View>
  );
};

const NavItem = ({ item, isActive, onPress }) => {
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
      style={styles.navItem}
    >
      <Animated.View style={[styles.iconContainer, animatedStyle]}>
        <Ionicons
          name={item.icon}
          size={22}
          color={isActive ? '#3B82F6' : '#6B7280'}
        />
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
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
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.6)',
  },
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
});

export default LumaBar;
