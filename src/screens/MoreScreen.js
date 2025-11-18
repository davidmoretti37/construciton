import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Switch,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LightColors, getColors, Spacing, FontSizes, BorderRadius } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { fetchEstimates, fetchInvoices, getCurrentUserId, getUserProfile, getSelectedLanguage } from '../utils/storage';
import { supabase } from '../lib/supabase';
import PhotoGallery from '../components/ChatVisuals/PhotoGallery';
import { getTradeById, formatPriceUnit } from '../constants/trades';
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

  // Content state
  const [photos, setPhotos] = useState([]);
  const [estimates, setEstimates] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Settings state
  const [userProfile, setUserProfile] = useState(null);
  const [currentLanguage, setCurrentLanguage] = useState('en');

  // Filter states
  const [estimateFilter, setEstimateFilter] = useState('All');
  const [invoiceFilter, setInvoiceFilter] = useState('All');

  // Load all data
  const loadData = async () => {
    try {
      setLoading(true);

      // Load photos from daily reports
      try {
        // Fetch all daily reports across all projects
        const { data: reports, error } = await supabase
          .from('daily_reports')
          .select('*, projects(name)')
          .order('report_date', { ascending: false })
          .limit(50); // Get recent 50 reports

        if (error) throw error;

        const allPhotos = [];
        reports?.forEach(report => {
          if (report.photos && report.photos.length > 0) {
            report.photos.forEach(photo => {
              allPhotos.push({
                uri: photo,
                project: report.projects?.name || 'Unknown Project',
                uploadedBy: report.worker_name || 'Unknown',
                timestamp: report.report_date,
              });
            });
          }
        });
        setPhotos(allPhotos.slice(0, 15)); // Recent 15 photos
      } catch (error) {
        console.log('Error loading photos:', error);
        setPhotos([]);
      }

      // Load estimates
      try {
        const allEstimates = await fetchEstimates();
        setEstimates(allEstimates?.slice(0, 10) || []); // Recent 10
      } catch (error) {
        console.log('Error loading estimates:', error);
        setEstimates([]);
      }

      // Load invoices
      try {
        const allInvoices = await fetchInvoices();
        setInvoices(allInvoices?.slice(0, 10) || []); // Recent 10
      } catch (error) {
        console.log('Error loading invoices:', error);
        setInvoices([]);
      }

      // Load user profile
      const profile = await getUserProfile();
      setUserProfile(profile);

      // Load current language
      const language = await getSelectedLanguage();
      setCurrentLanguage(language || 'en');
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const handleEditBusinessInfo = () => {
    navigation.navigate('EditBusinessInfo');
  };

  const handleEditPhases = () => {
    navigation.navigate('EditPhases');
  };

  const handleEditPricing = (tradeId) => {
    navigation.navigate('EditPricing', { tradeId });
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

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'accepted':
      case 'paid':
        return '#10B981';
      case 'sent':
      case 'partial':
        return '#F59E0B';
      case 'draft':
      case 'unpaid':
        return '#6B7280';
      case 'rejected':
      case 'overdue':
        return '#EF4444';
      default:
        return Colors.primaryBlue;
    }
  };

  const filteredEstimates = estimates.filter(est => {
    if (estimateFilter === 'All') return true;
    return est.status?.toLowerCase() === estimateFilter.toLowerCase();
  });

  const filteredInvoices = invoices.filter(inv => {
    if (invoiceFilter === 'All') return true;
    return inv.status?.toLowerCase() === invoiceFilter.toLowerCase();
  });

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: Colors.background }]}>
        <ActivityIndicator size="large" color={Colors.primaryBlue} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
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
              <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>
                {photos.length} photos uploaded
              </Text>
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
              <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>
                View saved contracts & templates
              </Text>
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
              <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>
                {estimates.length} total • View all
              </Text>
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
              <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>
                {invoices.length} total • View all
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={() => navigation.navigate('InvoiceTemplate')}
            activeOpacity={0.7}
          >
            <View style={[styles.settingIcon, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name="color-palette-outline" size={22} color={Colors.primaryBlue} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Invoice Template</Text>
              <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>
                Customize invoice design
              </Text>
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
                <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>
                  {userProfile.businessInfo?.name || 'Not set'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
              onPress={handleEditPhases}
              activeOpacity={0.7}
            >
              <View style={[styles.settingIcon, { backgroundColor: '#8B5CF6' + '20' }]}>
                <Ionicons name="layers-outline" size={22} color="#8B5CF6" />
              </View>
              <View style={styles.settingContent}>
                <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Project Phases</Text>
                <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>
                  {userProfile.phasesTemplate?.phases?.length
                    ? `${userProfile.phasesTemplate.phases.length} phases configured`
                    : 'Set up your workflow template'}
                </Text>
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
                <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>
                  {userProfile.businessPhoneNumber
                    ? `Configured: ${userProfile.businessPhoneNumber}`
                    : 'Not configured - Tap to set up'
                  }
                </Text>
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
        {userProfile && (
          <View style={styles.section}>
            <Text style={[styles.sectionCategory, { color: Colors.secondaryText }]}>SERVICES & PRICING</Text>

            {userProfile.trades && userProfile.trades.length > 0 ? (
              userProfile.trades.map((tradeId) => {
                const trade = getTradeById(tradeId);
                if (!trade) return null;

                return (
                  <TouchableOpacity
                    key={tradeId}
                    style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
                    onPress={() => handleEditPricing(tradeId)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.settingIcon, { backgroundColor: '#10B981' + '20' }]}>
                      <Ionicons name={trade.icon} size={22} color="#10B981" />
                    </View>
                    <View style={styles.settingContent}>
                      <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>{trade.name}</Text>
                      <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>
                        {trade.pricingTemplate.length} pricing items
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={[styles.emptyCard, { backgroundColor: Colors.lightGray }]}>
                <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                  No services configured
                </Text>
              </View>
            )}
          </View>
        )}

        {/* App Settings Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionCategory, { color: Colors.secondaryText }]}>APP SETTINGS</Text>

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
              <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>
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
            <View style={[styles.settingIcon, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name={isDark ? "moon" : "sunny-outline"} size={22} color={Colors.primaryBlue} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Appearance</Text>
              <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>
                {isDark ? 'Dark Mode' : 'Light Mode'}
              </Text>
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
              <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>1.0.0</Text>
            </View>
          </View>

          <View style={[styles.infoCard, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <View style={[styles.settingIcon, { backgroundColor: Colors.secondaryText + '20' }]}>
              <Ionicons name="construct-outline" size={22} color={Colors.secondaryText} />
            </View>
            <View style={styles.settingContent}>
              <Text style={[styles.settingTitle, { color: Colors.primaryText }]}>Construction Manager</Text>
              <Text style={[styles.settingSubtitle, { color: Colors.secondaryText }]}>
                AI-powered estimates
              </Text>
            </View>
          </View>
        </View>

        {/* Help Section */}
        <View style={[styles.helpCard, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
          <Ionicons name="help-circle-outline" size={22} color={Colors.primaryBlue} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.helpTitle, { color: Colors.primaryBlue }]}>Need Help?</Text>
            <Text style={[styles.helpText, { color: Colors.primaryBlue }]}>
              Chat with the AI assistant to learn how to use features, create estimates, and manage your business.
            </Text>
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
