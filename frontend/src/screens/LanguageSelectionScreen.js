import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, Spacing, FontSizes, BorderRadius, LightColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { SUPPORTED_LANGUAGES } from '../i18n';

export default function LanguageSelectionScreen({ onLanguageSelected }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('settings');
  const [selectedLanguage, setSelectedLanguage] = useState('en');

  const handleSelectLanguage = (languageId) => {
    setSelectedLanguage(languageId);
  };

  const handleContinue = () => {
    if (onLanguageSelected) {
      onLanguageSelected(selectedLanguage);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '20' }]}>
            <Ionicons name="language" size={48} color={Colors.primaryBlue} />
          </View>
          <Text style={[styles.title, { color: Colors.primaryText }]}>{t('language.select')}</Text>
          <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
            {/* This text shows in all supported languages */}
            Choose your preferred language
          </Text>
        </View>

        {/* Language List */}
        <ScrollView style={styles.languageList} showsVerticalScrollIndicator={false}>
          {SUPPORTED_LANGUAGES.map((language) => (
            <TouchableOpacity
              key={language.id}
              style={[
                styles.languageItem,
                {
                  backgroundColor: Colors.white,
                  borderColor: selectedLanguage === language.id ? Colors.primaryBlue : Colors.border,
                  borderWidth: selectedLanguage === language.id ? 2 : 1,
                },
              ]}
              onPress={() => handleSelectLanguage(language.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.flag}>{language.flag}</Text>
              <View style={styles.languageInfo}>
                <Text style={[styles.languageName, { color: Colors.primaryText }]}>
                  {language.name}
                </Text>
                <Text style={[styles.nativeName, { color: Colors.secondaryText }]}>
                  {language.nativeName}
                </Text>
              </View>
              {selectedLanguage === language.id && (
                <Ionicons name="checkmark-circle" size={24} color={Colors.primaryBlue} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Continue Button */}
        <TouchableOpacity
          style={[styles.continueButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleContinue}
          activeOpacity={0.8}
        >
          <Text style={styles.continueText}>{t('common:buttons.continue', 'Continue')}</Text>
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
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    paddingTop: Spacing.xl,
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
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  languageList: {
    flex: 1,
    marginBottom: Spacing.lg,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
  },
  flag: {
    fontSize: 32,
    marginRight: Spacing.md,
  },
  languageInfo: {
    flex: 1,
  },
  languageName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  nativeName: {
    fontSize: FontSizes.small,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  continueText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
