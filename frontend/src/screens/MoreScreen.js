import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { LightColors, getColors, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useSupervisorPermissions } from '../hooks/useSupervisorPermissions';
import { getCurrentUserId, getUserProfile, getSelectedLanguage, getAISettings, updateAISettings } from '../utils/storage';
import { chooseEmailApp } from '../utils/emailSupport';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Language display names
const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
};

export default function MoreScreen({ navigation }) {
  const { t } = useTranslation('settings');
  const { isDark = false, toggleTheme } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { isSupervisor, ownerId } = useAuth() || {};
  const [ownerBusinessLogo, setOwnerBusinessLogo] = useState(null);
  const [ownerBusinessName, setOwnerBusinessName] = useState(null);
  const supervisorPerms = useSupervisorPermissions();

  // Content state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Settings state
  const [userProfile, setUserProfile] = useState(null);

  // AI Personality state
  const [aboutYou, setAboutYou] = useState('');
  const [responseStyle, setResponseStyle] = useState('');
  const [projectInstructions, setProjectInstructions] = useState('');
  const [aiExpanded, setAiExpanded] = useState(false);
  const saveTimeoutRef = useRef(null);
  const [userServices, setUserServices] = useState([]);
  const [currentLanguage, setCurrentLanguage] = useState('en');

  // Load minimal data
  const loadData = async () => {
    try {
      setLoading(true);

      // Load user profile
      const profile = await getUserProfile();
      setUserProfile(profile);

      // For supervisors, load the owner's branding (logo + business name) so
      // the supervisor's settings header shows the company they work for —
      // not an empty placeholder. The supervisor's own profile won't have
      // business_logo since they don't run the business.
      if (isSupervisor && ownerId) {
        try {
          const { data: ownerProfile } = await supabase
            .from('profiles')
            .select('business_logo, business_name')
            .eq('id', ownerId)
            .single();
          if (ownerProfile?.business_logo) setOwnerBusinessLogo(ownerProfile.business_logo);
          if (ownerProfile?.business_name) setOwnerBusinessName(ownerProfile.business_name);
        } catch (_) { /* non-fatal — falls back to initials */ }
      }

      // Load user services
      try {
        const userId = await getCurrentUserId();
        if (userId) {
          const { data: services, error } = await supabase
            .from('user_services')
            .select(`
              *,
              service_categories(id, name, icon, description)
            `)
            .eq('user_id', userId)
            .eq('is_active', true);

          if (!error) {
            setUserServices(services || []);
          }
        }
      } catch (error) {
        console.error('Error loading user services:', error);
        setUserServices([]);
      }

      // Load current language
      const language = await getSelectedLanguage();
      setCurrentLanguage(language || 'en');

      // Load AI settings
      const aiSettings = await getAISettings();
      setAboutYou(aiSettings?.aboutYou || '');
      setResponseStyle(aiSettings?.responseStyle || '');
      setProjectInstructions(aiSettings?.projectInstructions || '');

      // Auto-expand if user has AI settings configured
      if (aiSettings?.aboutYou || aiSettings?.responseStyle || aiSettings?.projectInstructions) {
        setAiExpanded(true);
      }

      setHasLoadedOnce(true);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnce) {
        loadData();
      }
    }, [hasLoadedOnce])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  // Auto-save AI settings with debounce
  const handleAboutYouChange = (text) => {
    const trimmed = text.slice(0, 500);
    setAboutYou(trimmed);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      updateAISettings({ aboutYou: trimmed, responseStyle, projectInstructions });
    }, 1000);
  };

  const handleResponseStyleChange = (text) => {
    const trimmed = text.slice(0, 300);
    setResponseStyle(trimmed);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      updateAISettings({ aboutYou, responseStyle: trimmed, projectInstructions });
    }, 1000);
  };

  const handleProjectInstructionsChange = (text) => {
    const trimmed = text.slice(0, 2000);
    setProjectInstructions(trimmed);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      updateAISettings({ aboutYou, responseStyle, projectInstructions: trimmed });
    }, 1000);
  };

  const handleLogout = async () => {
    Alert.alert(
      t('confirmLogout.title'),
      t('confirmLogout.message'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('account.logout'),
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase.auth.signOut();
              if (error) throw error;
              const hasSeenOnboarding = await AsyncStorage.getItem('@hasSeenOnboarding');
              await AsyncStorage.clear();
              if (hasSeenOnboarding) await AsyncStorage.setItem('@hasSeenOnboarding', hasSeenOnboarding);
            } catch (error) {
              console.error('Logout failed:', error);
              Alert.alert(t('errors.logoutFailed'), t('errors.logoutFailedMessage'));
            }
          },
        },
      ]
    );
  };

  // Get initials for avatar
  const getInitials = () => {
    const name = userProfile?.business_name || userProfile?.full_name || 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </View>
    );
  }

  const MenuItem = ({ icon, iconColor, title, subtitle, onPress, rightElement, isLast }) => (
    <TouchableOpacity
      style={[
        styles.menuItem,
        !isLast && { borderBottomWidth: 1, borderBottomColor: Colors.border + '60' }
      ]}
      onPress={onPress}
      activeOpacity={0.6}
    >
      <View style={[styles.menuIcon, { backgroundColor: iconColor + '15' }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.menuContent}>
        <Text style={[styles.menuTitle, { color: Colors.primaryText }]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.menuSubtitle, { color: Colors.secondaryText }]}>{subtitle}</Text>
        )}
      </View>
      {rightElement || <Ionicons name="chevron-forward" size={18} color={Colors.secondaryText + '80'} />}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Profile Header */}
        <View style={styles.profileSection}>
          {(() => {
            // Prefer the user's own logo; for supervisors with no logo of their
            // own (the common case) fall back to the owner's company logo so
            // the settings page shows the right branding.
            const logoUrl = userProfile?.businessInfo?.logoUrl || ownerBusinessLogo || null;
            if (logoUrl) {
              return (
                <Image
                  source={{ uri: logoUrl }}
                  style={[styles.avatar, { backgroundColor: Colors.lightGray || '#F3F4F6' }]}
                  resizeMode="cover"
                />
              );
            }
            return (
              <View style={[styles.avatar, { backgroundColor: Colors.primaryBlue }]}>
                <Text style={styles.avatarText}>{getInitials()}</Text>
              </View>
            );
          })()}
          <View style={styles.profileInfo}>
            <Text style={[styles.profileName, { color: Colors.primaryText }]}>
              {userProfile?.businessInfo?.name || userProfile?.business_name || ownerBusinessName || userProfile?.full_name || t('business.info')}
            </Text>
            <Text style={[styles.profileEmail, { color: Colors.secondaryText }]}>
              {userProfile?.email || ''}
            </Text>
          </View>
          {!isSupervisor && (
            <TouchableOpacity
              style={[styles.editProfileBtn, { backgroundColor: Colors.primaryBlue + '12' }]}
              onPress={() => navigation.navigate('EditBusinessInfo')}
            >
              <Ionicons name="pencil" size={16} color={Colors.primaryBlue} />
            </TouchableOpacity>
          )}
        </View>

        {/* AI Personality Card */}
        <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
          <TouchableOpacity
            style={styles.aiHeader}
            onPress={() => setAiExpanded(!aiExpanded)}
            activeOpacity={0.7}
          >
            <View style={styles.aiHeaderLeft}>
              <View style={[styles.aiIconBg, { backgroundColor: Colors.accent + '15' }]}>
                <Ionicons name="sparkles" size={18} color={Colors.accent} />
              </View>
              <View>
                <Text style={[styles.aiTitle, { color: Colors.primaryText }]}>
                  {t('aiPersonality.title', 'AI Personality')}
                </Text>
                <Text style={[styles.aiSubtitle, { color: Colors.secondaryText }]}>
                  {t('aiPersonality.subtitle', 'Customize your assistant')}
                </Text>
              </View>
            </View>
            <Ionicons
              name={aiExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={Colors.secondaryText}
            />
          </TouchableOpacity>

          {aiExpanded && (
            <View style={styles.aiContent}>
              <View style={[styles.aiDivider, { backgroundColor: Colors.border }]} />

              <View style={styles.aiField}>
                <Text style={[styles.aiLabel, { color: Colors.secondaryText }]}>
                  {t('aiPersonality.aboutYou', 'About You')}
                </Text>
                <TextInput
                  style={[
                    styles.aiInput,
                    {
                      backgroundColor: Colors.background,
                      color: Colors.primaryText,
                      borderColor: Colors.border,
                    }
                  ]}
                  placeholder={t('aiPersonality.aboutYouPlaceholder', "I'm a plumber in Austin specializing in bathroom remodels...")}
                  placeholderTextColor={Colors.secondaryText + '70'}
                  value={aboutYou}
                  onChangeText={handleAboutYouChange}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                <Text style={[styles.aiCharCount, { color: Colors.secondaryText }]}>
                  {aboutYou.length}/500
                </Text>
              </View>

              <View style={styles.aiField}>
                <Text style={[styles.aiLabel, { color: Colors.secondaryText }]}>
                  {t('aiPersonality.responseStyle', 'Response Style')}
                </Text>
                <TextInput
                  style={[
                    styles.aiInput,
                    styles.aiInputSmall,
                    {
                      backgroundColor: Colors.background,
                      color: Colors.primaryText,
                      borderColor: Colors.border,
                    }
                  ]}
                  placeholder={t('aiPersonality.responseStylePlaceholder', 'Be brief. Use bullet points...')}
                  placeholderTextColor={Colors.secondaryText + '70'}
                  value={responseStyle}
                  onChangeText={handleResponseStyleChange}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
                <Text style={[styles.aiCharCount, { color: Colors.secondaryText }]}>
                  {responseStyle.length}/300
                </Text>
              </View>

              <View style={styles.aiField}>
                <Text style={[styles.aiLabel, { color: Colors.secondaryText }]}>
                  {t('aiPersonality.projectInstructions', 'Project Instructions')}
                </Text>
                <TextInput
                  style={[
                    styles.aiInput,
                    {
                      backgroundColor: Colors.background,
                      color: Colors.primaryText,
                      borderColor: Colors.border,
                      minHeight: 100,
                    }
                  ]}
                  placeholder={t('aiPersonality.projectInstructionsPlaceholder', 'Default checklists, scope of work templates...')}
                  placeholderTextColor={Colors.secondaryText + '70'}
                  value={projectInstructions}
                  onChangeText={handleProjectInstructionsChange}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />
                <Text style={[styles.aiCharCount, { color: Colors.secondaryText }]}>
                  {projectInstructions.length}/2000
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ────────────────── MY BUSINESS ────────────────── */}
        {/* Hidden entirely for supervisors — they don't own services or
            client relationships. Owners see services + clients grouped
            together (the "what you sell / who you sell to" pair). */}
        {!isSupervisor && (
          <>
            <Text style={[styles.sectionLabel, { color: Colors.secondaryText }]}>
              {t('sections.business', 'MY BUSINESS')}
            </Text>
            <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
              <MenuItem
                icon="people-outline"
                iconColor={Colors.primaryBlue}
                title={t('items.manageClients', 'Clients')}
                subtitle={t('items.manageClientsSubtitle', 'View and manage your clients')}
                onPress={() => navigation.navigate('Clients')}
              />
              {userServices && userServices.length > 0
                ? userServices.map((userService) => {
                    const service = userService.service_categories;
                    if (!service) return null;
                    return (
                      <MenuItem
                        key={userService.id}
                        icon={service.icon || 'briefcase-outline'}
                        iconColor={Colors.success}
                        title={service.name}
                        onPress={() => navigation.navigate('EditService', { serviceId: userService.id })}
                      />
                    );
                  })
                : null}
              <MenuItem
                icon="add-circle-outline"
                iconColor={Colors.primaryBlue}
                title={
                  userServices && userServices.length > 0
                    ? t('items.addNewService', 'Add another service')
                    : t('items.addFirstService', 'Add a service')
                }
                onPress={() => navigation.navigate('AddService')}
                isLast
              />
            </View>
          </>
        )}

        {/* ────────────────── DOCUMENTS ────────────────── */}
        {/* Supervisors see photos + contracts (what they need on site).
            Owners also see estimates + invoices + the invoice template. */}
        <Text style={[styles.sectionLabel, { color: Colors.secondaryText }]}>
          {t('sections.documents', 'DOCUMENTS')}
        </Text>
        <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
          <MenuItem
            icon="images-outline"
            iconColor={Colors.primaryBlue}
            title={t('items.pictures', 'Photos')}
            onPress={() => navigation.navigate('Pictures')}
          />
          {(() => {
            const showEstimates = !isSupervisor || supervisorPerms.canCreateEstimates;
            const showInvoices = !isSupervisor || supervisorPerms.canCreateInvoices;
            // Supervisors can edit the owner's invoice template too — it's
            // shared across the business, and supervisors are allowed to
            // pick the visual style + tweak business info shown on PDFs.
            const showInvoiceTemplate = true;
            const lastDocsItem = showInvoiceTemplate ? 'template' : showInvoices ? 'invoices' : showEstimates ? 'estimates' : 'contracts';
            return (
              <>
                <MenuItem
                  icon="document-text-outline"
                  iconColor={Colors.infoBlue}
                  title={t('items.contracts', 'Contracts')}
                  onPress={() => navigation.navigate('Contracts')}
                  isLast={lastDocsItem === 'contracts'}
                />
                {showEstimates && (
                  <MenuItem
                    icon="calculator-outline"
                    iconColor={Colors.success}
                    title={t('items.estimates', 'Estimates')}
                    onPress={() => navigation.navigate('EstimatesDetail')}
                    isLast={lastDocsItem === 'estimates'}
                  />
                )}
                {showInvoices && (
                  <MenuItem
                    icon="receipt-outline"
                    iconColor={Colors.warning}
                    title={t('items.invoices', 'Invoices')}
                    onPress={() => navigation.navigate('InvoicesDetail')}
                    isLast={lastDocsItem === 'invoices'}
                  />
                )}
                {showInvoiceTemplate && (
                  <MenuItem
                    icon="color-palette-outline"
                    iconColor={Colors.accent || '#8B5CF6'}
                    title={t('items.invoiceTemplate', 'Invoice & Estimate Template')}
                    subtitle={t('items.invoiceTemplateSubtitle', 'Style, logo, and business info — applied to both')}
                    onPress={() => navigation.navigate('InvoiceTemplate')}
                    isLast
                  />
                )}
              </>
            );
          })()}
        </View>

        {/* ────────────────── MONEY ────────────────── */}
        {/* Owners only. Subscription + Stripe Connect + bank live together
            because they're all "money infrastructure". */}
        {!isSupervisor && (
          <>
            <Text style={[styles.sectionLabel, { color: Colors.secondaryText }]}>
              {t('sections.money', 'MONEY')}
            </Text>
            <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
              <MenuItem
                icon="diamond-outline"
                iconColor={Colors.accent || '#8B5CF6'}
                title={t('subscription.title', 'Subscription Plan')}
                subtitle={t('subscription.managePlan', 'Manage your plan')}
                onPress={() => navigation.navigate('SubscriptionSettings')}
                isLast
              />
            </View>
          </>
        )}

        {/* ────────────────── APP ────────────────── */}
        {/* App-level preferences, matching iOS Settings + Jobber's
            separation between app behavior and business data. */}
        <Text style={[styles.sectionLabel, { color: Colors.secondaryText }]}>
          {t('sections.app', 'APP')}
        </Text>
        <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
          <MenuItem
            icon="notifications-outline"
            iconColor={Colors.error}
            title={t('notifications.title', 'Notifications')}
            onPress={() => navigation.navigate('NotificationSettings')}
          />
          <MenuItem
            icon="language-outline"
            iconColor={Colors.primaryBlue}
            title={t('account.language', 'Language')}
            subtitle={LANGUAGE_NAMES[currentLanguage] || 'English'}
            onPress={() => navigation.navigate('ChangeLanguage')}
          />
          <MenuItem
            icon={isDark ? 'moon' : 'sunny-outline'}
            iconColor={Colors.warning}
            title={t('preferences.theme', 'Appearance')}
            subtitle={isDark ? t('preferences.dark', 'Dark') : t('preferences.light', 'Light')}
            onPress={toggleTheme}
            rightElement={
              <View style={[
                styles.themeToggle,
                { backgroundColor: isDark ? Colors.primaryBlue : Colors.border }
              ]}>
                <View style={[
                  styles.themeToggleKnob,
                  {
                    backgroundColor: Colors.cardBackground,
                    transform: [{ translateX: isDark ? 14 : 0 }]
                  }
                ]} />
              </View>
            }
            isLast
          />
        </View>

        {/* ────────────────── HELP ────────────────── */}
        <Text style={[styles.sectionLabel, { color: Colors.secondaryText }]}>
          {t('sections.help', 'HELP')}
        </Text>
        <View style={[styles.card, { backgroundColor: Colors.cardBackground }]}>
          <MenuItem
            icon="help-circle-outline"
            iconColor={Colors.primaryBlue}
            title={t('help', 'Help & Support')}
            subtitle={t('support.helpSubtitle', 'Email the team')}
            onPress={() => chooseEmailApp('support@sylkapp.ai')}
          />
          <MenuItem
            icon="document-text-outline"
            iconColor={Colors.infoBlue}
            title={t('terms', 'Terms of Service')}
            onPress={() => Linking.openURL('https://sylkapp.ai/terms').catch(() => {})}
          />
          <MenuItem
            icon="shield-checkmark-outline"
            iconColor={Colors.success}
            title={t('privacy', 'Privacy Policy')}
            onPress={() => Linking.openURL('https://sylkapp.ai/privacy').catch(() => {})}
            isLast
          />
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutBtn, { backgroundColor: Colors.error + '10' }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={[styles.logoutText, { color: Colors.error }]}>
            {t('account.logout', 'Log Out')}
          </Text>
        </TouchableOpacity>

        {/* Version footer — iOS-style minimal, bottom of the list. */}
        <Text style={[styles.versionFooter, { color: Colors.secondaryText }]}>
          {t('appName', 'Foreman')} · {t('about.version', 'Version')} 1.0.0
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // Profile Section
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 4,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 14,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 14,
  },
  editProfileBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Cards
  card: {
    borderRadius: 14,
    marginBottom: 12,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 1,
      },
    }),
  },

  // Section Labels
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 8,
    marginLeft: 4,
  },

  // Menu Items
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuContent: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  menuSubtitle: {
    fontSize: 13,
    marginTop: 1,
  },

  // AI Personality
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  aiHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  aiTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  aiSubtitle: {
    fontSize: 13,
    marginTop: 1,
  },
  aiContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  aiDivider: {
    height: 1,
    marginBottom: 14,
  },
  aiField: {
    marginBottom: 12,
  },
  aiLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  aiInput: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 80,
    lineHeight: 20,
  },
  aiInputSmall: {
    minHeight: 56,
  },
  aiCharCount: {
    fontSize: 11,
    textAlign: 'right',
    marginTop: 4,
  },

  // Services
  emptyServices: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
  },
  // Theme Toggle
  themeToggle: {
    width: 36,
    height: 22,
    borderRadius: 11,
    padding: 2,
  },
  themeToggleKnob: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },

  // Version footer — tiny caption below Logout. iOS-style minimal.
  versionFooter: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 18,
    marginBottom: 4,
    letterSpacing: 0.2,
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
    gap: 8,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
