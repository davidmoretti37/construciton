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
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { generateInvoiceHTML } from '../../utils/pdfGenerator';

export default function InvoiceSetupScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);
  const { selectedTrades, businessInfo, pricing } = route.params;

  const [setupNow, setSetupNow] = useState(null); // null = not chosen, true = setup now, false = skip
  const [showPreview, setShowPreview] = useState(false);

  // Form state
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState(businessInfo?.email || '');
  const [phone, setPhone] = useState(businessInfo?.phone || '');
  const [address, setAddress] = useState('');

  // Payment info
  const [zelleInfo, setZelleInfo] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [achRouting, setAchRouting] = useState('');
  const [wireRouting, setWireRouting] = useState('');
  const [paypalInfo, setPaypalInfo] = useState('');
  const [venmoInfo, setVenmoInfo] = useState('');
  const [cashAppInfo, setCashAppInfo] = useState('');

  const handleSkipSetup = () => {
    // Continue without invoice setup
    navigation.navigate('Completion', {
      selectedTrades,
      businessInfo,
      pricing,
      invoiceSetup: null,
    });
  };

  const handleContinue = () => {
    // Build payment info string
    let paymentInfo = '';

    if (zelleInfo) {
      paymentInfo += `Zelle:\n${zelleInfo}\n\n`;
    }

    if (bankName && accountNumber) {
      paymentInfo += `Bank Transfer / Wire:\n`;
      paymentInfo += `${bankName}\n`;
      paymentInfo += `Account Number: ${accountNumber}\n`;
      if (achRouting) paymentInfo += `ACH Routing: ${achRouting}\n`;
      if (wireRouting) paymentInfo += `Wire Routing: ${wireRouting}\n`;
      paymentInfo += `\n`;
    }

    if (paypalInfo) {
      paymentInfo += `PayPal: ${paypalInfo}\n`;
    }

    if (venmoInfo) {
      paymentInfo += `Venmo: ${venmoInfo}\n`;
    }

    if (cashAppInfo) {
      paymentInfo += `Cash App: ${cashAppInfo}\n`;
    }

    const invoiceSetup = {
      contactName: contactName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      paymentInfo: paymentInfo.trim(),
    };

    navigation.navigate('Completion', {
      selectedTrades,
      businessInfo: {
        ...businessInfo,
        contactName: contactName.trim() || businessInfo.name,
        email: email.trim() || businessInfo.email,
        phone: phone.trim() || businessInfo.phone,
        address: address.trim(),
        paymentInfo: paymentInfo.trim(),
      },
      pricing,
      invoiceSetup,
    });
  };

  const handlePreview = () => {
    setShowPreview(true);
  };

  // Sample invoice data for preview
  const getSampleInvoiceData = () => {
    let paymentInfo = '';
    if (zelleInfo) paymentInfo += `Zelle:\n${zelleInfo}\n\n`;
    if (bankName) {
      paymentInfo += `Bank Transfer / Wire:\n${bankName}\n`;
      if (accountNumber) paymentInfo += `Account Number: ${accountNumber}\n`;
      if (achRouting) paymentInfo += `ACH Routing: ${achRouting}\n`;
      if (wireRouting) paymentInfo += `Wire Routing: ${wireRouting}\n`;
    }
    if (paypalInfo) paymentInfo += `\nPayPal: ${paypalInfo}`;
    if (venmoInfo) paymentInfo += `\nVenmo: ${venmoInfo}`;
    if (cashAppInfo) paymentInfo += `\nCash App: ${cashAppInfo}`;

    return {
      invoiceNumber: 'INV-2025-001',
      client_name: 'Sample Client',
      client_address: '123 Client St, City, State 12345',
      project_name: 'Sample Project',
      items: [
        {
          description: 'Sample Service',
          quantity: 100,
          unit: 'sq ft',
          price: 5.00,
          total: 500.00,
        },
      ],
      subtotal: 500.00,
      total: 500.00,
      created_at: new Date().toISOString(),
    };
  };

  const getBusinessInfoForPreview = () => ({
    name: businessInfo?.name || 'Your Company Name',
    contactName: contactName || businessInfo?.name,
    email: email || businessInfo?.email || 'email@example.com',
    phone: phone || businessInfo?.phone || '(555) 123-4567',
    address: address || '',
    paymentInfo: [zelleInfo, bankName, paypalInfo, venmoInfo, cashAppInfo].some(x => x)
      ? undefined // Show payment info from fields
      : 'Add payment information above',
  });

  if (setupNow === null) {
    // Initial choice screen
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
            Configure Invoice Setup?
          </Text>

          <Text style={[styles.choiceSubtitle, { color: Colors.secondaryText }]}>
            Add your payment details and business info to create professional invoices for your clients.
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

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: Colors.border }]}
            onPress={() => setSetupNow(false)}
          >
            <Text style={[styles.secondaryButtonText, { color: Colors.primaryText }]}>
              Skip for Now
            </Text>
          </TouchableOpacity>

          <Text style={[styles.skipNote, { color: Colors.secondaryText }]}>
            You can configure this later in Settings
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (setupNow === false) {
    // Skip confirmed - go to completion
    handleSkipSetup();
    return null;
  }

  // Setup form
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setSetupNow(null)} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Invoice Setup</Text>
        <TouchableOpacity onPress={handleSkipSetup}>
          <Text style={[styles.skipButton, { color: Colors.primaryBlue }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.title, { color: Colors.primaryText }]}>
            Invoice Information
          </Text>
          <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
            This information will appear on all your invoices
          </Text>

          {/* Company Identity */}
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
            1. Company Identity
          </Text>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              Contact Name <Text style={styles.required}>*</Text>
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="person-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder="e.g., John Smith"
                placeholderTextColor={Colors.secondaryText}
                value={contactName}
                onChangeText={setContactName}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              Email <Text style={styles.required}>*</Text>
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="mail-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder="john@construction.com"
                placeholderTextColor={Colors.secondaryText}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              Phone <Text style={[styles.optional, { color: Colors.secondaryText }]}>(Optional)</Text>
            </Text>
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
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              Business Address <Text style={[styles.optional, { color: Colors.secondaryText }]}>(Optional)</Text>
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="location-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder="123 Main St, City, State 12345"
                placeholderTextColor={Colors.secondaryText}
                value={address}
                onChangeText={setAddress}
              />
            </View>
          </View>

          {/* Payment Information */}
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
            2. Payment Information
          </Text>
          <Text style={[styles.sectionSubtitle, { color: Colors.secondaryText }]}>
            Add at least one payment method
          </Text>

          {/* Zelle */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              Zelle
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="cash-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder="Email or phone for Zelle"
                placeholderTextColor={Colors.secondaryText}
                value={zelleInfo}
                onChangeText={setZelleInfo}
              />
            </View>
          </View>

          {/* Bank Info */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              Bank Name
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="business-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder="e.g., Chase Bank"
                placeholderTextColor={Colors.secondaryText}
                value={bankName}
                onChangeText={setBankName}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              Account Number
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="card-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder="123456789"
                placeholderTextColor={Colors.secondaryText}
                value={accountNumber}
                onChangeText={setAccountNumber}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              ACH Routing Number
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="git-network-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder="021000021"
                placeholderTextColor={Colors.secondaryText}
                value={achRouting}
                onChangeText={setAchRouting}
                keyboardType="number-pad"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              Wire Transfer Routing Number
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="git-network-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder="021000021"
                placeholderTextColor={Colors.secondaryText}
                value={wireRouting}
                onChangeText={setWireRouting}
                keyboardType="number-pad"
              />
            </View>
          </View>

          {/* Other Payment Methods */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              PayPal
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="logo-paypal" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder="PayPal email or link"
                placeholderTextColor={Colors.secondaryText}
                value={paypalInfo}
                onChangeText={setPaypalInfo}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              Venmo
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="cash-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder="@username or phone"
                placeholderTextColor={Colors.secondaryText}
                value={venmoInfo}
                onChangeText={setVenmoInfo}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              Cash App
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="cash-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder="$cashtag"
                placeholderTextColor={Colors.secondaryText}
                value={cashAppInfo}
                onChangeText={setCashAppInfo}
              />
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Bottom Buttons */}
        <View style={[styles.bottomSection, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
          <TouchableOpacity
            style={[styles.previewButton, { backgroundColor: Colors.white, borderColor: Colors.primaryBlue }]}
            onPress={handlePreview}
          >
            <Ionicons name="eye-outline" size={20} color={Colors.primaryBlue} />
            <Text style={[styles.previewButtonText, { color: Colors.primaryBlue }]}>Preview Invoice</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleContinue}
          >
            <Text style={styles.buttonText}>Continue</Text>
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

      {/* Preview Modal */}
      <Modal
        visible={showPreview}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPreview(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: Colors.background }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: Colors.primaryText }]}>Invoice Preview</Text>
            <TouchableOpacity onPress={() => setShowPreview(false)}>
              <Ionicons name="close" size={28} color={Colors.primaryText} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.previewNotice}>
              <Ionicons name="information-circle" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.previewNoticeText, { color: Colors.primaryBlue }]}>
                This is a sample preview. Your actual invoices will show real client and project data.
              </Text>
            </View>

            {/* Show HTML preview - you could use WebView here */}
            <Text style={[styles.previewText, { color: Colors.secondaryText }]}>
              Preview functionality will show your invoice PDF here.{'\n\n'}
              Invoice will include:{'\n'}
              • Company: {businessInfo?.name}{'\n'}
              • Contact: {contactName || 'Not set'}{'\n'}
              • Email: {email || 'Not set'}{'\n'}
              {zelleInfo ? `• Zelle: ${zelleInfo}\n` : ''}
              {bankName ? `• Bank: ${bankName}\n` : ''}
              {paypalInfo ? `• PayPal: ${paypalInfo}\n` : ''}
            </Text>
          </ScrollView>
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
  skipButton: {
    fontSize: FontSizes.body,
    fontWeight: '600',
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
  secondaryButton: {
    width: '100%',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  secondaryButtonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  skipNote: {
    fontSize: FontSizes.small,
    textAlign: 'center',
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
  sectionTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
  sectionSubtitle: {
    fontSize: FontSizes.small,
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
  required: {
    color: '#EF4444',
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
  bottomSection: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  previewButtonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
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
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  modalContent: {
    flex: 1,
    padding: Spacing.lg,
  },
  previewNotice: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  previewNoticeText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  previewText: {
    fontSize: FontSizes.small,
    lineHeight: 22,
  },
});
