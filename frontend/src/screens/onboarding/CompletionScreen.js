/**
 * CompletionScreen
 * Business owner completion with celebration animations
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import { useTranslation } from 'react-i18next';
import { getColors, LightColors, Spacing, FontSizes, BorderRadius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { completeOnboarding, saveUserProfile } from '../../utils/storage';
import { supabase } from '../../lib/supabase';
import { savePricingHistory } from '../../services/aiService';
import {
  useSuccessCelebration,
  useTextSlideUp,
  useStaggeredItem,
  useButtonBounce,
  useSlideFromSide,
} from '../../hooks/useOnboardingAnimations';

// Animated feature item
const AnimatedFeature = ({ icon, text, index, isActive, Colors }) => {
  const animStyle = useStaggeredItem(isActive, index, 1200, 150);

  return (
    <Animated.View style={[styles.feature, animStyle]}>
      <View style={[styles.featureIcon, { backgroundColor: Colors.success + '12' }]}>
        <Ionicons name={icon} size={20} color={Colors.success} />
      </View>
      <Text style={[styles.featureText, { color: Colors.primaryText }]}>
        {text}
      </Text>
    </Animated.View>
  );
};

export default function CompletionScreen({ navigation, route, onComplete }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;
  const { t } = useTranslation('onboarding');

  const [isAnimating, setIsAnimating] = useState(false);

  // Animation hooks
  const iconAnim = useSuccessCelebration(isAnimating, 0);
  const titleAnim = useTextSlideUp(isAnimating, 500);
  const subtitleAnim = useTextSlideUp(isAnimating, 700);
  const buttonAnim = useButtonBounce(isAnimating, 1800);
  const tipAnim = useSlideFromSide(isAnimating, 2000, false);

  const features = [
    { icon: 'flash', text: t('completion.features.aiPricing') },
    { icon: 'calculator', text: t('completion.features.autoCalc') },
    { icon: 'send', text: t('completion.features.oneTapSend') },
  ];

  useEffect(() => {
    // Save all onboarding data and mark as complete
    const saveOnboardingData = async () => {
      try {
        // Get the data passed from previous screens
        const { selectedTrades, selectedServices, businessInfo, pricing, typicalContracts, phasesTemplate, profitMargin } = route?.params || {};

        // Save to user_services table (new system)
        if (selectedServices && selectedServices.length > 0) {
          console.log('💾 Saving selected services to database:', selectedServices.length, 'services');
          const { data: { user } } = await supabase.auth.getUser();

          if (user) {
            console.log('✅ User found:', user.id);
            // Save each selected service to user_services table
            for (const service of selectedServices) {
              console.log(`📝 Saving service: ${service.name || service.id}`);

              // Extract custom phases from the service
              const customPhases = service.phases?.map(phase => ({
                phase_name: phase.name || phase.phase_name,
                default_days: phase.defaultDays || phase.default_days || 1,
                description: phase.description || '',
                tasks: phase.tasks || [],
              })) || [];

              console.log(`  📊 Found ${customPhases.length} custom phases for ${service.name}`);

              const userService = {
                user_id: user.id,
                category_id: service.id,
                pricing: pricing?.[service.id] || {},
                custom_items: [],
                custom_phases: customPhases,
                is_active: true,
              };

              const { data, error } = await supabase
                .from('user_services')
                .upsert(userService, {
                  onConflict: 'user_id,category_id'
                });

              if (error) {
                console.error(`❌ Error saving service ${service.name}:`, error);
              } else {
                console.log(`✅ Service saved: ${service.name || service.id} with ${customPhases.length} phases`);
              }
            }
            console.log('✅ All services saved to database');

            // Seed pricing to pricing_history for AI learning
            if (pricing && Object.keys(pricing).length > 0) {
              console.log('📊 Seeding onboarding pricing to history for AI learning...');
              for (const [serviceId, items] of Object.entries(pricing)) {
                const service = selectedServices.find(s => s.id === serviceId);
                const serviceName = service?.name || 'general';

                for (const [itemId, itemData] of Object.entries(items)) {
                  if (itemData.price && itemData.price > 0) {
                    try {
                      await savePricingHistory({
                        serviceType: serviceName.toLowerCase().replace(/\s+/g, '_'),
                        workDescription: itemData.name || 'Service item',
                        pricePerUnit: itemData.price,
                        unit: itemData.unit || 'job',
                        totalAmount: itemData.price,
                        sourceType: 'onboarding',
                        isCorrection: false,
                      });
                      console.log(`  ✅ Saved pricing: ${itemData.name} - $${itemData.price}/${itemData.unit}`);
                    } catch (pricingError) {
                      console.warn(`  ⚠️ Failed to save pricing for ${itemData.name}:`, pricingError);
                    }
                  }
                }
              }
              console.log('✅ Onboarding pricing seeded to history');
            }
          } else {
            console.error('❌ No user found - cannot save services');
          }
        } else {
          console.log('⚠️ No selectedServices found in route params');
          console.log('Route params:', route?.params);
        }

        // Save typical contracts to database
        if (typicalContracts && typicalContracts.length > 0) {
          console.log('💾 Saving typical contracts to database:', typicalContracts.length, 'contracts');
          const { data: { user } } = await supabase.auth.getUser();

          if (user) {
            console.log('✅ User found:', user.id);
            for (const contract of typicalContracts) {
              console.log(`📝 Saving contract: ${contract.name}`);

              let fileUrl = null;
              let publicUrl = null;

              // Upload file to Supabase storage if fileUri exists
              if (contract.fileUri) {
                try {
                  console.log(`  📤 Uploading file for contract: ${contract.name}`);
                  console.log(`  📁 File URI: ${contract.fileUri}`);

                  // Create a file path with user ID and timestamp
                  const timestamp = Date.now();
                  const fileExt = contract.name.split('.').pop();
                  const fileName = `${user.id}/${timestamp}_${contract.name}`;

                  // Read file as base64 using expo-file-system (proper React Native way)
                  const base64 = await FileSystem.readAsStringAsync(contract.fileUri, {
                    encoding: FileSystem.EncodingType.Base64,
                  });

                  console.log(`  📊 File read as base64, length: ${base64.length}`);

                  // Decode base64 to binary string
                  const binaryString = global.atob ? global.atob(base64) :
                    Buffer.from(base64, 'base64').toString('binary');

                  // Convert binary string to byte array
                  const bytes = new Uint8Array(binaryString.length);
                  for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }

                  console.log(`  🔢 Converted to bytes, length: ${bytes.length}`);

                  // Upload to Supabase storage
                  const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('contracts')
                    .upload(fileName, bytes, {
                      contentType: contract.mimeType || 'application/octet-stream',
                      upsert: false,
                    });

                  if (uploadError) {
                    console.error(`  ❌ Error uploading file for ${contract.name}:`, uploadError);
                    console.error(`  ❌ Upload error details:`, JSON.stringify(uploadError));
                  } else {
                    console.log(`  ✅ File uploaded successfully: ${fileName}`);
                    fileUrl = fileName;

                    // Get public URL
                    const { data: { publicUrl: url } } = supabase.storage
                      .from('contracts')
                      .getPublicUrl(fileName);
                    publicUrl = url;
                    console.log(`  🔗 Public URL: ${publicUrl}`);
                  }
                } catch (uploadError) {
                  console.error(`  ❌ Exception uploading file for ${contract.name}:`, uploadError);
                  console.error(`  ❌ Error stack:`, uploadError.stack);
                }
              } else {
                console.log(`  ⚠️ No fileUri for contract: ${contract.name}`);
              }

              const typicalContract = {
                user_id: user.id,
                name: contract.name,
                description: contract.description || '',
                base_contract: contract.base_contract,
                contract_amount: contract.contract_amount || null,
                order_index: contract.order_index || 0,
                file_url: fileUrl,
                file_mime_type: contract.mimeType || null,
                is_active: true,
              };

              const { data, error } = await supabase
                .from('typical_contracts')
                .insert(typicalContract);

              if (error) {
                console.error(`❌ Error saving contract ${contract.name}:`, error);
              } else {
                console.log(`✅ Contract saved: ${contract.name}${fileUrl ? ' (with file)' : ''}`);
              }
            }
            console.log('✅ All contracts saved to database');
          } else {
            console.error('❌ No user found - cannot save contracts');
          }
        } else {
          console.log('⚠️ No typical contracts to save');
        }

        if (businessInfo || selectedTrades || pricing || phasesTemplate || profitMargin) {
          // Save complete profile with all business info
          console.log('💾 Saving business info with payment details:', {
            hasPaymentInfo: !!businessInfo?.paymentInfo,
            paymentInfoLength: businessInfo?.paymentInfo?.length || 0,
            paymentInfoPreview: businessInfo?.paymentInfo?.substring(0, 50) || 'none'
          });

          await saveUserProfile({
            isOnboarded: true,
            businessInfo: businessInfo || {},
            trades: selectedTrades || [],
            pricing: pricing || {},
            phasesTemplate: phasesTemplate || null,
            profit_margin: profitMargin || 0.25,
          });

          console.log('✅ Business info saved successfully');
        } else {
          // Just mark as onboarded if no data was passed
          await completeOnboarding();
        }

        // Start animations after data is saved
        setTimeout(() => {
          setIsAnimating(true);
        }, 300);
      } catch (error) {
        console.error('Error saving onboarding data:', error);
        // Still mark as onboarded even if save fails
        await completeOnboarding();
        setIsAnimating(true);
      }
    };

    saveOnboardingData();
  }, [route?.params]);

  const handleStart = () => {
    // Call the onComplete callback to switch to main app
    if (onComplete) {
      onComplete();
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#F8FAFC' }]}>
      <View style={styles.content}>
        {/* Success Animation/Icon */}
        <Animated.View style={[styles.iconContainer, { backgroundColor: Colors.success + '15' }, iconAnim]}>
          <Ionicons name="checkmark-circle" size={56} color={Colors.success} />
        </Animated.View>

        {/* Success Message */}
        <View style={styles.textContainer}>
          <Animated.Text style={[styles.title, { color: Colors.primaryText }, titleAnim]}>
            {t('completion.title')} {t('completion.titleEmoji')}
          </Animated.Text>

          {/* Accent horizontal rule */}
          <View style={[styles.accentRule, { backgroundColor: Colors.success }]} />

          <Animated.Text style={[styles.subtitle, { color: Colors.secondaryText }, subtitleAnim]}>
            {t('completion.subtitle')}
          </Animated.Text>
        </View>

        {/* Features Recap */}
        <View style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <AnimatedFeature
              key={feature.icon}
              icon={feature.icon}
              text={feature.text}
              index={index}
              isActive={isAnimating}
              Colors={Colors}
            />
          ))}
        </View>

        {/* Start Button */}
        <Animated.View style={[{ width: '100%' }, buttonAnim]}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: Colors.primaryBlue }]}
            onPress={handleStart}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>{t('completion.startButton')}</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </Animated.View>

        {/* Tips */}
        <Animated.View style={[styles.tipBox, tipAnim]}>
          <Ionicons name="bulb-outline" size={16} color={Colors.secondaryText} />
          <Text style={[styles.tipText, { color: Colors.secondaryText }]}>
            {t('completion.tip')}
          </Text>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: Spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  accentRule: {
    width: 40,
    height: 2,
    borderRadius: 1,
    marginVertical: 16,
  },
  subtitle: {
    fontSize: FontSizes.body,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    lineHeight: 24,
  },
  featuresContainer: {
    width: '100%',
    marginBottom: Spacing.xxl,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
    paddingLeft: Spacing.lg,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureText: {
    fontSize: FontSizes.body,
    marginLeft: Spacing.md,
    flex: 1,
    fontWeight: '500',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    borderRadius: 14,
    width: '100%',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#fff',
    fontSize: FontSizes.body,
    fontWeight: '600',
  },
  tipBox: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: 12,
    gap: Spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tipText: {
    flex: 1,
    fontSize: FontSizes.tiny,
    lineHeight: 18,
  },
});
