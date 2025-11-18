import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from '../../utils/storage';
import * as ImagePicker from 'expo-image-picker';

const PAYMENT_TERMS = [
  'Due on Receipt',
  'Net 7',
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
];

export default function InvoiceTemplateScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Template settings
  const [logoUri, setLogoUri] = useState(null);
  const [businessName, setBusinessName] = useState('');
  const [businessAddress, setBusinessAddress] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [footerText, setFooterText] = useState('');

  useEffect(() => {
    loadTemplate();
  }, []);

  const loadTemplate = async () => {
    try {
      setLoading(true);
      const userId = await getCurrentUserId();

      // Load from profiles first for business info
      const { data: profile } = await supabase
        .from('profiles')
        .select('business_name, business_phone, business_email')
        .eq('id', userId)
        .single();

      if (profile) {
        setBusinessName(profile.business_name || '');
        setBusinessPhone(profile.business_phone || '');
        setBusinessEmail(profile.business_email || '');
      }

      // Load invoice template settings
      const { data: template } = await supabase
        .from('invoice_template')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (template) {
        setLogoUri(template.logo_url);
        setBusinessAddress(template.business_address || '');
        setPaymentTerms(template.payment_terms || 'Net 30');
        setFooterText(template.footer_text || '');

        // Override with template business info if exists
        if (template.business_name) setBusinessName(template.business_name);
        if (template.business_phone) setBusinessPhone(template.business_phone);
        if (template.business_email) setBusinessEmail(template.business_email);
      }
    } catch (error) {
      console.error('Error loading template:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePickLogo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please grant photo library access to upload a logo');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setLogoUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking logo:', error);
      Alert.alert('Error', 'Failed to pick logo image');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const userId = await getCurrentUserId();

      // TODO: Upload logo to Supabase storage if changed
      let logoUrl = logoUri;

      // Save template settings
      const { error } = await supabase
        .from('invoice_template')
        .upsert({
          user_id: userId,
          logo_url: logoUrl,
          business_name: businessName,
          business_address: businessAddress,
          business_phone: businessPhone,
          business_email: businessEmail,
          payment_terms: paymentTerms,
          footer_text: footerText,
        });

      if (error) throw error;

      Alert.alert('Success', 'Invoice template saved successfully', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      console.error('Error saving template:', error);
      Alert.alert('Error', 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
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
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Invoice Template</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Box */}
        <View style={[styles.infoBox, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
          <Text style={[styles.infoText, { color: Colors.primaryBlue }]}>
            Customize how your invoices look. This information will appear on all generated invoices.
          </Text>
        </View>

        {/* Logo Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Business Logo</Text>

          <TouchableOpacity
            style={[styles.logoContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={handlePickLogo}
          >
            {logoUri ? (
              <Image source={{ uri: logoUri }} style={styles.logoImage} resizeMode="contain" />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Ionicons name="image-outline" size={48} color={Colors.secondaryText} />
                <Text style={[styles.logoPlaceholderText, { color: Colors.secondaryText }]}>
                  Tap to upload logo
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {logoUri && (
            <TouchableOpacity
              style={[styles.removeButton, { backgroundColor: '#EF4444' + '10' }]}
              onPress={() => setLogoUri(null)}
            >
              <Text style={[styles.removeButtonText, { color: '#EF4444' }]}>Remove Logo</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Business Information */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Business Information</Text>

          <Text style={[styles.label, { color: Colors.secondaryText }]}>Business Name</Text>
          <TextInput
            style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
            value={businessName}
            onChangeText={setBusinessName}
            placeholder="Enter business name"
            placeholderTextColor={Colors.secondaryText}
          />

          <Text style={[styles.label, { color: Colors.secondaryText }]}>Address</Text>
          <TextInput
            style={[styles.input, styles.multilineInput, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
            value={businessAddress}
            onChangeText={setBusinessAddress}
            placeholder="123 Main St, City, State 12345"
            placeholderTextColor={Colors.secondaryText}
            multiline
            numberOfLines={2}
          />

          <Text style={[styles.label, { color: Colors.secondaryText }]}>Phone</Text>
          <TextInput
            style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
            value={businessPhone}
            onChangeText={setBusinessPhone}
            placeholder="(555) 123-4567"
            placeholderTextColor={Colors.secondaryText}
            keyboardType="phone-pad"
          />

          <Text style={[styles.label, { color: Colors.secondaryText }]}>Email</Text>
          <TextInput
            style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
            value={businessEmail}
            onChangeText={setBusinessEmail}
            placeholder="contact@business.com"
            placeholderTextColor={Colors.secondaryText}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        {/* Payment Terms */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Payment Terms</Text>

          <View style={styles.termsGrid}>
            {PAYMENT_TERMS.map((term) => (
              <TouchableOpacity
                key={term}
                style={[
                  styles.termChip,
                  {
                    backgroundColor: paymentTerms === term ? Colors.primaryBlue : Colors.lightGray,
                    borderColor: paymentTerms === term ? Colors.primaryBlue : Colors.border,
                  }
                ]}
                onPress={() => setPaymentTerms(term)}
              >
                <Text style={[
                  styles.termText,
                  { color: paymentTerms === term ? '#fff' : Colors.primaryText }
                ]}>
                  {term}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Footer Text */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Footer Text</Text>
          <Text style={[styles.label, { color: Colors.secondaryText }]}>
            Thank you message or payment instructions
          </Text>
          <TextInput
            style={[styles.input, styles.multilineInput, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
            value={footerText}
            onChangeText={setFooterText}
            placeholder="Thank you for your business! Payment can be made via..."
            placeholderTextColor={Colors.secondaryText}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Preview Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Preview</Text>

          <View style={[styles.previewCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            {logoUri && (
              <Image source={{ uri: logoUri }} style={styles.previewLogo} resizeMode="contain" />
            )}

            <Text style={[styles.previewBusinessName, { color: Colors.primaryText }]}>
              {businessName || 'Your Business Name'}
            </Text>

            {businessAddress && (
              <Text style={[styles.previewText, { color: Colors.secondaryText }]}>
                {businessAddress}
              </Text>
            )}

            <Text style={[styles.previewText, { color: Colors.secondaryText }]}>
              {businessPhone} • {businessEmail}
            </Text>

            <View style={[styles.previewDivider, { backgroundColor: Colors.border }]} />

            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, { color: Colors.secondaryText }]}>Payment Terms:</Text>
              <Text style={[styles.previewValue, { color: Colors.primaryText }]}>{paymentTerms}</Text>
            </View>

            {footerText && (
              <>
                <View style={[styles.previewDivider, { backgroundColor: Colors.border }]} />
                <Text style={[styles.previewFooter, { color: Colors.secondaryText }]}>
                  {footerText}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={{ height: 120 }} />
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
          style={[styles.saveButton, { backgroundColor: Colors.primaryBlue, opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>Save Template</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  infoBox: {
    flexDirection: 'row',
    padding: 14,
    margin: 20,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
  },
  logoContainer: {
    height: 150,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoImage: {
    width: '90%',
    height: '90%',
  },
  logoPlaceholder: {
    alignItems: 'center',
    gap: 8,
  },
  logoPlaceholderText: {
    fontSize: 14,
  },
  removeButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  multilineInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  termsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  termChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  termText: {
    fontSize: 14,
    fontWeight: '600',
  },
  previewCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
  },
  previewLogo: {
    width: 120,
    height: 60,
    marginBottom: 16,
  },
  previewBusinessName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  previewText: {
    fontSize: 13,
    marginBottom: 4,
  },
  previewDivider: {
    height: 1,
    marginVertical: 16,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  previewLabel: {
    fontSize: 14,
  },
  previewValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  previewFooter: {
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
