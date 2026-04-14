/**
 * WorkScreen — Container with weighted toggle between Projects and Services
 * Active tab grows larger, inactive shrinks — clear visual hierarchy
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import NotificationBell from '../../components/NotificationBell';
import OwnerProjectsScreen from './OwnerProjectsScreen';
import ServicePlansScreen from './ServicePlansScreen';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOGGLE_PADDING = Spacing.lg * 2 + 6; // horizontal padding + gap
const TOTAL_WIDTH = SCREEN_WIDTH - TOGGLE_PADDING;
const ACTIVE_RATIO = 0.63;
const INACTIVE_RATIO = 1 - ACTIVE_RATIO;

const SPRING_CONFIG = { damping: 18, stiffness: 180, mass: 0.8 };

export default function WorkScreen() {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const navigation = useNavigation();
  const [activeSegment, setActiveSegment] = useState(0);
  const [showFilter, setShowFilter] = useState(false);
  const progress = useSharedValue(0); // 0 = Projects active, 1 = Services active

  // Restore last selected tab
  useEffect(() => {
    AsyncStorage.getItem('@work_tab').then(val => {
      if (val === '1') {
        setActiveSegment(1);
        progress.value = 1;
      }
    });
  }, []);

  const handleToggle = (index) => {
    setActiveSegment(index);
    progress.value = withSpring(index, SPRING_CONFIG);
    AsyncStorage.setItem('@work_tab', String(index));
  };

  // Animated widths
  const projectsStyle = useAnimatedStyle(() => ({
    flex: interpolate(progress.value, [0, 1], [ACTIVE_RATIO, INACTIVE_RATIO]),
  }));

  const servicesStyle = useAnimatedStyle(() => ({
    flex: interpolate(progress.value, [0, 1], [INACTIVE_RATIO, ACTIVE_RATIO]),
  }));

  // Animated text sizes
  const projectsTextStyle = useAnimatedStyle(() => ({
    fontSize: interpolate(progress.value, [0, 1], [17, 13]),
    opacity: interpolate(progress.value, [0, 1], [1, 0.55]),
  }));

  const servicesTextStyle = useAnimatedStyle(() => ({
    fontSize: interpolate(progress.value, [0, 1], [13, 17]),
    opacity: interpolate(progress.value, [0, 1], [0.55, 1]),
  }));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Work</Text>
        <View style={styles.headerRight}>
          {activeSegment === 0 && (
            <TouchableOpacity
              style={styles.addProjectBtn}
              onPress={() => navigation.navigate('ManualProjectCreate')}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle" size={28} color="#1E40AF" />
            </TouchableOpacity>
          )}
          <NotificationBell onPress={() => navigation.navigate('Notifications')} />
        </View>
      </View>

      {/* Toggle row with filter */}
      <View style={styles.toggleWrapper}>
        <TouchableOpacity
          style={styles.filterBtn}
          onPress={() => setShowFilter(!showFilter)}
          activeOpacity={0.7}
        >
          <Ionicons name="filter" size={18} color={showFilter ? '#1E40AF' : Colors.secondaryText} />
        </TouchableOpacity>
        {/* Projects pill */}
        <Animated.View style={[styles.pillOuter, projectsStyle]}>
          <TouchableOpacity
            style={[
              styles.pill,
              activeSegment === 0 ? styles.pillActive : styles.pillInactive,
            ]}
            onPress={() => handleToggle(0)}
            activeOpacity={0.8}
          >
            <Animated.Text style={[
              styles.pillText,
              projectsTextStyle,
              { color: activeSegment === 0 ? '#1E40AF' : Colors.secondaryText },
              activeSegment === 0 && styles.pillTextActive,
            ]}>
              Projects
            </Animated.Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Services pill */}
        <Animated.View style={[styles.pillOuter, servicesStyle]}>
          <TouchableOpacity
            style={[
              styles.pill,
              activeSegment === 1 ? styles.pillActive : styles.pillInactive,
            ]}
            onPress={() => handleToggle(1)}
            activeOpacity={0.8}
          >
            <Animated.Text style={[
              styles.pillText,
              servicesTextStyle,
              { color: activeSegment === 1 ? '#1E40AF' : Colors.secondaryText },
              activeSegment === 1 && styles.pillTextActive,
            ]}>
              Services
            </Animated.Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {activeSegment === 0 ? (
          <OwnerProjectsScreen embedded showFilter={showFilter} />
        ) : (
          <ServicePlansScreen showFilter={showFilter} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addProjectBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  toggleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 6,
  },
  filterBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  pillOuter: {
    // flex is set by animated style
  },
  pill: {
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  pillInactive: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  pillText: {
    fontWeight: '500',
  },
  pillTextActive: {
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
});
