/**
 * WelcomeScreen
 * Business owner welcome with choreographed animations
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import {
  useIconWithGlow,
  useTextSlideUp,
  useStaggeredItem,
  useButtonBounce,
} from '../../hooks/useOnboardingAnimations';

// Animated feature item with checkmark pop
const AnimatedFeature = ({ icon, text, index, isActive, Colors }) => {
  const animStyle = useStaggeredItem(isActive, index, 800, 150);

  return (
    <Animated.View style={[styles.feature, animStyle]}>
      <Ionicons name={icon} size={24} color={Colors.success} />
      <Text style={[styles.featureText, { color: Colors.primaryText }]}>
        {text}
      </Text>
    </Animated.View>
  );
};

export default function WelcomeScreen({ navigation, onGoBack }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('onboarding');

  const [isScreenActive, setIsScreenActive] = useState(false);

  // Trigger animations on mount
  useEffect(() => {
    setIsScreenActive(true);
  }, []);

  // Animation hooks
  const { containerStyle: iconContainerAnim, glowStyle: iconGlowAnim } = useIconWithGlow(isScreenActive, 0, Colors.primaryBlue);
  const titleAnim = useTextSlideUp(isScreenActive, 300);
  const subtitleAnim = useTextSlideUp(isScreenActive, 500);
  const buttonAnim = useButtonBounce(isScreenActive, 1500);
  const progressAnim = useTextSlideUp(isScreenActive, 1700);

  const features = [
    { icon: 'flash-outline', text: t('welcome.features.aiEstimates') },
    { icon: 'calculator-outline', text: t('welcome.features.autoCalc') },
    { icon: 'send-outline', text: t('welcome.features.sendVia') },
    { icon: 'time-outline', text: t('welcome.features.setupTime') },
  ];

  const handleContinue = () => {
    navigation.navigate('ServiceSelection'); // NEW: Use AI-powered service selection
  };

  const handleGoBack = () => {
    if (onGoBack) {
      onGoBack();
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Back Button */}
      {onGoBack && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoBack}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
      )}

      <View style={styles.content}>
        {/* Icon with glow */}
        <Animated.View
          style={[
            styles.iconContainer,
            { backgroundColor: Colors.primaryBlue + '20' },
            iconContainerAnim,
          ]}
        >
          <Animated.View
            style={[
              styles.iconGlow,
              { shadowColor: Colors.primaryBlue },
              iconGlowAnim,
            ]}
          >
            <Ionicons name="construct" size={80} color={Colors.primaryBlue} />
          </Animated.View>
        </Animated.View>

        {/* Welcome Text */}
        <View style={styles.textContainer}>
          <Animated.Text style={[styles.title, { color: Colors.primaryText }, titleAnim]}>
            {t('welcome.title')}
          </Animated.Text>
          <Animated.Text style={[styles.subtitle, { color: Colors.secondaryText }, subtitleAnim]}>
            {t('welcome.subtitle')}
          </Animated.Text>
        </View>

        {/* Features */}
        <View style={styles.featuresContainer}>
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

        {/* Continue Button */}
        <Animated.View style={[{ width: '100%' }, buttonAnim]}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>{t('welcome.getStarted')}</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </Animated.View>

        {/* Progress Indicator */}
        <Animated.View style={[styles.progressContainer, progressAnim]}>
          <View style={styles.progressDots}>
            <View style={[styles.dot, styles.activeDot, { backgroundColor: Colors.primaryBlue }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
          </View>
          <Text style={[styles.progressText, { color: Colors.secondaryText }]}>
            {t('progress.step', { current: 1, total: 4 })}
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    position: 'absolute',
    top: Spacing.xxl,
    left: Spacing.lg,
    zIndex: 10,
    padding: Spacing.sm,
  },
  content: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  iconGlow: {
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 30,
    elevation: 10,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  title: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  subtitle: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    lineHeight: 24,
  },
  featuresContainer: {
    width: '100%',
    marginBottom: Spacing.xxl,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    paddingLeft: Spacing.lg,
  },
  featureText: {
    fontSize: FontSizes.body,
    marginLeft: Spacing.md,
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
    marginTop: Spacing.xxl,
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
