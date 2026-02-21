import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from 'react-i18next';
import { getUserProfile, updateProfitMargin } from '../../utils/storage';

export default function EditProfitMarginScreen({ navigation }) {
  const { t } = useTranslation('common');
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedMargin, setSelectedMargin] = useState(0.25);
  const [customMargin, setCustomMargin] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  const profitOptions = [
    { label: '20%', value: 0.20, description: 'Conservative margin for competitive markets' },
    { label: '25%', value: 0.25, description: 'Standard margin for most contractors' },
    { label: '30%', value: 0.30, description: 'Higher margin for specialized work' },
    { label: '35%', value: 0.35, description: 'Premium margin for luxury projects' },
    { label: '40%', value: 0.40, description: 'High-end custom work' },
  ];

  useEffect(() => {
    loadProfitMargin();
  }, []);

  const loadProfitMargin = async () => {
    try {
      const profile = await getUserProfile();
      if (profile && profile.profit_margin !== undefined) {
        const margin = profile.profit_margin;
        setSelectedMargin(margin);

        // Check if it's a custom margin (not in predefined options)
        const isPresetMargin = profitOptions.some(opt => opt.value === margin);
        if (!isPresetMargin) {
          setIsCustom(true);
          setCustomMargin((margin * 100).toString());
        }
      }
    } catch (error) {
      console.error('Error loading profit margin:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToLoad', { item: 'profit margin' }));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let marginToSave = selectedMargin;

      // If custom margin is selected, use the custom value
      if (isCustom) {
        const customValue = parseFloat(customMargin);
        if (isNaN(customValue) || customValue <= 0 || customValue > 100) {
          Alert.alert(t('alerts.invalidInput'), t('messages.pleaseEnterValid', { item: 'profit margin between 1 and 100' }));
          setSaving(false);
          return;
        }
        marginToSave = customValue / 100;
      }

      await updateProfitMargin(marginToSave);

      Alert.alert(t('alerts.success'), t('messages.updatedSuccessfully', { item: 'Profit margin' }), [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]);
    } catch (error) {
      console.error('Error saving profit margin:', error);
      Alert.alert(t('alerts.error'), t('messages.failedToSave', { item: 'profit margin' }));
    } finally {
      setSaving(false);
    }
  };

  const handleCustomMarginChange = (text) => {
    // Only allow numbers and decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    setCustomMargin(cleaned);
  };

  const handleSelectPreset = (value) => {
    setIsCustom(false);
    setSelectedMargin(value);
    setCustomMargin('');
  };

  const handleSelectCustom = () => {
    setIsCustom(true);
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
        <Text style={[styles.headerTitle, { color: Colors.primaryText }]}>Profit Margin</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Margin Options */}
          <Text style={[styles.sectionTitle, { color: Colors.primaryText }]}>
            Select Your Profit Margin
          </Text>

          {profitOptions.map((option) => {
            const isSelected = !isCustom && selectedMargin === option.value;

            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: isSelected ? Colors.primaryBlue + '10' : Colors.white,
                    borderColor: isSelected ? Colors.primaryBlue : Colors.border,
                  },
                ]}
                onPress={() => handleSelectPreset(option.value)}
                activeOpacity={0.7}
              >
                <View style={styles.optionHeader}>
                  <View style={styles.optionTitleRow}>
                    <View
                      style={[
                        styles.radio,
                        {
                          borderColor: isSelected ? Colors.primaryBlue : Colors.border,
                          backgroundColor: isSelected ? Colors.primaryBlue : 'transparent',
                        },
                      ]}
                    >
                      {isSelected && (
                        <Ionicons name="checkmark" size={14} color="#fff" />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.optionLabel,
                        { color: isSelected ? Colors.primaryBlue : Colors.primaryText },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.optionDescription, { color: Colors.secondaryText }]}>
                  {option.description}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Custom Margin Input */}
          <View style={styles.customSection}>
            <Text style={[styles.sectionTitle, { color: Colors.primaryText, marginTop: Spacing.xl }]}>
              Or Enter Your Own
            </Text>

            <TouchableOpacity
              style={[
                styles.customCard,
                {
                  backgroundColor: isCustom ? Colors.primaryBlue + '10' : Colors.white,
                  borderColor: isCustom ? Colors.primaryBlue : Colors.border,
                },
              ]}
              onPress={handleSelectCustom}
              activeOpacity={0.7}
            >
              <View style={styles.customHeader}>
                <View
                  style={[
                    styles.radio,
                    {
                      borderColor: isCustom ? Colors.primaryBlue : Colors.border,
                      backgroundColor: isCustom ? Colors.primaryBlue : 'transparent',
                    },
                  ]}
                >
                  {isCustom && (
                    <Ionicons name="checkmark" size={14} color="#fff" />
                  )}
                </View>
                <Text style={[styles.customLabel, { color: isCustom ? Colors.primaryBlue : Colors.primaryText }]}>
                  Custom Profit Margin
                </Text>
              </View>

              <View style={styles.customInputContainer}>
                <TextInput
                  style={[
                    styles.customInput,
                    {
                      backgroundColor: Colors.background,
                      borderColor: isCustom ? Colors.primaryBlue : Colors.border,
                      color: Colors.primaryText,
                    },
                  ]}
                  placeholder="Enter percentage (e.g., 27.5)"
                  placeholderTextColor={Colors.secondaryText}
                  keyboardType="decimal-pad"
                  value={customMargin}
                  onChangeText={handleCustomMarginChange}
                  onFocus={handleSelectCustom}
                  maxLength={5}
                />
                <Text style={[styles.percentSymbol, { color: Colors.primaryText }]}>%</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Save Button */}
      <View style={[
        styles.footer,
        {
          backgroundColor: Colors.background,
          borderTopColor: Colors.border,
          paddingBottom: Math.max(insets.bottom + 20, 36),
        }
      ]}>
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
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </>
          )}
        </TouchableOpacity>
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
  sectionTitle: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
    marginBottom: Spacing.lg,
  },
  optionCard: {
    borderWidth: 2,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  optionHeader: {
    marginBottom: Spacing.sm,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  optionDescription: {
    fontSize: FontSizes.body,
    marginLeft: 34,
  },
  customSection: {
    marginTop: Spacing.md,
  },
  customCard: {
    borderWidth: 2,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  customLabel: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
  },
  customInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginLeft: 34,
  },
  customInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  percentSymbol: {
    fontSize: FontSizes.subheader,
    fontWeight: '700',
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
