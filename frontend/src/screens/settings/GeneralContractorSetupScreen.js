import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getAllTrades, getTradeById, getDefaultPricing } from '../../constants/trades';
import { addTrade, saveUserProfile, getUserProfile, saveSubcontractorQuote } from '../../utils/storage';
import { analyzeSubcontractorQuote } from '../../services/aiService';

export default function GeneralContractorSetupScreen({ navigation }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const [step, setStep] = useState(1); // 1 = service selection, 2 = pricing setup (DEPRECATED), 3 = quote upload
  const [selectedServices, setSelectedServices] = useState(['drywall', 'electrical', 'hvac', 'plumbing']);
  const [activeService, setActiveService] = useState(null);
  const [pricing, setPricing] = useState({});
  const [saving, setSaving] = useState(false);

  // Step 3: Quote upload state
  const [uploadingQuote, setUploadingQuote] = useState(false);
  const [analyzingQuote, setAnalyzingQuote] = useState(false);
  const [currentQuoteData, setCurrentQuoteData] = useState(null);
  const [currentTradeForQuote, setCurrentTradeForQuote] = useState(null);
  const [uploadedQuotes, setUploadedQuotes] = useState({}); // { tradeId: [quotes] }

  // Get all available services (excluding General Contractor itself)
  const availableServices = getAllTrades().filter(trade => trade.id !== 'generalContractor');

  // Initialize pricing with default values when services are selected
  useEffect(() => {
    const initialPricing = {};
    selectedServices.forEach(serviceId => {
      if (!pricing[serviceId]) {
        initialPricing[serviceId] = getDefaultPricing(serviceId);
      }
    });
    setPricing(prev => ({ ...prev, ...initialPricing }));
  }, [selectedServices]);

  const toggleService = (serviceId) => {
    if (selectedServices.includes(serviceId)) {
      setSelectedServices(selectedServices.filter(id => id !== serviceId));
      // Remove pricing for deselected service
      const newPricing = { ...pricing };
      delete newPricing[serviceId];
      setPricing(newPricing);
    } else {
      setSelectedServices([...selectedServices, serviceId]);
    }
  };

  const handleContinueToQuotes = () => {
    if (selectedServices.length === 0) {
      Alert.alert(t('alerts.selectServices'), t('messages.selectAtLeastOneService'));
      return;
    }
    setCurrentTradeForQuote(selectedServices[0]);
    setStep(3); // Skip pricing step (2), go directly to quote upload (3)
  };

  const handlePriceChange = (serviceId, itemId, value) => {
    const numericValue = parseFloat(value) || 0;
    setPricing(prev => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        [itemId]: {
          ...prev[serviceId][itemId],
          price: numericValue,
        },
      },
    }));
  };

  const handleNextService = () => {
    const currentIndex = selectedServices.indexOf(activeService);
    if (currentIndex < selectedServices.length - 1) {
      setActiveService(selectedServices[currentIndex + 1]);
    }
  };

  const handlePreviousService = () => {
    const currentIndex = selectedServices.indexOf(activeService);
    if (currentIndex > 0) {
      setActiveService(selectedServices[currentIndex - 1]);
    }
  };

  // Step 3: Quote Upload Functions
  const handleUploadQuote = async () => {
    try {
      // Request permission
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('permissions.required'), t('permissions.photoLibraryRequired'));
        return;
      }

      // Launch image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
        base64: true,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingQuote(true);
        setAnalyzingQuote(true);

        // Analyze quote with AI
        const extracted = await analyzeSubcontractorQuote(result.assets[0].base64, currentTradeForQuote);

        setAnalyzingQuote(false);
        setCurrentQuoteData(extracted);
      }
    } catch (error) {
      console.error('Error uploading quote:', error);
      Alert.alert(t('alerts.error'), error.message || t('messages.failedToAnalyzeQuote'));
      setAnalyzingQuote(false);
      setUploadingQuote(false);
    }
  };

  const handleTakePhoto = async () => {
    try {
      // Request camera permission
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('permissions.required'), t('permissions.cameraRequired'));
        return;
      }

      // Launch camera
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        base64: true,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets[0]) {
        setUploadingQuote(true);
        setAnalyzingQuote(true);

        // Analyze quote with AI
        const extracted = await analyzeSubcontractorQuote(result.assets[0].base64, currentTradeForQuote);

        setAnalyzingQuote(false);
        setCurrentQuoteData(extracted);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert(t('alerts.error'), error.message || t('messages.failedToAnalyzeQuote'));
      setAnalyzingQuote(false);
      setUploadingQuote(false);
    }
  };

  const handleSaveQuote = async (isPreferred = false) => {
    if (!currentQuoteData) return;

    try {
      const quoteToSave = {
        tradeId: currentTradeForQuote,
        subcontractorName: currentQuoteData.subcontractorName,
        contactPhone: currentQuoteData.contactPhone,
        contactEmail: currentQuoteData.contactEmail,
        isPreferred: isPreferred,
        services: currentQuoteData.services,
        notes: currentQuoteData.notes,
      };

      const result = await saveSubcontractorQuote(quoteToSave);

      if (result.success) {
        // Add to uploaded quotes tracker
        setUploadedQuotes(prev => ({
          ...prev,
          [currentTradeForQuote]: [...(prev[currentTradeForQuote] || []), quoteToSave],
        }));

        // Reset quote upload state
        setUploadingQuote(false);
        setCurrentQuoteData(null);

        Alert.alert(
          t('alerts.quoteSaved'),
          t('messages.quoteSavedSuccessfully', { name: currentQuoteData.subcontractorName }),
          [{ text: t('alerts.ok') }]
        );
      } else {
        Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'quote' }));
      }
    } catch (error) {
      console.error('Error saving quote:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'quote' }));
    }
  };

  const handleSkipQuoteForTrade = () => {
    // Reset current quote data
    setCurrentQuoteData(null);
    setUploadingQuote(false);

    // Move to next trade or finish
    const currentIndex = selectedServices.indexOf(currentTradeForQuote);
    if (currentIndex < selectedServices.length - 1) {
      setCurrentTradeForQuote(selectedServices[currentIndex + 1]);
    } else {
      // All trades done, save and finish
      handleCompleteSave();
    }
  };

  const handleNextTrade = () => {
    const currentIndex = selectedServices.indexOf(currentTradeForQuote);
    if (currentIndex < selectedServices.length - 1) {
      setCurrentTradeForQuote(selectedServices[currentIndex + 1]);
      setCurrentQuoteData(null);
      setUploadingQuote(false);
    }
  };

  const handlePreviousTrade = () => {
    const currentIndex = selectedServices.indexOf(currentTradeForQuote);
    if (currentIndex > 0) {
      setCurrentTradeForQuote(selectedServices[currentIndex - 1]);
      setCurrentQuoteData(null);
      setUploadingQuote(false);
    }
  };

  const handleCompleteSave = async () => {
    setSaving(true);
    try {
      const profile = await getUserProfile();

      // Add General Contractor trade
      if (!profile.trades.includes('generalContractor')) {
        profile.trades.push('generalContractor');
      }

      // Add all selected services
      selectedServices.forEach(serviceId => {
        if (!profile.trades.includes(serviceId)) {
          profile.trades.push(serviceId);
        }
      });

      // Update pricing - GC doesn't use traditional pricing, subcontractor quotes instead
      profile.pricing = {
        ...profile.pricing,
        generalContractor: {}, // Empty pricing for GC itself
      };

      const success = await saveUserProfile(profile);

      if (success) {
        const quotesCount = Object.values(uploadedQuotes).reduce((sum, quotes) => sum + quotes.length, 0);

        Alert.alert(
          t('alerts.success'),
          t('messages.gcSetupComplete', { services: selectedServices.length, quotes: quotesCount }),
          [
            {
              text: t('alerts.ok'),
              onPress: () => navigation.pop(2), // Go back to main settings
            },
          ]
        );
      } else {
        Alert.alert(t('alerts.error'), t('messages.failedToSaveTryAgain'));
      }
    } catch (error) {
      console.error('Error saving General Contractor setup:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSaveTryAgain'));
    } finally {
      setSaving(false);
    }
  };

  const currentServiceIndex = selectedServices.indexOf(activeService);
  const isLastService = currentServiceIndex === selectedServices.length - 1;
  const isFirstService = currentServiceIndex === 0;
  const currentTrade = getTradeById(activeService);

  if (step === 1) {
    // Service Selection Step
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>General Contractor</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            {/* Info Header */}
            <View style={[styles.gcHeader, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
              <View style={[styles.gcIcon, { backgroundColor: Colors.primaryBlue }]}>
                <Ionicons name="briefcase-outline" size={32} color="#fff" />
              </View>
              <View style={styles.gcInfo}>
                <Text style={[styles.gcTitle, { color: Colors.primaryText }]}>
                  General Contractor
                </Text>
                <Text style={[styles.gcSubtitle, { color: Colors.secondaryText }]}>
                  Select the services you manage and set pricing for each
                </Text>
              </View>
            </View>

            {/* Instructions */}
            <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
              What services do you manage?
            </Text>
            <Text style={[styles.sectionSubtitle, { color: Colors.secondaryText }]}>
              Select all services you contract or manage. You can add more later.
            </Text>

            {/* Service Grid */}
            <View style={styles.serviceGrid}>
              {availableServices.map((service) => {
                const isSelected = selectedServices.includes(service.id);

                return (
                  <TouchableOpacity
                    key={service.id}
                    style={[
                      styles.serviceCard,
                      {
                        backgroundColor: isSelected ? Colors.primaryBlue + '15' : Colors.white,
                        borderColor: isSelected ? Colors.primaryBlue : Colors.border,
                      },
                    ]}
                    onPress={() => toggleService(service.id)}
                    activeOpacity={0.7}
                  >
                    {isSelected && (
                      <View style={[styles.checkBadge, { backgroundColor: Colors.primaryBlue }]}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      </View>
                    )}

                    <Ionicons
                      name={service.icon}
                      size={28}
                      color={isSelected ? Colors.primaryBlue : Colors.secondaryText}
                    />
                    <Text
                      style={[
                        styles.serviceName,
                        { color: isSelected ? Colors.primaryBlue : Colors.primaryText },
                      ]}
                    >
                      {service.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Selected Count */}
            {selectedServices.length > 0 && (
              <View style={[styles.selectedBanner, { backgroundColor: Colors.success + '20' }]}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                <Text style={[styles.selectedText, { color: Colors.success }]}>
                  {selectedServices.length} service{selectedServices.length > 1 ? 's' : ''} selected
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Bottom Button */}
        <View style={[styles.bottomSection, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: selectedServices.length > 0 ? Colors.primaryBlue : Colors.lightGray,
              },
            ]}
            onPress={handleContinueToQuotes}
            disabled={selectedServices.length === 0}
            activeOpacity={0.8}
          >
            <Text style={[styles.buttonText, { opacity: selectedServices.length > 0 ? 1 : 0.5 }]}>
              Continue to Upload Quotes
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" style={{ opacity: selectedServices.length > 0 ? 1 : 0.5 }} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Step 3: Quote Upload
  if (step === 3) {
    const currentTradeIndex = selectedServices.indexOf(currentTradeForQuote);
    const isLastTrade = currentTradeIndex === selectedServices.length - 1;
    const isFirstTrade = currentTradeIndex === 0;
    const currentTrade = getTradeById(currentTradeForQuote);
    const quotesForCurrentTrade = uploadedQuotes[currentTradeForQuote] || [];

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep(1)} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Upload Quotes</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {/* Current Trade Header */}
          <View style={[styles.quoteTradeHeader, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
            <View style={[styles.quoteTradeIcon, { backgroundColor: Colors.primaryBlue }]}>
              <Ionicons name={currentTrade?.icon} size={32} color="#fff" />
            </View>
            <View style={styles.quoteTradeInfo}>
              <Text style={[styles.quoteTradeTitle, { color: Colors.primaryText }]}>
                {currentTrade?.name}
              </Text>
              <Text style={[styles.quoteTradeSubtitle, { color: Colors.secondaryText }]}>
                Service {currentTradeIndex + 1} of {selectedServices.length}
              </Text>
            </View>
          </View>

          {/* Instructions */}
          <Text style={[styles.quoteInstructions, { color: Colors.primaryText }]}>
            Upload subcontractor quotes for {currentTrade?.name} services
          </Text>
          <Text style={[styles.quoteSubtext, { color: Colors.secondaryText }]}>
            The AI will extract pricing information automatically. You can upload multiple quotes and mark your preferred vendor.
          </Text>

          {/* Upload Buttons */}
          {!analyzingQuote && !currentQuoteData && (
            <View style={styles.uploadButtonsContainer}>
              <TouchableOpacity
                style={[styles.uploadButton, { backgroundColor: Colors.primaryBlue }]}
                onPress={handleTakePhoto}
                activeOpacity={0.8}
              >
                <Ionicons name="camera" size={24} color="#fff" />
                <Text style={styles.uploadButtonText}>Take Photo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.uploadButton, { backgroundColor: Colors.primaryBlue }]}
                onPress={handleUploadQuote}
                activeOpacity={0.8}
              >
                <Ionicons name="image" size={24} color="#fff" />
                <Text style={styles.uploadButtonText}>Choose from Gallery</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Analyzing State */}
          {analyzingQuote && (
            <View style={[styles.analyzingContainer, { backgroundColor: Colors.white }]}>
              <ActivityIndicator size="large" color={Colors.primaryBlue} />
              <Text style={[styles.analyzingText, { color: Colors.primaryText }]}>
                Analyzing quote with AI...
              </Text>
              <Text style={[styles.analyzingSubtext, { color: Colors.secondaryText }]}>
                Extracting pricing and company details
              </Text>
            </View>
          )}

          {/* Extracted Quote Review */}
          {currentQuoteData && !analyzingQuote && (
            <View style={[styles.extractedQuoteContainer, { backgroundColor: Colors.white }]}>
              <View style={styles.extractedHeader}>
                <Ionicons name="checkmark-circle" size={24} color={Colors.success} />
                <Text style={[styles.extractedTitle, { color: Colors.primaryText }]}>
                  Quote Extracted
                </Text>
              </View>

              {/* Contractor Info */}
              <View style={styles.contractorInfo}>
                <Text style={[styles.contractorLabel, { color: Colors.secondaryText }]}>
                  Subcontractor
                </Text>
                <Text style={[styles.contractorName, { color: Colors.primaryText }]}>
                  {currentQuoteData.subcontractorName}
                </Text>

                {currentQuoteData.contactPhone && (
                  <View style={styles.contactRow}>
                    <Ionicons name="call-outline" size={14} color={Colors.secondaryText} />
                    <Text style={[styles.contactText, { color: Colors.secondaryText }]}>
                      {currentQuoteData.contactPhone}
                    </Text>
                  </View>
                )}

                {currentQuoteData.contactEmail && (
                  <View style={styles.contactRow}>
                    <Ionicons name="mail-outline" size={14} color={Colors.secondaryText} />
                    <Text style={[styles.contactText, { color: Colors.secondaryText }]}>
                      {currentQuoteData.contactEmail}
                    </Text>
                  </View>
                )}
              </View>

              {/* Services Preview */}
              <View style={styles.servicesPreview}>
                <Text style={[styles.servicesLabel, { color: Colors.secondaryText }]}>
                  Services Extracted ({currentQuoteData.services.length})
                </Text>
                {currentQuoteData.services.slice(0, 3).map((service, index) => (
                  <View key={index} style={styles.serviceItem}>
                    <Text style={[styles.serviceDesc, { color: Colors.primaryText }]} numberOfLines={1}>
                      • {service.description}
                    </Text>
                    <Text style={[styles.servicePrice, { color: Colors.primaryBlue }]}>
                      ${service.pricePerUnit || service.price_per_unit || 0}/{service.unit}
                    </Text>
                  </View>
                ))}
                {currentQuoteData.services.length > 3 && (
                  <Text style={[styles.moreServices, { color: Colors.secondaryText }]}>
                    +{currentQuoteData.services.length - 3} more services
                  </Text>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.quoteActions}>
                <TouchableOpacity
                  style={[styles.quoteActionButton, styles.savePreferred, { backgroundColor: '#F59E0B' }]}
                  onPress={() => handleSaveQuote(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="star" size={18} color="#fff" />
                  <Text style={styles.quoteActionText}>Save as Preferred</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.quoteActionButton, { backgroundColor: Colors.primaryBlue }]}
                  onPress={() => handleSaveQuote(false)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark" size={18} color="#fff" />
                  <Text style={styles.quoteActionText}>Save Quote</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.discardButton}
                onPress={() => {
                  setCurrentQuoteData(null);
                  setUploadingQuote(false);
                }}
                activeOpacity={0.8}
              >
                <Text style={[styles.discardButtonText, { color: Colors.secondaryText }]}>
                  Discard & Upload Different
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Uploaded Quotes Summary */}
          {quotesForCurrentTrade.length > 0 && (
            <View style={[styles.uploadedSummary, { backgroundColor: Colors.success + '20' }]}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={[styles.uploadedText, { color: Colors.success }]}>
                {quotesForCurrentTrade.length} quote{quotesForCurrentTrade.length > 1 ? 's' : ''} uploaded for {currentTrade?.name}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Bottom Navigation */}
        <View style={[styles.bottomSection, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
          <View style={styles.navigationButtons}>
            {!isFirstTrade && (
              <TouchableOpacity
                style={[styles.navButton, { backgroundColor: Colors.lightGray }]}
                onPress={handlePreviousTrade}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-back" size={20} color={Colors.primaryText} />
                <Text style={[styles.navButtonText, { color: Colors.primaryText }]}>Previous</Text>
              </TouchableOpacity>
            )}

            {!isLastTrade ? (
              <TouchableOpacity
                style={[styles.navButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue, marginLeft: isFirstTrade ? 0 : Spacing.sm }]}
                onPress={handleSkipQuoteForTrade}
                activeOpacity={0.8}
              >
                <Text style={styles.navButtonText}>
                  {quotesForCurrentTrade.length > 0 ? 'Next Service' : 'Skip'}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.navButton, styles.primaryButton, { backgroundColor: Colors.success, opacity: saving ? 0.6 : 1, marginLeft: isFirstTrade ? 0 : Spacing.sm }]}
                onPress={handleCompleteSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Text style={styles.navButtonText}>Complete Setup</Text>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Step 2: Pricing Setup (DEPRECATED - Keeping for backwards compatibility)
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep(1)} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Set Pricing</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1 }}>
          {/* Service Header */}
          <View style={[styles.serviceHeader, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
            <View style={[styles.serviceIcon, { backgroundColor: Colors.primaryBlue }]}>
              <Ionicons name={currentTrade?.icon} size={28} color="#fff" />
            </View>
            <View style={styles.serviceInfo}>
              <Text style={[styles.serviceHeaderName, { color: Colors.primaryText }]}>
                {currentTrade?.name}
              </Text>
              <Text style={[styles.serviceHeaderSubtitle, { color: Colors.secondaryText }]}>
                Service {currentServiceIndex + 1} of {selectedServices.length}
              </Text>
            </View>
          </View>

          {/* Service Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
            contentContainerStyle={styles.tabsContent}
          >
            {selectedServices.map((serviceId, index) => {
              const service = getTradeById(serviceId);
              const isActive = activeService === serviceId;

              return (
                <TouchableOpacity
                  key={serviceId}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: isActive ? Colors.primaryBlue : Colors.white,
                      borderColor: isActive ? Colors.primaryBlue : Colors.border,
                    },
                  ]}
                  onPress={() => setActiveService(serviceId)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={service.icon}
                    size={18}
                    color={isActive ? '#fff' : Colors.secondaryText}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      { color: isActive ? '#fff' : Colors.primaryText },
                    ]}
                  >
                    {service.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Pricing Inputs */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.pricingContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {currentTrade && currentTrade.pricingTemplate.map((item) => {
              const currentPrice = pricing[activeService]?.[item.id]?.price || item.defaultPrice;

              return (
                <View key={item.id} style={styles.priceItem}>
                  <View style={styles.priceItemHeader}>
                    <Text style={[styles.priceItemLabel, { color: Colors.primaryText }]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.priceItemUnit, { color: Colors.secondaryText }]}>
                      per {item.unit}
                    </Text>
                  </View>

                  <View style={[styles.priceInput, { backgroundColor: Colors.white, borderColor: Colors.border }]}>
                    <Text style={[styles.currencySymbol, { color: Colors.secondaryText }]}>$</Text>
                    <TextInput
                      style={[styles.input, { color: Colors.primaryText }]}
                      value={currentPrice.toString()}
                      onChangeText={(value) => handlePriceChange(activeService, item.id, value)}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={Colors.secondaryText}
                    />
                    <Text style={[styles.unitText, { color: Colors.secondaryText }]}>
                      / {item.unit}
                    </Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {/* Bottom Section */}
        <View style={[styles.bottomSection, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
          <View style={styles.navigationButtons}>
            {!isFirstService && (
              <TouchableOpacity
                style={[styles.navButton, { backgroundColor: Colors.lightGray }]}
                onPress={handlePreviousService}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-back" size={20} color={Colors.primaryText} />
                <Text style={[styles.navButtonText, { color: Colors.primaryText }]}>Previous</Text>
              </TouchableOpacity>
            )}

            {!isLastService ? (
              <TouchableOpacity
                style={[styles.navButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue, marginLeft: isFirstService ? 0 : Spacing.sm }]}
                onPress={handleNextService}
                activeOpacity={0.8}
              >
                <Text style={styles.navButtonText}>Next</Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.navButton, styles.primaryButton, { backgroundColor: Colors.primaryBlue, opacity: saving ? 0.6 : 1, marginLeft: isFirstService ? 0 : Spacing.sm }]}
                onPress={handleSave}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Text style={styles.navButtonText}>Complete Setup</Text>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.xl,
    paddingBottom: 120, // Extra padding to avoid bottom bar overlap
  },
  gcHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  gcIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gcInfo: {
    flex: 1,
  },
  gcTitle: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginBottom: 4,
  },
  gcSubtitle: {
    fontSize: FontSizes.small,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    fontSize: FontSizes.body,
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  serviceCard: {
    width: '47%',
    aspectRatio: 1.2,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    padding: Spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  checkBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceName: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  selectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  selectedText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  serviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    gap: Spacing.md,
  },
  serviceIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceInfo: {
    flex: 1,
  },
  serviceHeaderName: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: 2,
  },
  serviceHeaderSubtitle: {
    fontSize: FontSizes.small,
  },
  tabsContainer: {
    maxHeight: 56,
  },
  tabsContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    gap: Spacing.xs,
  },
  tabText: {
    fontSize: FontSizes.tiny,
    fontWeight: '600',
  },
  pricingContent: {
    padding: Spacing.xl,
    paddingBottom: 100,
  },
  priceItem: {
    marginBottom: Spacing.xl,
  },
  priceItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  priceItemLabel: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  priceItemUnit: {
    fontSize: FontSizes.small,
  },
  priceInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  currencySymbol: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginRight: Spacing.xs,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    paddingVertical: Spacing.sm,
  },
  unitText: {
    fontSize: FontSizes.small,
    marginLeft: Spacing.xs,
  },
  bottomSection: {
    padding: Spacing.xl,
    paddingBottom: Spacing.xl + 20, // Extra padding to lift above tab bar
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
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  navigationButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  primaryButton: {
    flex: 1,
  },
  navButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  // Step 3: Quote Upload Styles
  quoteTradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  quoteTradeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quoteTradeInfo: {
    flex: 1,
  },
  quoteTradeTitle: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginBottom: 4,
  },
  quoteTradeSubtitle: {
    fontSize: FontSizes.small,
  },
  quoteInstructions: {
    fontSize: FontSizes.subheader,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  quoteSubtext: {
    fontSize: FontSizes.small,
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },
  uploadButtonsContainer: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  analyzingContainer: {
    padding: Spacing.xxl,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  analyzingText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginTop: Spacing.sm,
  },
  analyzingSubtext: {
    fontSize: FontSizes.small,
  },
  extractedQuoteContainer: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.xl,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  extractedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  extractedTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  contractorInfo: {
    marginBottom: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  contractorLabel: {
    fontSize: FontSizes.tiny,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 4,
  },
  contractorName: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: Spacing.xs,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  contactText: {
    fontSize: FontSizes.small,
  },
  servicesPreview: {
    marginBottom: Spacing.lg,
  },
  servicesLabel: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  serviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  serviceDesc: {
    flex: 1,
    fontSize: FontSizes.small,
    marginRight: Spacing.sm,
  },
  servicePrice: {
    fontSize: FontSizes.small,
    fontWeight: '700',
  },
  moreServices: {
    fontSize: FontSizes.tiny,
    fontStyle: 'italic',
    marginTop: 4,
  },
  quoteActions: {
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  quoteActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  quoteActionText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  discardButton: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  discardButtonText: {
    fontSize: FontSizes.small,
    textDecorationLine: 'underline',
  },
  uploadedSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  uploadedText: {
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
