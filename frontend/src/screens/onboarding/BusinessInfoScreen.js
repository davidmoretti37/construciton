/**
 * BusinessInfoScreen
 * Business info form with choreographed animations
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import ProgressStepBar from '../../components/onboarding/ProgressStepBar';
import {
  useSlideDown,
  useFormFieldPop,
  useButtonBounce,
  useTextSlideUp,
  useSlideFromSide,
} from '../../hooks/useOnboardingAnimations';

export default function BusinessInfoScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('onboarding');

  // Handle both new (services) and legacy (trades) format
  const { selectedServices, selectedTrades, phasesTemplate } = route.params || {};

  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [isScreenActive, setIsScreenActive] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  // Trigger animations on mount
  useEffect(() => {
    setIsScreenActive(true);
  }, []);

  // Animation hooks
  const headerAnim = useSlideDown(isScreenActive, 0);
  const titleAnim = useTextSlideUp(isScreenActive, 100);
  const subtitleAnim = useTextSlideUp(isScreenActive, 200);
  const field1Anim = useFormFieldPop(isScreenActive, 0, 300);
  const field2Anim = useFormFieldPop(isScreenActive, 1, 300);
  const field3Anim = useFormFieldPop(isScreenActive, 2, 300);
  const infoBoxAnim = useSlideFromSide(isScreenActive, 700, false);
  const buttonAnim = useButtonBounce(isScreenActive, 900);
  const progressAnim = useTextSlideUp(isScreenActive, 1100);

  const handleContinue = () => {
    if (!businessName.trim()) {
      Alert.alert(t('businessInfo.errors.businessNameRequired'), t('businessInfo.errors.enterBusinessName'));
      return;
    }

    if (!phone.trim()) {
      Alert.alert(t('businessInfo.errors.phoneRequired'), t('businessInfo.errors.enterPhone'));
      return;
    }

    navigation.navigate('InvoiceSetup', {
      selectedServices, // NEW: Pass services
      selectedTrades, // Legacy support
      phasesTemplate,
      pricing: route.params?.pricing,
      businessInfo: {
        name: businessName.trim(),
        phone: phone.trim(),
        email: email.trim(),
      },
    });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const getFocusedInputStyle = (fieldName) => {
    if (focusedField === fieldName) {
      return {
        borderColor: '#2563EB',
        shadowColor: '#2563EB',
        shadowOpacity: 0.12,
        shadowRadius: 4,
      };
    }
    return {};
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#F8FAFC' }]}>
      {/* Header */}
      <Animated.View style={[styles.header, headerAnim]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: '#1F2937' }]}>{t('businessInfo.headerTitle')}</Text>
        <View style={{ width: 40 }} />
      </Animated.View>

      {/* Content */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.Text style={[styles.title, { color: Colors.primaryText }, titleAnim]}>
            {t('businessInfo.title')}
          </Animated.Text>
          <Animated.Text style={[styles.subtitle, { color: Colors.secondaryText }, subtitleAnim]}>
            {t('businessInfo.subtitle')}
          </Animated.Text>

          {/* Business Name Input */}
          <Animated.View style={[styles.inputGroup, field1Anim]}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              {t('businessInfo.businessName')} <Text style={{ color: Colors.error }}>{t('businessInfo.businessNameRequired')}</Text>
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: '#E2E8F0' }, getFocusedInputStyle('businessName')]}>
              <Ionicons name="business-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: '#1F2937' }]}
                placeholder={t('businessInfo.businessNamePlaceholder')}
                placeholderTextColor={Colors.secondaryText}
                value={businessName}
                onChangeText={setBusinessName}
                onFocus={() => setFocusedField('businessName')}
                onBlur={() => setFocusedField(null)}
                autoCorrect={false}
                textContentType="none"
                autoComplete="off"
              />
            </View>
          </Animated.View>

          {/* Phone Input */}
          <Animated.View style={[styles.inputGroup, field2Anim]}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              {t('businessInfo.phone')} <Text style={{ color: Colors.error }}>{t('businessInfo.phoneRequired')}</Text>
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: '#E2E8F0' }, getFocusedInputStyle('phone')]}>
              <Ionicons name="call-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: '#1F2937' }]}
                placeholder={t('businessInfo.phonePlaceholder')}
                placeholderTextColor={Colors.secondaryText}
                value={phone}
                onChangeText={setPhone}
                onFocus={() => setFocusedField('phone')}
                onBlur={() => setFocusedField(null)}
                keyboardType="phone-pad"
                autoCorrect={false}
                textContentType="none"
                autoComplete="off"
              />
            </View>
            <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
              {t('businessInfo.phoneHelper')}
            </Text>
          </Animated.View>

          {/* Email Input */}
          <Animated.View style={[styles.inputGroup, field3Anim]}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              {t('businessInfo.email')} <Text style={[styles.optional, { color: Colors.secondaryText }]}>{t('businessInfo.emailOptional')}</Text>
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: '#E2E8F0' }, getFocusedInputStyle('email')]}>
              <Ionicons name="mail-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: '#1F2937' }]}
                placeholder={t('businessInfo.emailPlaceholder')}
                placeholderTextColor={Colors.secondaryText}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedField('email')}
                onBlur={() => setFocusedField(null)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="none"
                autoComplete="off"
              />
            </View>
          </Animated.View>

          {/* Info Box */}
          <Animated.View style={[styles.infoBox, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }, infoBoxAnim]}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
            <Text style={[styles.infoText, { color: Colors.primaryBlue }]}>
              {t('businessInfo.infoNote')}
            </Text>
          </Animated.View>
        </ScrollView>

        {/* Bottom Section */}
        <View style={[styles.bottomSection, { backgroundColor: '#F8FAFC' }]}>
          <Animated.View style={buttonAnim}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: Colors.primaryBlue }]}
              onPress={handleContinue}
              activeOpacity={0.8}
            >
              <Text style={styles.buttonText}>{t('buttons.continue')}</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </TouchableOpacity>
          </Animated.View>

          {/* Progress */}
          <Animated.View style={[styles.progressContainer, progressAnim]}>
            <ProgressStepBar currentStep={5} totalSteps={5} />
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: Spacing.md,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
  },
  title: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.body,
    marginBottom: Spacing.xxl,
    lineHeight: 22,
  },
  inputGroup: {
    marginBottom: Spacing.xl,
  },
  label: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  optional: {
    fontSize: FontSizes.small,
    fontWeight: '400',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Spacing.sm,
    color: '#1F2937',
  },
  helperText: {
    fontSize: FontSizes.tiny,
    marginTop: Spacing.xs,
  },
  infoBox: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  bottomSection: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  fadeOverlay: {
    position: 'absolute',
    top: -32,
    left: 0,
    right: 0,
    height: 32,
    backgroundColor: '#F8FAFC',
    opacity: 0.8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: 14,
    width: '100%',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressText: {
    fontSize: FontSizes.small,
  },
});
