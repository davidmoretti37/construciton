/**
 * SupervisorCompletionScreen
 * Completion screen that saves supervisor profile and marks onboarding complete
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useOnboarding } from '../../../contexts/OnboardingContext';
import { supabase } from '../../../lib/supabase';
import {
  useIconBounce,
  useTextSlideUp,
  useStaggeredItem,
  useButtonBounce,
} from '../../../hooks/useOnboardingAnimations';

const SUPERVISOR_BLUE = '#1E40AF';

// Animated feature item
const AnimatedFeature = ({ icon, text, index, isActive, Colors }) => {
  const animStyle = useStaggeredItem(isActive, index, 500, 150);

  return (
    <Animated.View style={[styles.feature, animStyle]}>
      <View style={[styles.featureIcon, { backgroundColor: SUPERVISOR_BLUE + '15' }]}>
        <Ionicons name={icon} size={20} color={SUPERVISOR_BLUE} />
      </View>
      <Text style={[styles.featureText, { color: Colors.primaryText }]}>
        {text}
      </Text>
    </Animated.View>
  );
};

export default function SupervisorCompletionScreen({ route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');
  const { refreshProfile } = useAuth();
  const { onComplete } = useOnboarding();

  const { fullName, phone, jobTitle } = route?.params || {};

  const [saving, setSaving] = useState(true);
  const [error, setError] = useState(null);
  const [isScreenActive, setIsScreenActive] = useState(false);

  // Animation hooks
  const iconAnim = useIconBounce(isScreenActive, 0);
  const titleAnim = useTextSlideUp(isScreenActive, 200);
  const subtitleAnim = useTextSlideUp(isScreenActive, 400);
  const buttonAnim = useButtonBounce(isScreenActive, 1200);

  const features = [
    { icon: 'briefcase-outline', text: t('supervisorOnboarding.featureManageProjects') },
    { icon: 'people-outline', text: t('supervisorOnboarding.featureManageWorkers') },
    { icon: 'calculator-outline', text: t('supervisorOnboarding.featureCreateEstimates') },
    { icon: 'document-text-outline', text: t('supervisorOnboarding.featureGenerateInvoices') },
  ];

  // Save profile on mount
  useEffect(() => {
    saveProfile();
  }, []);

  const saveProfile = async () => {
    try {
      setSaving(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No user found');
      }

      // Update the profile with supervisor info
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          business_name: fullName,
          business_phone: phone,
          job_title: jobTitle,
          is_onboarded: true,
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Error updating profile:', updateError);
        // Don't block onboarding for profile update errors
      }

      // Refresh the auth context
      await refreshProfile();

      setSaving(false);
      setIsScreenActive(true);

    } catch (err) {
      console.error('Error saving supervisor profile:', err);
      setError(err.message);
      setSaving(false);
      // Still allow continuing even if save fails
      setIsScreenActive(true);
    }
  };

  const handleFinish = () => {
    if (onComplete) {
      onComplete();
    }
  };

  // Show loading while saving
  if (saving) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={SUPERVISOR_BLUE} />
          <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
            {t('supervisorOnboarding.settingUpAccount')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={styles.content}>
        {/* Success Icon */}
        <Animated.View style={[styles.iconContainer, { backgroundColor: SUPERVISOR_BLUE + '15' }, iconAnim]}>
          <Ionicons name="checkmark-circle" size={80} color={SUPERVISOR_BLUE} />
        </Animated.View>

        {/* Welcome Text */}
        <View style={styles.textContainer}>
          <Animated.Text style={[styles.title, { color: Colors.primaryText }, titleAnim]}>
            {t('supervisorOnboarding.allSet')} 🎉
          </Animated.Text>
          <Animated.Text style={[styles.subtitle, { color: Colors.secondaryText }, subtitleAnim]}>
            {t('supervisorOnboarding.welcomeToTeam', { name: fullName?.split(' ')[0] || 'Supervisor' })}
          </Animated.Text>
        </View>

        {/* Features */}
        <View style={styles.featuresContainer}>
          <Text style={[styles.featuresTitle, { color: Colors.secondaryText }]}>
            {t('supervisorOnboarding.whatYouCanDo')}
          </Text>
          {features.map((feature, index) => (
            <AnimatedFeature
              key={feature.icon}
              icon={feature.icon}
              text={feature.text}
              index={index}
              isActive={isScreenActive}
              Colors={Colors}
            />
          ))}
        </View>

        {/* Start Button */}
        <Animated.View style={[{ width: '100%' }, buttonAnim]}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: SUPERVISOR_BLUE }]}
            onPress={handleFinish}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>{t('supervisorOnboarding.startUsingApp')}</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </Animated.View>

        {/* Progress Indicator */}
        <View style={styles.progressContainer}>
          <View style={styles.progressDots}>
            <View style={[styles.dot, { backgroundColor: SUPERVISOR_BLUE }]} />
            <View style={[styles.dot, { backgroundColor: SUPERVISOR_BLUE }]} />
            <View style={[styles.dot, styles.activeDot, { backgroundColor: SUPERVISOR_BLUE }]} />
          </View>
          <Text style={[styles.progressText, { color: Colors.secondaryText }]}>
            {t('supervisorOnboarding.stepOf', { step: 3, total: 3 })}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.lg,
    fontSize: FontSizes.body,
  },
  iconContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: FontSizes.xlarge,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.body,
    textAlign: 'center',
  },
  featuresContainer: {
    width: '100%',
    marginBottom: Spacing.xl,
  },
  featuresTitle: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
    marginLeft: Spacing.sm,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.sm,
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  featureText: {
    fontSize: FontSizes.body,
    flex: 1,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    width: '100%',
    gap: Spacing.sm,
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  progressContainer: {
    marginTop: Spacing.xl,
    alignItems: 'center',
  },
  progressDots: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 24,
  },
  progressText: {
    fontSize: FontSizes.small,
  },
});
