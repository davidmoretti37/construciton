/**
 * ProjectsSlide
 * Screen 3: Project Management with phone mockup
 * Items pop in one by one, progress bars overshoot before settling
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { PhoneMockup, FeatureBullet } from '../../../components/onboarding';
import {
  ONBOARDING_COLORS,
  ONBOARDING_TYPOGRAPHY,
  ONBOARDING_SPACING,
} from './constants';
import { useBounceAnimation, usePhoneAnimation, useEntranceAnimation } from './useEntranceAnimation';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Mock project data
const PROJECTS = [
  { name: 'Kitchen', client: 'Johnson', progress: 75, color: '#3B82F6' },
  { name: 'Bathroom', client: 'Smith', progress: 45, color: '#10B981' },
  { name: 'Deck', client: 'Williams', progress: 20, color: '#F59E0B' },
  { name: 'Garage', client: 'Davis', progress: 90, color: '#A78BFA' },
];

const WORKERS = [
  { initial: 'M', name: 'Mike', color: '#F59E0B' },
  { initial: 'J', name: 'Jose', color: '#3B82F6' },
  { initial: 'D', name: 'Dan', color: '#10B981' },
];

// Animated project card with overshoot progress bar
// NO SCALE - prevents iOS rasterization blur
const AnimatedProjectCard = ({ name, client, progress, color, delay, isActive }) => {
  const cardOpacity = useSharedValue(0);
  const cardTranslateY = useSharedValue(20);
  const progressWidth = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      // Card slides in
      cardOpacity.value = withDelay(delay, withSpring(1, { damping: 15 }));
      cardTranslateY.value = withDelay(delay, withSpring(0, { damping: 10, stiffness: 120 }));

      // Progress bar with dramatic overshoot
      progressWidth.value = withDelay(
        delay + 400,
        withSequence(
          // Overshoot to 100%
          withTiming(100, { duration: 400, easing: Easing.out(Easing.cubic) }),
          // Drop below target
          withTiming(progress * 0.5, { duration: 250, easing: Easing.inOut(Easing.ease) }),
          // Bounce up past target
          withTiming(progress * 1.15, { duration: 200, easing: Easing.out(Easing.ease) }),
          // Settle at final value
          withSpring(progress, { damping: 12, stiffness: 100 })
        )
      );
    } else {
      cardOpacity.value = 0;
      cardTranslateY.value = 20;
      progressWidth.value = 0;
    }
  }, [isActive, delay, progress]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
    transform: [{ translateY: cardTranslateY.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, progressWidth.value))}%`,
  }));

  return (
    <Animated.View style={[projectStyles.card, cardStyle]}>
      <Text style={projectStyles.projectName}>{name}</Text>
      <Text style={projectStyles.clientName}>{client}</Text>
      <View style={projectStyles.progressContainer}>
        <Animated.View
          style={[
            projectStyles.progressBar,
            { backgroundColor: color },
            progressStyle,
          ]}
        />
      </View>
      <Text style={[projectStyles.progressText, { color }]}>{progress}%</Text>
    </Animated.View>
  );
};

// Animated worker avatar
// NO SCALE - prevents iOS rasterization blur
const AnimatedWorkerAvatar = ({ initial, color, delay, isActive }) => {
  const translateY = useSharedValue(15);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      translateY.value = withDelay(delay, withSpring(0, { damping: 8, stiffness: 150 }));
      opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
    } else {
      translateY.value = 15;
      opacity.value = 0;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[projectStyles.avatar, { backgroundColor: color + '30' }, animatedStyle]}>
      <Text style={[projectStyles.avatarText, { color }]}>{initial}</Text>
    </Animated.View>
  );
};

// Animated section that slides up
const AnimatedSection = ({ children, delay, isActive, style }) => {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(30);

  useEffect(() => {
    if (isActive) {
      opacity.value = withDelay(delay, withSpring(1, { damping: 15 }));
      translateY.value = withDelay(delay, withSpring(0, { damping: 12, stiffness: 100 }));
    } else {
      opacity.value = 0;
      translateY.value = 30;
    }
  }, [isActive, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[style, animatedStyle]}>
      {children}
    </Animated.View>
  );
};

const ProjectsMockup = ({ isActive }) => {
  return (
    <View style={projectStyles.container}>
      {/* Header - pops in first */}
      <AnimatedSection delay={300} isActive={isActive} style={projectStyles.header}>
        <Ionicons name="grid" size={16} color="#60A5FA" />
        <Text style={projectStyles.headerText}>PROJECTS</Text>
      </AnimatedSection>

      {/* Project cards grid - staggered pop in */}
      <View style={projectStyles.grid}>
        {PROJECTS.map((project, index) => (
          <AnimatedProjectCard
            key={project.name}
            {...project}
            delay={500 + index * 200}
            isActive={isActive}
          />
        ))}
      </View>

      {/* Schedule section - slides up */}
      <AnimatedSection delay={1200} isActive={isActive} style={projectStyles.scheduleSection}>
        <View style={projectStyles.scheduleHeader}>
          <Ionicons name="calendar" size={14} color="#A78BFA" />
          <Text style={projectStyles.scheduleTitle}>Today's Schedule</Text>
        </View>
        <View style={projectStyles.scheduleItem}>
          <Text style={projectStyles.scheduleTime}>8:00 AM</Text>
          <Text style={projectStyles.scheduleText}>Team A → Kitchen</Text>
        </View>
        <View style={projectStyles.scheduleItem}>
          <Text style={projectStyles.scheduleTime}>11:00 AM</Text>
          <Text style={projectStyles.scheduleText}>Inspection → Deck</Text>
        </View>
        <View style={projectStyles.scheduleItem}>
          <Text style={projectStyles.scheduleTime}>1:00 PM</Text>
          <Text style={projectStyles.scheduleText}>Team B → Bathroom</Text>
        </View>
      </AnimatedSection>

      {/* Workers - staggered pop in */}
      <View style={projectStyles.workersSection}>
        <AnimatedSection delay={1400} isActive={isActive}>
          <Text style={projectStyles.workersLabel}>On Site</Text>
        </AnimatedSection>
        <View style={projectStyles.avatarsRow}>
          {WORKERS.map((worker, index) => (
            <AnimatedWorkerAvatar
              key={worker.name}
              initial={worker.initial}
              color={worker.color}
              delay={1500 + index * 100}
              isActive={isActive}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

export default function ProjectsSlide({ isActive = true }) {
  const [phoneReady, setPhoneReady] = useState(false);

  // Staggered entrance animations
  const titleAnim = useBounceAnimation(isActive, 0);
  const phoneAnim = usePhoneAnimation(isActive, 200);
  const feature1Anim = useEntranceAnimation(isActive, 2000);
  const feature2Anim = useEntranceAnimation(isActive, 2150);
  const feature3Anim = useEntranceAnimation(isActive, 2300);
  const quoteAnim = useEntranceAnimation(isActive, 2500);

  // Start phone content animation after phone entrance
  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => setPhoneReady(true), 400);
      return () => clearTimeout(timer);
    } else {
      setPhoneReady(false);
    }
  }, [isActive]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Title */}
      <Animated.View style={titleAnim}>
        <Text style={styles.title}>Everything. One Place.</Text>
        <Text style={styles.titleAccent}>Zero Stress.</Text>
      </Animated.View>

      {/* Phone mockup with animated content */}
      <Animated.View style={[styles.phone, phoneAnim]}>
        <PhoneMockup tilt={0}>
          <ProjectsMockup isActive={phoneReady} />
        </PhoneMockup>
      </Animated.View>

      {/* Feature bullets */}
      <View style={styles.features}>
        <Animated.View style={feature1Anim}>
          <FeatureBullet
            icon="clipboard"
            title="See all projects at a glance"
            description="Know exactly what's happening"
            iconColor="#60A5FA"
          />
        </Animated.View>
        <Animated.View style={feature2Anim}>
          <FeatureBullet
            icon="people"
            title="Assign crews in seconds"
            description="Drag, drop, done"
            iconColor="#10B981"
          />
        </Animated.View>
        <Animated.View style={feature3Anim}>
          <FeatureBullet
            icon="notifications"
            title="Automatic reminders"
            description="Never miss another deadline"
            iconColor="#F59E0B"
          />
        </Animated.View>
      </View>

      {/* Quote */}
      <Animated.View style={quoteAnim}>
        <Text style={styles.quote}>
          "From 'where's that file?' to 'I've got this' in one tap."
        </Text>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: ONBOARDING_SPACING.screenPaddingHorizontal,
    paddingTop: ONBOARDING_SPACING.screenPaddingTop,
    paddingBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: ONBOARDING_COLORS.textSecondary,
    textAlign: 'center',
  },
  titleAccent: {
    fontSize: 32,
    fontWeight: '800',
    color: ONBOARDING_COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  phone: {
    alignSelf: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  features: {
    marginBottom: 16,
  },
  quote: {
    ...ONBOARDING_TYPOGRAPHY.caption,
  },
});

const projectStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: ONBOARDING_COLORS.primaryLight,
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  card: {
    width: '48%',
    backgroundColor: ONBOARDING_COLORS.glassBg,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: ONBOARDING_COLORS.borderSubtle,
  },
  projectName: {
    fontSize: 13,
    fontWeight: '700',
    color: ONBOARDING_COLORS.textPrimary,
    marginBottom: 2,
  },
  clientName: {
    fontSize: 10,
    color: ONBOARDING_COLORS.textTertiary,
    marginBottom: 8,
  },
  progressContainer: {
    height: 6,
    backgroundColor: ONBOARDING_COLORS.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
  },
  scheduleSection: {
    backgroundColor: `${ONBOARDING_COLORS.purple}1A`,
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  scheduleTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: ONBOARDING_COLORS.purple,
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  scheduleTime: {
    fontSize: 10,
    color: ONBOARDING_COLORS.textTertiary,
    width: 50,
  },
  scheduleText: {
    fontSize: 11,
    color: ONBOARDING_COLORS.textMuted,
  },
  workersSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  workersLabel: {
    fontSize: 11,
    color: ONBOARDING_COLORS.textTertiary,
  },
  avatarsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
