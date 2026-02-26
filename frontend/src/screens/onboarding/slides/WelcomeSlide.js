/**
 * WelcomeSlide
 * Screen 1: Welcome with gradient text, entrance animations, and breathing logo
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import { ShimmerButton } from '../../../components/onboarding';
import {
  ONBOARDING_COLORS,
  ONBOARDING_SPACING,
} from './constants';
import { useBounceAnimation, useScaleAnimation, useEntranceAnimation } from './useEntranceAnimation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function WelcomeSlide({ isActive = true, onGetStarted }) {
  // Staggered entrance animations - bouncy and playful
  const logoAnim = useScaleAnimation(isActive, 0);           // Pop in with overshoot
  const headlineAnim = useBounceAnimation(isActive, 200);    // Bouncy text
  const subtitleAnim = useEntranceAnimation(isActive, 400);  // Smooth slide up
  const badgeAnim = useScaleAnimation(isActive, 550);        // Pop in badge
  const buttonAnim = useBounceAnimation(isActive, 700);      // Bouncy button

  // Logo breathing animation (continuous after entrance)
  const breathingScale = useSharedValue(1);
  const breathingShadow = useSharedValue(0.5);

  useEffect(() => {
    if (isActive) {
      // Start breathing animation after entrance completes (1 second delay)
      breathingScale.value = withDelay(
        1000,
        withRepeat(
          withSequence(
            withTiming(1.03, { duration: 1250, easing: Easing.inOut(Easing.ease) }),
            withTiming(1.0, { duration: 1250, easing: Easing.inOut(Easing.ease) })
          ),
          -1, // Infinite
          false
        )
      );
      breathingShadow.value = withDelay(
        1000,
        withRepeat(
          withSequence(
            withTiming(0.7, { duration: 1250, easing: Easing.inOut(Easing.ease) }),
            withTiming(0.4, { duration: 1250, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          false
        )
      );
    } else {
      breathingScale.value = 1;
      breathingShadow.value = 0.5;
    }
  }, [isActive]);

  const breathingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathingScale.value }],
    shadowOpacity: breathingShadow.value,
  }));

  return (
    <View style={styles.container}>
      {/* Logo with glow and breathing animation */}
      <Animated.View style={[styles.logoContainer, logoAnim]}>
        <Animated.View style={[styles.logoGlow, breathingStyle]}>
          <View style={styles.logoInner}>
            <Image source={require('../../../../assets/icon.png')} style={{ width: 48, height: 48, borderRadius: 12 }} />
          </View>
        </Animated.View>
      </Animated.View>

      {/* Gradient headline */}
      <Animated.View style={[styles.titleContainer, headlineAnim]}>
        <MaskedView
          maskElement={
            <Text style={styles.headline}>Build Smarter</Text>
          }
        >
          <LinearGradient
            colors={['#3B82F6', '#06B6D4', '#60A5FA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={[styles.headline, { opacity: 0 }]}>Build Smarter</Text>
          </LinearGradient>
        </MaskedView>
      </Animated.View>

      {/* Subtitle */}
      <Animated.View style={[styles.subtitleContainer, subtitleAnim]}>
        <Text style={styles.subtitle}>
          The AI-powered app for modern contractors
        </Text>
      </Animated.View>

      {/* Social proof badge */}
      <Animated.View style={[styles.socialProof, badgeAnim]}>
        <View style={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Ionicons key={i} name="star" size={14} color="#FBBF24" />
          ))}
        </View>
        <Text style={styles.socialText}>4.9 Rating</Text>
        <View style={styles.divider} />
        <Text style={styles.socialText}>500+ Contractors</Text>
      </Animated.View>

      {/* CTA Button */}
      <Animated.View style={[styles.buttonContainer, buttonAnim]}>
        <ShimmerButton
          title="Get Started"
          onPress={onGetStarted}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ONBOARDING_SPACING.screenPaddingHorizontal,
  },
  logoContainer: {
    marginBottom: 32,
  },
  logoGlow: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: `${ONBOARDING_COLORS.primary}26`,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: ONBOARDING_COLORS.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  logoInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: `${ONBOARDING_COLORS.primary}33`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    marginBottom: 12,
  },
  headline: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
    color: ONBOARDING_COLORS.textPrimary,
    textAlign: 'center',
  },
  subtitleContainer: {
    minHeight: 30,
    marginBottom: 32,
  },
  subtitle: {
    fontSize: 15,
    color: ONBOARDING_COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ONBOARDING_COLORS.glassBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
    marginBottom: 40,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  socialText: {
    fontSize: 13,
    color: ONBOARDING_COLORS.textSecondary,
    fontWeight: '500',
  },
  divider: {
    width: 1,
    height: 12,
    backgroundColor: ONBOARDING_COLORS.divider,
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 300,
  },
});
