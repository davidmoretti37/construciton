/**
 * WorkerWelcomeScreen
 * Welcome screen with choreographed animations
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import WorkerInviteHandler from '../../../components/WorkerInviteHandler';
import { useWorkerInvites } from '../../../hooks/useWorkerInvites';
import { supabase } from '../../../lib/supabase';
import {
  useIconBounce,
  useTextSlideUp,
  useStaggeredItem,
  useButtonBounce,
} from '../../../hooks/useOnboardingAnimations';

const WORKER_GREEN = '#059669';

// Animated feature item
const AnimatedFeature = ({ icon, text, index, isActive, Colors }) => {
  const animStyle = useStaggeredItem(isActive, index, 700, 150);

  return (
    <Animated.View style={[styles.feature, animStyle]}>
      <Ionicons name={icon} size={24} color={WORKER_GREEN} />
      <Text style={[styles.featureText, { color: Colors.primaryText }]}>
        {text}
      </Text>
    </Animated.View>
  );
};

export default function WorkerWelcomeScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { refreshProfile } = useAuth();
  const { invites, loading: invitesLoading, refetch } = useWorkerInvites();
  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const [isScreenActive, setIsScreenActive] = useState(false);
  const onComplete = route?.params?.onComplete;

  // Trigger animations on mount
  useEffect(() => {
    if (!invitesLoading) {
      setIsScreenActive(true);
    }
  }, [invitesLoading]);

  // Check for invites when screen loads
  useEffect(() => {
    if (!invitesLoading && invites && invites.length > 0) {
      setShowInvitePopup(true);
    }
  }, [invites, invitesLoading]);

  // Animation hooks
  const iconAnim = useIconBounce(isScreenActive, 0);
  const titleAnim = useTextSlideUp(isScreenActive, 300);
  const subtitleAnim = useTextSlideUp(isScreenActive, 500);
  const buttonAnim = useButtonBounce(isScreenActive, 1400);
  const progressAnim = useTextSlideUp(isScreenActive, 1600);

  const features = [
    { icon: 'time-outline', text: 'Clock in/out with location tracking' },
    { icon: 'briefcase-outline', text: 'View your project assignments' },
    { icon: 'calendar-outline', text: 'Track your hours and timesheet' },
    { icon: 'chatbubble-outline', text: 'Message your contractor' },
  ];

  const handleInvitesHandled = async () => {
    setShowInvitePopup(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: workerData } = await supabase
        .from('workers')
        .select('owner_id, is_onboarded')
        .eq('user_id', user.id)
        .single();

      if (workerData?.owner_id) {
        await supabase
          .from('profiles')
          .update({ is_onboarded: true })
          .eq('id', user.id);

        if (onComplete) {
          onComplete();
        }
        return;
      }
    }

    refetch();
  };

  const handleContinue = () => {
    navigation.navigate('WorkerInfo');
  };

  // Show loading while checking for invites
  if (invitesLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.content, { justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={WORKER_GREEN} />
          <Text style={[styles.subtitle, { color: Colors.secondaryText, marginTop: 16 }]}>
            Checking for invitations...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Show invite popup if there are pending invites */}
      {showInvitePopup && invites && invites.length > 0 && (
        <WorkerInviteHandler onInvitesHandled={handleInvitesHandled} />
      )}

      <View style={styles.content}>
        {/* Icon */}
        <Animated.View style={[styles.iconContainer, { backgroundColor: WORKER_GREEN + '20' }, iconAnim]}>
          <Ionicons name="hammer" size={80} color={WORKER_GREEN} />
        </Animated.View>

        {/* Welcome Text */}
        <View style={styles.textContainer}>
          <Animated.Text style={[styles.title, { color: Colors.primaryText }, titleAnim]}>
            Welcome, Worker!
          </Animated.Text>
          <Animated.Text style={[styles.subtitle, { color: Colors.secondaryText }, subtitleAnim]}>
            Let's set up your profile so you can start tracking your work
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
            style={[styles.button, { backgroundColor: WORKER_GREEN }]}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </Animated.View>

        {/* Progress Indicator */}
        <Animated.View style={[styles.progressContainer, progressAnim]}>
          <View style={styles.progressDots}>
            <View style={[styles.dot, styles.activeDot, { backgroundColor: WORKER_GREEN }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
          </View>
          <Text style={[styles.progressText, { color: Colors.secondaryText }]}>
            Step 1 of 3
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
  textContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  title: {
    fontSize: FontSizes.large,
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
