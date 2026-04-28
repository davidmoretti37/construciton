import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { getCurrentUserId } from '../../utils/storage';
import * as ImagePicker from 'expo-image-picker';
import { uploadLogoToStorage } from '../../utils/pdfGenerator';
import {
  TEMPLATE_STYLES,
  generateHTML as generateTemplateHTML,
  buildSampleData,
} from '../../utils/invoiceTemplates';

const PAYMENT_TERMS = [
  'Due on Receipt',
  'Net 7',
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
];

export default function InvoiceTemplateScreen({ navigation }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Template settings
  const [templateStyle, setTemplateStyle] = useState('modern');
  const [previewStyle, setPreviewStyle] = useState(null); // null = closed; 'modern' | 'premium' | 'creative' = open
  const [previewIsEstimate, setPreviewIsEstimate] = useState(false);
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
      const authUserId = await getCurrentUserId();

      // Supervisors share the owner's invoice template. Resolve to the
      // owner's user_id so both the read and the write below target the
      // shared row, not a stale supervisor-specific one.
      let userId = authUserId;
      try {
        const { data: meProfile } = await supabase
          .from('profiles')
          .select('role, owner_id')
          .eq('id', authUserId)
          .maybeSingle();
        if (meProfile?.role === 'supervisor' && meProfile?.owner_id) {
          userId = meProfile.owner_id;
        }
      } catch { /* default to authUserId */ }

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
        if (template.template_style) setTemplateStyle(template.template_style);

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
        Alert.alert(t('alerts.permissionRequired', 'Permission needed'), t('permissions.photoLibraryRequired', 'Please grant photo library access to upload a logo'));
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
      Alert.alert(t('alerts.error', 'Error'), t('messages.failedToLoad', 'Failed to pick logo image'));
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const authUserId = await getCurrentUserId();
      // Same owner-resolution as loadTemplate so a supervisor's save
      // writes to the shared row, not their own.
      let userId = authUserId;
      try {
        const { data: meProfile } = await supabase
          .from('profiles')
          .select('role, owner_id')
          .eq('id', authUserId)
          .maybeSingle();
        if (meProfile?.role === 'supervisor' && meProfile?.owner_id) {
          userId = meProfile.owner_id;
        }
      } catch { /* default to authUserId */ }

      // Upload logo to Supabase storage if it's a local file
      let logoUrl = logoUri;
      if (logoUri && logoUri.startsWith('file://')) {
        try {
          logoUrl = await uploadLogoToStorage(logoUri);
        } catch (uploadError) {
          console.error('Error uploading logo:', uploadError);
          Alert.alert(t('alerts.warning', 'Warning'), t('invoiceTemplate.logoUploadFailed', 'Failed to upload logo. Template will be saved without logo.'));
          logoUrl = null;
        }
      }

      // Save template settings
      const { error } = await supabase
        .from('invoice_template')
        .upsert({
          user_id: userId,
          template_style: templateStyle,
          logo_url: logoUrl,
          business_name: businessName,
          business_address: businessAddress,
          business_phone: businessPhone,
          business_email: businessEmail,
          payment_terms: paymentTerms,
          footer_text: footerText,
        });

      if (error) throw error;

      Alert.alert(t('alerts.success', 'Success'), t('messages.savedSuccessfully', 'Invoice template saved successfully'), [
        { text: t('common.ok', 'OK'), onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      console.error('Error saving template:', error);
      Alert.alert(t('alerts.error', 'Error'), t('messages.failedToSave', 'Failed to save template'));
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
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Invoice & Estimate Template</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info Box */}
        <View style={[styles.infoBox, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
          <Text style={[styles.infoText, { color: Colors.primaryBlue }]}>
            Customize how your invoices and estimates look. This applies to every PDF you generate.
          </Text>
        </View>

        {/* Template Style Picker */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Template Style</Text>
          <Text style={[styles.label, { color: Colors.secondaryText, marginBottom: 14 }]}>
            Pick the visual style for your invoices and estimates. Tap Preview to see it with your business info.
          </Text>

          <View style={styles.styleCardsRow}>
            {TEMPLATE_STYLES.map((style) => {
              const selected = templateStyle === style.id;
              return (
                <TouchableOpacity
                  key={style.id}
                  activeOpacity={0.85}
                  onPress={() => setTemplateStyle(style.id)}
                  style={[
                    styles.styleCard,
                    {
                      backgroundColor: Colors.white,
                      borderColor: selected ? Colors.primaryBlue : Colors.border,
                      borderWidth: selected ? 2 : 1,
                    },
                  ]}
                >
                  {selected && (
                    <View style={[styles.styleCardCheck, { backgroundColor: Colors.primaryBlue }]}>
                      <Ionicons name="checkmark" size={14} color="#fff" />
                    </View>
                  )}
                  <View style={[styles.styleCardSwatch, { backgroundColor: style.swatchAccent }]} />
                  <Text style={[styles.styleCardName, { color: Colors.primaryText }]}>{style.name}</Text>
                  <Text style={[styles.styleCardTagline, { color: Colors.secondaryText }]} numberOfLines={2}>
                    {style.tagline}
                  </Text>
                  <TouchableOpacity
                    style={[styles.styleCardPreview, { borderColor: Colors.border }]}
                    onPress={() => { setPreviewStyle(style.id); setPreviewIsEstimate(false); }}
                  >
                    <Ionicons name="eye-outline" size={14} color={Colors.primaryText} />
                    <Text style={[styles.styleCardPreviewText, { color: Colors.primaryText }]}>Preview</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
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

        {/* Live Preview — actual rendered template using the user's
            current inputs. Updates in real time as they type. */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Live preview</Text>
          <Text style={[styles.label, { color: Colors.secondaryText, marginBottom: 12 }]}>
            This is what your invoice will actually look like with your info.
          </Text>

          <View style={[styles.livePreviewWrap, { borderColor: Colors.border, backgroundColor: '#f5f5f5' }]}>
            <WebView
              key={`${templateStyle}-${logoUri || 'nologo'}-${businessName}-${businessAddress}-${businessPhone}-${businessEmail}-${paymentTerms}-${footerText}`}
              originWhitelist={['*']}
              source={{
                html: (() => {
                  const sample = buildSampleData({
                    business: {
                      name: businessName || 'Your Business Name',
                      address: businessAddress,
                      phone: businessPhone,
                      email: businessEmail,
                      logo_url: logoUri,
                    },
                    isEstimate: false,
                  });
                  // Stamp the user's saved payment terms + footer text into
                  // the sample so the live preview shows them.
                  const enrichedBusiness = {
                    ...sample.businessInfo,
                    payment_terms: paymentTerms,
                    footer_text: footerText,
                  };
                  return generateTemplateHTML(
                    templateStyle,
                    sample.invoiceData,
                    enrichedBusiness,
                    {}
                  );
                })(),
              }}
              style={{ flex: 1, backgroundColor: '#f5f5f5' }}
              scrollEnabled={true}
              showsVerticalScrollIndicator={false}
              automaticallyAdjustContentInsets={false}
            />
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

      {/* Template preview modal — renders the chosen visual with the user's
          current logo + business info + sample line items, in a WebView.
          The user can switch invoice ↔ estimate from the toggle. "Use this
          template" sets templateStyle and closes. */}
      <Modal
        visible={!!previewStyle}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPreviewStyle(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={[styles.previewModalHeader, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => setPreviewStyle(null)} style={styles.previewClose}>
              <Ionicons name="close" size={26} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.previewModalTitle, { color: Colors.primaryText }]}>
              {previewStyle ? (TEMPLATE_STYLES.find((s) => s.id === previewStyle)?.name || '') : ''} preview
            </Text>
            <View style={{ width: 36 }} />
          </View>

          <View style={[styles.previewToggleRow, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity
              style={[styles.previewToggle, !previewIsEstimate && { backgroundColor: Colors.primaryBlue }]}
              onPress={() => setPreviewIsEstimate(false)}
            >
              <Text style={[styles.previewToggleText, !previewIsEstimate && { color: '#fff' }, previewIsEstimate && { color: Colors.primaryText }]}>
                Invoice
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.previewToggle, previewIsEstimate && { backgroundColor: Colors.primaryBlue }]}
              onPress={() => setPreviewIsEstimate(true)}
            >
              <Text style={[styles.previewToggleText, previewIsEstimate && { color: '#fff' }, !previewIsEstimate && { color: Colors.primaryText }]}>
                Estimate
              </Text>
            </TouchableOpacity>
          </View>

          {previewStyle ? (
            <WebView
              originWhitelist={['*']}
              source={{
                html: (() => {
                  const sample = buildSampleData({
                    business: {
                      name: businessName || 'Your Business',
                      address: businessAddress,
                      phone: businessPhone,
                      email: businessEmail,
                      logo_url: logoUri,
                    },
                    isEstimate: previewIsEstimate,
                  });
                  return generateTemplateHTML(
                    previewStyle,
                    sample.invoiceData,
                    sample.businessInfo,
                    { isEstimate: previewIsEstimate }
                  );
                })(),
              }}
              style={{ flex: 1, backgroundColor: '#f5f5f5' }}
              scalesPageToFit={true}
              automaticallyAdjustContentInsets={false}
            />
          ) : null}

          <View style={[
            styles.previewModalFooter,
            { backgroundColor: Colors.background, borderTopColor: Colors.border, paddingBottom: Math.max(insets.bottom + 12, 24) },
          ]}>
            <TouchableOpacity
              style={[styles.previewUseButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={() => {
                if (previewStyle) setTemplateStyle(previewStyle);
                setPreviewStyle(null);
              }}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.previewUseButtonText}>Use this template</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
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

  /* ─── Template style picker ─────────────────────────── */
  styleCardsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  styleCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 168,
    position: 'relative',
  },
  styleCardCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  styleCardSwatch: {
    width: '100%',
    height: 28,
    borderRadius: 6,
    marginBottom: 10,
  },
  styleCardName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  styleCardTagline: {
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 10,
    minHeight: 30,
  },
  styleCardPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  styleCardPreviewText: {
    fontSize: 12,
    fontWeight: '600',
  },

  /* ─── Live preview pane (in-page WebView) ─────── */
  livePreviewWrap: {
    height: 720,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },

  /* ─── Preview modal ─────────────────────────── */
  previewModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  previewModalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  previewClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewToggleRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
  },
  previewToggle: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  previewToggleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  previewModalFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  previewUseButton: {
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  previewUseButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
