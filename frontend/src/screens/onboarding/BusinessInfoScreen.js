import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function BusinessInfoScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('onboarding');

  // Handle both new (services) and legacy (trades) format
  const { selectedServices, selectedTrades, phasesTemplate } = route.params || {};

  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('businessInfo.headerTitle')}</Text>
        <View style={{ width: 40 }} />
      </View>

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
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            {t('businessInfo.title')}
          </Text>
          <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
            {t('businessInfo.subtitle')}
          </Text>

          {/* Business Name Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              {t('businessInfo.businessName')} <Text style={{ color: Colors.error }}>{t('businessInfo.businessNameRequired')}</Text>
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="business-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder={t('businessInfo.businessNamePlaceholder')}
                placeholderTextColor={Colors.secondaryText}
                value={businessName}
                onChangeText={setBusinessName}
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Phone Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              {t('businessInfo.phone')} <Text style={{ color: Colors.error }}>{t('businessInfo.phoneRequired')}</Text>
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="call-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder={t('businessInfo.phonePlaceholder')}
                placeholderTextColor={Colors.secondaryText}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCorrect={false}
              />
            </View>
            <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
              {t('businessInfo.phoneHelper')}
            </Text>
          </View>

          {/* Email Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              {t('businessInfo.email')} <Text style={[styles.optional, { color: Colors.secondaryText }]}>{t('businessInfo.emailOptional')}</Text>
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="mail-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder={t('businessInfo.emailPlaceholder')}
                placeholderTextColor={Colors.secondaryText}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Info Box */}
          <View style={[styles.infoBox, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
            <Text style={[styles.infoText, { color: Colors.primaryBlue }]}>
              {t('businessInfo.infoNote')}
            </Text>
          </View>
        </ScrollView>

        {/* Bottom Section */}
        <View style={[styles.bottomSection, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>{t('buttons.continue')}</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>

          {/* Progress */}
          <View style={styles.progressContainer}>
            <View style={styles.progressDots}>
              <View style={[styles.dot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.dot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.dot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.dot, styles.activeDot, { backgroundColor: Colors.primaryBlue }]} />
            </View>
            <Text style={[styles.progressText, { color: Colors.secondaryText }]}>{t('progress.step', { current: 4, total: 4 })}</Text>
          </View>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
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
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.body,
    paddingVertical: Spacing.sm,
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
    padding: Spacing.xl,
    borderTopWidth: 1,
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
    marginBottom: Spacing.lg,
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
