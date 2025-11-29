/**
 * Add Service Screen (Settings)
 * Search and select services to add, with AI-powered service creation
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getUserServices, getServiceCategories } from '../../utils/storage';
import { discoverServices, getServiceDetails } from '../../services/serviceDiscoveryService';
import { supabase } from '../../lib/supabase';

export default function AddServiceScreen({ navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [loading, setLoading] = useState(true);
  const [userServiceCategoryIds, setUserServiceCategoryIds] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [filteredCategories, setFilteredCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingService, setIsCreatingService] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  // Filter categories based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      // Filter out already owned services
      const available = allCategories.filter(cat => !userServiceCategoryIds.includes(cat.id));
      setFilteredCategories(available);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = allCategories.filter(category => {
        const notOwned = !userServiceCategoryIds.includes(category.id);
        const matchesSearch = category.name.toLowerCase().includes(query) ||
          (category.description && category.description.toLowerCase().includes(query));
        return notOwned && matchesSearch;
      });
      setFilteredCategories(filtered);
    }
  }, [searchQuery, allCategories, userServiceCategoryIds]);

  const loadData = async () => {
    try {
      // Get user's existing services
      const userServices = await getUserServices();
      const categoryIds = userServices.map(s => s.category_id);
      setUserServiceCategoryIds(categoryIds);

      // Get all available categories
      const categories = await getServiceCategories();
      setAllCategories(categories);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectService = (category) => {
    // Navigate to phases screen first (then pricing)
    navigation.navigate('AddServicePhases', {
      categoryId: category.id,
      categoryName: category.name,
      categoryIcon: category.icon
    });
  };

  const handleCreateNewService = async (serviceName) => {
    setIsCreatingService(true);

    try {
      // Use the discovery service to create AI-generated service
      const results = await discoverServices(serviceName);

      if (results && results.length > 0) {
        const newService = results[0];

        // Fetch full details
        const details = await getServiceDetails(newService.id);

        // Reload categories to include the new one
        const categories = await getServiceCategories();
        setAllCategories(categories);

        // Clear search
        setSearchQuery('');

        // Navigate to phases screen with the new service
        navigation.navigate('AddServicePhases', {
          categoryId: newService.id,
          categoryName: newService.name,
          categoryIcon: newService.icon
        });
      } else {
        Alert.alert('Error', 'Failed to create service. Please try again.');
      }
    } catch (error) {
      console.error('Error creating service:', error);
      Alert.alert('Error', 'Failed to create service. Please try again.');
    } finally {
      setIsCreatingService(false);
    }
  };

  const handleOpenCreateService = () => {
    // Focus on search input
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
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
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Add Service</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Creating Service Animation */}
      {isCreatingService && (
        <View style={styles.creatingContainer}>
          <View style={[styles.creatingCard, { backgroundColor: Colors.white }]}>
            <View style={[styles.creatingIconContainer, { backgroundColor: Colors.primaryBlue + '15' }]}>
              <Ionicons name="sparkles" size={48} color={Colors.primaryBlue} />
            </View>

            <ActivityIndicator size="large" color={Colors.primaryBlue} style={{ marginVertical: Spacing.lg }} />

            <Text style={[styles.creatingTitle, { color: Colors.primaryText }]}>
              Creating Service...
            </Text>
            <Text style={[styles.creatingSubtitle, { color: Colors.secondaryText }]}>
              AI is generating items and phases
            </Text>

            <View style={styles.creatingDots}>
              <View style={[styles.creatingDot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.creatingDot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.creatingDot, { backgroundColor: Colors.primaryBlue }]} />
            </View>
          </View>
        </View>
      )}

      {/* Main Content - Hidden when creating */}
      {!isCreatingService && (
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            {/* Search Box */}
            <View style={[styles.searchBox, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
              <Ionicons name="search-outline" size={20} color={Colors.secondaryText} />
              <TextInput
                ref={searchInputRef}
                style={[styles.searchInput, { color: Colors.primaryText }]}
                placeholder="Search services..."
                placeholderTextColor={Colors.secondaryText}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
                autoCapitalize="words"
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={20} color={Colors.secondaryText} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Create New Service Button - Shows when not searching */}
            {!searchQuery && (
              <TouchableOpacity
                style={[styles.createServiceCard, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue }]}
                onPress={handleOpenCreateService}
                activeOpacity={0.7}
              >
                <View style={styles.createServiceContent}>
                  <View style={[styles.createIcon, { backgroundColor: Colors.primaryBlue }]}>
                    <Ionicons name="add" size={24} color="#fff" />
                  </View>

                  <View style={styles.createServiceInfo}>
                    <Text style={[styles.createServiceName, { color: Colors.primaryBlue }]}>
                      Add custom service
                    </Text>
                    <Text style={[styles.createHint, { color: Colors.secondaryText }]}>
                      Search to create a new service with AI
                    </Text>
                  </View>

                  <Ionicons name="sparkles" size={24} color={Colors.primaryBlue} />
                </View>
              </TouchableOpacity>
            )}

            {/* Create from Search Query - Shows when typing */}
            {searchQuery.trim().length > 0 && (
              <TouchableOpacity
                style={[styles.createServiceCard, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue }]}
                onPress={() => handleCreateNewService(searchQuery.trim())}
                activeOpacity={0.7}
              >
                <View style={styles.createServiceContent}>
                  <View style={[styles.createIcon, { backgroundColor: Colors.primaryBlue }]}>
                    <Ionicons name="add" size={24} color="#fff" />
                  </View>

                  <View style={styles.createServiceInfo}>
                    <Text style={[styles.createServiceName, { color: Colors.primaryBlue }]}>
                      Create "{searchQuery.trim()}"
                    </Text>
                    <Text style={[styles.createHint, { color: Colors.secondaryText }]}>
                      AI will generate a template for this service
                    </Text>
                  </View>

                  <Ionicons name="sparkles" size={24} color={Colors.primaryBlue} />
                </View>
              </TouchableOpacity>
            )}

            {filteredCategories.length === 0 ? (
              <View style={[styles.emptyContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                {searchQuery ? (
                  <>
                    <Ionicons name="search-outline" size={48} color={Colors.secondaryText} />
                    <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>No Results</Text>
                    <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                      No existing services found matching "{searchQuery}".{'\n'}Use the button above to create it with AI.
                    </Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
                    <Text style={[styles.emptyTitle, { color: Colors.primaryText }]}>All Services Added</Text>
                    <Text style={[styles.emptyText, { color: Colors.secondaryText }]}>
                      You've already added all available services! Use the button above to create a custom service.
                    </Text>
                  </>
                )}
              </View>
            ) : (
              <>
                {/* Section Title */}
                <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
                  {searchQuery ? 'Search Results' : 'Available Services'} ({filteredCategories.length})
                </Text>

                {/* Service Options */}
                {filteredCategories.map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.serviceCard,
                      {
                        backgroundColor: Colors.white,
                        borderColor: Colors.border,
                      },
                    ]}
                    onPress={() => handleSelectService(category)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.serviceHeader}>
                      <View
                        style={[
                          styles.serviceIcon,
                          {
                            backgroundColor: Colors.primaryBlue + '10',
                          },
                        ]}
                      >
                        <Ionicons
                          name={category.icon || 'briefcase-outline'}
                          size={24}
                          color={Colors.primaryBlue}
                        />
                      </View>
                      <View style={styles.serviceInfo}>
                        <Text
                          style={[
                            styles.serviceName,
                            { color: Colors.primaryText },
                          ]}
                        >
                          {category.name}
                        </Text>
                        {category.description && (
                          <Text style={[styles.serviceDescription, { color: Colors.secondaryText }]} numberOfLines={1}>
                            {category.description}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={Colors.secondaryText} />
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            )}
          </View>
        </ScrollView>
      )}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: FontSizes.body,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.body,
    padding: 0,
  },
  createServiceCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderStyle: 'dashed',
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  createServiceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  createIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createServiceInfo: {
    flex: 1,
  },
  createServiceName: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  createHint: {
    fontSize: FontSizes.small,
  },
  creatingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  creatingCard: {
    alignItems: 'center',
    padding: Spacing.xxl,
    borderRadius: BorderRadius.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    width: '100%',
  },
  creatingIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  creatingTitle: {
    fontSize: FontSizes.xl || 24,
    fontWeight: '700',
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  creatingSubtitle: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  creatingDots: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  creatingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  emptyContainer: {
    padding: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    lineHeight: 22,
  },
  sectionTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: Spacing.md,
  },
  serviceCard: {
    borderWidth: 2,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  serviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: 2,
  },
  serviceDescription: {
    fontSize: FontSizes.small,
  },
});
