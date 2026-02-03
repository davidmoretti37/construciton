/**
 * WorkerWelcomeScreen
 * Welcome screen with choreographed animations
 * Workers must have an invitation to proceed (same pattern as supervisor)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useOnboarding } from '../../../contexts/OnboardingContext';
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

export default function WorkerWelcomeScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { refreshProfile } = useAuth();
  const { onComplete, onGoBack } = useOnboarding();
  const { invites, loading: invitesLoading, refetch } = useWorkerInvites();
  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const [isScreenActive, setIsScreenActive] = useState(false);

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

  const handleCheckInvitations = () => {
    refetch();
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

  const hasInvites = invites && invites.length > 0;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Show invite popup if there are pending invites */}
      {showInvitePopup && hasInvites && (
        <WorkerInviteHandler onInvitesHandled={handleInvitesHandled} />
      )}

      {/* Back button */}
      {onGoBack && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={onGoBack}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.primaryText} />
          <Text style={[styles.backText, { color: Colors.primaryText }]}>
            Back
          </Text>
        </TouchableOpacity>
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
            {hasInvites
              ? 'You have a pending invitation to join a company!'
              : 'You need an invitation from a business owner to get started.'}
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

        {/* Action Button */}
        <Animated.View style={[{ width: '100%' }, buttonAnim]}>
          {hasInvites ? (
            <TouchableOpacity
              style={[styles.button, { backgroundColor: WORKER_GREEN }]}
              onPress={() => setShowInvitePopup(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="mail" size={20} color="#fff" />
              <Text style={styles.buttonText}>View Invitation</Text>
            </TouchableOpacity>
          ) : (
            <View>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: WORKER_GREEN }]}
                onPress={handleCheckInvitations}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={20} color="#fff" />
                <Text style={styles.buttonText}>Check for Invitations</Text>
              </TouchableOpacity>

              {/* Info message */}
              <View style={[styles.infoBox, { backgroundColor: WORKER_GREEN + '10' }]}>
                <Ionicons name="information-circle" size={20} color={WORKER_GREEN} />
                <Text style={[styles.infoText, { color: Colors.secondaryText }]}>
                  Ask your business owner to send you an invitation using your email address.
                </Text>
              </View>
            </View>
          )}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  backText: {
    fontSize: FontSizes.body,
    fontWeight: '500',
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
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
});
