/**
 * OnboardingScreen
 * Premium onboarding flow with 5 slides + paywall
 * Features: glassmorphism, animations, gradient backgrounds
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Animated,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Slide data
const SLIDES = [
  {
    id: 'welcome',
    icon: 'construct',
    headline: 'Build Smarter',
    subtext: 'The AI-powered app for modern contractors',
    showLogo: true,
  },
  {
    id: 'ai',
    icon: 'sparkles',
    headline: 'AI-Powered Estimates',
    subtext: 'Generate accurate project estimates in seconds, not hours',
  },
  {
    id: 'manage',
    icon: 'clipboard',
    headline: 'Manage Everything',
    subtext: 'Projects, workers, schedules, and invoices — all in one place',
  },
  {
    id: 'finance',
    icon: 'stats-chart',
    headline: 'Track Profits',
    subtext: 'See exactly where your money goes with smart insights',
  },
  {
    id: 'ready',
    icon: 'rocket',
    headline: 'Ready to Build?',
    subtext: 'Join thousands of contractors saving time every day',
    showCTA: true,
  },
];

// Plan data
const PLANS = [
  { id: 'starter', name: 'Starter', price: 49, projects: 3 },
  { id: 'pro', name: 'Pro', price: 79, projects: 10, recommended: true },
  { id: 'business', name: 'Business', price: 149, projects: 'Unlimited' },
];

export default function OnboardingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const flatListRef = useRef(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Initial animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentIndex]);

  // Shimmer animation for CTA
  useEffect(() => {
    const shimmer = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    );
    shimmer.start();
    return () => shimmer.stop();
  }, []);

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      setShowPaywall(true);
    }
  };

  const handleSkip = () => {
    setShowPaywall(true);
  };

  const handleGetStarted = async () => {
    // Mark onboarding as complete
    await AsyncStorage.setItem('@hasSeenOnboarding', 'true');
    navigation.navigate('Signup');
  };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  const renderSlide = ({ item, index }) => (
    <View style={styles.slide}>
      {/* Icon with glow */}
      <Animated.View
        style={[
          styles.iconContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.iconGlow}>
          <View style={styles.iconInner}>
            <Ionicons name={item.icon} size={48} color="#60A5FA" />
          </View>
        </View>
      </Animated.View>

      {/* Text */}
      <Animated.View style={{ opacity: fadeAnim }}>
        <Text style={styles.headline}>{item.headline}</Text>
        <Text style={styles.subtext}>{item.subtext}</Text>
      </Animated.View>

      {/* Social proof for last slide */}
      {item.showCTA && (
        <View style={styles.socialProof}>
          <Ionicons name="star" size={16} color="#FBBF24" />
          <Text style={styles.socialText}>Trusted by 500+ contractors</Text>
        </View>
      )}
    </View>
  );

  // Paywall screen
  if (showPaywall) {
    const selectedPlanData = PLANS.find(p => p.id === selectedPlan);

    return (
      <LinearGradient
        colors={['#0a0f1a', '#0f172a', '#1a1f3a']}
        style={[styles.container, { paddingTop: insets.top }]}
      >
        <ScrollView
          contentContainerStyle={styles.paywallContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.paywallHeader}>
            <Text style={styles.paywallTitle}>Choose Your Plan</Text>
            <Text style={styles.paywallSubtitle}>
              Start with a 7-day free trial. Cancel anytime.
            </Text>
          </View>

          {/* Plan Cards */}
          <View style={styles.planCards}>
            {PLANS.map((plan) => (
              <TouchableOpacity
                key={plan.id}
                style={[
                  styles.planCard,
                  selectedPlan === plan.id && styles.planCardSelected,
                ]}
                onPress={() => setSelectedPlan(plan.id)}
                activeOpacity={0.8}
              >
                {plan.recommended && (
                  <LinearGradient
                    colors={['#3B82F6', '#06B6D4']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.bestBadge}
                  >
                    <Text style={styles.bestText}>Best</Text>
                  </LinearGradient>
                )}
                <Text style={[
                  styles.planName,
                  selectedPlan === plan.id && styles.planNameSelected,
                ]}>
                  {plan.name}
                </Text>
                <Text style={[
                  styles.planPrice,
                  selectedPlan === plan.id && styles.planPriceSelected,
                ]}>
                  ${plan.price}
                </Text>
                <Text style={styles.planPeriod}>/month</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Benefits */}
          <View style={styles.benefits}>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color="#34D399" />
              <Text style={styles.benefitText}>
                {selectedPlanData.projects === 'Unlimited'
                  ? 'Unlimited active projects'
                  : `${selectedPlanData.projects} active projects`}
              </Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color="#34D399" />
              <Text style={styles.benefitText}>7-day free trial included</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color="#34D399" />
              <Text style={styles.benefitText}>All features unlocked</Text>
            </View>
            <View style={styles.benefitRow}>
              <Ionicons name="checkmark-circle" size={20} color="#34D399" />
              <Text style={styles.benefitText}>Cancel anytime</Text>
            </View>
          </View>

          {/* CTA Button with shimmer */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={handleGetStarted}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={['#3B82F6', '#06B6D4']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaGradient}
            >
              <Text style={styles.ctaText}>Start Free Trial</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFF" />
            </LinearGradient>
          </TouchableOpacity>

          {/* Trust Footer */}
          <View style={styles.trustFooter}>
            <Ionicons name="shield-checkmark" size={14} color="#64748B" />
            <Text style={styles.trustText}>Secure payment</Text>
            <Text style={styles.trustDot}>•</Text>
            <Text style={styles.trustText}>Powered by Stripe</Text>
          </View>
        </ScrollView>
      </LinearGradient>
    );
  }

  // Onboarding slides
  return (
    <LinearGradient
      colors={['#0a0f1a', '#0f172a', '#1a1f3a']}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Skip button */}
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        scrollEventThrottle={16}
      />

      {/* Bottom section */}
      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 20 }]}>
        {/* Pagination */}
        <View style={styles.pagination}>
          {SLIDES.map((_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                currentIndex === i && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {/* Next/Get Started button */}
        <TouchableOpacity
          style={styles.nextButton}
          onPress={handleNext}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={['#3B82F6', '#2563EB']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.nextGradient}
          >
            <Text style={styles.nextText}>
              {currentIndex === SLIDES.length - 1 ? 'Get Started' : 'Next'}
            </Text>
            <Ionicons name="arrow-forward" size={20} color="#FFF" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  skipButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    zIndex: 10,
    padding: 8,
  },
  skipText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: '500',
  },
  slide: {
    width: SCREEN_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  iconContainer: {
    marginBottom: 40,
  },
  iconGlow: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#60A5FA',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
  },
  iconInner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(96, 165, 250, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.3)',
  },
  headline: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 16,
  },
  subtext: {
    fontSize: 17,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 26,
  },
  socialProof: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  socialText: {
    color: '#FBBF24',
    fontSize: 14,
    fontWeight: '600',
  },
  bottomSection: {
    paddingHorizontal: 20,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  dotActive: {
    width: 24,
    backgroundColor: '#3B82F6',
  },
  nextButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  nextGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  nextText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
  },
  // Paywall styles
  paywallContent: {
    padding: 20,
    paddingTop: 40,
  },
  paywallHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  paywallTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F8FAFC',
    marginBottom: 8,
  },
  paywallSubtitle: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
  },
  planCards: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  planCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
  },
  planCardSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: '#3B82F6',
    transform: [{ scale: 1.02 }],
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  bestBadge: {
    position: 'absolute',
    top: -10,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  bestText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  planName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
    marginTop: 8,
    marginBottom: 8,
  },
  planNameSelected: {
    color: '#F8FAFC',
  },
  planPrice: {
    fontSize: 28,
    fontWeight: '700',
    color: '#64748B',
  },
  planPriceSelected: {
    color: '#60A5FA',
  },
  planPeriod: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  benefits: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    gap: 16,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitText: {
    fontSize: 15,
    color: '#CBD5E1',
  },
  ctaButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
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
  trustFooter: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 20,
  },
  trustText: {
    fontSize: 12,
    color: '#64748B',
  },
  trustDot: {
    color: '#64748B',
  },
});
