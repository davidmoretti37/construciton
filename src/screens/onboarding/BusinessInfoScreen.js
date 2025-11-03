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
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

export default function BusinessInfoScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);
  const { selectedTrades } = route.params;

  const [businessName, setBusinessName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const handleContinue = () => {
    if (!businessName.trim()) {
      Alert.alert('Business Name Required', 'Please enter your business or contractor name');
      return;
    }

    if (!phone.trim()) {
      Alert.alert('Phone Required', 'Please enter your phone number');
      return;
    }

    navigation.navigate('PricingSetup', {
      selectedTrades,
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
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Business Info</Text>
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
            Tell us about your business
          </Text>
          <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
            This information will appear on your estimates
          </Text>

          {/* Business Name Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              Business Name <Text style={styles.required}>*</Text>
            </Text>
            <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="business-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                style={[styles.input, { color: Colors.primaryText }]}
                placeholder="e.g., John's Construction"
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
              Phone Number <Text style={styles.required}>*</Text>
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
                autoCorrect={false}
              />
            </View>
            <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
              Clients will see this on estimates
            </Text>
          </View>

          {/* Email Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>
              Email <Text style={[styles.optional, { color: Colors.secondaryText }]}>(Optional)</Text>
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
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Info Box */}
          <View style={[styles.infoBox, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
            <Text style={[styles.infoText, { color: Colors.primaryBlue }]}>
              You can update this information later in Settings
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
            <Text style={styles.buttonText}>Continue to Pricing</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>

          {/* Progress */}
          <View style={styles.progressContainer}>
            <View style={styles.progressDots}>
              <View style={[styles.dot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.dot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.dot, styles.activeDot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            </View>
            <Text style={[styles.progressText, { color: Colors.secondaryText }]}>Step 3 of 4</Text>
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
