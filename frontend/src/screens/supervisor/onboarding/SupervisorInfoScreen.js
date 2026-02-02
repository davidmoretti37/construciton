/**
 * SupervisorInfoScreen
 * Simple info collection for supervisors (similar to worker flow)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import {
  useSlideDown,
  useFormFieldPop,
  useButtonBounce,
  useTextSlideUp,
} from '../../../hooks/useOnboardingAnimations';
import { useOnboarding } from '../../../contexts/OnboardingContext';

const SUPERVISOR_BLUE = '#1E40AF';

export default function SupervisorInfoScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');
  const { onComplete } = useOnboarding();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [isScreenActive, setIsScreenActive] = useState(false);

  // Trigger animations on mount
  useEffect(() => {
    setIsScreenActive(true);
  }, []);

  // Animation hooks
  const headerAnim = useSlideDown(isScreenActive, 0);
  const field1Anim = useFormFieldPop(isScreenActive, 0, 200);
  const field2Anim = useFormFieldPop(isScreenActive, 1, 200);
  const field3Anim = useFormFieldPop(isScreenActive, 2, 200);
  const buttonAnim = useButtonBounce(isScreenActive, 600);
  const progressAnim = useTextSlideUp(isScreenActive, 800);

  const handleContinue = () => {
    // Validation
    if (!fullName.trim()) {
      Alert.alert('Required Field', 'Please enter your full name');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Required Field', 'Please enter your phone number');
      return;
    }

    // Pass data to completion screen (onComplete is handled via context)
    navigation.navigate('SupervisorCompletion', {
      fullName: fullName.trim(),
      phone: phone.trim(),
      jobTitle: jobTitle.trim() || 'Supervisor',
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View style={[styles.header, headerAnim]}>
            <Text style={[styles.title, { color: Colors.primaryText }]}>
              Your Information
            </Text>
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
              Tell us a bit about yourself
            </Text>
          </Animated.View>

          {/* Form */}
          <View style={styles.form}>
            {/* Full Name */}
            <Animated.View style={[styles.inputGroup, field1Anim]}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Full Name *</Text>
              <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                <Ionicons name="person-outline" size={20} color={Colors.secondaryText} />
                <TextInput
                  style={[styles.input, { color: Colors.primaryText }]}
                  placeholder="John Doe"
                  placeholderTextColor={Colors.secondaryText}
                  value={fullName}
                  onChangeText={setFullName}
                  autoCapitalize="words"
                />
              </View>
            </Animated.View>

            {/* Phone */}
            <Animated.View style={[styles.inputGroup, field2Anim]}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Phone Number *</Text>
              <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                <Ionicons name="call-outline" size={20} color={Colors.secondaryText} />
                <TextInput
                  style={[styles.input, { color: Colors.primaryText }]}
                  placeholder="(555) 123-4567"
                  placeholderTextColor={Colors.secondaryText}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                />
              </View>
            </Animated.View>

            {/* Job Title */}
            <Animated.View style={[styles.inputGroup, field3Anim]}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Job Title (Optional)</Text>
              <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                <Ionicons name="briefcase-outline" size={20} color={Colors.secondaryText} />
                <TextInput
                  style={[styles.input, { color: Colors.primaryText }]}
                  placeholder="Project Manager, Foreman, etc."
                  placeholderTextColor={Colors.secondaryText}
                  value={jobTitle}
                  onChangeText={setJobTitle}
                  autoCapitalize="words"
                />
              </View>
            </Animated.View>
          </View>

          {/* Info Box */}
          <View style={[styles.infoBox, { backgroundColor: SUPERVISOR_BLUE + '10' }]}>
            <Ionicons name="information-circle" size={20} color={SUPERVISOR_BLUE} />
            <Text style={[styles.infoText, { color: Colors.secondaryText }]}>
              Your business owner has already configured the company settings. You'll use their pricing, phases, and templates.
            </Text>
          </View>

          {/* Continue Button */}
          <Animated.View style={buttonAnim}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: SUPERVISOR_BLUE }]}
              onPress={handleContinue}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </Animated.View>

          {/* Progress Indicator */}
          <Animated.View style={[styles.progressContainer, progressAnim]}>
            <View style={styles.progressDots}>
              <View style={[styles.dot, { backgroundColor: SUPERVISOR_BLUE }]} />
              <View style={[styles.dot, styles.activeDot, { backgroundColor: SUPERVISOR_BLUE }]} />
              <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            </View>
            <Text style={[styles.progressText, { color: Colors.secondaryText }]}>
              Step 2 of 3
            </Text>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.xl,
  },
  header: {
    marginBottom: Spacing.xxl,
  },
  title: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSizes.body,
    lineHeight: 24,
  },
  form: {
    marginBottom: Spacing.lg,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: Spacing.md,
    fontSize: FontSizes.body,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.xl,
  },
  infoText: {
    flex: 1,
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
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  progressContainer: {
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
