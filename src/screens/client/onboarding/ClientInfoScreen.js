import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';

export default function ClientInfoScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');

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
    if (!address.trim()) {
      Alert.alert('Required Field', 'Please enter your address');
      return;
    }

    // Pass data to completion screen
    navigation.navigate('ClientCompletion', {
      fullName: fullName.trim(),
      phone: phone.trim(),
      address: address.trim(),
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
          <View style={styles.header}>
            <Text style={[styles.title, { color: Colors.primaryText }]}>
              Your Information
            </Text>
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
              Tell us a bit about yourself
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Full Name */}
            <View style={styles.inputGroup}>
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
            </View>

            {/* Phone */}
            <View style={styles.inputGroup}>
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
            </View>

            {/* Address */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>Address *</Text>
              <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                <Ionicons name="location-outline" size={20} color={Colors.secondaryText} />
                <TextInput
                  style={[styles.input, { color: Colors.primaryText }]}
                  placeholder="123 Main St, City, State 12345"
                  placeholderTextColor={Colors.secondaryText}
                  value={address}
                  onChangeText={setAddress}
                  autoCapitalize="words"
                  multiline
                />
              </View>
            </View>
          </View>

          {/* Continue Button */}
          <TouchableOpacity
            style={[styles.button, { backgroundColor: '#7C3AED' }]}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>

          {/* Progress Indicator */}
          <View style={styles.progressContainer}>
            <View style={styles.progressDots}>
              <View style={[styles.dot, { backgroundColor: '#7C3AED' }]} />
              <View style={[styles.dot, styles.activeDot, { backgroundColor: '#7C3AED' }]} />
              <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            </View>
            <Text style={[styles.progressText, { color: Colors.secondaryText }]}>
              Step 2 of 3
            </Text>
          </View>
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
    marginBottom: Spacing.xl,
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
