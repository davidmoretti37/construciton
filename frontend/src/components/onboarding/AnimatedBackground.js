/**
 * AnimatedBackground
 * Premium gradient background with floating particles
 */

import React, { useMemo } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const PARTICLE_COUNT = 30;

// Generate random particle configs once
const generateParticles = () => {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: Math.random() * SCREEN_WIDTH,
    y: Math.random() * SCREEN_HEIGHT,
    size: 2 + Math.random() * 4,
    opacity: 0.1 + Math.random() * 0.3,
    duration: 4000 + Math.random() * 4000,
    delay: Math.random() * 2000,
    amplitude: 30 + Math.random() * 50,
  }));
};

const Particle = ({ config }) => {
  const translateY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const particleOpacity = useSharedValue(config.opacity);

  React.useEffect(() => {
    // Vertical floating animation
    translateY.value = withDelay(
      config.delay,
      withRepeat(
        withSequence(
          withTiming(-config.amplitude, {
            duration: config.duration,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(config.amplitude, {
            duration: config.duration,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        true
      )
    );

    // Horizontal drift animation
    translateX.value = withDelay(
      config.delay + 500,
      withRepeat(
        withSequence(
          withTiming(config.amplitude * 0.5, {
            duration: config.duration * 1.2,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(-config.amplitude * 0.5, {
            duration: config.duration * 1.2,
            easing: Easing.inOut(Easing.ease),
          })
        ),
        -1,
        true
      )
    );

    // Subtle opacity pulsing
    particleOpacity.value = withDelay(
      config.delay,
      withRepeat(
        withSequence(
          withTiming(config.opacity * 1.5, { duration: config.duration * 0.8 }),
          withTiming(config.opacity * 0.5, { duration: config.duration * 0.8 })
        ),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { translateX: translateX.value },
    ],
    opacity: particleOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        styles.particle,
        animatedStyle,
        {
          left: config.x,
          top: config.y,
          width: config.size,
          height: config.size,
          borderRadius: config.size / 2,
        },
      ]}
    />
  );
};

const MemoizedParticle = React.memo(Particle);

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
      <View style={styles.particlesContainer}>
        {particles.map((config) => (
          <MemoizedParticle key={config.id} config={config} />
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
  particlesContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  particle: {
    position: 'absolute',
    backgroundColor: '#60A5FA',
  },
});
