import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { WebView } from 'react-native-webview';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { supabase } from '../../lib/supabase';
import { generateInvoiceHTML } from '../../utils/pdfGenerator';

const PAYMENT_TERMS = [
  'Due on Receipt',
  'Net 7',
  'Net 15',
  'Net 30',
  'Net 45',
  'Net 60',
];

export default function InvoiceSetupScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');
  const { selectedTrades, selectedServices, businessInfo, pricing, phasesTemplate, profitMargin } = route.params;

  const [setupNow, setSetupNow] = useState(null); // null = showing intro, true = showing form
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Form state - pre-populate from businessInfo
  const [logoUrl, setLogoUrl] = useState(businessInfo?.logoUrl || null);
  const [businessName, setBusinessName] = useState(businessInfo?.name || '');
  const [businessAddress, setBusinessAddress] = useState(businessInfo?.address || '');
  const [businessPhone, setBusinessPhone] = useState(businessInfo?.phone || '');
  const [businessEmail, setBusinessEmail] = useState(businessInfo?.email || '');
  const [paymentTerms, setPaymentTerms] = useState('Net 30');
  const [footerText, setFooterText] = useState('');

  // Payment method toggles
  const [enabledPayments, setEnabledPayments] = useState({
    zelle: false,
    bank: false,
    paypal: false,
    venmo: false,
    cashapp: false,
  });

  // Payment info
  const [zelleInfo, setZelleInfo] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [achRouting, setAchRouting] = useState('');
  const [wireRouting, setWireRouting] = useState('');
  const [paypalInfo, setPaypalInfo] = useState('');
  const [venmoInfo, setVenmoInfo] = useState('');
  const [cashAppInfo, setCashAppInfo] = useState('');

  const togglePaymentMethod = (method) => {
    setEnabledPayments(prev => ({
      ...prev,
      [method]: !prev[method],
    }));
  };

  const handlePickLogo = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('alerts.permissionDenied'), t('permissions.photoLibraryRequired'));
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImage = result.assets[0];
        await uploadLogo(selectedImage.uri);
      }
    } catch (error) {
      console.error('Error picking logo:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad'));
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
      Alert.alert(t('alerts.uploadFailed'), t('messages.failedToSave'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const generatePreviewHTML = () => {
    // Build payment info for preview
    let paymentInfo = '';
    if (enabledPayments.zelle && zelleInfo) {
      paymentInfo += `Zelle:\n${zelleInfo}\n\n`;
    }
    if (enabledPayments.bank && bankName && accountNumber) {
      paymentInfo += `Bank Transfer / Wire:\n${bankName}\nAccount Number: ${accountNumber}\n`;
      if (achRouting) paymentInfo += `ACH Routing: ${achRouting}\n`;
      if (wireRouting) paymentInfo += `Wire Routing: ${wireRouting}\n`;
      paymentInfo += `\n`;
    }
    if (enabledPayments.paypal && paypalInfo) {
      paymentInfo += `PayPal: ${paypalInfo}\n`;
    }
    if (enabledPayments.venmo && venmoInfo) {
      paymentInfo += `Venmo: ${venmoInfo}\n`;
    }
    if (enabledPayments.cashapp && cashAppInfo) {
      paymentInfo += `Cash App: ${cashAppInfo}\n`;
    }

    const sampleInvoiceData = {
      invoiceNumber: 'INV-001',
      clientName: 'Sample Client',
      clientAddress: '123 Client Street\nCity, State 12345',
      clientEmail: 'client@example.com',
      projectName: 'Sample Project',
      items: [
        { description: 'Sample Item 1', quantity: 1, rate: 500, amount: 500 },
        { description: 'Sample Item 2', quantity: 2, rate: 250, amount: 500 },
      ],
      subtotal: 1000,
      taxRate: 0.08,
      taxAmount: 80,
      total: 1080,
      amountPaid: 0,
      amountDue: 1080,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      paymentTerms: paymentTerms,
      notes: footerText,
      createdAt: new Date().toISOString(),
    };

    const businessInfoForPreview = {
      name: businessName || 'Your Business Name',
      address: businessAddress,
      phone: businessPhone,
      email: businessEmail,
      logoUrl: logoUrl,
      paymentInfo: paymentInfo.trim(),
    };

    return generateInvoiceHTML(sampleInvoiceData, businessInfoForPreview);
  };

  const handleContinue = () => {
    // Build payment info string - only include enabled payment methods
    let paymentInfo = '';

    console.log('💳 Building payment info...');
    console.log('Enabled payments:', enabledPayments);
    console.log('Zelle info:', zelleInfo);
    console.log('Bank name:', bankName);
    console.log('Account number:', accountNumber);

    if (enabledPayments.zelle && zelleInfo) {
      paymentInfo += `Zelle:\n${zelleInfo}\n\n`;
      console.log('✅ Added Zelle to payment info');
    }

    if (enabledPayments.bank && bankName && accountNumber) {
      paymentInfo += `Bank Transfer / Wire:\n`;
      paymentInfo += `${bankName}\n`;
      paymentInfo += `Account Number: ${accountNumber}\n`;
      if (achRouting) paymentInfo += `ACH Routing: ${achRouting}\n`;
      if (wireRouting) paymentInfo += `Wire Routing: ${wireRouting}\n`;
      paymentInfo += `\n`;
      console.log('✅ Added Bank info to payment info');
    }

    if (enabledPayments.paypal && paypalInfo) {
      paymentInfo += `PayPal: ${paypalInfo}\n`;
      console.log('✅ Added PayPal to payment info');
    }

    if (enabledPayments.venmo && venmoInfo) {
      paymentInfo += `Venmo: ${venmoInfo}\n`;
      console.log('✅ Added Venmo to payment info');
    }

    if (enabledPayments.cashapp && cashAppInfo) {
      paymentInfo += `Cash App: ${cashAppInfo}\n`;
      console.log('✅ Added Cash App to payment info');
    }

    console.log('💳 Final payment info string:', paymentInfo);
    console.log('💳 Payment info length:', paymentInfo.length);

    // Build updated business info with invoice settings
    const updatedBusinessInfo = {
      ...businessInfo,
      name: businessName.trim() || businessInfo.name,
      email: businessEmail.trim() || businessInfo.email,
      phone: businessPhone.trim() || businessInfo.phone,
      address: businessAddress.trim(),
      logoUrl: logoUrl,
      paymentTerms: paymentTerms,
      paymentInfo: paymentInfo.trim(),
      footerText: footerText.trim(),
    };

    console.log('📦 Navigating with business info:', {
      hasPaymentInfo: !!updatedBusinessInfo.paymentInfo,
      paymentInfoLength: updatedBusinessInfo.paymentInfo?.length || 0
    });

    navigation.navigate('TypicalContracts', {
      selectedTrades,
      selectedServices,
      businessInfo: updatedBusinessInfo,
      pricing,
      phasesTemplate,
      profitMargin,
    });
  };

  if (setupNow === null) {
    // Initial intro screen
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Invoice Setup</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.choiceContent}>
          <Ionicons name="receipt-outline" size={80} color={Colors.primaryBlue} style={styles.icon} />

          <Text style={[styles.choiceTitle, { color: Colors.primaryText }]}>
            Configure Your Invoices
          </Text>

          <Text style={[styles.choiceSubtitle, { color: Colors.secondaryText }]}>
            Your AI assistant will use this info to automatically generate and send professional invoices to clients.
          </Text>

          <View style={styles.benefitsContainer}>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.primaryGreen} />
              <Text style={[styles.benefitText, { color: Colors.primaryText }]}>
                Professional PDF invoices
              </Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.primaryGreen} />
              <Text style={[styles.benefitText, { color: Colors.primaryText }]}>
                Multiple payment methods
              </Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={24} color={Colors.primaryGreen} />
              <Text style={[styles.benefitText, { color: Colors.primaryText }]}>
                Preview before sending
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={() => setSetupNow(true)}
          >
            <Text style={styles.primaryButtonText}>Set Up Now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Setup form
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={[styles.header, { borderBottomColor: Colors.border }]}>
        <TouchableOpacity onPress={() => setSetupNow(null)} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Invoice Template</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Info Box */}
          <View style={[styles.infoBox, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
            <Text style={[styles.infoText, { color: Colors.primaryBlue }]}>
              This information will appear on all your invoices. You can change it later in Settings.
            </Text>
          </View>

          {/* Logo Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Business Logo</Text>

            <TouchableOpacity
              style={[styles.logoContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}
              onPress={handlePickLogo}
              disabled={uploadingLogo}
            >
              {uploadingLogo ? (
                <ActivityIndicator size="large" color={Colors.primaryBlue} />
              ) : logoUrl ? (
                <Image source={{ uri: logoUrl }} style={styles.logoImage} resizeMode="contain" />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Ionicons name="image-outline" size={48} color={Colors.secondaryText} />
                  <Text style={[styles.logoPlaceholderText, { color: Colors.secondaryText }]}>
                    Tap to upload logo
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {logoUrl && (
              <TouchableOpacity
                style={[styles.removeButton, { backgroundColor: '#EF4444' + '10' }]}
                onPress={() => setLogoUrl(null)}
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

          {/* Payment Methods */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Payment Methods</Text>
            <Text style={[styles.sectionSubtitle, { color: Colors.secondaryText }]}>
              Select and configure your accepted payment methods
            </Text>

            {/* Zelle */}
            <TouchableOpacity
              style={[styles.paymentMethodCard, { backgroundColor: Colors.white, borderColor: enabledPayments.zelle ? Colors.primaryBlue : Colors.border }]}
              onPress={() => togglePaymentMethod('zelle')}
            >
              <View style={styles.paymentMethodHeader}>
                <View style={styles.paymentMethodTitle}>
                  <Ionicons
                    name={enabledPayments.zelle ? "checkbox" : "square-outline"}
                    size={24}
                    color={enabledPayments.zelle ? Colors.primaryBlue : Colors.secondaryText}
                  />
                  <Text style={[styles.paymentMethodName, { color: Colors.primaryText }]}>Zelle</Text>
                </View>
              </View>
            </TouchableOpacity>

            {enabledPayments.zelle && (
              <View style={styles.paymentInput}>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder="Email or phone for Zelle"
                  placeholderTextColor={Colors.secondaryText}
                  value={zelleInfo}
                  onChangeText={setZelleInfo}
                />
              </View>
            )}

            {/* Bank Transfer */}
            <TouchableOpacity
              style={[styles.paymentMethodCard, { backgroundColor: Colors.white, borderColor: enabledPayments.bank ? Colors.primaryBlue : Colors.border }]}
              onPress={() => togglePaymentMethod('bank')}
            >
              <View style={styles.paymentMethodHeader}>
                <View style={styles.paymentMethodTitle}>
                  <Ionicons
                    name={enabledPayments.bank ? "checkbox" : "square-outline"}
                    size={24}
                    color={enabledPayments.bank ? Colors.primaryBlue : Colors.secondaryText}
                  />
                  <Text style={[styles.paymentMethodName, { color: Colors.primaryText }]}>Bank Transfer / Wire</Text>
                </View>
              </View>
            </TouchableOpacity>

            {enabledPayments.bank && (
              <View style={styles.paymentInput}>
                <Text style={[styles.label, { color: Colors.secondaryText }]}>Bank Name</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder="e.g., Chase Bank"
                  placeholderTextColor={Colors.secondaryText}
                  value={bankName}
                  onChangeText={setBankName}
                />

                <Text style={[styles.label, { color: Colors.secondaryText }]}>Account Number</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder="123456789"
                  placeholderTextColor={Colors.secondaryText}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  keyboardType="number-pad"
                />

                <Text style={[styles.label, { color: Colors.secondaryText }]}>ACH Routing (Optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder="021000021"
                  placeholderTextColor={Colors.secondaryText}
                  value={achRouting}
                  onChangeText={setAchRouting}
                  keyboardType="number-pad"
                />

                <Text style={[styles.label, { color: Colors.secondaryText }]}>Wire Routing (Optional)</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder="021000021"
                  placeholderTextColor={Colors.secondaryText}
                  value={wireRouting}
                  onChangeText={setWireRouting}
                  keyboardType="number-pad"
                />
              </View>
            )}

            {/* PayPal */}
            <TouchableOpacity
              style={[styles.paymentMethodCard, { backgroundColor: Colors.white, borderColor: enabledPayments.paypal ? Colors.primaryBlue : Colors.border }]}
              onPress={() => togglePaymentMethod('paypal')}
            >
              <View style={styles.paymentMethodHeader}>
                <View style={styles.paymentMethodTitle}>
                  <Ionicons
                    name={enabledPayments.paypal ? "checkbox" : "square-outline"}
                    size={24}
                    color={enabledPayments.paypal ? Colors.primaryBlue : Colors.secondaryText}
                  />
                  <Text style={[styles.paymentMethodName, { color: Colors.primaryText }]}>PayPal</Text>
                </View>
              </View>
            </TouchableOpacity>

            {enabledPayments.paypal && (
              <View style={styles.paymentInput}>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder="PayPal email or link"
                  placeholderTextColor={Colors.secondaryText}
                  value={paypalInfo}
                  onChangeText={setPaypalInfo}
                />
              </View>
            )}

            {/* Venmo */}
            <TouchableOpacity
              style={[styles.paymentMethodCard, { backgroundColor: Colors.white, borderColor: enabledPayments.venmo ? Colors.primaryBlue : Colors.border }]}
              onPress={() => togglePaymentMethod('venmo')}
            >
              <View style={styles.paymentMethodHeader}>
                <View style={styles.paymentMethodTitle}>
                  <Ionicons
                    name={enabledPayments.venmo ? "checkbox" : "square-outline"}
                    size={24}
                    color={enabledPayments.venmo ? Colors.primaryBlue : Colors.secondaryText}
                  />
                  <Text style={[styles.paymentMethodName, { color: Colors.primaryText }]}>Venmo</Text>
                </View>
              </View>
            </TouchableOpacity>

            {enabledPayments.venmo && (
              <View style={styles.paymentInput}>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder="@username or phone"
                  placeholderTextColor={Colors.secondaryText}
                  value={venmoInfo}
                  onChangeText={setVenmoInfo}
                />
              </View>
            )}

            {/* Cash App */}
            <TouchableOpacity
              style={[styles.paymentMethodCard, { backgroundColor: Colors.white, borderColor: enabledPayments.cashapp ? Colors.primaryBlue : Colors.border }]}
              onPress={() => togglePaymentMethod('cashapp')}
            >
              <View style={styles.paymentMethodHeader}>
                <View style={styles.paymentMethodTitle}>
                  <Ionicons
                    name={enabledPayments.cashapp ? "checkbox" : "square-outline"}
                    size={24}
                    color={enabledPayments.cashapp ? Colors.primaryBlue : Colors.secondaryText}
                  />
                  <Text style={[styles.paymentMethodName, { color: Colors.primaryText }]}>Cash App</Text>
                </View>
              </View>
            </TouchableOpacity>

            {enabledPayments.cashapp && (
              <View style={styles.paymentInput}>
                <TextInput
                  style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
                  placeholder="$cashtag"
                  placeholderTextColor={Colors.secondaryText}
                  value={cashAppInfo}
                  onChangeText={setCashAppInfo}
                />
              </View>
            )}
          </View>

          {/* Footer Text */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Footer Text</Text>
            <Text style={[styles.label, { color: Colors.secondaryText }]}>
              Thank you message or additional notes
            </Text>
            <TextInput
              style={[styles.input, styles.multilineInput, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
              value={footerText}
              onChangeText={setFooterText}
              placeholder="Thank you for your business!"
              placeholderTextColor={Colors.secondaryText}
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Preview Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>Preview Invoice</Text>

            <TouchableOpacity
              style={[styles.previewButton, { backgroundColor: Colors.primaryBlue }]}
              onPress={() => setShowPreview(true)}
            >
              <Ionicons name="eye-outline" size={20} color="#fff" />
              <Text style={styles.previewButtonText}>Preview Invoice PDF</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom Buttons */}
        <View style={[styles.footer, { backgroundColor: Colors.background, borderTopColor: Colors.border }]}>
          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleContinue}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
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
            <Text style={[styles.progressText, { color: Colors.secondaryText }]}>Step 4 of 4</Text>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* PDF Preview Modal */}
      <Modal
        visible={showPreview}
        animationType="slide"
        onRequestClose={() => setShowPreview(false)}
      >
        <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
          <View style={[styles.header, { borderBottomColor: Colors.border }]}>
            <TouchableOpacity onPress={() => setShowPreview(false)} style={styles.backButton}>
              <Ionicons name="close" size={24} color={Colors.primaryText} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Invoice Preview</Text>
            <View style={{ width: 40 }} />
          </View>
          <WebView
            originWhitelist={['*']}
            source={{ html: generatePreviewHTML() }}
            style={{ flex: 1 }}
          />
        </SafeAreaView>
      </Modal>
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
  choiceContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
  },
  icon: {
    marginBottom: Spacing.xl,
  },
  choiceTitle: {
    fontSize: FontSizes.title,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  choiceSubtitle: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginBottom: Spacing.xxl,
    lineHeight: 24,
  },
  benefitsContainer: {
    marginBottom: Spacing.xxl,
    width: '100%',
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  benefitText: {
    fontSize: FontSizes.body,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
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
  sectionSubtitle: {
    fontSize: 13,
    marginBottom: 12,
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
  paymentMethodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
    borderWidth: 2,
    marginBottom: 8,
  },
  paymentMethodHeader: {
    flex: 1,
  },
  paymentMethodTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentMethodName: {
    fontSize: 15,
    fontWeight: '600',
  },
  paymentInput: {
    marginLeft: 36,
    marginBottom: 16,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  previewButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: Spacing.lg,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 16,
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
