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
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getUserProfile, getSelectedLanguage, getAutoTranslateEstimates, updateAutoTranslateEstimates } from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Language display names
const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
};

export default function SettingsScreen({ navigation }) {
  const { t } = useTranslation(['settings', 'common']);
  const { isDark = false, toggleTheme } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [userProfile, setUserProfile] = useState(null);
  const [currentLanguage, setCurrentLanguage] = useState('en');
  const [autoTranslateEstimates, setAutoTranslateEstimates] = useState(false);

  useEffect(() => {
    loadProfile();

    // Reload profile when screen comes into focus
    const unsubscribe = navigation.addListener('focus', () => {
      loadProfile();
    });

    return unsubscribe;
  }, [navigation]);

  const loadProfile = async () => {
    const profile = await getUserProfile();
    setUserProfile(profile);

    // Load current language
    const language = await getSelectedLanguage();
    setCurrentLanguage(language || 'en');

    // Load auto-translate setting
    const autoTranslate = await getAutoTranslateEstimates();
    setAutoTranslateEstimates(autoTranslate);
  };

  const handleChangeLanguage = () => {
    navigation.navigate('ChangeLanguage');
  };

  const handleToggleAutoTranslate = async () => {
    const newValue = !autoTranslateEstimates;
    const success = await updateAutoTranslateEstimates(newValue);
    if (success) {
      setAutoTranslateEstimates(newValue);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      t('confirmLogout.title'),
      t('confirmLogout.message'),
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: t('account.logout'),
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🚪 LOGOUT: Starting logout process...');

              // Sign out from Supabase
              console.log('🚪 LOGOUT: Calling supabase.auth.signOut()...');
              const { error } = await supabase.auth.signOut();
              if (error) {
                console.error('🚪 LOGOUT ERROR:', error);
                throw error;
              }
              console.log('🚪 LOGOUT: Supabase signOut successful');

              // Clear all AsyncStorage data for complete reset
              console.log('🚪 LOGOUT: Clearing AsyncStorage...');
              await AsyncStorage.clear();
              console.log('🚪 LOGOUT: AsyncStorage cleared');

              console.log('✅ LOGOUT COMPLETE - App should now show LOGIN screen');
              // App.js will handle navigation to login screen via auth state listener
            } catch (error) {
              console.error('❌ LOGOUT FAILED:', error);
              Alert.alert(t('common:alerts.error'), t('common:messages.failedToLogout'));
            }
          },
        },
      ]
    );
  };

  if (!userProfile) {
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
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{t('title')}</Text>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        {/* App Settings Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>{t('sections.preferences').toUpperCase()}</Text>

          <TouchableOpacity
            style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={handleChangeLanguage}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name="language-outline" size={24} color={Colors.primaryBlue} />
            </View>
            <View style={styles.itemContent}>
              <Text style={[styles.itemTitle, { color: Colors.primaryText }]}>{t('account.language')}</Text>
              <Text style={[styles.itemSubtitle, { color: Colors.secondaryText }]}>
                {LANGUAGE_NAMES[currentLanguage] || 'English'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={toggleTheme}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name={isDark ? "moon" : "sunny-outline"} size={24} color={Colors.primaryBlue} />
            </View>
            <View style={styles.itemContent}>
              <Text style={[styles.itemTitle, { color: Colors.primaryText }]}>{t('preferences.theme')}</Text>
              <Text style={[styles.itemSubtitle, { color: Colors.secondaryText }]}>
                {isDark ? t('preferences.themeDark') : t('preferences.themeLight')}
              </Text>
            </View>
            <Ionicons name={isDark ? "toggle" : "toggle-outline"} size={32} color={Colors.primaryBlue} />
          </TouchableOpacity>

          {/* Auto-translate Estimates - only show for non-English users */}
          {currentLanguage !== 'en' && (
            <TouchableOpacity
              style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
              onPress={handleToggleAutoTranslate}
              activeOpacity={0.7}
            >
              <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '20' }]}>
                <Ionicons name="document-text-outline" size={24} color={Colors.primaryBlue} />
              </View>
              <View style={styles.itemContent}>
                <Text style={[styles.itemTitle, { color: Colors.primaryText }]}>
                  {t('preferences.autoTranslateEstimates')}
                </Text>
                <Text style={[styles.itemSubtitle, { color: Colors.secondaryText }]}>
                  {t('preferences.autoTranslateEstimatesDesc')}
                </Text>
              </View>
              <Ionicons
                name={autoTranslateEstimates ? "checkbox" : "square-outline"}
                size={24}
                color={Colors.primaryBlue}
              />
            </TouchableOpacity>
          )}
        </View>

        {/* App Info Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>{t('sections.about').toUpperCase()}</Text>

          <View style={[styles.infoItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <View style={[styles.iconContainer, { backgroundColor: Colors.secondaryText + '20' }]}>
              <Ionicons name="information-circle-outline" size={24} color={Colors.secondaryText} />
            </View>
            <View style={styles.itemContent}>
              <Text style={[styles.itemTitle, { color: Colors.primaryText }]}>{t('about.version')}</Text>
              <Text style={[styles.itemSubtitle, { color: Colors.secondaryText }]}>1.0.0</Text>
            </View>
          </View>

          <View style={[styles.infoItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <View style={[styles.iconContainer, { backgroundColor: Colors.secondaryText + '20' }]}>
              <Ionicons name="construct-outline" size={24} color={Colors.secondaryText} />
            </View>
            <View style={styles.itemContent}>
              <Text style={[styles.itemTitle, { color: Colors.primaryText }]}>Construction Manager</Text>
              <Text style={[styles.itemSubtitle, { color: Colors.secondaryText }]}>
                AI-powered estimates
              </Text>
            </View>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: Colors.error + '10', borderColor: Colors.error + '30' }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={[styles.logoutText, { color: Colors.error }]}>{t('account.logout')}</Text>
        </TouchableOpacity>

        {/* Bottom Padding */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: FontSizes.header,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: FontSizes.body,
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSizes.tiny,
    fontWeight: '700',
    marginBottom: Spacing.md,
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  itemContent: {
    flex: 1,
  },
  itemTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemSubtitle: {
    fontSize: FontSizes.small,
  },
  emptyState: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSizes.body,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  logoutText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
