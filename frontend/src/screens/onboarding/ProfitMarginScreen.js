import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { saveUserProfile } from '../../utils/storage';

export default function ProfitMarginScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('onboarding');
  const { selectedTrades, selectedServices, businessInfo, pricing, phasesTemplate } = route.params;

  const [selectedMargin, setSelectedMargin] = useState(0.25); // Default 25%
  const [customMargin, setCustomMargin] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  const profitOptions = [
    { label: '20%', value: 0.20 },
    { label: '25%', value: 0.25 },
    { label: '30%', value: 0.30 },
    { label: '35%', value: 0.35 },
  ];

  const handleSelectMargin = (value) => {
    setSelectedMargin(value);
    setIsCustom(false);
    setCustomMargin('');
  };

  const handleCustomMarginChange = (value) => {
    setCustomMargin(value);
    if (value.trim() === '') {
      // If cleared, reset to default preset
      setIsCustom(false);
      setSelectedMargin(0.25);
      return;
    }
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0 && numValue <= 100) {
      setSelectedMargin(numValue / 100);
      setIsCustom(true);
    }
  };

  const handleContinue = async () => {
    // Save profile with profit margin
    const profile = {
      isOnboarded: false, // Will be set to true after completion screen
      businessInfo,
      trades: selectedTrades,
      pricing,
      phasesTemplate,
      profit_margin: selectedMargin,
    };

    await saveUserProfile(profile);

    // Navigate to Invoice Setup screen
    navigation.navigate('InvoiceSetup', {
      selectedTrades,
      selectedServices,
      businessInfo,
      pricing,
      phasesTemplate,
      profitMargin: selectedMargin,
    });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.backButton, { backgroundColor: Colors.secondaryText + '15' }]}
          onPress={handleBack}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('profitMargin.headerTitle')}</Text>
          <Text style={[styles.headerSubtitle, { color: Colors.secondaryText }]}>
            {t('profitMargin.headerSubtitle')}
          </Text>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profit Options */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
            {t('profitMargin.title')}
          </Text>
          <Text style={[styles.sectionSubtitle, { color: Colors.secondaryText }]}>
            {t('profitMargin.subtitle')}
          </Text>

          <View style={styles.optionsContainer}>
            {profitOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: selectedMargin === option.value && !isCustom ? Colors.primaryBlue + '15' : Colors.white,
                    borderColor: selectedMargin === option.value && !isCustom ? Colors.primaryBlue : Colors.border,
                  },
                ]}
                onPress={() => handleSelectMargin(option.value)}
                activeOpacity={0.7}
              >
                <View style={styles.optionHeader}>
                  <Text style={[
                    styles.optionLabel,
                    { color: selectedMargin === option.value && !isCustom ? Colors.primaryBlue : Colors.primaryText }
                  ]}>
                    {option.label}
                  </Text>
                  {selectedMargin === option.value && !isCustom && (
                    <Ionicons name="checkmark-circle" size={24} color={Colors.primaryBlue} />
                  )}
                </View>
              </TouchableOpacity>
            ))}

            {/* Custom Margin Input */}
            <View style={[styles.customCard, { backgroundColor: Colors.white, borderColor: isCustom ? Colors.primaryBlue : Colors.border }]}>
              <View style={styles.customHeader}>
                <Text style={[styles.customLabel, { color: Colors.primaryText }]}>{t('profitMargin.customMargin')}</Text>
                {isCustom && <Ionicons name="checkmark-circle" size={24} color={Colors.primaryBlue} />}
              </View>
              <View style={[styles.customInputContainer, { backgroundColor: Colors.lightGray }]}>
                <TextInput
                  style={[styles.customInput, { color: Colors.primaryText }]}
                  value={customMargin}
                  onChangeText={handleCustomMarginChange}
                  placeholder={t('profitMargin.enterPercentage')}
                  placeholderTextColor={Colors.secondaryText}
                  keyboardType="decimal-pad"
                />
                <Text style={[styles.percentSymbol, { color: Colors.secondaryText }]}>%</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Continue Button */}
      <View style={[styles.footer, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.continueButtonText}>{t('buttons.continue')}</Text>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  content: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
  },
  infoCard: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: FontSizes.md,
    fontWeight: '600',
    marginBottom: 4,
  },
  infoText: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: FontSizes.sm,
    marginBottom: Spacing.md,
  },
  optionsContainer: {
    gap: Spacing.md,
  },
  optionCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
  },
  customCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
  },
  customHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  customLabel: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  customInput: {
    flex: 1,
    fontSize: FontSizes.xl,
    fontWeight: '700',
  },
  percentSymbol: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    marginLeft: Spacing.xs,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
});
