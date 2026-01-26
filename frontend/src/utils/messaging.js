import * as SMS from 'expo-sms';
import { Linking, Alert } from 'react-native';

/**
 * Send estimate via SMS
 * Opens SMS app with pre-filled message
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} estimateText - Formatted estimate text
 * @returns {Promise<void>}
 */
export const sendEstimateViaSMS = async (phoneNumber, estimateText) => {
  try {
    const isAvailable = await SMS.isAvailableAsync();

    if (!isAvailable) {
      Alert.alert('Error', 'SMS is not available on this device');
      return;
    }

    const { result } = await SMS.sendSMSAsync([phoneNumber], estimateText);

    console.log('SMS result:', result);
  } catch (error) {
    console.error('Error sending SMS:', error);
    Alert.alert('Error', 'Failed to send SMS. Please try again.');
  }
};

/**
 * Send estimate via WhatsApp
 * Opens WhatsApp with pre-filled message
 * @param {string} phoneNumber - Recipient phone number (international format without +)
 * @param {string} estimateText - Formatted estimate text
 * @returns {Promise<void>}
 */
export const sendEstimateViaWhatsApp = async (phoneNumber, estimateText) => {
  try {
    // Remove all non-numeric characters
    const formattedNumber = phoneNumber.replace(/[^0-9]/g, '');

    // Use web API URL (more reliable than whatsapp:// scheme)
    const url = `https://api.whatsapp.com/send?phone=${formattedNumber}&text=${encodeURIComponent(estimateText)}`;

    const supported = await Linking.canOpenURL(url);

    if (!supported) {
      Alert.alert('Error', 'WhatsApp is not installed on this device');
      return;
    }

    await Linking.openURL(url);
  } catch (error) {
    console.error('Error opening WhatsApp:', error);
    Alert.alert('Error', 'Failed to open WhatsApp. Please try again.');
  }
};

/**
 * Validate phone number format
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} True if valid
 */
export const isValidPhoneNumber = (phoneNumber) => {
  // Remove all non-numeric characters
  const digitsOnly = phoneNumber.replace(/[^0-9]/g, '');

  // Should have at least 10 digits
  return digitsOnly.length >= 10;
};

/**
 * Format phone number for display
 * @param {string} phoneNumber - Raw phone number
 * @returns {string} Formatted phone number
 */
export const formatPhoneNumber = (phoneNumber) => {
  const digitsOnly = phoneNumber.replace(/[^0-9]/g, '');

  if (digitsOnly.length === 10) {
    // Format as (XXX) XXX-XXXX
    return `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
  } else if (digitsOnly.length === 11 && digitsOnly[0] === '1') {
    // Format as +1 (XXX) XXX-XXXX
    return `+1 (${digitsOnly.slice(1, 4)}) ${digitsOnly.slice(4, 7)}-${digitsOnly.slice(7)}`;
  }

  // Return original if can't format
  return phoneNumber;
};

/**
 * Show send options alert
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} estimateText - Formatted estimate text
 * @returns {Promise<void>}
 */
export const showSendOptions = (phoneNumber, estimateText) => {
  if (!isValidPhoneNumber(phoneNumber)) {
    Alert.alert('Invalid Phone Number', 'Please enter a valid phone number');
    return;
  }

  Alert.alert(
    'Send Estimate',
    'How would you like to send this estimate?',
    [
      {
        text: 'SMS',
        onPress: () => sendEstimateViaSMS(phoneNumber, estimateText),
      },
      {
        text: 'WhatsApp',
        onPress: () => sendEstimateViaWhatsApp(phoneNumber, estimateText),
      },
      {
        text: 'Cancel',
        style: 'cancel',
      },
    ],
    { cancelable: true }
  );
};
