/**
 * SupervisorWelcomeScreen
 * Welcome screen for supervisors - checks for invitations
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
import SupervisorInviteHandler from '../../../components/SupervisorInviteHandler';
import { useSupervisorInvites } from '../../../hooks/useSupervisorInvites';
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
  const animStyle = useStaggeredItem(isActive, index, 700, 150);

  return (
    <Animated.View style={[styles.feature, animStyle]}>
      <Ionicons name={icon} size={24} color={SUPERVISOR_BLUE} />
      <Text style={[styles.featureText, { color: Colors.primaryText }]}>
        {text}
      </Text>
    </Animated.View>
  );
};

export default function SupervisorWelcomeScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('owner');
  const { user, refreshProfile, ownerId } = useAuth();
  const { onComplete, onGoBack } = useOnboarding();
  const { invites, loading: invitesLoading, refetch } = useSupervisorInvites();
  const [showInvitePopup, setShowInvitePopup] = useState(false);
  const [isScreenActive, setIsScreenActive] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);

  // Check if supervisor is already linked to an owner
  useEffect(() => {
    const checkSupervisorStatus = async () => {
      if (ownerId) {
        // Already linked to an owner, navigate to info collection
        navigation.navigate('SupervisorInfo');
        return;
      }
      setCheckingStatus(false);
    };

    checkSupervisorStatus();
  }, [ownerId]);

  // Trigger animations after loading
  useEffect(() => {
    if (!invitesLoading && !checkingStatus) {
      setIsScreenActive(true);
    }
  }, [invitesLoading, checkingStatus]);

  // Check for invites when screen loads
  useEffect(() => {
    if (!invitesLoading && !checkingStatus && invites && invites.length > 0) {
      setShowInvitePopup(true);
    }
  }, [invites, invitesLoading, checkingStatus]);

  const markOnboarded = async () => {
    if (user?.id) {
      await supabase
        .from('profiles')
        .update({ is_onboarded: true })
        .eq('id', user.id);

      if (onComplete) {
        onComplete();
      }
    }
  };

  // Animation hooks
  const iconAnim = useIconBounce(isScreenActive, 0);
  const titleAnim = useTextSlideUp(isScreenActive, 300);
  const subtitleAnim = useTextSlideUp(isScreenActive, 500);
  const buttonAnim = useButtonBounce(isScreenActive, 1400);

  const features = [
    { icon: 'briefcase-outline', text: t('supervisorOnboarding.feature1', 'Manage multiple projects') },
    { icon: 'people-outline', text: t('supervisorOnboarding.feature2', 'Track your workers and schedules') },
    { icon: 'cash-outline', text: t('supervisorOnboarding.feature3', 'Handle finances and invoicing') },
    { icon: 'chatbubbles-outline', text: t('supervisorOnboarding.feature4', 'AI assistant to help you') },
  ];

  const handleInvitesHandled = async (accepted) => {
    setShowInvitePopup(false);

    if (accepted) {
      // Refresh to get updated profile with owner_id
      await refreshProfile();

      // Check if now linked to an owner
      const { data: profileData } = await supabase
        .from('profiles')
        .select('owner_id, is_onboarded')
        .eq('id', user.id)
        .single();

      if (profileData?.owner_id) {
        // Successfully linked, navigate to info screen to collect basic details
        navigation.navigate('SupervisorInfo');
        return;
      }
    }

    // Refresh invites in case more exist
    refetch();
  };

  const handleContinue = () => {
    // Continue to regular onboarding (business setup)
    navigation.navigate('SupervisorInfo');
  };

  const handleWaitForInvite = () => {
    // Show a message that they need an invitation
    refetch();
  };

  // Show loading while checking status
  if (checkingStatus || invitesLoading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={[styles.content, { justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color={SUPERVISOR_BLUE} />
          <Text style={[styles.subtitle, { color: Colors.secondaryText, marginTop: 16 }]}>
            {t('supervisorOnboarding.checking', 'Checking for invitations...')}
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
        <SupervisorInviteHandler onInvitesHandled={handleInvitesHandled} />
      )}

      {/* Back to role selection */}
      {onGoBack && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={onGoBack}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.primaryText} />
          <Text style={[styles.backText, { color: Colors.primaryText }]}>
            {t('common:buttons.back', 'Back')}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.content}>
        {/* Icon */}
        <Animated.View style={[styles.iconContainer, { backgroundColor: SUPERVISOR_BLUE + '20' }, iconAnim]}>
          <Ionicons name="business" size={80} color={SUPERVISOR_BLUE} />
        </Animated.View>

        {/* Welcome Text */}
        <View style={styles.textContainer}>
          <Animated.Text style={[styles.title, { color: Colors.primaryText }, titleAnim]}>
            {t('supervisorOnboarding.title', 'Welcome, Supervisor!')}
          </Animated.Text>
          <Animated.Text style={[styles.subtitle, { color: Colors.secondaryText }, subtitleAnim]}>
            {hasInvites
              ? t('supervisorOnboarding.hasInvites', 'You have a pending invitation to join a company!')
              : t('supervisorOnboarding.noInvites', 'You need an invitation from a business owner to get started.')}
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
              style={[styles.button, { backgroundColor: SUPERVISOR_BLUE }]}
              onPress={() => setShowInvitePopup(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="mail" size={20} color="#fff" />
              <Text style={styles.buttonText}>
                {t('supervisorOnboarding.viewInvite', 'View Invitation')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: SUPERVISOR_BLUE }]}
                onPress={handleWaitForInvite}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh" size={20} color="#fff" />
                <Text style={styles.buttonText}>
                  {t('supervisorOnboarding.refresh', 'Check for Invitations')}
                </Text>
              </TouchableOpacity>

              {/* Info message */}
              <View style={[styles.infoBox, { backgroundColor: SUPERVISOR_BLUE + '10' }]}>
                <Ionicons name="information-circle" size={20} color={SUPERVISOR_BLUE} />
                <Text style={[styles.infoText, { color: Colors.secondaryText }]}>
                  {t('supervisorOnboarding.waitingInfo', 'Ask your business owner to send you an invitation using your email address.')}
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
    fontSize: FontSizes.xlarge,
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
