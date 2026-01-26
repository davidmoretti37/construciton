/**
 * ProjectsSlide
 * Screen 3: Project Management with phone mockup showing projects grid
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { PhoneMockup, FeatureBullet } from '../../../components/onboarding';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Mock project data
const PROJECTS = [
  { name: 'Kitchen', client: 'Johnson', progress: 75, color: '#3B82F6' },
  { name: 'Bathroom', client: 'Smith', progress: 45, color: '#10B981' },
];

const WORKERS = [
  { initial: 'M', name: 'Mike', color: '#F59E0B' },
  { initial: 'J', name: 'Jose', color: '#3B82F6' },
  { initial: 'D', name: 'Dan', color: '#10B981' },
];

const ProjectCard = ({ name, client, progress, color, delay, isActive }) => {
  const translateX = useSharedValue(-50);
  const opacity = useSharedValue(0);
  const progressWidth = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      translateX.value = withDelay(delay, withSpring(0, { damping: 15 }));
      opacity.value = withDelay(delay, withTiming(1, { duration: 300 }));
      progressWidth.value = withDelay(delay + 400, withSpring(progress, { damping: 12 }));
    }
  }, [isActive, delay, progress]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  return (
    <Animated.View style={[projectStyles.card, cardStyle]}>
      <Text style={projectStyles.projectName}>{name}</Text>
      <Text style={projectStyles.clientName}>{client}</Text>
      <View style={projectStyles.progressContainer}>
        <Animated.View
          style={[
            projectStyles.progressBar,
            progressStyle,
            { backgroundColor: color }
          ]}
        />
      </View>
      <Text style={[projectStyles.progressText, { color }]}>{progress}%</Text>
    </Animated.View>
  );
};

const WorkerAvatar = ({ initial, color, delay, isActive }) => {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      scale.value = withDelay(delay, withSpring(1, { damping: 10 }));
      opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
    }
  }, [isActive, delay]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[projectStyles.avatar, style, { backgroundColor: color + '30' }]}>
      <Text style={[projectStyles.avatarText, { color }]}>{initial}</Text>
    </Animated.View>
  );
};

const ProjectsMockup = ({ isActive }) => {
  const headerOpacity = useSharedValue(0);
  const scheduleOpacity = useSharedValue(0);

  useEffect(() => {
    if (isActive) {
      headerOpacity.value = withDelay(400, withTiming(1, { duration: 300 }));
      scheduleOpacity.value = withDelay(1800, withTiming(1, { duration: 300 }));
    }
  }, [isActive]);

  const headerStyle = useAnimatedStyle(() => ({
    opacity: headerOpacity.value,
  }));

  const scheduleStyle = useAnimatedStyle(() => ({
    opacity: scheduleOpacity.value,
  }));

  return (
    <View style={projectStyles.container}>
      {/* Header */}
      <Animated.View style={[projectStyles.header, headerStyle]}>
        <Ionicons name="grid" size={16} color="#60A5FA" />
        <Text style={projectStyles.headerText}>PROJECTS</Text>
      </Animated.View>

      {/* Project cards grid */}
      <View style={projectStyles.grid}>
        {PROJECTS.map((project, index) => (
          <ProjectCard
            key={project.name}
            {...project}
            delay={600 + index * 200}
            isActive={isActive}
          />
        ))}
      </View>

      {/* Schedule section */}
      <Animated.View style={[projectStyles.scheduleSection, scheduleStyle]}>
        <View style={projectStyles.scheduleHeader}>
          <Ionicons name="calendar" size={14} color="#A78BFA" />
          <Text style={projectStyles.scheduleTitle}>Today's Schedule</Text>
        </View>
        <View style={projectStyles.scheduleItem}>
          <Text style={projectStyles.scheduleTime}>8:00 AM</Text>
          <Text style={projectStyles.scheduleText}>Team A → Kitchen</Text>
        </View>
        <View style={projectStyles.scheduleItem}>
          <Text style={projectStyles.scheduleTime}>1:00 PM</Text>
          <Text style={projectStyles.scheduleText}>Team B → Bathroom</Text>
        </View>
      </Animated.View>

      {/* Workers */}
      <View style={projectStyles.workersSection}>
        <Text style={projectStyles.workersLabel}>On Site</Text>
        <View style={projectStyles.avatarsRow}>
          {WORKERS.map((worker, index) => (
            <WorkerAvatar
              key={worker.name}
              initial={worker.initial}
              color={worker.color}
              delay={2000 + index * 100}
              isActive={isActive}
            />
          ))}
        </View>
      </View>
    </View>
  );
};

export default function ProjectsSlide({ isActive }) {
  return (
    <View style={styles.container}>
      {/* Title */}
      <Text style={styles.title}>Everything. One Place.</Text>
      <Text style={styles.titleAccent}>Zero Stress.</Text>

      {/* Phone mockup */}
      <PhoneMockup
        tilt={0}
        slideInFrom="left"
        delay={200}
        isActive={isActive}
        style={styles.phone}
      >
        <ProjectsMockup isActive={isActive} />
      </PhoneMockup>

      {/* Feature bullets */}
      <View style={styles.features}>
        <FeatureBullet
          icon="clipboard"
          title="See all projects at a glance"
          description="Know exactly what's happening"
          delay={1600}
          isActive={isActive}
          iconColor="#60A5FA"
        />
        <FeatureBullet
          icon="people"
          title="Assign crews in seconds"
          description="Drag, drop, done"
          delay={1800}
          isActive={isActive}
          iconColor="#10B981"
        />
        <FeatureBullet
          icon="notifications"
          title="Automatic reminders"
          description="Never miss another deadline"
          delay={2000}
          isActive={isActive}
          iconColor="#F59E0B"
        />
      </View>

      {/* Quote */}
      <Text style={styles.quote}>
        "From 'where's that file?' to 'I've got this' in one tap."
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#94A3B8',
    textAlign: 'center',
  },
  titleAccent: {
    fontSize: 32,
    fontWeight: '800',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 16,
  },
  phone: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  features: {
    marginBottom: 16,
  },
  quote: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});

const projectStyles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 12,
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
    color: '#60A5FA',
    letterSpacing: 0.5,
  },
  grid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  card: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  projectName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 2,
  },
  clientName: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 8,
  },
  progressContainer: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
    backgroundColor: 'rgba(167, 139, 250, 0.1)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
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
    color: '#A78BFA',
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  scheduleTime: {
    fontSize: 10,
    color: '#64748B',
    width: 50,
  },
  scheduleText: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  workersSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  workersLabel: {
    fontSize: 11,
    color: '#64748B',
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
