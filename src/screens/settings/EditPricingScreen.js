import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { getUserProfile, updateTradePricing } from '../../utils/storage';
import { getTradeById } from '../../constants/trades';

export default function EditPricingScreen({ route, navigation }) {
  const { tradeId } = route.params;
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trade, setTrade] = useState(null);
  const [pricing, setPricing] = useState({});

  useEffect(() => {
    loadPricing();
  }, []);

  const loadPricing = async () => {
    try {
      const tradeData = getTradeById(tradeId);
      if (!tradeData) {
        Alert.alert('Error', 'Trade not found');
        navigation.goBack();
        return;
      }

      setTrade(tradeData);

      const profile = await getUserProfile();
      if (profile && profile.pricing && profile.pricing[tradeId]) {
        setPricing(profile.pricing[tradeId]);
      } else {
        // Initialize with default pricing from template
        const defaultPricing = {};
        tradeData.pricingTemplate.forEach((item) => {
          defaultPricing[item.id] = {
            price: item.defaultPrice,
            unit: item.unit,
          };
        });
        setPricing(defaultPricing);
      }
    } catch (error) {
      console.error('Error loading pricing:', error);
      Alert.alert('Error', 'Failed to load pricing information');
    } finally {
      setLoading(false);
    }
  };

  const handlePriceChange = (itemId, value) => {
    setPricing((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        price: value,
      },
    }));
  };

  const handleSave = async () => {
    // Validate all prices are filled and valid
    for (const item of trade.pricingTemplate) {
      const price = pricing[item.id]?.price;
      if (!price || price === '' || isNaN(parseFloat(price))) {
        Alert.alert('Invalid Price', `Please enter a valid price for ${item.label}`);
        return;
      }

      if (parseFloat(price) <= 0) {
        Alert.alert('Invalid Price', `Price for ${item.label} must be greater than 0`);
        return;
      }
    }

    // Convert all prices to numbers
    const numericPricing = {};
    Object.keys(pricing).forEach((key) => {
      numericPricing[key] = {
        ...pricing[key],
        price: parseFloat(pricing[key].price),
      };
    });

    // Save to storage
    setSaving(true);
    try {
      await updateTradePricing(tradeId, numericPricing);

      Alert.alert('Success', 'Pricing updated successfully', [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('Error saving pricing:', error);
      Alert.alert('Error', 'Failed to save pricing. Please try again.');
    } finally {
      setSaving(false);
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

  if (!trade) {
    return null;
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
        <View style={styles.headerContent}>
          <Ionicons name={trade.icon} size={24} color={Colors.primaryBlue} style={{ marginRight: Spacing.sm }} />
          <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>{trade.name} Pricing</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            {/* Info Box */}
            <View style={[styles.infoBox, { backgroundColor: Colors.primaryBlue + '10', borderColor: Colors.primaryBlue + '30' }]}>
              <Ionicons name="information-circle-outline" size={20} color={Colors.primaryBlue} />
              <Text style={[styles.infoText, { color: Colors.primaryBlue }]}>
                Set your pricing for {trade.name.toLowerCase()} services. The AI will use these rates when creating estimates.
              </Text>
            </View>

            {/* Pricing Items */}
            <View style={styles.pricingList}>
              {trade.pricingTemplate.map((item, index) => (
                <View
                  key={item.id}
                  style={[styles.pricingItem, {
                    backgroundColor: Colors.white,
                    borderColor: Colors.border
                  }]}
                >
                  <View style={styles.itemHeader}>
                    <Text style={[styles.itemLabel, { color: Colors.primaryText }]}>
                      {item.label}
                    </Text>
                    <Text style={[styles.itemUnit, { color: Colors.secondaryText }]}>
                      per {item.unit}
                    </Text>
                  </View>

                  <View style={styles.priceInputContainer}>
                    <Text style={[styles.currencySymbol, { color: Colors.primaryText }]}>$</Text>
                    <TextInput
                      style={[styles.priceInput, {
                        backgroundColor: Colors.lightGray,
                        borderColor: Colors.border,
                        color: Colors.primaryText
                      }]}
                      placeholder="0.00"
                      placeholderTextColor={Colors.secondaryText}
                      value={pricing[item.id]?.price?.toString() || ''}
                      onChangeText={(value) => handlePriceChange(item.id, value)}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              ))}
            </View>

            {/* Example Calculation */}
            <View style={[styles.exampleBox, { backgroundColor: Colors.lightGray }]}>
              <Text style={[styles.exampleTitle, { color: Colors.primaryText }]}>
                Example Calculation
              </Text>
              <Text style={[styles.exampleText, { color: Colors.secondaryText }]}>
                {trade.pricingTemplate[0]?.label}: 100 {trade.pricingTemplate[0]?.unit} × ${pricing[trade.pricingTemplate[0]?.id]?.price || 0} = ${((pricing[trade.pricingTemplate[0]?.id]?.price || 0) * 100).toFixed(2)}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Save Button */}
        <View style={[styles.footer, { backgroundColor: Colors.background, borderTopColor: Colors.border }]}>
          <TouchableOpacity
            style={[styles.saveButton, {
              backgroundColor: Colors.primaryBlue,
              opacity: saving ? 0.6 : 1
            }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Save Pricing</Text>
              </>
            )}
          </TouchableOpacity>
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
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
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
  infoBox: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: FontSizes.small,
    lineHeight: 20,
  },
  pricingList: {
    gap: Spacing.md,
  },
  pricingItem: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
  },
  itemHeader: {
    marginBottom: Spacing.md,
  },
  itemLabel: {
    fontSize: FontSizes.body,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemUnit: {
    fontSize: FontSizes.small,
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: FontSizes.large,
    fontWeight: '600',
    marginRight: Spacing.sm,
  },
  priceInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSizes.large,
    fontWeight: '600',
  },
  exampleBox: {
    marginTop: Spacing.xl,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  exampleTitle: {
    fontSize: FontSizes.small,
    fontWeight: '600',
    marginBottom: Spacing.xs,
  },
  exampleText: {
    fontSize: FontSizes.small,
  },
  footer: {
    padding: Spacing.lg,
    borderTopWidth: 1,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.lg,
    gap: Spacing.sm,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
});
