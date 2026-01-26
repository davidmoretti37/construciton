/**
 * WelcomeSlide
 * Screen 1: Cinematic welcome with particles, gradient text, typewriter
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import MaskedView from '@react-native-masked-view/masked-view';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
} from 'react-native-reanimated';
import { TypewriterText, ShimmerButton } from '../../../components/onboarding';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function WelcomeSlide({ isActive, onGetStarted }) {
  // Logo animations
  const logoScale = useSharedValue(0.5);
  const logoOpacity = useSharedValue(0);
  const logoGlow = useSharedValue(0.3);

  // Title animations
  const titleOpacity = useSharedValue(0);
  const titleTranslateY = useSharedValue(20);

  // Social proof animation
  const socialOpacity = useSharedValue(0);

  // Button animation
  const buttonOpacity = useSharedValue(0);
  const buttonTranslateY = useSharedValue(20);

  useEffect(() => {
    if (isActive) {
      // Logo entrance (0-400ms)
      logoScale.value = withSpring(1, { damping: 12, stiffness: 100 });
      logoOpacity.value = withTiming(1, { duration: 400 });

      // Logo glow pulsing (continuous)
      logoGlow.value = withDelay(
        400,
        withRepeat(
          withSequence(
            withTiming(0.7, { duration: 1500 }),
            withTiming(0.3, { duration: 1500 })
          ),
          -1
        )
      );

      // Title entrance (400-800ms)
      titleOpacity.value = withDelay(400, withTiming(1, { duration: 400 }));
      titleTranslateY.value = withDelay(400, withSpring(0, { damping: 15 }));

      // Social proof (1500ms)
      socialOpacity.value = withDelay(1500, withTiming(1, { duration: 500 }));

      // Button (2000ms)
      buttonOpacity.value = withDelay(2000, withTiming(1, { duration: 400 }));
      buttonTranslateY.value = withDelay(2000, withSpring(0, { damping: 15 }));
    }
  }, [isActive]);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    shadowOpacity: logoGlow.value,
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateY: titleTranslateY.value }],
  }));

  const socialStyle = useAnimatedStyle(() => ({
    opacity: socialOpacity.value,
  }));

  const buttonStyle = useAnimatedStyle(() => ({
    opacity: buttonOpacity.value,
    transform: [{ translateY: buttonTranslateY.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Logo with glow */}
      <Animated.View style={[styles.logoContainer, logoStyle]}>
        <Animated.View style={[styles.logoGlow, glowStyle]}>
          <View style={styles.logoInner}>
            <Ionicons name="construct" size={48} color="#60A5FA" />
          </View>
        </Animated.View>
      </Animated.View>

      {/* Gradient headline */}
      <Animated.View style={[styles.titleContainer, titleStyle]}>
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

      {/* Typewriter subtitle */}
      <View style={styles.subtitleContainer}>
        {isActive && (
          <TypewriterText
            text="The AI-powered app for modern contractors"
            speed={35}
            delay={800}
            style={styles.subtitle}
            showCursor={false}
          />
        )}
      </View>

      {/* Social proof badge */}
      <Animated.View style={[styles.socialProof, socialStyle]}>
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
      <Animated.View style={[styles.buttonContainer, buttonStyle]}>
        <ShimmerButton
          title="Get Started"
          onPress={onGetStarted}
          gradientColors={['#3B82F6', '#2563EB']}
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
    paddingHorizontal: 24,
  },
  logoContainer: {
    marginBottom: 32,
  },
  logoGlow: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#60A5FA',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 30,
    elevation: 20,
  },
  logoInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(96, 165, 250, 0.2)',
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
    color: '#F8FAFC',
    textAlign: 'center',
  },
  subtitleContainer: {
    minHeight: 30,
    marginBottom: 32,
  },
  subtitle: {
    fontSize: 15,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 22,
  },
  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
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
    color: '#94A3B8',
    fontWeight: '500',
  },
  divider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 300,
  },
});
