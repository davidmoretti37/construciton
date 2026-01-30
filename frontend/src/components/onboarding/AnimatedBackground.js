/**
 * AnimatedBackground
 * Premium gradient background with floating particle stars
 */

import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PARTICLE_COUNT = 12;

// Generate random particles once
const generateParticles = () => {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_WIDTH,
    y: Math.random() * SCREEN_HEIGHT,
    size: 2 + Math.random() * 2, // 2-4px
    baseOpacity: 0.1 + Math.random() * 0.3, // 0.1-0.4
    duration: 15000 + Math.random() * 10000, // 15-25 seconds
    delay: Math.random() * 5000, // 0-5 second delay
  }));
};

const Particle = ({ particle }) => {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(particle.baseOpacity);

  useEffect(() => {
    // Drift upward animation
    translateY.value = withDelay(
      particle.delay,
      withRepeat(
        withTiming(-SCREEN_HEIGHT - 50, {
          duration: particle.duration,
          easing: Easing.linear,
        }),
        -1, // Infinite repeat
        false
      )
    );

    // Twinkle effect
    opacity.value = withDelay(
      particle.delay,
      withRepeat(
        withSequence(
          withTiming(particle.baseOpacity * 2, { duration: 2000 }),
          withTiming(particle.baseOpacity * 0.5, { duration: 2000 }),
          withTiming(particle.baseOpacity, { duration: 1000 })
        ),
        -1,
        false
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: particle.x,
          top: particle.y,
          width: particle.size,
          height: particle.size,
          borderRadius: particle.size / 2,
        },
        animatedStyle,
      ]}
    />
  );
};

export default function AnimatedBackground({ children }) {
  const particles = useMemo(() => generateParticles(), []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0A0F1A', '#0F172A', '#1A1F3A']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      {/* Floating particles */}
      <View style={styles.particleContainer}>
        {particles.map((particle) => (
          <Particle key={particle.id} particle={particle} />
        ))}
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  particleContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
});
