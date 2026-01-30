import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getUserProfile, updateBusinessInfo } from '../../utils/storage';

export default function EditBusinessInfoScreen({ navigation }) {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    loadBusinessInfo();
  }, []);

  const loadBusinessInfo = async () => {
    try {
      const profile = await getUserProfile();
      if (profile && profile.businessInfo) {
        setBusinessName(profile.businessInfo.name || '');
        setPhone(profile.businessInfo.phone || '');
        setEmail(profile.businessInfo.email || '');
      }
    } catch (error) {
      console.error('Error loading business info:', error);
      Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToLoad', { item: 'business information' }));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    // Validation
    if (!businessName.trim()) {
      Alert.alert(tCommon('alerts.missingInfo'), tCommon('messages.pleaseEnterValid', { item: 'business name' }));
      return;
    }

    if (!phone.trim()) {
      Alert.alert(tCommon('alerts.missingInfo'), tCommon('messages.pleaseEnterValid', { item: 'phone number' }));
      return;
    }

    // Basic phone validation
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      Alert.alert(tCommon('alerts.invalidPhone'), tCommon('messages.pleaseEnterValid', { item: 'phone number with at least 10 digits' }));
      return;
    }

    // Email validation (optional field)
    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        Alert.alert(tCommon('alerts.invalidEmail'), tCommon('messages.pleaseEnterValid', { item: 'email address or leave it blank' }));
        return;
      }
    }

    // Save to storage
    setSaving(true);
    try {
      // Get current profile to preserve other fields
      const currentProfile = await getUserProfile();
      const currentBusinessInfo = currentProfile?.businessInfo || {};

      await updateBusinessInfo({
        ...currentBusinessInfo, // Preserve existing fields like address, paymentInfo, logoUrl
        name: businessName.trim(),
        phone: phone.trim(),
        email: email.trim(),
      });

      Alert.alert(tCommon('alerts.success'), tCommon('messages.updatedSuccessfully', { item: 'Business information' }), [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('Error saving business info:', error);
      Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToSave', { item: 'business information' }));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
          <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('business.info')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            {/* Info Box */}
            <View style={[styles.infoBox, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.infoText, { color: Colors.primaryBlue }]}>
                This information appears on your estimates and invoices.
              </Text>
            </View>

            {/* Business Name */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>
                {t('business.companyName')} <Text style={{ color: Colors.error }}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, {
                  backgroundColor: Colors.cardBackground,
                  borderColor: Colors.border,
                  color: Colors.primaryText
                }]}
                placeholder="e.g., Smith Construction"
                placeholderTextColor={Colors.secondaryText}
                value={businessName}
                onChangeText={setBusinessName}
                autoCapitalize="words"
              />
            </View>

            {/* Phone Number */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>
                {t('business.phone')} <Text style={{ color: Colors.error }}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, {
                  backgroundColor: Colors.cardBackground,
                  borderColor: Colors.border,
                  color: Colors.primaryText
                }]}
                placeholder="(555) 123-4567"
                placeholderTextColor={Colors.secondaryText}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>

            {/* Email */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>
                {t('account.email')} <Text style={[styles.optionalText, { color: Colors.secondaryText }]}>(optional)</Text>
              </Text>
              <TextInput
                style={[styles.input, {
                  backgroundColor: Colors.cardBackground,
                  borderColor: Colors.border,
                  color: Colors.primaryText
                }]}
                placeholder="your@email.com"
                placeholderTextColor={Colors.secondaryText}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Required Fields Note */}
            <Text style={[styles.requiredNote, { color: Colors.secondaryText }]}>
              <Text style={{ color: Colors.error }}>*</Text> Required fields
            </Text>
          </View>
        </ScrollView>

        {/* Save Button */}
        <View style={[
          styles.footer,
          {
            backgroundColor: Colors.background,
            borderTopColor: Colors.border,
            paddingBottom: Math.max(insets.bottom + 20, 36),
          }
        ]}>
          <TouchableOpacity
            style={[styles.saveButton, {
              backgroundColor: Colors.primaryBlue,
              opacity: saving ? 0.6 : 1
            }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color={Colors.white} />
                <Text style={[styles.saveButtonText, { color: Colors.white }]}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
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
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.header,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.body,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
  },
  infoBox: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  optionalText: {
    fontWeight: '400',
    fontSize: FontSizes.small,
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.body,
  },
  textArea: {
    minHeight: 80,
    paddingTop: Spacing.md,
  },
  helpText: {
    fontSize: FontSizes.tiny,
    marginBottom: Spacing.xs,
    lineHeight: 16,
  },
  requiredNote: {
    fontSize: FontSizes.tiny,
    marginTop: Spacing.md,
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  saveButtonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  helperText: {
    fontSize: FontSizes.tiny,
    lineHeight: 16,
  },
  logoUploadButton: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 150,
  },
  uploadText: {
    fontSize: FontSizes.body,
    fontWeight: '500',
    marginTop: Spacing.sm,
  },
  uploadHint: {
    fontSize: FontSizes.tiny,
    marginTop: Spacing.xs,
  },
  logoPreviewContainer: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  logoPreview: {
    width: 120,
    height: 120,
    marginBottom: Spacing.md,
  },
  logoActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    width: '100%',
  },
  logoButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  logoButtonText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
});
