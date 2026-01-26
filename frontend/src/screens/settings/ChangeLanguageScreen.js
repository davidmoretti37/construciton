import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../../i18n';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getSelectedLanguage, saveLanguage } from '../../utils/storage';

const LANGUAGES = [
  { id: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { id: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { id: 'fr', name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  { id: 'de', name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  { id: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', flag: '🇧🇷' },
  { id: 'pt', name: 'Portuguese (Portugal)', nativeName: 'Português (Portugal)', flag: '🇵🇹' },
  { id: 'it', name: 'Italian', nativeName: 'Italiano', flag: '🇮🇹' },
  { id: 'zh', name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  { id: 'ja', name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  { id: 'ko', name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
  { id: 'ar', name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
];

export default function ChangeLanguageScreen({ navigation }) {
  const { t } = useTranslation('settings');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrentLanguage();
  }, []);

  const loadCurrentLanguage = async () => {
    try {
      const language = await getSelectedLanguage();
      setSelectedLanguage(language || 'en');
    } catch (error) {
      console.error('Error loading language:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectLanguage = (languageId) => {
    setSelectedLanguage(languageId);
  };

  const handleSave = async () => {
    try {
      const success = await saveLanguage(selectedLanguage);
      if (success) {
        // Update i18n language immediately so UI reflects the change
        await changeLanguage(selectedLanguage);
        Alert.alert(
          t('language.updated'),
          t('language.updateMessage'),
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack(),
            },
          ]
        );
      } else {
        Alert.alert('Error', 'Failed to update language. Please try again.');
      }
    } catch (error) {
      console.error('Error saving language:', error);
      Alert.alert('Error', 'Failed to update language. Please try again.');
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>Loading...</Text>
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
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('account.language')}</Text>
        <View style={styles.headerRight} />
      </View>

      <View style={styles.content}>
        {/* Language List */}
        <ScrollView style={styles.languageList} showsVerticalScrollIndicator={false}>
          {LANGUAGES.map((language) => (
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

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: Colors.primaryBlue }]}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <Text style={styles.saveText}>Save Changes</Text>
          <Ionicons name="checkmark" size={20} color="#fff" />
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
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerTitle: {
    fontSize: FontSizes.header,
    fontWeight: '700',
  },
  headerRight: {
    width: 32, // Same width as back button for centering
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: FontSizes.body,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
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
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  saveText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
