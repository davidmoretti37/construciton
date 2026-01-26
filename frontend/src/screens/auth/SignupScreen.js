import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { supabase } from '../../lib/supabase';

// Password complexity validation
const validatePassword = (password) => {
  const checks = {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return { valid: passed >= 4, checks, score: passed };
};

export default function SignupScreen({ navigation }) {
  // Always use light mode for auth screens
  const Colors = LightColors;
  const { t } = useTranslation('auth');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleSignup = async () => {
    // Validation
    if (!email || !password || !confirmPassword) {
      Alert.alert(t('signup.errors.missingFields'), t('signup.errors.fillAllFields'));
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert(t('signup.errors.invalidEmail'), t('signup.errors.enterValidEmail'));
      return;
    }

    const { valid, checks } = validatePassword(password);
    if (!valid) {
      const missing = [];
      if (!checks.length) missing.push(t('signup.errors.minChars'));
      if (!checks.uppercase) missing.push(t('signup.errors.uppercase'));
      if (!checks.lowercase) missing.push(t('signup.errors.lowercase'));
      if (!checks.number) missing.push(t('signup.errors.number'));
      if (!checks.special) missing.push(t('signup.errors.specialChar'));
      Alert.alert(
        t('signup.errors.weakPassword'),
        `${t('signup.errors.passwordRequirements')}\n\n• ${missing.join('\n• ')}`
      );
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert(t('signup.errors.passwordMismatch'), t('signup.errors.passwordsDoNotMatch'));
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.toLowerCase().trim(),
        password: password,
      });

      if (error) throw error;

      if (data.user) {
        console.log('✅ Signup successful:', data.user.email);
        // With email confirmation disabled, user is automatically logged in
        // App.js will detect the session and navigate to language selection
        // No need to show alert or navigate manually
      }
    } catch (error) {
      console.error('Signup error:', error);
      Alert.alert(t('signup.errors.signupFailed'), error.message || t('signup.errors.signupError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name="construct" size={48} color={Colors.primaryBlue} />
            </View>
            <Text style={[styles.title, { color: Colors.primaryText }]}>{t('signup.title')}</Text>
            <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
              {t('signup.subtitle')}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Email Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('signup.emailLabel')}</Text>
              <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                <Ionicons name="mail-outline" size={20} color={Colors.secondaryText} />
                <TextInput
                  style={[styles.input, { color: Colors.primaryText }]}
                  placeholder={t('signup.emailPlaceholder')}
                  placeholderTextColor={Colors.secondaryText}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('signup.passwordLabel')}</Text>
              <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.secondaryText} />
                <TextInput
                  style={[styles.input, { color: Colors.primaryText }]}
                  placeholder={t('signup.passwordPlaceholder')}
                  placeholderTextColor={Colors.secondaryText}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons
                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={Colors.secondaryText}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password Input */}
            <View style={styles.inputGroup}>
              <Text style={[styles.label, { color: Colors.primaryText }]}>{t('signup.confirmPasswordLabel')}</Text>
              <View style={[styles.inputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                <Ionicons name="lock-closed-outline" size={20} color={Colors.secondaryText} />
                <TextInput
                  style={[styles.input, { color: Colors.primaryText }]}
                  placeholder={t('signup.confirmPasswordPlaceholder')}
                  placeholderTextColor={Colors.secondaryText}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  <Ionicons
                    name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                    size={20}
                    color={Colors.secondaryText}
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Signup Button */}
            <TouchableOpacity
              style={[styles.button, {
                backgroundColor: Colors.primaryBlue,
                opacity: loading ? 0.6 : 1
              }]}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Text style={styles.buttonText}>{t('signup.createAccountButton')}</Text>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                </>
              )}
            </TouchableOpacity>

            {/* Login Link */}
            <View style={styles.footer}>
              <Text style={[styles.footerText, { color: Colors.secondaryText }]}>
                {t('signup.hasAccount')}{' '}
              </Text>
              <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                <Text style={[styles.linkText, { color: Colors.primaryBlue }]}>{t('signup.signInLink')}</Text>
              </TouchableOpacity>
            </View>
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
  scrollContent: {
    flexGrow: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: FontSizes.xlarge,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  form: {
    width: '100%',
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
    borderRadius: BorderRadius.lg,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.xl,
  },
  footerText: {
    fontSize: FontSizes.body,
  },
  linkText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
