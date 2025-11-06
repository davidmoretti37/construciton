import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getUserProfile } from '../../utils/storage';
import { supabase } from '../../lib/supabase';

export default function TwilioSetupScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTwilioConfig();
  }, []);

  const loadTwilioConfig = async () => {
    try {
      const profile = await getUserProfile();
      if (profile) {
        // Load from user profile if exists
        const { data, error } = await supabase
          .from('profiles')
          .select('business_phone_number, twilio_account_sid, twilio_auth_token')
          .eq('id', (await supabase.auth.getUser()).data.user?.id)
          .single();

        if (data) {
          setAccountSid(data.twilio_account_sid || '');
          setAuthToken(data.twilio_auth_token || '');
          setPhoneNumber(data.business_phone_number || '');
        }
      }
    } catch (error) {
      console.error('Error loading Twilio config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    // Validate inputs
    if (!accountSid.trim() || !authToken.trim() || !phoneNumber.trim()) {
      Alert.alert('Missing Information', 'Please fill in all fields');
      return;
    }

    // Validate phone number format
    if (!phoneNumber.startsWith('+')) {
      Alert.alert('Invalid Phone Number', 'Phone number must start with + and include country code (e.g., +1234567890)');
      return;
    }

    setIsSaving(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user?.id;
      if (!userId) {
        throw new Error('Not logged in');
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          twilio_account_sid: accountSid.trim(),
          twilio_auth_token: authToken.trim(),
          business_phone_number: phoneNumber.trim(),
          phone_provisioned_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) throw error;

      Alert.alert(
        'Success',
        'Twilio configuration saved successfully! You can now receive client messages.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Error saving Twilio config:', error);
      Alert.alert('Error', 'Failed to save configuration. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!accountSid.trim() || !authToken.trim()) {
      Alert.alert('Missing Credentials', 'Please enter Account SID and Auth Token first');
      return;
    }

    setIsTesting(true);
    try {
      // Test Twilio credentials by fetching account info
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid.trim()}.json`,
        {
          headers: {
            Authorization: `Basic ${btoa(`${accountSid.trim()}:${authToken.trim()}`)}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        Alert.alert(
          'Connection Successful ✅',
          `Account: ${data.friendly_name}\nStatus: ${data.status}\n\nYour Twilio credentials are valid!`
        );
      } else {
        const error = await response.json();
        Alert.alert(
          'Connection Failed ❌',
          `Error: ${error.message || 'Invalid credentials'}\n\nPlease check your Account SID and Auth Token.`
        );
      }
    } catch (error) {
      console.error('Error testing Twilio connection:', error);
      Alert.alert('Connection Failed', 'Unable to connect to Twilio. Please check your credentials and internet connection.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleClear = () => {
    Alert.alert(
      'Clear Configuration',
      'This will remove all Twilio settings. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            setAccountSid('');
            setAuthToken('');
            setPhoneNumber('');
          },
        },
      ]
    );
  };

  if (isLoading) {
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>SMS/WhatsApp Setup</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Info Banner */}
        <View style={[styles.infoBanner, { backgroundColor: Colors.primaryBlue + '15', borderColor: Colors.primaryBlue + '30' }]}>
          <Ionicons name="information-circle" size={24} color={Colors.primaryBlue} />
          <Text style={[styles.infoText, { color: Colors.primaryText }]}>
            Connect your Twilio account to enable client messaging via SMS and WhatsApp
          </Text>
        </View>

        {/* Instructions */}
        <View style={[styles.section, { backgroundColor: Colors.lightGray }]}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>How to Get Twilio Credentials</Text>
          <View style={styles.step}>
            <Text style={[styles.stepNumber, { color: Colors.primaryBlue }]}>1</Text>
            <Text style={[styles.stepText, { color: Colors.secondaryText }]}>
              Create a free account at twilio.com/try-twilio
            </Text>
          </View>
          <View style={styles.step}>
            <Text style={[styles.stepNumber, { color: Colors.primaryBlue }]}>2</Text>
            <Text style={[styles.stepText, { color: Colors.secondaryText }]}>
              Buy a phone number ($1-2/month)
            </Text>
          </View>
          <View style={styles.step}>
            <Text style={[styles.stepNumber, { color: Colors.primaryBlue }]}>3</Text>
            <Text style={[styles.stepText, { color: Colors.secondaryText }]}>
              Find Account SID and Auth Token in your Twilio Console
            </Text>
          </View>
          <View style={styles.step}>
            <Text style={[styles.stepNumber, { color: Colors.primaryBlue }]}>4</Text>
            <Text style={[styles.stepText, { color: Colors.secondaryText }]}>
              Enter credentials below and test the connection
            </Text>
          </View>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>Account SID</Text>
            <TextInput
              style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              placeholderTextColor={Colors.placeholderText}
              value={accountSid}
              onChangeText={setAccountSid}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
              Found in Twilio Console → Account Info
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>Auth Token</Text>
            <TextInput
              style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
              placeholder="Enter your Twilio Auth Token"
              placeholderTextColor={Colors.placeholderText}
              value={authToken}
              onChangeText={setAuthToken}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
              Click "Show" next to Auth Token in Twilio Console
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.label, { color: Colors.primaryText }]}>Twilio Phone Number</Text>
            <TextInput
              style={[styles.input, { backgroundColor: Colors.white, borderColor: Colors.border, color: Colors.primaryText }]}
              placeholder="+1 234 567 8900"
              placeholderTextColor={Colors.placeholderText}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
            />
            <Text style={[styles.helperText, { color: Colors.secondaryText }]}>
              Include country code (e.g., +1 for US)
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.button, styles.testButton, { borderColor: Colors.primaryBlue }]}
            onPress={handleTestConnection}
            disabled={isTesting || isSaving}
          >
            {isTesting ? (
              <ActivityIndicator size="small" color={Colors.primaryBlue} />
            ) : (
              <>
                <Ionicons name="flash-outline" size={20} color={Colors.primaryBlue} />
                <Text style={[styles.buttonText, { color: Colors.primaryBlue }]}>Test Connection</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.saveButton, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleSave}
            disabled={isSaving || isTesting}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color={Colors.white} />
                <Text style={[styles.buttonText, { color: Colors.white }]}>Save Configuration</Text>
              </>
            )}
          </TouchableOpacity>

          {(accountSid || authToken || phoneNumber) && (
            <TouchableOpacity
              style={[styles.button, styles.clearButton, { borderColor: Colors.error }]}
              onPress={handleClear}
              disabled={isSaving || isTesting}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
              <Text style={[styles.buttonText, { color: Colors.error }]}>Clear All</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Help Section */}
        <View style={[styles.helpSection, { backgroundColor: Colors.lightGray }]}>
          <Text style={[styles.helpTitle, { color: Colors.primaryText }]}>Need Help?</Text>
          <Text style={[styles.helpText, { color: Colors.secondaryText }]}>
            • Make sure your Twilio account is active{'\n'}
            • Verify you copied the Account SID and Auth Token correctly{'\n'}
            • Test the connection before saving{'\n'}
            • Cost: ~$2-3/month for phone number + messages
          </Text>
        </View>
      </ScrollView>
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
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.large,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
  },
  infoBanner: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  section: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '600',
  },
  stepText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  form: {
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
  input: {
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    fontSize: FontSizes.body,
  },
  helperText: {
    fontSize: FontSizes.tiny,
    marginTop: Spacing.xs,
  },
  actions: {
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  testButton: {
    borderWidth: 1,
  },
  saveButton: {},
  clearButton: {
    borderWidth: 1,
  },
  buttonText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  helpSection: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  helpTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  helpText: {
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.body,
  },
});
