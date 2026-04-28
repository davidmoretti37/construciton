import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { View, TouchableOpacity, TouchableWithoutFeedback, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useSupervisorPermissions } from '../hooks/useSupervisorPermissions';

// Quick actions configuration - order is bottom to top when expanded
const QUICK_ACTIONS = [
  { id: 'assign-worker', icon: 'person-add-outline', labelKey: 'quickActions.assignWorker', type: 'form', color: '#EC4899' },
  { id: 'expense', icon: 'receipt-outline', labelKey: 'quickActions.logTransaction', type: 'form', color: '#10B981' },
  { id: 'report', icon: 'document-text-outline', labelKey: 'quickActions.dailyReport', type: 'form', color: '#F59E0B' },
  { id: 'estimate', icon: 'calculator-outline', labelKey: 'quickActions.newEstimate', type: 'ai', color: '#8B5CF6' },
  { id: 'project', icon: 'folder-outline', labelKey: 'quickActions.newProject', type: 'ai', color: '#3B82F6' },
];

/**
 * QuickActionFAB - Floating action button with expandable menu
 * @param {function} onActionPress - Callback when an action is pressed
 * @param {string} primaryColor - Primary color for the FAB (default: blue)
 * @param {string} variant - 'owner' or 'supervisor' for different styling
 */
const QuickActionFAB = forwardRef(({ onActionPress, primaryColor = '#3B82F6', variant = 'supervisor', menuItemRefs = {} }, ref) => {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');
  const supervisorPerms = useSupervisorPermissions();

  const [isExpanded, setIsExpanded] = useState(false);
  const expanded = useSharedValue(0);

  // Expose expand/collapse to parent for walkthrough
  useImperativeHandle(ref, () => ({
    expand: () => {
      expanded.value = withTiming(1, { duration: 200 });
      setIsExpanded(true);
    },
    collapse: () => {
      expanded.value = withTiming(0, { duration: 200 });
      setIsExpanded(false);
    },
  }));

  // Use owner blue for owner variant
  const fabColor = variant === 'owner' ? '#1E40AF' : primaryColor;

  // Supervisors see estimate/project quick actions only when the owner has
  // granted those permissions. Owners always see everything and get the
  // "Add Worker" label (vs supervisors' "Assign Worker").
  const availableActions = variant === 'supervisor'
    ? QUICK_ACTIONS.filter(a => {
        if (a.id === 'estimate') return supervisorPerms.canCreateEstimates;
        if (a.id === 'project') return supervisorPerms.canCreateProjects;
        return true;
      })
    : QUICK_ACTIONS.map(a => a.id === 'assign-worker' ? { ...a, labelKey: 'quickActions.addWorker' } : a);

  const toggleExpand = () => {
    const newValue = isExpanded ? 0 : 1;
    expanded.value = withTiming(newValue, { duration: 200 });
    setIsExpanded(!isExpanded);
  };

  const handleActionPress = (action) => {
    // Collapse menu
    expanded.value = withTiming(0, { duration: 200 });
    setIsExpanded(false);

    // Trigger action
    if (onActionPress) {
      onActionPress(action);
    }
  };

  const handleBackdropPress = () => {
    expanded.value = withTiming(0, { duration: 200 });
    setIsExpanded(false);
  };

  // Main FAB rotation animation (+ to ×)
  const fabAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(expanded.value, [0, 1], [0, 45])}deg` }],
  }));

  // Backdrop fade animation
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(expanded.value, [0, 1], [0, 1]),
    pointerEvents: expanded.value > 0.5 ? 'auto' : 'none',
  }));

  return (
    <View style={styles.container}>
      {/* Backdrop */}
      <TouchableWithoutFeedback onPress={handleBackdropPress}>
        <Animated.View style={[styles.backdrop, backdropAnimatedStyle]} />
      </TouchableWithoutFeedback>

      {/* Menu Items */}
      <View style={styles.menuContainer}>
        {availableActions.map((action, index) => (
          <MenuItem
            key={action.id}
            action={action}
            index={index}
            expanded={expanded}
            onPress={() => handleActionPress(action)}
            Colors={Colors}
            t={t}
            itemRef={menuItemRefs[action.id]}
          />
        ))}
      </View>

      {/* Main FAB Button */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: fabColor }]}
        onPress={toggleExpand}
        activeOpacity={0.8}
      >
        <Animated.View style={fabAnimatedStyle}>
          <Ionicons name="add" size={28} color="#fff" />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
});

const MenuItem = ({ action, index, expanded, onPress, Colors, t, itemRef }) => {
  // Staggered animation for each menu item
  const animatedStyle = useAnimatedStyle(() => {
    const baseOffset = 70; // Base distance between items
    const translateY = interpolate(
      expanded.value,
      [0, 1],
      [0, -(index + 1) * baseOffset],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(expanded.value, [0, 0.3, 1], [0, 0, 1]);
    const scale = interpolate(expanded.value, [0, 1], [0.5, 1]);

    return {
      transform: [{ translateY }, { scale }],
      opacity,
    };
  });

  return (
    <Animated.View style={[styles.menuItem, animatedStyle]}>
      <TouchableOpacity
        ref={itemRef}
        style={styles.menuItemTouchable}
        onPress={onPress}
        activeOpacity={0.8}
      >
        {/* Label pill */}
        <View style={[styles.menuLabel, { backgroundColor: '#FFFFFF' }]}>
          <Text style={[styles.menuLabelText, { color: '#1F2937' }]}>
            {t(action.labelKey)}
          </Text>
        </View>

        {/* Icon circle */}
        <View style={[styles.menuIcon, { backgroundColor: action.color }]}>
          <Ionicons name={action.icon} size={22} color="#fff" />
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -100,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  menuContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    alignItems: 'flex-end',
  },
  menuItem: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  menuItemTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuLabel: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  menuLabelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  menuIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
});

export default QuickActionFAB;
