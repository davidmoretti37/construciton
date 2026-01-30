import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';

// Import English translations (base language)
import enCommon from '../locales/en/common.json';
import enAuth from '../locales/en/auth.json';
import enOnboarding from '../locales/en/onboarding.json';
import enProjects from '../locales/en/projects.json';
import enWorkers from '../locales/en/workers.json';
import enInvoices from '../locales/en/invoices.json';
import enSettings from '../locales/en/settings.json';
import enChat from '../locales/en/chat.json';
import enHome from '../locales/en/home.json';
import enNavigation from '../locales/en/navigation.json';
import enSchedule from '../locales/en/schedule.json';

// Import Spanish translations
import esCommon from '../locales/es/common.json';
import esAuth from '../locales/es/auth.json';
import esOnboarding from '../locales/es/onboarding.json';
import esProjects from '../locales/es/projects.json';
import esWorkers from '../locales/es/workers.json';
import esInvoices from '../locales/es/invoices.json';
import esSettings from '../locales/es/settings.json';
import esChat from '../locales/es/chat.json';
import esHome from '../locales/es/home.json';
import esNavigation from '../locales/es/navigation.json';
import esSchedule from '../locales/es/schedule.json';

// Import Portuguese (Brazil) translations
import ptBRCommon from '../locales/pt-BR/common.json';
import ptBRAuth from '../locales/pt-BR/auth.json';
import ptBROnboarding from '../locales/pt-BR/onboarding.json';
import ptBRProjects from '../locales/pt-BR/projects.json';
import ptBRWorkers from '../locales/pt-BR/workers.json';
import ptBRInvoices from '../locales/pt-BR/invoices.json';
import ptBRSettings from '../locales/pt-BR/settings.json';
import ptBRChat from '../locales/pt-BR/chat.json';
import ptBRHome from '../locales/pt-BR/home.json';
import ptBRNavigation from '../locales/pt-BR/navigation.json';
import ptBRSchedule from '../locales/pt-BR/schedule.json';

const resources = {
  en: {
    common: enCommon,
    auth: enAuth,
    onboarding: enOnboarding,
    projects: enProjects,
    workers: enWorkers,
    invoices: enInvoices,
    settings: enSettings,
    chat: enChat,
    home: enHome,
    navigation: enNavigation,
    schedule: enSchedule,
  },
  es: {
    common: esCommon,
    auth: esAuth,
    onboarding: esOnboarding,
    projects: esProjects,
    workers: esWorkers,
    invoices: esInvoices,
    settings: esSettings,
    chat: esChat,
    home: esHome,
    navigation: esNavigation,
    schedule: esSchedule,
  },
  'pt-BR': {
    common: ptBRCommon,
    auth: ptBRAuth,
    onboarding: ptBROnboarding,
    projects: ptBRProjects,
    workers: ptBRWorkers,
    invoices: ptBRInvoices,
    settings: ptBRSettings,
    chat: ptBRChat,
    home: ptBRHome,
    navigation: ptBRNavigation,
    schedule: ptBRSchedule,
  },
};

// Supported languages (EN, ES, PT-BR only)
export const SUPPORTED_LANGUAGES = [
  { id: 'en', name: 'English', nativeName: 'English', flag: '🇺🇸' },
  { id: 'es', name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  { id: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', flag: '🇧🇷' },
];

// Get device language or fallback to English
const getDeviceLanguage = () => {
  const deviceLocale = Localization.locale;
  // Check if device language is supported
  const supportedLang = SUPPORTED_LANGUAGES.find(
    (lang) => deviceLocale.startsWith(lang.id)
  );
  return supportedLang?.id || 'en';
};

// Initialize i18next
i18n.use(initReactI18next).init({
  resources,
  lng: 'en', // Default to English, will be updated by user preference
  fallbackLng: 'en',
  ns: ['common', 'auth', 'onboarding', 'projects', 'workers', 'invoices', 'settings', 'chat', 'home', 'navigation', 'schedule'],
  defaultNS: 'common',
  interpolation: {
    escapeValue: false, // React already handles escaping
  },
  react: {
    useSuspense: false, // Disable suspense for React Native
  },
});

// Function to change language
export const changeLanguage = async (languageId) => {
  await i18n.changeLanguage(languageId);
};

// Function to get current language
export const getCurrentLanguage = () => {
  return i18n.language;
};

// Check if language is RTL (for Arabic)
export const isRTL = (languageId) => {
  return languageId === 'ar';
};

export default i18n;
