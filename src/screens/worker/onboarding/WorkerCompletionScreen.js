import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../lib/supabase';

export default function WorkerCompletionScreen({ route, navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);
  const { user } = useAuth();
  const { fullName, phone, role, trade, onComplete } = route.params;

  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    // Auto-save when screen loads
    handleSave();
  }, []);

  const handleSave = async () => {
    if (saving || completed) return;

    setSaving(true);
    try {
      console.log('💾 Saving worker profile...');

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

      console.log('✅ Worker profile saved:', data);

      // Mark onboarding as complete in profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_onboarded: true })
        .eq('id', user.id);

      if (profileError) throw profileError;

      console.log('✅ Onboarding completed');
      setCompleted(true);
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
            <ActivityIndicator size="large" color="#059669" />
            <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
              Setting up your profile...
            </Text>
          </>
        ) : completed ? (
          <>
            {/* Success Icon */}
            <View style={[styles.iconContainer, { backgroundColor: '#059669' + '20' }]}>
              <Ionicons name="checkmark-circle" size={80} color="#059669" />
            </View>

            {/* Success Text */}
            <View style={styles.textContainer}>
              <Text style={[styles.title, { color: Colors.primaryText }]}>
                You're All Set!
              </Text>
              <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
                Your profile has been created. You're ready to start tracking your work hours and assignments.
              </Text>
            </View>

            {/* Info Box */}
            <View style={[styles.infoBox, { backgroundColor: '#059669' + '10', borderColor: '#059669' + '30' }]}>
              <Ionicons name="information-circle-outline" size={24} color="#059669" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoTitle, { color: '#059669' }]}>
                  Waiting for Approval
                </Text>
                <Text style={[styles.infoText, { color: '#059669' }]}>
                  Your contractor will need to approve your account before you can clock in and start working.
                </Text>
              </View>
            </View>

            {/* Continue Button */}
            <TouchableOpacity
              style={[styles.button, { backgroundColor: '#059669' }]}
              onPress={handleContinue}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Go to App</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>

            {/* Progress Indicator */}
            <View style={styles.progressContainer}>
              <View style={styles.progressDots}>
                <View style={[styles.dot, { backgroundColor: '#059669' }]} />
                <View style={[styles.dot, { backgroundColor: '#059669' }]} />
                <View style={[styles.dot, styles.activeDot, { backgroundColor: '#059669' }]} />
              </View>
              <Text style={[styles.progressText, { color: Colors.secondaryText }]}>
                Step 3 of 3
              </Text>
            </View>
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
