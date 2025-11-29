import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LightColors, getColors, Spacing } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getCurrentUserId, getUserProfile, getSelectedLanguage } from '../utils/storage';
import { supabase } from '../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Language display names
const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  it: 'Italiano',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  ar: 'العربية',
};

export default function MoreScreen({ navigation }) {
  const { isDark = false, toggleTheme } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  // Content state - only counts, not actual data
  const [photoCount, setPhotoCount] = useState(0);
  const [estimateCount, setEstimateCount] = useState(0);
  const [invoiceCount, setInvoiceCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false); // Track if data was loaded

  // Settings state
  const [userProfile, setUserProfile] = useState(null);
  const [userServices, setUserServices] = useState([]);
  const [currentLanguage, setCurrentLanguage] = useState('en');

  // Load minimal data - just UI essentials
  const loadData = async () => {
    try {
      setLoading(true);

      // Load counts only (fast queries)
      try {
        const userId = await getCurrentUserId();
        if (userId) {
          // Get photo count from daily reports
          const { count: photoCountResult } = await supabase
            .from('daily_reports')
            .select('id', { count: 'exact', head: true })
            .not('photos', 'is', null);
          setPhotoCount(photoCountResult || 0);

          // Get estimate count
          const { count: estimateCountResult } = await supabase
            .from('estimates')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);
          setEstimateCount(estimateCountResult || 0);

          // Get invoice count
          const { count: invoiceCountResult } = await supabase
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);
          setInvoiceCount(invoiceCountResult || 0);
        }
      } catch (error) {
        console.log('Error loading counts:', error);
      }

      // Load user profile (needed for business info display)
      const profile = await getUserProfile();
      setUserProfile(profile);

      // Load user services (needed for services section)
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

          if (error) {
            console.error('Error loading user services:', error);
            setUserServices([]);
          } else {
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

      // Mark as loaded
      setHasLoadedOnce(true);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      // Only load data if we haven't loaded it before
      // This makes navigating back instant
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

  const handleEditBusinessInfo = () => {
    navigation.navigate('EditBusinessInfo');
  };

  const handleEditPricing = (tradeId) => {
    navigation.navigate('EditPricing', { tradeId });
  };

  const handleEditProfitMargin = () => {
    navigation.navigate('EditProfitMargin');
  };

  const handleAddService = () => {
    navigation.navigate('AddService');
  };

  const handleChangeLanguage = () => {
    navigation.navigate('ChangeLanguage');
  };

  const handleTwilioSetup = () => {
    navigation.navigate('TwilioSetup');
  };

  const handleLogout = async () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout? This will reset the app and you\'ll need to sign in again.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              // Sign out from Supabase
              const { error } = await supabase.auth.signOut();
              if (error) throw error;

              // Clear all AsyncStorage data for complete reset
              await AsyncStorage.clear();

              // App.js will handle navigation to login screen via auth state listener
            } catch (error) {
              console.error('Logout failed:', error);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          },
        },
      ]
    );
  };


  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.white }]}>
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>More</Text>
        </View>

        {/* DOCUMENTS & MEDIA Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionCategory, { color: Colors.secondaryText }]}>DOCUMENTS & MEDIA</Text>

          <TouchableOpacity
            style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={() => navigation.navigate('Pictures')}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name="images-outline" size={22} color={Colors.primaryBlue} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Pictures</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={() => navigation.navigate('Contracts')}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name="document-text-outline" size={22} color={Colors.primaryBlue} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Contracts</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* FINANCIALS Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionCategory, { color: Colors.secondaryText }]}>FINANCIALS</Text>

          <TouchableOpacity
            style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={() => navigation.navigate('EstimatesDetail')}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: '#10B981' + '20' }]}>
              <Ionicons name="calculator-outline" size={22} color="#10B981" />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Estimates</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={() => navigation.navigate('InvoicesDetail')}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: '#F59E0B' + '20' }]}>
              <Ionicons name="receipt-outline" size={22} color="#F59E0B" />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Invoices</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Business Section */}
        {userProfile && (
          <View style={styles.section}>
            <Text style={[styles.sectionCategory, { color: Colors.secondaryText }]}>BUSINESS</Text>

            <TouchableOpacity
              style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
              onPress={handleEditBusinessInfo}
              activeOpacity={0.7}
            >
              <View style={[styles.settingIcon, { backgroundColor: Colors.primaryBlue + '20' }]}>
                <Ionicons name="business-outline" size={22} color={Colors.primaryBlue} />
              </View>
              <View style={styles.settingContent}>
                <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Business Information</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
              onPress={handleEditProfitMargin}
              activeOpacity={0.7}
            >
              <View style={[styles.settingIcon, { backgroundColor: '#10B981' + '20' }]}>
                <Ionicons name="trending-up-outline" size={22} color="#10B981" />
              </View>
              <View style={styles.settingContent}>
                <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Profit Margin</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
              onPress={() => navigation.navigate('EditInvoiceSetup')}
              activeOpacity={0.7}
            >
              <View style={[styles.settingIcon, { backgroundColor: '#F59E0B' + '20' }]}>
                <Ionicons name="receipt-outline" size={22} color="#F59E0B" />
              </View>
              <View style={styles.settingContent}>
                <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Invoice Setup</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
            </TouchableOpacity>
          </View>
        )}

        {/* Client Messaging Section */}
        {userProfile && (
          <View style={styles.section}>
            <Text style={[styles.sectionCategory, { color: Colors.secondaryText }]}>CLIENT MESSAGING</Text>

            <TouchableOpacity
              style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
              onPress={handleTwilioSetup}
              activeOpacity={0.7}
            >
              <View style={[styles.settingIcon, { backgroundColor: '#10B981' + '20' }]}>
                <Ionicons name="chatbubbles-outline" size={22} color="#10B981" />
              </View>
              <View style={styles.settingContent}>
                <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>SMS/WhatsApp Setup</Text>
              </View>
              <Ionicons
                name={userProfile.businessPhoneNumber ? "checkmark-circle" : "chevron-forward"}
                size={20}
                color={userProfile.businessPhoneNumber ? '#10B981' : Colors.secondaryText}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* Services & Pricing Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionCategory, { color: Colors.secondaryText }]}>SERVICES & PRICING</Text>

          {userServices && userServices.length > 0 ? (
            <>
              {userServices.map((userService) => {
                const service = userService.service_categories;
                if (!service) return null;

                return (
                  <TouchableOpacity
                    key={userService.id}
                    style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                    onPress={() => navigation.navigate('EditService', { serviceId: userService.id })}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.settingIcon, { backgroundColor: '#10B981' + '20' }]}>
                      <Ionicons name={service.icon || 'briefcase-outline'} size={22} color="#10B981" />
                    </View>
                    <View style={styles.settingContent}>
                      <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>{service.name}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                  </TouchableOpacity>
                );
              })}

              {/* Add New Service Button */}
              <TouchableOpacity
                style={[styles.addServiceButton, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue }]}
                onPress={handleAddService}
                activeOpacity={0.7}
              >
                <View style={[styles.addServiceIcon, { backgroundColor: Colors.primaryBlue }]}>
                  <Ionicons name="add" size={22} color="#fff" />
                </View>
                <Text style={[styles.addServiceText, { color: Colors.primaryBlue }]}>
                  Add New Service
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[styles.emptyCard, { backgroundColor: Colors.lightGray }]}>
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                  No services configured
                </Text>
              </View>

              {/* Add New Service Button */}
              <TouchableOpacity
                style={[styles.addServiceButton, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue }]}
                onPress={handleAddService}
                activeOpacity={0.7}
              >
                <View style={[styles.addServiceIcon, { backgroundColor: Colors.primaryBlue }]}>
                  <Ionicons name="add" size={22} color="#fff" />
                </View>
                <Text style={[styles.addServiceText, { color: Colors.primaryBlue }]}>
                  Add New Service
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* App Settings Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionCategory, { color: Colors.secondaryText }]}>APP SETTINGS</Text>

          <TouchableOpacity
            style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={() => navigation.navigate('NotificationSettings')}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: '#EF4444' + '20' }]}>
              <Ionicons name="notifications-outline" size={22} color="#EF4444" />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Notifications</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={handleChangeLanguage}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name="language-outline" size={22} color={Colors.primaryBlue} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Language</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={toggleTheme}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name={isDark ? "moon" : "sunny-outline"} size={22} color={Colors.primaryBlue} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Appearance</Text>
            </View>
            <Ionicons name={isDark ? "toggle" : "toggle-outline"} size={32} color={Colors.primaryBlue} />
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionCategory, { color: Colors.secondaryText }]}>ABOUT</Text>

          <View style={[styles.infoCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <View style={[styles.settingIcon, { backgroundColor: Colors.secondaryText + '20' }]}>
              <Ionicons name="information-circle-outline" size={22} color={Colors.secondaryText} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>App Version</Text>
            </View>
          </View>

          <View style={[styles.infoCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <View style={[styles.settingIcon, { backgroundColor: Colors.secondaryText + '20' }]}>
              <Ionicons name="construct-outline" size={22} color={Colors.secondaryText} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Construction Manager</Text>
            </View>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: '#EF4444' }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out" size={20} color="#FFFFFF" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <View style={{ height: 100 }} />
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: LightColors.lightGray,
  },
  activeFilterTab: {
    backgroundColor: LightColors.primaryBlue,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  listItemContent: {
    flex: 1,
    marginRight: 8,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 3,
  },
  listItemSubtitle: {
    fontSize: 13,
  },
  listItemRight: {
    alignItems: 'flex-end',
  },
  listItemAmount: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 14,
    paddingVertical: 16,
    fontStyle: 'italic',
  },
  inputLabel: {
    fontSize: 13,
    marginBottom: 6,
    marginTop: 8,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  saveButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: LightColors.border,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  languageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  languageText: {
    fontSize: 13,
    fontWeight: '500',
  },
  aboutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: LightColors.border,
  },
  aboutText: {
    fontSize: 15,
  },
  aboutValue: {
    fontSize: 15,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 8,
  },
  logoutText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  // Settings-specific styles
  sectionCategory: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  settingIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 13,
  },
  addServiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    marginTop: 10,
  },
  addServiceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  addServiceText: {
    fontSize: 15,
    fontWeight: '600',
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  emptyCard: {
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  helpCard: {
    flexDirection: 'row',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 8,
    gap: 12,
  },
  helpTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  helpText: {
    fontSize: 13,
    lineHeight: 19,
  },
});
