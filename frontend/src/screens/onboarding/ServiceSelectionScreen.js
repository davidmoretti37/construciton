/**
 * Service Selection Screen (Onboarding)
 * Replaces TradeSelectionScreen with AI-powered service discovery
 * Users can search for ANY service - system auto-generates if not in DB
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
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getServiceDetails } from '../../services/serviceDiscoveryService';
import { supabase } from '../../lib/supabase';

export default function ServiceSelectionScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('common');

  const [selectedServices, setSelectedServices] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [allServices, setAllServices] = useState([]);
  const [filteredServices, setFilteredServices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingServices, setLoadingServices] = useState(true);
  const [isCreatingService, setIsCreatingService] = useState(false);
  const searchInputRef = useRef(null);

  // Load all available services on mount
  useEffect(() => {
    loadAllServices();
  }, []);

  // Filter services based on search query
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredServices(allServices);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = allServices.filter(service =>
        service.name.toLowerCase().includes(query) ||
        (service.description && service.description.toLowerCase().includes(query))
      );
      setFilteredServices(filtered);
    }
  }, [searchQuery, allServices]);

  const loadAllServices = async () => {
    try {
      setLoadingServices(true);
      const { data, error } = await supabase
        .from('service_categories')
        .select('*')
        .order('name');

      if (error) throw error;

      setAllServices(data || []);
      setFilteredServices(data || []);
    } catch (error) {
      console.error('Error loading services:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad'));
    } finally {
      setLoadingServices(false);
    }
  };

  const handleServiceSelect = async (service) => {
    // Check if already selected
    const isAlreadySelected = selectedServices.some(s => s.id === service.id);
    if (isAlreadySelected) {
      Alert.alert(t('alerts.alreadyAdded'), `${service.name} ${t('messages.alreadyInList')}`);
      return;
    }

    // Fetch full details (items and phases) for the service
    setLoadingDetails(true);
    try {
      const details = await getServiceDetails(service.id);

      const fullService = {
        ...service,
        items: details.items,
        phases: details.phases,
      };

      setSelectedServices([...selectedServices, fullService]);
    } catch (error) {
      console.error('Error loading service details:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad'));
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleRemoveService = (serviceId) => {
    setSelectedServices(selectedServices.filter(s => s.id !== serviceId));
  };

  const handleOpenCreateService = () => {
    // Focus on search input
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  };

  const handleCreateNewService = async (serviceName) => {
    setIsCreatingService(true);
    setLoadingDetails(true);
    setSearchQuery(''); // Clear search

    try {
      // Use the discovery service to create AI-generated service
      const { discoverServices } = require('../../services/serviceDiscoveryService');
      const results = await discoverServices(serviceName);

      if (results && results.length > 0) {
        const newService = results[0];

        // Fetch full details
        const details = await getServiceDetails(newService.id);

        const fullService = {
          ...newService,
          items: details.items,
          phases: details.phases,
        };

        setSelectedServices([...selectedServices, fullService]);

        // Reload all services to include the new one
        loadAllServices();
      }
    } catch (error) {
      console.error('Error creating service:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave'));
    } finally {
      setLoadingDetails(false);
      setIsCreatingService(false);
    }
  };

  const handleContinue = () => {
    if (selectedServices.length === 0) {
      Alert.alert(t('alerts.selectServices'), t('messages.atLeastOne'));
      return;
    }

    // Navigate to phase customization with selected services
    navigation.navigate('PhaseCustomization', { selectedServices });
  };

  const handleBack = () => {
    navigation.goBack();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Your Services</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Fixed Header Content - Outside ScrollView */}
      <View style={styles.headerContent}>
        <Text style={[styles.title, { color: Colors.primaryText }]}>
          Your Services
        </Text>

        {/* Search Input */}
        <View style={[styles.searchInputContainer, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
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
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors.secondaryText} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

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

        {/* Show content only when not creating */}
        {!isCreatingService && (
          <>
            {/* Loading Indicator */}
            {loadingDetails && (
              <View style={[styles.loadingBanner, { backgroundColor: Colors.primaryBlue + '15' }]}>
                <ActivityIndicator size="small" color={Colors.primaryBlue} />
                <Text style={[styles.loadingText, { color: Colors.primaryBlue }]}>
                  Loading service details...
                </Text>
              </View>
            )}


        {/* Selected Services */}
        {selectedServices.length > 0 && (
          <View style={styles.selectedSection}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              Selected Services ({selectedServices.length})
            </Text>

            {selectedServices.map((service) => (
              <View
                key={service.id}
                style={[
                  styles.selectedCard,
                  {
                    backgroundColor: Colors.white,
                    borderColor: Colors.primaryBlue + '30',
                  },
                ]}
              >
                <View style={styles.selectedCardContent}>
                  <View style={[styles.serviceIcon, { backgroundColor: Colors.primaryBlue + '15' }]}>
                    <Ionicons
                      name={service.icon || 'construct-outline'}
                      size={24}
                      color={Colors.primaryBlue}
                    />
                  </View>

                  <View style={styles.serviceInfo}>
                    <Text style={[styles.serviceName, { color: Colors.primaryText }]}>
                      {service.name}
                    </Text>
                  </View>

                  <TouchableOpacity
                    onPress={() => handleRemoveService(service.id)}
                    style={styles.removeButton}
                  >
                    <Ionicons name="close-circle" size={24} color={Colors.error} />
                  </TouchableOpacity>
                </View>

                {/* Show item and phase counts */}
                <View style={styles.serviceStats}>
                  <View style={styles.statItem}>
                    <Ionicons name="list-outline" size={16} color={Colors.secondaryText} />
                    <Text style={[styles.statText, { color: Colors.secondaryText }]}>
                      {service.items?.length || 0} items
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Ionicons name="git-network-outline" size={16} color={Colors.secondaryText} />
                    <Text style={[styles.statText, { color: Colors.secondaryText }]}>
                      {service.phases?.length || 0} phases
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Create New Service Button - Always visible when not searching */}
        {!searchQuery && !loadingServices && (
          <View style={styles.createServiceSection}>
            <TouchableOpacity
              style={[styles.createServiceCard, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue }]}
              onPress={handleOpenCreateService}
              activeOpacity={0.7}
            >
              <View style={styles.createServiceContent}>
                <View style={[styles.createIcon, { backgroundColor: Colors.primaryBlue }]}>
                  <Ionicons name="add" size={24} color="#fff" />
                </View>

                <View style={styles.serviceInfo}>
                  <Text style={[styles.serviceName, { color: Colors.primaryBlue }]}>
                    Add custom service
                  </Text>
                  <Text style={[styles.createHint, { color: Colors.secondaryText }]}>
                    Search to create a new service with AI
                  </Text>
                </View>

                <Ionicons name="sparkles" size={24} color={Colors.primaryBlue} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Create from Search Query - Always shows when typing */}
        {searchQuery.trim().length > 0 && !loadingServices && (
          <View style={styles.createServiceSection}>
            <TouchableOpacity
              style={[styles.createServiceCard, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue }]}
              onPress={() => handleCreateNewService(searchQuery.trim())}
              activeOpacity={0.7}
            >
              <View style={styles.createServiceContent}>
                <View style={[styles.createIcon, { backgroundColor: Colors.primaryBlue }]}>
                  <Ionicons name="add" size={24} color="#fff" />
                </View>

                <View style={styles.serviceInfo}>
                  <Text style={[styles.serviceName, { color: Colors.primaryBlue }]}>
                    Create "{searchQuery.trim()}"
                  </Text>
                  <Text style={[styles.createHint, { color: Colors.secondaryText }]}>
                    AI will generate a template for this service
                  </Text>
                </View>

                <Ionicons name="sparkles" size={24} color={Colors.primaryBlue} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Available Services */}
        {filteredServices.length > 0 && (
          <View style={styles.availableSection}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              {searchQuery ? 'Search Results' : 'Available Services'}
            </Text>

            {filteredServices.map((service) => {
              const isSelected = selectedServices.some(s => s.id === service.id);

              return (
                <TouchableOpacity
                  key={service.id}
                  style={[
                    styles.availableCard,
                    {
                      backgroundColor: Colors.white,
                      borderColor: isSelected ? Colors.success : Colors.border,
                      opacity: isSelected ? 0.6 : 1,
                    },
                  ]}
                  onPress={() => !isSelected && handleServiceSelect(service)}
                  disabled={isSelected}
                  activeOpacity={0.7}
                >
                  <View style={styles.availableCardContent}>
                    <View style={[styles.serviceIcon, { backgroundColor: Colors.primaryBlue + '15' }]}>
                      <Ionicons
                        name={service.icon || 'construct-outline'}
                        size={24}
                        color={Colors.primaryBlue}
                      />
                    </View>

                    <View style={styles.serviceInfo}>
                      <Text style={[styles.serviceName, { color: Colors.primaryText }]}>
                        {service.name}
                      </Text>
                    </View>

                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Loading State */}
        {loadingServices && (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
            <Text style={[styles.emptyTitle, { color: Colors.secondaryText }]}>
              Loading services...
            </Text>
          </View>
        )}
          </>
        )}

      </ScrollView>

      {/* Bottom Section */}
      <View style={[styles.bottomSection, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
        <TouchableOpacity
          style={[
            styles.button,
            {
              backgroundColor: selectedServices.length > 0 ? Colors.primaryBlue : Colors.lightGray,
            },
          ]}
          onPress={handleContinue}
          disabled={selectedServices.length === 0}
          activeOpacity={0.8}
        >
          <Text style={[styles.buttonText, { opacity: selectedServices.length > 0 ? 1 : 0.5 }]}>
            Continue
          </Text>
          <Ionicons
            name="arrow-forward"
            size={20}
            color="#fff"
            style={{ opacity: selectedServices.length > 0 ? 1 : 0.5 }}
          />
        </TouchableOpacity>

        {/* Progress */}
        <View style={styles.progressContainer}>
          <View style={styles.progressDots}>
            <View style={[styles.dot, { backgroundColor: Colors.primaryBlue }]} />
            <View style={[styles.dot, styles.activeDot, { backgroundColor: Colors.primaryBlue }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
            <View style={[styles.dot, { backgroundColor: Colors.lightGray }]} />
          </View>
          <Text style={[styles.progressText, { color: Colors.secondaryText }]}>Step 2 of 4</Text>
        </View>
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
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
  },
  headerContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    zIndex: 1000, // Keep search dropdown above ScrollView content
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    paddingTop: Spacing.md, // Reduced since title/search moved to headerContent
  },
  title: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.body,
    marginBottom: Spacing.xl,
    lineHeight: 22,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSizes.body,
    paddingVertical: Spacing.xs,
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  loadingText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  helpBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  helpText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 18,
  },
  selectedSection: {
    marginTop: Spacing.lg,
  },
  availableSection: {
    marginTop: Spacing.lg,
  },
  availableCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  availableCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  createServiceSection: {
    marginTop: Spacing.lg,
  },
  createServiceCard: {
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderStyle: 'dashed',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
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
  createHint: {
    fontSize: FontSizes.small,
    marginTop: 2,
  },
  creatingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xxl * 3,
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
    fontSize: FontSizes.xl,
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
  sectionTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  selectedCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  selectedCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
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
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 4,
  },
  serviceDescription: {
    fontSize: FontSizes.small,
    lineHeight: 18,
    marginBottom: 6,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    gap: 4,
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  removeButton: {
    padding: 4,
  },
  serviceStats: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xs,
    paddingLeft: 60, // Align with service name
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    fontSize: FontSizes.small,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl * 2,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
    lineHeight: 22,
  },
  bottomSection: {
    padding: Spacing.xl,
    borderTopWidth: 1,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    width: '100%',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  progressContainer: {
    alignItems: 'center',
  },
  progressDots: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activeDot: {
    width: 24,
  },
  progressText: {
    fontSize: FontSizes.small,
  },
});
