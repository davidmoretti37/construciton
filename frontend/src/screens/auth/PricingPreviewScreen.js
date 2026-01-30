/**
 * PricingPreviewScreen
 * Modern pricing screen shown before login
 * Features: gradient background, horizontal plan pills, feature carousel
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Animated,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { Spacing, FontSizes, BorderRadius } from '../../constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PricingPreviewScreen({ navigation }) {
  const { t } = useTranslation('auth');
  const insets = useSafeAreaInsets();
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [activeFeature, setActiveFeature] = useState(0);
  const carouselRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Translated plan configurations
  const PLANS = [
    {
      id: 'starter',
      name: t('pricing.plans.starter.name'),
      price: 49,
      projects: 3,
      description: t('pricing.plans.starter.description'),
    },
    {
      id: 'pro',
      name: t('pricing.plans.pro.name'),
      price: 79,
      projects: 10,
      description: t('pricing.plans.pro.description'),
      recommended: true,
    },
    {
      id: 'business',
      name: t('pricing.plans.business.name'),
      price: 149,
      projects: 'Unlimited',
      description: t('pricing.plans.business.description'),
    },
  ];

  // Translated features for carousel
  const FEATURES = [
    { icon: 'sparkles', title: t('pricing.features.aiAssistant.title'), desc: t('pricing.features.aiAssistant.desc') },
    { icon: 'document-text', title: t('pricing.features.smartInvoices.title'), desc: t('pricing.features.smartInvoices.desc') },
    { icon: 'people', title: t('pricing.features.teamManagement.title'), desc: t('pricing.features.teamManagement.desc') },
    { icon: 'camera', title: t('pricing.features.photoDocs.title'), desc: t('pricing.features.photoDocs.desc') },
    { icon: 'stats-chart', title: t('pricing.features.financialInsights.title'), desc: t('pricing.features.financialInsights.desc') },
  ];

  // Auto-scroll carousel
  useEffect(() => {
    const interval = setInterval(() => {
      const nextIndex = (activeFeature + 1) % FEATURES.length;
      setActiveFeature(nextIndex);
      carouselRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }, 3000);
    return () => clearInterval(interval);
  }, [activeFeature]);

  // CTA pulse animation
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.02,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  const selectedPlanData = PLANS.find(p => p.id === selectedPlan);

  // DEV: Reset onboarding to test new flow
  const handleResetOnboarding = async () => {
    await AsyncStorage.removeItem('@hasSeenOnboarding');
    Alert.alert('Reset', 'Onboarding reset! Restart the app to see the new onboarding.', [
      { text: t('common:buttons.ok', 'OK') }
    ]);
  };

  const renderFeatureCard = ({ item, index }) => (
    <View style={styles.featureCard}>
      <View style={styles.featureIconWrap}>
        <Ionicons name={item.icon} size={28} color="#60A5FA" />
      </View>
      <Text style={styles.featureTitle}>{item.title}</Text>
      <Text style={styles.featureDesc}>{item.desc}</Text>
    </View>
  );

  return (
    <LinearGradient
      colors={['#0A1628', '#0F172A', '#1E1B4B']}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* DEV: Reset button - remove after testing */}
      <TouchableOpacity
        style={{ position: 'absolute', top: insets.top + 10, left: 20, zIndex: 100 }}
        onPress={handleResetOnboarding}
      >
        <Text style={{ color: '#F59E0B', fontSize: 12 }}>{t('pricing.dev.resetOnboarding')}</Text>
      </TouchableOpacity>

      {/* Hero Section */}
      <View style={styles.hero}>
        <View style={styles.iconGlow}>
          <View style={styles.iconCircle}>
            <Ionicons name="construct" size={36} color="#60A5FA" />
          </View>
        </View>
        <Text style={styles.heroTitle}>{t('pricing.hero.title')}</Text>
        <Text style={styles.heroSubtitle}>{t('pricing.hero.subtitle')}</Text>
      </View>

      {/* Feature Carousel */}
      <View style={styles.carouselContainer}>
        <FlatList
          ref={carouselRef}
          data={FEATURES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          renderItem={renderFeatureCard}
          keyExtractor={(item) => item.title}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 60));
            setActiveFeature(index);
          }}
          contentContainerStyle={styles.carouselContent}
          snapToInterval={SCREEN_WIDTH - 60}
          decelerationRate="fast"
        />
        {/* Pagination dots */}
        <View style={styles.pagination}>
          {FEATURES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                activeFeature === i && styles.dotActive,
              ]}
            />
          ))}
        </View>
      </View>

      {/* Plan Selector */}
      <View style={styles.planSelector}>
        {PLANS.map((plan) => (
          <TouchableOpacity
            key={plan.id}
            style={[
              styles.planPill,
              selectedPlan === plan.id && styles.planPillActive,
            ]}
            onPress={() => setSelectedPlan(plan.id)}
            activeOpacity={0.8}
          >
            {plan.recommended && (
              <View style={styles.recommendedBadge}>
                <Text style={styles.recommendedText}>{t('pricing.badge')}</Text>
              </View>
            )}
            <Text style={[
              styles.planName,
              selectedPlan === plan.id && styles.planNameActive,
            ]}>
              {plan.name}
            </Text>
            <Text style={[
              styles.planPrice,
              selectedPlan === plan.id && styles.planPriceActive,
            ]}>
              ${plan.price}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Selected Plan Details */}
      <View style={styles.planDetails}>
        <View style={styles.detailRow}>
          <Ionicons name="folder-open" size={20} color="#60A5FA" />
          <Text style={styles.detailText}>
            {selectedPlanData.projects === 'Unlimited'
              ? t('pricing.details.unlimitedProjects')
              : t('pricing.details.activeProjects', { count: selectedPlanData.projects })}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="gift" size={20} color="#34D399" />
          <Text style={styles.detailText}>{t('pricing.details.freeTrial')}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="refresh" size={20} color="#A78BFA" />
          <Text style={styles.detailText}>{t('pricing.details.cancelAnytime')}</Text>
        </View>
      </View>

      {/* CTA Button */}
      <View style={styles.ctaContainer}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => navigation.navigate('Signup')}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#3B82F6', '#2563EB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <Text style={styles.ctaText}>{t('pricing.cta')}</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Trust Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.trustItem}>
          <Ionicons name="shield-checkmark" size={16} color="#64748B" />
          <Text style={styles.trustText}>{t('pricing.footer.securePayment')}</Text>
        </View>
        <View style={styles.trustDivider} />
        <View style={styles.trustItem}>
          <Ionicons name="card" size={16} color="#64748B" />
          <Text style={styles.trustText}>{t('pricing.footer.poweredByStripe')}</Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 24,
  },
  iconGlow: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#60A5FA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(96, 165, 250, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 16,
    color: '#94A3B8',
  },
  carouselContainer: {
    marginBottom: 24,
  },
  carouselContent: {
    paddingHorizontal: 30,
  },
  featureCard: {
    width: SCREEN_WIDTH - 60,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  featureIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#F8FAFC',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 14,
    color: '#94A3B8',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  dotActive: {
    width: 20,
    backgroundColor: '#60A5FA',
  },
  planSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  planPill: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    position: 'relative',
  },
  planPillActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: '#3B82F6',
  },
  recommendedBadge: {
    position: 'absolute',
    top: -8,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recommendedText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  planName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginBottom: 4,
  },
  planNameActive: {
    color: '#F8FAFC',
  },
  planPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: '#64748B',
  },
  planPriceActive: {
    color: '#60A5FA',
  },
  planDetails: {
    paddingHorizontal: 30,
    marginBottom: 24,
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailText: {
    fontSize: 15,
    color: '#CBD5E1',
  },
  ctaContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  ctaButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trustText: {
    fontSize: 12,
    color: '#64748B',
  },
  trustDivider: {
    width: 1,
    height: 12,
    backgroundColor: '#334155',
  },
});
