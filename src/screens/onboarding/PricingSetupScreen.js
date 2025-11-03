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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getTradeById, getDefaultPricing, formatPriceUnit } from '../../constants/trades';
import { saveUserProfile, completeOnboarding } from '../../utils/storage';

export default function PricingSetupScreen({ navigation, route }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);
  const { selectedTrades, businessInfo } = route.params;

  const [activeTrade, setActiveTrade] = useState(selectedTrades[0]);
  const [pricing, setPricing] = useState({});

  // Initialize pricing with default values
  useEffect(() => {
    const initialPricing = {};
    selectedTrades.forEach(tradeId => {
      initialPricing[tradeId] = getDefaultPricing(tradeId);
    });
    setPricing(initialPricing);
  }, []);

  const handlePriceChange = (tradeId, itemId, value) => {
    const numericValue = parseFloat(value) || 0;
    setPricing(prev => ({
      ...prev,
      [tradeId]: {
        ...prev[tradeId],
        [itemId]: {
          ...prev[tradeId][itemId],
          price: numericValue,
        },
      },
    }));
  };

  const handleContinue = async () => {
    // Save complete profile
    const profile = {
      isOnboarded: false, // Will be set to true after completion screen
      businessInfo,
      trades: selectedTrades,
      pricing,
    };

    await saveUserProfile(profile);

    navigation.navigate('Completion');
  };

  const handleBack = () => {
    navigation.goBack();
  };

  const currentTrade = getTradeById(activeTrade);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.primaryText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Pricing Setup</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Content */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: Colors.primaryText, paddingHorizontal: Spacing.xl }]}>
            Set your pricing
          </Text>
          <Text style={[styles.subtitle, { color: Colors.secondaryText, paddingHorizontal: Spacing.xl }]}>
            These are your default rates. You can adjust them for each estimate.
          </Text>

          {/* Trade Tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
            contentContainerStyle={styles.tabsContent}
          >
            {selectedTrades.map(tradeId => {
              const trade = getTradeById(tradeId);
              const isActive = activeTrade === tradeId;

              return (
                <TouchableOpacity
                  key={tradeId}
                  style={[
                    styles.tab,
                    {
                      backgroundColor: isActive ? Colors.primaryBlue : Colors.white,
                      borderColor: isActive ? Colors.primaryBlue : Colors.border,
                    },
                  ]}
                  onPress={() => setActiveTrade(tradeId)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={trade.icon}
                    size={20}
                    color={isActive ? '#fff' : Colors.secondaryText}
                  />
                  <Text
                    style={[
                      styles.tabText,
                      { color: isActive ? '#fff' : Colors.primaryText },
                    ]}
                  >
                    {trade.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Pricing Inputs */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {currentTrade && currentTrade.pricingTemplate.map((item) => {
              const currentPrice = pricing[activeTrade]?.[item.id]?.price || item.defaultPrice;

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
                      onChangeText={(value) => handlePriceChange(activeTrade, item.id, value)}
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

            {/* Tip Box */}
            <View style={[styles.tipBox, { backgroundColor: Colors.success + '10', borderColor: Colors.success + '30' }]}>
              <Ionicons name="bulb-outline" size={20} color={Colors.success} />
              <Text style={[styles.tipText, { color: Colors.success }]}>
                Pro tip: Set competitive rates based on your local market. You can always adjust prices for individual estimates.
              </Text>
            </View>
          </ScrollView>
        </View>

        {/* Bottom Section */}
        <View style={[styles.bottomSection, { backgroundColor: Colors.white, borderTopColor: Colors.border }]}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>Complete Setup</Text>
            <Ionicons name="checkmark" size={20} color="#fff" />
          </TouchableOpacity>

          {/* Progress */}
          <View style={styles.progressContainer}>
            <View style={styles.progressDots}>
              <View style={[styles.dot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.dot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.dot, { backgroundColor: Colors.primaryBlue }]} />
              <View style={[styles.dot, styles.activeDot, { backgroundColor: Colors.primaryBlue }]} />
            </View>
            <Text style={[styles.progressText, { color: Colors.secondaryText }]}>Step 4 of 4</Text>
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
  title: {
    fontSize: FontSizes.header,
    fontWeight: '700',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSizes.body,
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  tabsContainer: {
    maxHeight: 60,
  },
  tabsContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    gap: Spacing.sm,
  },
  tabText: {
    fontSize: FontSizes.small,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
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
  tipBox: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  tipText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
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
