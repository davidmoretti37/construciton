import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getUserProfile, updateBusinessInfo } from '../../utils/storage';
import { supabase } from '../../lib/supabase';

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
  const [logoUrl, setLogoUrl] = useState(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

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
        setLogoUrl(profile.businessInfo.logoUrl || null);
      }
    } catch (error) {
      console.error('Error loading business info:', error);
      Alert.alert(tCommon('alerts.error'), tCommon('messages.failedToLoad', { item: 'business information' }));
    } finally {
      setLoading(false);
    }
  };

  const handlePickLogo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Photo library access is needed to upload a logo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        await uploadLogo(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking logo:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadLogo = async (uri) => {
    setUploadingLogo(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user logged in');

      const fileName = `logo_${user.id}_${Date.now()}.jpg`;
      const filePath = `logos/${fileName}`;

      const response = await fetch(uri);
      const blob = await response.blob();
      const arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      });

      const { error } = await supabase.storage
        .from('business-logos')
        .upload(filePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('business-logos')
        .getPublicUrl(filePath);

      setLogoUrl(publicUrl);
    } catch (error) {
      console.error('Error uploading logo:', error);
      Alert.alert('Error', 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
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
        ...currentBusinessInfo,
        name: businessName.trim(),
        phone: phone.trim(),
        email: email.trim(),
        logoUrl: logoUrl,
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

            {/* Logo */}
            <View style={styles.logoSection}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Business Logo</Text>
              <TouchableOpacity
                style={[styles.logoUploadArea, { backgroundColor: Colors.cardBackground, borderColor: Colors.border }]}
                onPress={handlePickLogo}
                disabled={uploadingLogo}
                activeOpacity={0.7}
              >
                {uploadingLogo ? (
                  <ActivityIndicator size="small" color={Colors.primaryBlue} />
                ) : logoUrl ? (
                  <View style={styles.logoPreviewWrapper}>
                    <Image source={{ uri: logoUrl }} style={styles.logoImage} />
                    <View style={styles.logoChangeOverlay}>
                      <Ionicons name="camera" size={16} color="#fff" />
                      <Text style={styles.logoChangeText}>Change</Text>
                    </View>
                  </View>
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <Ionicons name="image-outline" size={32} color={Colors.secondaryText} />
                    <Text style={[styles.logoPlaceholderText, { color: Colors.secondaryText }]}>Tap to add logo</Text>
                  </View>
                )}
              </TouchableOpacity>
              {logoUrl && (
                <TouchableOpacity onPress={() => setLogoUrl(null)} style={styles.removeLogo}>
                  <Ionicons name="trash-outline" size={14} color="#EF4444" />
                  <Text style={styles.removeLogoText}>Remove logo</Text>
                </TouchableOpacity>
              )}
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
  logoSection: {
    gap: 8,
  },
  logoUploadArea: {
    width: 100,
    height: 100,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoPreviewWrapper: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  logoChangeOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  logoChangeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  logoPlaceholder: {
    alignItems: 'center',
    gap: 4,
  },
  logoPlaceholderText: {
    fontSize: 11,
    fontWeight: '500',
  },
  removeLogo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  removeLogoText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#EF4444',
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
