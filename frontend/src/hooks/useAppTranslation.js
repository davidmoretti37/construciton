import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getSelectedLanguage, saveLanguage } from '../utils/storage';
import { changeLanguage, SUPPORTED_LANGUAGES, isRTL } from '../i18n';

/**
 * Custom hook for app translation with language persistence
 * Syncs with user's saved language preference from Supabase
 */
export const useAppTranslation = (namespace) => {
  const { t, i18n } = useTranslation(namespace);

  // Load saved language on mount
  useEffect(() => {
    const loadSavedLanguage = async () => {
      try {
        const savedLanguage = await getSelectedLanguage();
        if (savedLanguage && savedLanguage !== i18n.language) {
          await i18n.changeLanguage(savedLanguage);
        }
      } catch (error) {
        console.error('Error loading saved language:', error);
      }
    };

    loadSavedLanguage();
  }, [i18n]);

  // Change language and save to storage
  const setLanguage = useCallback(async (languageId) => {
    try {
      await i18n.changeLanguage(languageId);
      await saveLanguage(languageId);
      return true;
    } catch (error) {
      console.error('Error changing language:', error);
      return false;
    }
  }, [i18n]);

  // Get current language info
  const getCurrentLanguageInfo = useCallback(() => {
    const currentLang = SUPPORTED_LANGUAGES.find(
      (lang) => lang.id === i18n.language
    );
    return currentLang || SUPPORTED_LANGUAGES[0]; // Default to English
  }, [i18n.language]);

  // Check if current language is RTL
  const isCurrentRTL = useCallback(() => {
    return isRTL(i18n.language);
  }, [i18n.language]);

  return {
    t,
    i18n,
    currentLanguage: i18n.language,
    setLanguage,
    getCurrentLanguageInfo,
    isRTL: isCurrentRTL,
    supportedLanguages: SUPPORTED_LANGUAGES,
  };
};

export default useAppTranslation;
