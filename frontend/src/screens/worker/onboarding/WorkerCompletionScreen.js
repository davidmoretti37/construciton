/**
 * WorkerCompletionScreen
 * Success screen with celebration animations
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useOnboarding } from '../../../contexts/OnboardingContext';
import { supabase } from '../../../lib/supabase';
import {
  useSuccessCelebration,
  useTextSlideUp,
  useSlideFromSide,
  useButtonBounce,
} from '../../../hooks/useOnboardingAnimations';

const WORKER_GREEN = '#059669';

export default function WorkerCompletionScreen({ route, navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { user } = useAuth();
  const { onComplete } = useOnboarding();
  const { fullName, phone, role, trade } = route.params;

  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Animation hooks (only activate after save completes)
  const iconAnim = useSuccessCelebration(isAnimating, 0);
  const titleAnim = useTextSlideUp(isAnimating, 400);
  const subtitleAnim = useTextSlideUp(isAnimating, 600);
  const infoBoxAnim = useSlideFromSide(isAnimating, 900, false);
  const buttonAnim = useButtonBounce(isAnimating, 1200);
  const progressAnim = useTextSlideUp(isAnimating, 1400);

  useEffect(() => {
    // Auto-save when screen loads
    handleSave();
  }, []);

  const handleSave = async () => {
    if (saving || completed) return;

    setSaving(true);
    try {
      // Save to workers table
      const { data, error } = await supabase
        .from('workers')
        .insert({
          user_id: user.id,
          full_name: fullName,
          phone: phone,
          trade: trade,
          status: 'pending', // Pending until owner approves
          is_onboarded: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Mark onboarding as complete in profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_onboarded: true })
        .eq('id', user.id);

      if (profileError) throw profileError;

      setCompleted(true);

      // Start animations after short delay
      setTimeout(() => {
        setIsAnimating(true);
      }, 300);
    } catch (error) {
      console.error('❌ Error saving worker profile:', error);
      Alert.alert(
        'Error',
        'Failed to save your profile. Please try again.',
        [{ text: 'Retry', onPress: () => handleSave() }]
      );
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = () => {
    // Call the onComplete callback to trigger App.js to show Worker app
    if (onComplete) {
      onComplete();
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={styles.content}>
        {saving ? (
          <>
            <ActivityIndicator size="large" color={WORKER_GREEN} />
            <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
              Setting up your profile...
            </Text>
          </>
        ) : completed ? (
          <>
            {/* Success Icon */}
            <Animated.View style={[styles.iconContainer, { backgroundColor: WORKER_GREEN + '20' }, iconAnim]}>
              <Ionicons name="checkmark-circle" size={80} color={WORKER_GREEN} />
            </Animated.View>

            {/* Success Text */}
            <View style={styles.textContainer}>
              <Animated.Text style={[styles.title, { color: Colors.primaryText }, titleAnim]}>
                You're All Set!
              </Animated.Text>
              <Animated.Text style={[styles.subtitle, { color: Colors.secondaryText }, subtitleAnim]}>
                Your profile has been created. You're ready to start tracking your work hours and assignments.
              </Animated.Text>
            </View>

            {/* Info Box */}
            <Animated.View style={[styles.infoBox, { backgroundColor: WORKER_GREEN + '10', borderColor: WORKER_GREEN + '30' }, infoBoxAnim]}>
              <Ionicons name="information-circle-outline" size={24} color={WORKER_GREEN} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoTitle, { color: WORKER_GREEN }]}>
                  Waiting for Approval
                </Text>
                <Text style={[styles.infoText, { color: WORKER_GREEN }]}>
                  Your contractor will need to approve your account before you can clock in and start working.
                </Text>
              </View>
            </Animated.View>

            {/* Continue Button */}
            <Animated.View style={[{ width: '100%' }, buttonAnim]}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: WORKER_GREEN }]}
                onPress={handleContinue}
                activeOpacity={0.8}
              >
                <Text style={styles.buttonText}>Go to App</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </TouchableOpacity>
            </Animated.View>

            {/* Progress Indicator */}
            <Animated.View style={[styles.progressContainer, progressAnim]}>
              <View style={styles.progressDots}>
                <View style={[styles.dot, { backgroundColor: WORKER_GREEN }]} />
                <View style={[styles.dot, { backgroundColor: WORKER_GREEN }]} />
                <View style={[styles.dot, styles.activeDot, { backgroundColor: WORKER_GREEN }]} />
              </View>
              <Text style={[styles.progressText, { color: Colors.secondaryText }]}>
                Step 3 of 3
              </Text>
            </Animated.View>
          </>
        ) : null}
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
  loadingText: {
    marginTop: Spacing.lg,
    fontSize: FontSizes.body,
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
  infoBox: {
    flexDirection: 'row',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.xxl,
    gap: Spacing.md,
    alignItems: 'flex-start',
    width: '100%',
  },
  infoTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  infoText: {
    fontSize: FontSizes.small,
    lineHeight: 20,
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
