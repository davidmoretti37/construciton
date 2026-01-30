/**
 * RoleSelectionScreen
 * Choose your role with choreographed animations
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  useIconBounce,
  useTextSlideUp,
  useCardPop,
} from '../../hooks/useOnboardingAnimations';

// Animated role card component
const AnimatedRoleCard = ({
  role,
  isSelected,
  isDisabled,
  onPress,
  index,
  isScreenActive,
  Colors,
}) => {
  const cardAnim = useCardPop(isScreenActive, index, 600);
  const selectionScale = useSharedValue(1);
  const checkScale = useSharedValue(0);

  useEffect(() => {
    if (isSelected) {
      // Pulse on selection
      selectionScale.value = withSequence(
        withTiming(1.03, { duration: 150 }),
        withSpring(1, { damping: 10, stiffness: 100 })
      );
      checkScale.value = withSpring(1, { damping: 8, stiffness: 150 });
    } else {
      selectionScale.value = withSpring(1, { damping: 15 });
      checkScale.value = withSpring(0, { damping: 15 });
    }
  }, [isSelected]);

  const selectionStyle = useAnimatedStyle(() => ({
    transform: [{ scale: selectionScale.value }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  return (
    <Animated.View style={[cardAnim, selectionStyle]}>
      <TouchableOpacity
        style={[
          styles.roleCard,
          {
            backgroundColor: Colors.white,
            borderColor: isSelected ? role.color : Colors.border,
            borderWidth: isSelected ? 2 : 1,
            opacity: isDisabled ? 0.5 : 1,
          },
        ]}
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.7}
      >
        {/* Icon */}
        <View
          style={[
            styles.roleIconContainer,
            { backgroundColor: role.color + '20' },
          ]}
        >
          <Ionicons name={role.icon} size={32} color={role.color} />
        </View>

        {/* Content */}
        <View style={styles.roleContent}>
          <Text style={[styles.roleName, { color: Colors.primaryText }]}>
            {role.name}
          </Text>
          <Text style={[styles.roleDescription, { color: Colors.secondaryText }]}>
            {role.description}
          </Text>
        </View>

        {/* Selection Indicator */}
        {isSelected && isDisabled ? (
          <ActivityIndicator size="small" color={role.color} />
        ) : isSelected ? (
          <Animated.View style={[styles.checkmark, { backgroundColor: role.color }, checkStyle]}>
            <Ionicons name="checkmark" size={20} color="#fff" />
          </Animated.View>
        ) : (
          <View style={styles.chevron}>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function RoleSelectionScreen({ onRoleSelected }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { setRole } = useAuth();
  const { t } = useTranslation('auth');

  const [isScreenActive, setIsScreenActive] = useState(false);

  const ROLES = [
    {
      id: 'owner',
      name: t('roleSelection.owner.title'),
      icon: 'business',
      description: t('roleSelection.owner.description'),
      color: '#2563EB',
    },
    {
      id: 'worker',
      name: t('roleSelection.worker.title'),
      icon: 'hammer',
      description: t('roleSelection.worker.description'),
      color: '#059669',
    },
    {
      id: 'client',
      name: t('roleSelection.client.title'),
      icon: 'person',
      description: t('roleSelection.client.description'),
      color: '#7C3AED',
    },
  ];

  const [selectedRole, setSelectedRole] = useState(null);
  const [loading, setLoading] = useState(false);

  // Trigger animations on mount
  useEffect(() => {
    setIsScreenActive(true);
  }, []);

  // Animation hooks
  const iconAnim = useIconBounce(isScreenActive, 0);
  const titleAnim = useTextSlideUp(isScreenActive, 200);
  const subtitleAnim = useTextSlideUp(isScreenActive, 400);

  const handleRoleSelect = async (roleId) => {
    setSelectedRole(roleId);
    setLoading(true);

    try {
      console.log('🎭 Role Selection - User selected:', roleId);

      // Save role to database
      const success = await setRole(roleId);

      if (success) {
        console.log('🎭 Role Selection - Role saved successfully');
        // Call callback to continue to next screen
        if (onRoleSelected) {
          onRoleSelected(roleId);
        }
      } else {
        console.error('🎭 Role Selection - Failed to save role');
        // Reset selection on error
        setSelectedRole(null);
      }
    } catch (error) {
      console.error('🎭 Role Selection - Error:', error);
      setSelectedRole(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Animated.View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '20' }, iconAnim]}>
            <Ionicons name="people" size={48} color={Colors.primaryBlue} />
          </Animated.View>
          <Animated.Text style={[styles.title, { color: Colors.primaryText }, titleAnim]}>
            {t('roleSelection.title')}
          </Animated.Text>
          <Animated.Text style={[styles.subtitle, { color: Colors.secondaryText }, subtitleAnim]}>
            {t('roleSelection.subtitle')}
          </Animated.Text>
        </View>

        {/* Role Cards */}
        <View style={styles.rolesContainer}>
          {ROLES.map((role, index) => {
            const isSelected = selectedRole === role.id;
            const isDisabled = loading && !isSelected;

            return (
              <AnimatedRoleCard
                key={role.id}
                role={role}
                index={index}
                isSelected={isSelected}
                isDisabled={isDisabled || loading}
                onPress={() => !loading && handleRoleSelect(role.id)}
                isScreenActive={isScreenActive}
                Colors={Colors}
              />
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.xl,
    paddingTop: Spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.xlarge,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  rolesContainer: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  roleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  roleIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleContent: {
    flex: 1,
  },
  roleName: {
    fontSize: FontSizes.body,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  roleDescription: {
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  checkmark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chevron: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
