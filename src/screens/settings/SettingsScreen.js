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
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getUserProfile } from '../../utils/storage';
import { getTradeById } from '../../constants/trades';
import { supabase } from '../../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [userProfile, setUserProfile] = useState(null);

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
  };

  const handleEditBusinessInfo = () => {
    navigation.navigate('EditBusinessInfo');
  };

  const handleEditPricing = (tradeId) => {
    navigation.navigate('EditPricing', { tradeId });
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

              console.log('Logged out successfully - app reset complete');
              // App.js will handle navigation to login screen via auth state listener
            } catch (error) {
              console.error('Error logging out:', error);
              Alert.alert('Error', 'Failed to logout. Please try again.');
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
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Settings</Text>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Business Info Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>BUSINESS</Text>

          <TouchableOpacity
            style={[styles.settingItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}
            onPress={handleEditBusinessInfo}
            activeOpacity={0.7}
          >
            <View style={[styles.iconContainer, { backgroundColor: Colors.primaryBlue + '20' }]}>
              <Ionicons name="business-outline" size={24} color={Colors.primaryBlue} />
            </View>
            <View style={styles.itemContent}>
              <Text style={[styles.itemTitle, { color: Colors.primaryText }]}>Business Information</Text>
              <Text style={[styles.itemSubtitle, { color: Colors.secondaryText }]}>
                {userProfile.businessInfo?.name || 'Not set'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {/* Services & Pricing Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>SERVICES & PRICING</Text>

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
                  <View style={[styles.iconContainer, { backgroundColor: Colors.success + '20' }]}>
                    <Ionicons name={trade.icon} size={24} color={Colors.success} />
                  </View>
                  <View style={styles.itemContent}>
                    <Text style={[styles.itemTitle, { color: Colors.primaryText }]}>{trade.name}</Text>
                    <Text style={[styles.itemSubtitle, { color: Colors.secondaryText }]}>
                      {trade.pricingTemplate.length} pricing items
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={[styles.emptyState, { backgroundColor: Colors.lightGray }]}>
              <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                No services configured
              </Text>
            </View>
          )}
        </View>

        {/* App Info Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: Colors.secondaryText }]}>ABOUT</Text>

          <View style={[styles.infoItem, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
            <View style={[styles.iconContainer, { backgroundColor: Colors.secondaryText + '20' }]}>
              <Ionicons name="information-circle-outline" size={24} color={Colors.secondaryText} />
            </View>
            <View style={styles.itemContent}>
              <Text style={[styles.itemTitle, { color: Colors.primaryText }]}>App Version</Text>
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

        {/* Help Section */}
        <View style={[styles.helpBox, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
          <Ionicons name="help-circle-outline" size={24} color={Colors.primaryBlue} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.helpTitle, { color: Colors.primaryBlue }]}>Need Help?</Text>
            <Text style={[styles.helpText, { color: Colors.primaryBlue }]}>
              Chat with the AI assistant to learn how to use features, create estimates, and manage your business.
            </Text>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: Colors.error + '10', borderColor: Colors.error + '30' }]}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={[styles.logoutText, { color: Colors.error }]}>Logout</Text>
        </TouchableOpacity>

        {/* Bottom Padding */}
        <View style={{ height: 100 }} />
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
  helpBox: {
    flexDirection: 'row',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xxl,
    gap: Spacing.md,
  },
  helpTitle: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  helpText: {
    fontSize: FontSizes.small,
    lineHeight: 20,
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
